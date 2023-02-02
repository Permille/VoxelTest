import MemoryObject from "./MemoryObject.mjs";

export default class IterableSet extends MemoryObject{
  constructor(Size, Memory){
    const AllocationSize = 3 * Size + 2;
    super(Memory, AllocationSize);
    const u32 = this.Memory.u32;
    const HeapIndex = this.SegmentOffset | u32[this.SegmentAndStackIndex];

    u32[HeapIndex + 1] = Size & 65535; //Size should never be above ~16384 anyway
    for(let i = 2; i < AllocationSize; ++i){
      u32[HeapIndex + i] = 0xffffffff;
    }
  }
  Add(Value){
    const u32 = this.Memory.u32;
    const HeapIndex = this.SegmentOffset | u32[this.SegmentAndStackIndex];

    const I_Header = HeapIndex + 1;
    const Capacity = u32[I_Header] & 65535;
    const I_HashTable = HeapIndex + 2;
    const I_ItemsList = HeapIndex + 2 + (Capacity << 1);
    const CapacityM1 = Capacity - 1;

    let Hash = Value;/*Math.imul(((Value >>> 16) ^ Value), 0x45d9f3b);
    Hash = Math.imul(((Hash >>> 16) ^ Hash), 0x45d9f3b);
    Hash = ((Hash >>> 16) ^ Hash) & 8191;*/
    for(let i = 0; i < Capacity; ++i){
      const CurrentValue = u32[I_HashTable + (((Hash + i) & CapacityM1) << 1)];
      if(CurrentValue === Value) return; //Set already contains element
      if(CurrentValue === 0xffffffff){
        Hash = (Hash + i) & CapacityM1;
        const SetItems = u32[I_Header] >> 16;
        u32[I_HashTable + (Hash << 1)] = Value;
        u32[I_HashTable + (Hash << 1 | 1)] = SetItems; //This sets the ID of the entry for easy access
        u32[I_ItemsList + SetItems] = Value;
        u32[I_Header] = (u32[I_Header] & 65535) | (SetItems + 1) << 16; //Adds 1 to the set size by clearing the top 16 bits and replacing them with the size plus 1.
        return;
      }
    }
    throw new Error("Ran out of space");
  }
  Clear(){
    const u32 = this.Memory.u32;
    const HeapIndex = this.SegmentOffset | u32[this.SegmentAndStackIndex];

    const I_Header = HeapIndex + 1;
    const Capacity = u32[I_Header] & 65535;
    const I_HashTable = HeapIndex + 2;
    const I_ItemsList = HeapIndex + 2 + (Capacity << 1);
    const CapacityM1 = Capacity - 1;

    const SetItems = u32[I_Header] >> 16;
    for(let i = 0; i < SetItems; ++i){
      const Value = u32[I_ItemsList + i];
      let Hash = Value;/*Math.imul(((Value >>> 16) ^ Value), 0x45d9f3b);
      Hash = Math.imul(((Hash >>> 16) ^ Hash), 0x45d9f3b);
      Hash = ((Hash >>> 16) ^ Hash) >>> 0;*/

      u32[I_ItemsList + i] = 0xffffffff;
      for(let i = 0; i < Capacity; ++i){
        if(u32[I_HashTable + (((Hash + i) & CapacityM1) << 1)] === 0xffffffff) break;
        u32[I_HashTable + (((Hash + i) & CapacityM1) << 1)] = 0xffffffff;
        u32[I_HashTable + (((Hash + i) & CapacityM1) << 1 | 1)] = 0xffffffff;
      }
    }
    u32[I_Header] &= 65535; //Set item count to 0 (clears top 16 bits, which stores the item count)
  }
  Get(Value){
    const u32 = this.Memory.u32;
    const HeapIndex = this.SegmentOffset | u32[this.SegmentAndStackIndex];

    const I_Header = HeapIndex + 1;
    const Capacity = u32[I_Header] & 65535;
    const I_HashTable = HeapIndex + 2;
    const I_ItemsList = HeapIndex + 2 + (Capacity << 1);
    const CapacityM1 = Capacity - 1;

    const SetSize = u32[I_Header] >> 16;
    //Should be faster in this case because it takes a little to calculate the hash
    if(SetSize < 4){
      for(let i = 0; i < SetSize; ++i) if(u32[I_ItemsList + i] === Value) return i;
      return 0xffffffff;
    }
    let Hash = Value;/*Math.imul(((Value >>> 16) ^ Value), 0x45d9f3b);
    Hash = Math.imul(((Hash >>> 16) ^ Hash), 0x45d9f3b);
    Hash = ((Hash >>> 16) ^ Hash) >>> 0;*/
    for(let i = 0; i < Capacity; ++i){
      const CurrentValue = u32[I_HashTable + (((Hash + i) & CapacityM1) << 1)];
      if(CurrentValue === Value) return u32[I_HashTable + (((Hash + i) & CapacityM1) << 1 | 1)];
      if(CurrentValue === 0xffffffff) return 0xffffffff;
    }
    return 0xffffffff;
  }
  Size(){
    const u32 = this.Memory.u32;
    const HeapIndex = this.SegmentOffset | u32[this.SegmentAndStackIndex];

    const I_Header = HeapIndex + 1;

    return u32[I_Header] >> 16;
  }
  ItemsListOffset(){
    const u32 = this.Memory.u32;
    const HeapIndex = this.SegmentOffset | u32[this.SegmentAndStackIndex];

    const I_Header = HeapIndex + 1;
    const Capacity = u32[I_Header] & 65535;
    const I_ItemsList = HeapIndex + 2 + (Capacity << 1);

    return I_ItemsList;
  }
};