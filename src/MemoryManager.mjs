import * as M from "./Constants/Memory.mjs";
import {I_DEALLOCATION_COUNT, I_STACK, I_USAGE_COUNTER} from "./Constants/Memory.mjs";

export default class MemoryManager{
  constructor(MemoryBuffer){
    this.MemoryBuffer = MemoryBuffer;
    this.u32 = new Uint32Array(this.MemoryBuffer);
    this.i32 = new Int32Array(this.MemoryBuffer);

    this.MemorySize = this.u32[M.I_MEMORY_SIZE];
    this.MemorySegments = this.MemorySize >> 18;
  }
  //Important: This should only be called once in the program!
  InitialiseMemory(){
    this.u32[M.I_MEMORY_SIZE] = this.MemoryBuffer.byteLength; //In bytes
    this.MemorySize = this.u32[M.I_MEMORY_SIZE];
    this.MemorySegments = this.MemorySize >> 18;

    const HeightDataArraysCount = 64;
    let ByteIndex = 16 * 4; //Before this are the memory-wide header variables

    this.u32[M.I_HEIGHT_DATA_INFO_INDEX] = ByteIndex >> 2;

    //Nothing to do, memory is already initialised to zeros
    ByteIndex += HeightDataArraysCount * 2 * 4;


    ByteIndex = (ByteIndex + 262143) & ~262143; //Round up to next 262144 alignment


    //this.WorldGrid = new Uint32Array(this.MemoryBuffer, ByteIndex, 32*32*32*16); //Allocates 2MB
    this.u32[M.I_WORLD_GRID_INDEX] = ByteIndex >> 2;
    ByteIndex += 32*32*32*16*4;

    //this.WorldGridInfo = new Uint32Array(this.MemoryBuffer, ByteIndex, 8*32*32*16); //Allocates 512 KB
    this.u32[M.I_WORLD_GRID_INFO_INDEX] = ByteIndex >> 2;
    ByteIndex += 8*32*32*16*4;


    this.HeightDataArrays = [];
    this.u32[M.I_HEIGHT_DATA_INDEX] = ByteIndex >> 2;
    this.u32[M.I_HEIGHT_DATA_COUNT] = HeightDataArraysCount;

    for(let i = 0; i < HeightDataArraysCount; ++i){ //Allocates 4MB in total, HeightDataArraysCount == 64
      this.HeightDataArrays.push(new Float32Array(this.MemoryBuffer, ByteIndex, 128*128));
      ByteIndex += 128*128*4;
    }

    for(; ByteIndex < this.MemorySize; ByteIndex += 65536 * 4 /* => 65536 u32s */){
      this.u32[ByteIndex >> 2 | M.I_STACK] = 65527;
      this.u32[ByteIndex >> 2 | M.I_LIST_END] = 65527;

      this.u32[M.I_ALLOCATION_SEGMENTS_COUNT]++;
    }

    this.u32[M.I_ALLOCATION_SEGMENTS_LIST_INDEX] = (this.u32[M.I_MEMORY_SIZE] >> 18) - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT];
  }
  Allocate(Size, Temporary){
    //if(Size & 1) Size++; //Make size even. The size passed into the function should include space for the header (1x uint32, 4 bytes)
    const Max = this.MemorySize >> 18;

    let SegmentIndex = Atomics.load(this.u32, M.I_ALLOCATION_SEGMENTS_LIST_INDEX);
    if(Temporary){
      SegmentIndex = ((SegmentIndex + 512) % this.u32[M.I_ALLOCATION_SEGMENTS_COUNT]) + Max - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT];
    }
    let i = 0;
    for(; i < Max; ++i, SegmentIndex++, /* wrap around and skip to first segment location -> */ SegmentIndex >= Max && (SegmentIndex = Max - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT])){
      //Check if there's enough space
      if(Math.min(Atomics.load(this.u32, SegmentIndex << 16 | M.I_STACK), Atomics.load(this.u32, SegmentIndex << 16 | M.I_LIST_END)) - Atomics.load(this.u32, SegmentIndex << 16 | M.I_HEAP) > Size + 1){ // The +1 is for the stack item
        //Obtain mutex lock, https://v8.dev/features/atomics
        while(Atomics.compareExchange(this.i32, SegmentIndex << 16 | M.I_ALLOCATION_LOCK, M.UNLOCKED, M.LOCKED) !== M.UNLOCKED){
          Atomics.wait(this.i32, SegmentIndex << 16 | M.I_ALLOCATION_LOCK, M.LOCKED);
        }

        //Increment usage counter
        Atomics.add(this.u32, SegmentIndex << 16 | M.I_USAGE_COUNTER, 1);

        if(
          Atomics.load(this.u32, SegmentIndex << 16 | M.I_MANAGEMENT_LOCK) === M.LOCKED || //Check management lock
          Math.min(Atomics.load(this.u32, SegmentIndex << 16 | M.I_STACK), Atomics.load(this.u32, SegmentIndex << 16 | M.I_LIST_END)) - Atomics.load(this.u32, SegmentIndex << 16 | M.I_HEAP) <= Size + 1 //Check again, might have changed
        ){
          // Unable to allocate now, so I have to remove the lock and try another segment
          Atomics.sub(this.u32, SegmentIndex << 16 | M.I_USAGE_COUNTER, 1);
          Atomics.compareExchange(this.i32, SegmentIndex << 16 | M.I_ALLOCATION_LOCK, M.LOCKED, M.UNLOCKED);
          Atomics.notify(this.i32, SegmentIndex << 16 | M.I_ALLOCATION_LOCK, 1);
          continue;
        }
        break; //Found segment
      } else{
        //Only increment if it's not skipped before (so that good segments aren't skipped only because they were locked)
        if(SegmentIndex === Atomics.load(this.u32, M.I_ALLOCATION_SEGMENTS_LIST_INDEX) && !Temporary){
          //Increment and wrap around if at the end of the list
          Atomics.store(this.u32, M.I_ALLOCATION_SEGMENTS_LIST_INDEX, SegmentIndex + 1 >= Max ? Max - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT] : SegmentIndex + 1);
        }
      }
    }


    if(i === Max) throw "Out of memory";


    //TODO: I may need to switch the following section to use atomic instructions if I run into issues

    let AllocationHeapIndex = -1;
    let AllocationStackIndex = -1;
    if(this.u32[SegmentIndex << 16 | M.I_LIST_END] < this.u32[SegmentIndex << 16 | M.I_LIST_START]){
      this.u32[SegmentIndex << 16 | M.I_LIST_END]++;
      AllocationStackIndex = this.u32[SegmentIndex << 16 | this.u32[SegmentIndex << 16 | M.I_LIST_END]];
      this.u32[SegmentIndex << 16 | this.u32[SegmentIndex << 16 | M.I_LIST_END]] = 0;
    } else{
      AllocationStackIndex = this.u32[SegmentIndex << 16 | M.I_STACK];
      this.u32[SegmentIndex << 16 | M.I_STACK]--;
    }
    AllocationHeapIndex = this.u32[SegmentIndex << 16 | M.I_HEAP];
    this.u32[SegmentIndex << 16 | AllocationStackIndex] = AllocationHeapIndex;
    this.u32[SegmentIndex << 16 | M.I_HEAP] += Size;


    this.u32[SegmentIndex << 16 | AllocationHeapIndex] = Size << 16 | (~AllocationStackIndex & 65535);

    //Increment usage counter
    Atomics.add(this.u32, SegmentIndex << 16 | M.I_USAGE_COUNTER, 1);

    //Free allocation lock
    Atomics.sub(this.u32, SegmentIndex << 16 | M.I_USAGE_COUNTER, 1);
    Atomics.compareExchange(this.i32, SegmentIndex << 16 | M.I_ALLOCATION_LOCK, M.LOCKED, M.UNLOCKED);
    Atomics.notify(this.i32, SegmentIndex << 16 | M.I_ALLOCATION_LOCK, 1);

    return SegmentIndex << 16 | AllocationStackIndex;
  }
  DefragmentSegment(SegmentID){
    if(SegmentID < this.MemorySegments - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT] || SegmentID > this.MemorySegments){
      return;
    }

    if(Atomics.compareExchange(this.i32, SegmentID << 16 | M.I_MANAGEMENT_LOCK, M.UNLOCKED, M.LOCKED) !== M.UNLOCKED){
      //Couldn't obtain management lock
      return;
    }

    if(
      Atomics.load(this.u32, SegmentID << 16 | M.I_ALLOCATION_LOCK) !== M.UNLOCKED || //Some thread is allocating to this segment
      Atomics.load(this.u32, SegmentID << 16 | M.I_USAGE_COUNTER) > 0 || //Some thread is writing to this segment
      Atomics.load(this.u32, SegmentID << 16 | M.I_NEEDS_GPU_UPLOAD) !== 0 //Segment is waiting for gpu upload
    ){
      Atomics.store(this.i32, SegmentID << 16 | M.I_MANAGEMENT_LOCK, M.UNLOCKED); //Free management lock
      return; // Try again later
    }

    const Utilisation = (Math.min(65536 - Atomics.load(this.u32, SegmentID << 16 | M.I_STACK), Atomics.load(this.u32, SegmentID << 16 | M.I_LIST_END)) + Atomics.load(this.u32, SegmentID << 16 | M.I_HEAP)) / 65536;
    const Collectable = Atomics.load(this.u32, SegmentID << 16 | M.I_DEALLOCATION_COUNT) / 65536;

    if(!(Collectable !== 0 && (Utilisation > 0.87 || (Utilisation > 0.75 && Collectable > 0.1) || (Utilisation > 0.5 && Collectable > 0.2) || Collectable > 0.3))){
      //Not "worth" defragmenting now, lift lock and return
      Atomics.store(this.i32, SegmentID << 16 | M.I_MANAGEMENT_LOCK, 0);
      Atomics.notify(this.i32, SegmentID << 16 | M.I_MANAGEMENT_LOCK);
      return;
    }

    //Defragment. May need to change this to use atomic operations due to possible cache issues?
    let CurrentOldIndex = 0;
    let CurrentNewIndex = 0;
    let CurrentListIndex = Math.min(this.u32[SegmentID << 16 | M.I_LIST_START], this.u32[SegmentID << 16 | M.I_LIST_END]);

    const OldHeapIndex = this.u32[SegmentID << 16 | M.I_HEAP];
    while(CurrentOldIndex < OldHeapIndex){
      const AllocationLength = this.u32[SegmentID << 16 | CurrentOldIndex] >> 16 & 65535;
      const AllocationStackIndex = ~(this.u32[SegmentID << 16 | CurrentOldIndex] & 65535) & 65535;

      if((this.u32[SegmentID << 16 | AllocationStackIndex] & 1) === 0){ //This means that the allocation wasn't freed
        //Only copy if the indices have diverged
        if(CurrentNewIndex !== CurrentOldIndex){
          //Set new heap index
          this.u32[SegmentID << 16 | AllocationStackIndex] = CurrentNewIndex;
          //Copy it to the new location
          for(let i = 0; i < AllocationLength; ++i){
            this.u32[SegmentID << 16 | CurrentNewIndex++] = this.u32[SegmentID << 16 | CurrentOldIndex++];
          }
        } else CurrentOldIndex += AllocationLength;
      } else{
        CurrentOldIndex += AllocationLength;
        this.u32[SegmentID << 16 | CurrentListIndex--] = AllocationStackIndex; //Add deallocated stack index to free list
      }
    }
    this.u32[SegmentID << 16 | M.I_LIST_END] = CurrentListIndex;
    this.u32[SegmentID << 16 | M.I_HEAP] = CurrentNewIndex;
    this.u32[SegmentID << 16 | M.I_DEALLOCATION_COUNT] = 0;

    //Lift management lock
    Atomics.store(this.i32, SegmentID << 16 | M.I_MANAGEMENT_LOCK, 0);
    Atomics.notify(this.i32, SegmentID << 16 | M.I_MANAGEMENT_LOCK);
  }
  Deallocate(SegmentIndex, StackIndex){
    //TODO: I (hopefully) don't need to care about locks for this

    const Freeable = Atomics.load(this.u32, SegmentIndex << 16 | StackIndex) & 65535; //Gets allocation size
    Atomics.add(this.u32, SegmentIndex << 16 | M.I_DEALLOCATION_COUNT, Freeable); //Add allocation size to the amount of freeable memory
    Atomics.or(this.u32, SegmentIndex << 16 | StackIndex, 1); // Mark as unloaded
  }

  RequestGPUUpload(SegmentIndex, StackIndex){
    Atomics.add(this.u32, SegmentIndex << 16 | M.I_NEEDS_GPU_UPLOAD, Atomics.load(this.u32, SegmentIndex << 16 | StackIndex) & 65535);
  }

  GetUsedMemory(){
    const MemorySegments = this.u32[M.I_MEMORY_SIZE] >> 18;
    const FirstSegment = MemorySegments - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT];
    let TotalUsed = FirstSegment << 16;
    for(let i = FirstSegment; i < MemorySegments; ++i){
      TotalUsed += 65535 - this.u32[i << 16 | M.I_STACK] + this.u32[i << 16 | M.I_HEAP];
    }
    return TotalUsed << 2; //Shifting by 2 to get the consumption in bytes, not in i32s
  }

  GetCollectableMemory(){
    const MemorySegments = this.u32[M.I_MEMORY_SIZE] >> 18
    const FirstSegment = MemorySegments - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT];
    let Total = 0;
    for(let i = FirstSegment; i < MemorySegments; ++i){
      Total += this.u32[i << 16 | M.I_DEALLOCATION_COUNT];
    }
    return Total << 2; //Shifting by 2 to get the consumption in bytes, not in i32s
  }
  GetUnlockedCollectableMemory(){
    const MemorySegments = this.u32[M.I_MEMORY_SIZE] >> 18
    const FirstSegment = MemorySegments - this.u32[M.I_ALLOCATION_SEGMENTS_COUNT];
    let Total = 0;
    for(let i = FirstSegment; i < MemorySegments; ++i){
      if(this.u32[i << 16 | M.I_USAGE_COUNTER] === 0) Total += this.u32[i << 16 | M.I_DEALLOCATION_COUNT];
    }
    return Total << 2; //Shifting by 2 to get the consumption in bytes, not in i32s
  }
};