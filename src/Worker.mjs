import * as M from "./Constants/Memory.mjs";
import * as W from "./Constants/Worker.mjs";
import MemoryManager from "./MemoryManager.mjs";
import IterableSet from "./DataStructures/IterableSet.mjs";
import GetHeight from "./GetHeight.mjs";
import {LOAD_REGIONS} from "./Constants/Worker.mjs";
import WasmBinary from "./Test.wat";
import {I_INFO_LOADED_CUBES_COUNTER} from "./Constants/Memory.mjs";

const WasmModule = new WebAssembly.Module(WasmBinary);





self.Times = new Float64Array(32 * 32);

class WorkerMain{
  constructor(MessageData){
    this.MemoryBuffer = MessageData.WasmMemory.buffer;
    this.u32 = new Uint32Array(this.MemoryBuffer);
    this.i32 = new Int32Array(this.MemoryBuffer);
    this.f32 = new Float32Array(this.MemoryBuffer);

    const Offset = this.u32[M.I_HEIGHT_DATA_INDEX];
    for(let z = 0; z < 256; ++z) for(let x = 0; x < 256; ++x){
      this.f32[Offset + (z << 8 | x)] = GetHeight(x * 16, z * 16);
    }

    this.ID = MessageData.ID;


    this.Memory = new MemoryManager(this.MemoryBuffer);

    this.Children128SegmentAndStackIndex = this.Memory.Allocate(514, true);//self.WasmInstance.exports.Allocate(514, true);
    this.AllocationTemplateSegmentAndStackIndex = this.Memory.Allocate(8192, true);//self.WasmInstance.exports.Allocate(8192, true);
    this.FreeCubeIndicesSegmentAndStackIndex = this.Memory.Allocate(514, true);//self.WasmInstance.exports.Allocate(514, true);

    {
      const FreeCubeSegmentHeapIndex = (this.FreeCubeIndicesSegmentAndStackIndex & ~65535) | this.u32[this.FreeCubeIndicesSegmentAndStackIndex];
      for(let i = 2; i < 514; ++i){
        this.u32[FreeCubeSegmentHeapIndex + i] = 0;
      }
    }

    //this.TypesSet = new IterableSet(8192, this.Memory);
    this.TypesSetSSI = self.WasmInstance.exports.SetCreate(8192);
    this.TempRLESegmentAndStackIndex = this.Memory.Allocate(8210, true);//self.WasmInstance.exports.Allocate(8210, true);
  }
  [LOAD_REGIONS](){
    const MinX128 = this.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MIN_X)];
    const MinY128 = this.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MIN_Y)];
    const MinZ128 = this.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MIN_Z)];
    const MaxX128 = this.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MAX_X)];
    const MaxY128 = this.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MAX_Y)];
    const MaxZ128 = this.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MAX_Z)];
    for(let z128 = MinZ128; z128 < MaxZ128; ++z128) for(let x128 = MinX128; x128 < MaxX128; ++x128){
      const HeightDataOffset = this.u32[M.I_HEIGHT_DATA_INDEX];
      let MinY = 32767;
      let MaxY = -32768;
      for(let z = 0; z < 10; ++z) for(let x = 0; x < 10; ++x){
        const Height = this.f32[HeightDataOffset + (((z128 << 11) + (z << 8)) | ((x128 << 3) + x))];
        MinY = Math.min(MinY, Height);
        MaxY = Math.max(MaxY, Height);
      }
      for(let y128 = MinY128; y128 <= MaxY128; ++y128){
        if(y128 < Math.floor(MinY / 128) || y128 > Math.floor(MaxY / 128)){
          //Mark region as fully empty
          Atomics.or(this.u32, this.u32[M.I_WORLD_GRID_INFO_INDEX] + (0 << 13 | z128 << 8 | y128 << 3 | x128 >> 2), M.MASK_IS_EMPTY << ((x128 & 3) << 3));
        } else{
          const QueryResult = Atomics.or(this.u32, this.u32[M.I_WORLD_GRID_INFO_INDEX] + (0 << 13 | z128 << 8 | y128 << 3 | x128 >> 2), M.MASK_GENERATING << ((x128 & 3) << 3));
          if((QueryResult & (M.MASK_GENERATING << ((x128 & 3) << 3))) !== 0) continue; //Some other thread is generating / has generated this
          this.LoadRegion(x128, y128, z128);
        }
      }
    }
  }
  LoadRegion(x128, y128, z128){
    const InterpolatedHeights = new Int32Array(32 * 32);
    const Min4s = new Int32Array(16);
    const Max4s = new Int32Array(16);
    const GroundTypes = new Uint32Array([2, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const EmptyCube = new Uint32Array(4096);


    const HeightDataOffset = this.u32[M.I_HEIGHT_DATA_INDEX];
    let FreeCubeIndex = 0;

    const Children128HeapIndex = (this.Children128SegmentAndStackIndex & ~65535) | this.u32[this.Children128SegmentAndStackIndex];
    for(let i = 2; i < 514; ++i) this.u32[Children128HeapIndex + i] = 0;

    let NonEmptyChildrenCount = 0;

    for(let z16 = 0; z16 < 8; ++z16){
      for(let x16 = 0; x16 < 8; ++x16){
        const HeightMM = this.f32[HeightDataOffset + (((z128 << 11) + (z16 << 8)) | ((x128 << 3) + x16))];
        const HeightM0 = this.f32[HeightDataOffset + (((z128 << 11) + (z16 << 8)) | ((x128 << 3) + (x16 + 1)))];
        const HeightMP = this.f32[HeightDataOffset + (((z128 << 11) + (z16 << 8)) | ((x128 << 3) + (x16 + 2)))];
        const Height0M = this.f32[HeightDataOffset + (((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + x16))];
        const Height00 = this.f32[HeightDataOffset + (((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + (x16 + 1)))];
        const Height0P = this.f32[HeightDataOffset + (((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + (x16 + 2)))];
        const HeightPM = this.f32[HeightDataOffset + (((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + x16))];
        const HeightP0 = this.f32[HeightDataOffset + (((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + (x16 + 1)))];
        const HeightPP = this.f32[HeightDataOffset + (((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + (x16 + 2)))];


        for(let z = 0; z < 9; ++z) for(let x = 0; x < 9; ++x){
          InterpolatedHeights[z << 5 | x] = Math.floor((
            HeightMM * (16. - (x + 7)) * (16. - (z + 7)) +
            HeightM0 * (x + 7) * (16. - (z + 7)) +
            Height0M * (16. - (x + 7)) * (z + 7) +
            Height00 * (x + 7) * (z + 7)
          ) / 256.);


          InterpolatedHeights[z << 5 | (x + 9)] = Math.floor((
            HeightM0 * (16. - x) * (16. - (z + 7)) +
            HeightMP * x * (16. - (z + 7)) +
            Height00 * (16. - x) * (z + 7) +
            Height0P * x * (z + 7)
          ) / 256.);


          InterpolatedHeights[(z + 9) << 5 | x] = Math.floor((
            Height0M * (16. - (x + 7)) * (16. - z) +
            Height00 * (x + 7) * (16. - z) +
            HeightPM * (16. - (x + 7)) * z +
            HeightP0 * (x + 7) * z
          ) / 256.);


          InterpolatedHeights[(z + 9) << 5 | (x + 9)] = Math.floor((
            Height00 * (16. - x) * (16. - z) +
            Height0P * x * (16. - z) +
            HeightP0 * (16. - x) * z +
            HeightPP * x * z
          ) / 256.);
        }


        let YMin = 2147483647;
        let YMax = -2147483648;

        Min4s.fill(2147483647);
        Max4s.fill(-2147483648);

        for(let z4 = 0; z4 < 4; ++z4) for(let x4 = 0; x4 < 4; ++x4){
          const Offset = z4 << 7 | x4 << 2;
          let Min = 2147483647;
          let Max = -2147483648;
          for(let z1 = 0; z1 < 6; ++z1) for(let x1 = 0; x1 < 6; x1 += 2){
            let Large = InterpolatedHeights[Offset + (z1 << 5 | x1)];
            let Small = InterpolatedHeights[Offset + (z1 << 5 | x1 | 1)];
            if(Large < Small){
              const Temp = Large;
              Large = Small;
              Small = Temp;
            }
            Min = Math.min(Small, Min);
            Max = Math.max(Large, Max);
          }
          YMin = Math.min(YMin, Min);
          YMax = Math.max(YMax, Max);

          Min4s[z4 << 2 | x4] = Math.floor(Min);
          Max4s[z4 << 2 | x4] = Math.floor(Max);
        }


        const y16_Min = Math.max(Math.floor((YMin - (y128 << 7)) / 16), 0);
        const y16_Max = Math.min(Math.floor((YMax - (y128 << 7)) / 16), 7);

        for(let y16 = y16_Min; y16 <= y16_Max; ++y16){
          const FreeCubeIndicesHeapIndex = (this.FreeCubeIndicesSegmentAndStackIndex & ~65535) | this.u32[this.FreeCubeIndicesSegmentAndStackIndex];
          let CubeSegmentAndStackIndex = this.u32[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex];
          if(CubeSegmentAndStackIndex === 0){
            CubeSegmentAndStackIndex = this.Memory.Allocate(4130, true);//self.WasmInstance.exports.Allocate(4130, true);
            this.u32[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex] = CubeSegmentAndStackIndex;
          }
          FreeCubeIndex++;
          const CubeHeapIndex = (CubeSegmentAndStackIndex & ~65535) | this.u32[CubeSegmentAndStackIndex];
          this.u32.set(EmptyCube, CubeHeapIndex + 2);

          for(let i = 0; i < 16; ++i){
            this.u32[CubeHeapIndex + 4098 + i] = Min4s[i];
            this.u32[CubeHeapIndex + 4114 + i] = Max4s[i];
          }

          //The start of the memory allocation, plus two for the header, plus the specific region
          this.u32[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)] = CubeSegmentAndStackIndex;
          NonEmptyChildrenCount++;

          for(let z1 = 0; z1 < 16; ++z1) for(let x1 = 0; x1 < 16; ++x1){
            const MapHeight = InterpolatedHeights[(z1 + 1) << 5 | (x1 + 1)] - (y128 << 7 | y16 << 4);
            for(let y1 = 0, y1Max = Math.min(MapHeight + 1, 16); y1 < y1Max; ++y1){
              const HeightDifference = MapHeight - y1;
              const Type = GroundTypes[HeightDifference > 15 ? 15 : HeightDifference];
              this.u32[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | x1)] = Type; //This gets the type
              //self.WasmInstance.exports.Write(CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | x1), Type);
            }
          }
        }
      }
    } //End z16

    //Test structure spawn
    /*if(false){
      const FreeCubeIndicesHeapIndex = FreeCubeIndicesSegmentArray[FreeCubeIndicesStackIndex];
      if(true || x128 === 3 && z128 === 3){
        for(let z16 = 0; z16 < 8; ++z16) for(let y16 = 0; y16 < 8; ++y16) for(let x16 = 0; x16 < 8; ++x16){
          let CubeSegmentAndStackIndex = 0;
          let CubeSegmentArray;
          let CubeHeapIndex;
          for(let z1 = 0; z1 < 16; ++z1) for(let y1 = 0; y1 < 16; ++y1) for(let x1 = 0; x1 < 16; ++x1){
            const Distance = Math.abs((z16 << 4 | z1) - 64) + Math.abs((y16 << 4 | y1) - 64) + Math.abs((x16 << 4 | x1) - 64);
            if(Distance < ((x16 << 4 | x1) ^ (y16 << 4 | y1) ^ (z16 << 4 | z1))){
              if(CubeSegmentAndStackIndex === 0){
                CubeSegmentAndStackIndex = Children128SegmentArray[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)];
                if(CubeSegmentAndStackIndex === 0){
                  CubeSegmentAndStackIndex = FreeCubeIndicesSegmentArray[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex];
                  if(CubeSegmentAndStackIndex === 0){
                    CubeSegmentAndStackIndex = this.Memory.Allocate(4130, true);
                    FreeCubeIndicesSegmentArray[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex] = CubeSegmentAndStackIndex;
                  }
                  Children128SegmentArray[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)] = CubeSegmentAndStackIndex;
                  NonEmptyChildrenCount++;
                  FreeCubeIndex++;


                  const CubeSegmentIndex = CubeSegmentAndStackIndex >> 16;
                  const CubeStackIndex = CubeSegmentAndStackIndex & 65535;
                  CubeSegmentArray = this.MemorySegments_u32[CubeSegmentIndex];
                  CubeHeapIndex = CubeSegmentArray[CubeStackIndex];
                  for(let i = 0; i < 4096; ++i) CubeSegmentArray[CubeHeapIndex + 2 + i] = 0;
                }
                const CubeSegmentIndex = CubeSegmentAndStackIndex >> 16;
                const CubeStackIndex = CubeSegmentAndStackIndex & 65535;
                CubeSegmentArray = this.MemorySegments_u32[CubeSegmentIndex];
                CubeHeapIndex = CubeSegmentArray[CubeStackIndex];
                for(let i = 0; i < 16; ++i){
                  CubeSegmentArray[CubeHeapIndex + 4098 + i] = 0;
                  CubeSegmentArray[CubeHeapIndex + 4114 + i] = 15;
                }

              }
              CubeSegmentArray[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | x1)] = 3;

            }
          }
        }
      }
    }*/

    const Allocation128SegmentAndStackIndex = this.Memory.Allocate(531 + NonEmptyChildrenCount, false);//self.WasmInstance.exports.Allocate(531 + NonEmptyChildrenCount, false);
    const Allocation128HeapIndex = (Allocation128SegmentAndStackIndex & ~65535) | this.u32[Allocation128SegmentAndStackIndex];
    for(let i = 2; i < 530; ++i) this.u32[Allocation128HeapIndex + i] = 0;

    this.u32[Allocation128HeapIndex + 530] = NonEmptyChildrenCount;
    for(let i = 0, Counter = Allocation128HeapIndex + 531; i < 512; ++i){
      if(this.u32[Children128HeapIndex + 2 + i] !== 0){
        this.u32[Counter++] = i; //Store the local coordinate (8x8x8) of every 16-cube that's not empty
      }
    }

    for(let z16 = 0; z16 < 8; ++z16) for(let y16 = 0; y16 < 8; ++y16) for(let x16 = 0; x16 < 8; ++x16){
      const CubeSegmentAndStackIndex = this.u32[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)];
      if(CubeSegmentAndStackIndex === 0) continue; //Is either hidden below ground or empty

      const AllocationTemplateHeapIndex = (this.AllocationTemplateSegmentAndStackIndex & ~65535) | this.u32[this.AllocationTemplateSegmentAndStackIndex];
      for(let i = 1; i < 8; ++i) this.u32[AllocationTemplateHeapIndex + i] = 0;

      const CubeHeapIndex = (CubeSegmentAndStackIndex & ~65535) | this.u32[CubeSegmentAndStackIndex];

      let MinX16 = 15;
      let MinY16 = 15;
      let MinZ16 = 15;
      let MaxX16 = 0;
      let MaxY16 = 0;
      let MaxZ16 = 0;

      Outer: for(let x = 0; x <= 15; ++x) for(let z = 0; z <= 15; ++z) for(let y = 0; y <= 15; ++y) if(this.u32[CubeHeapIndex + 2 + (z << 8 | y << 4 | x)] !== 0){
        MinX16 = x;
        break Outer;
      }
      Outer: for(let y = 0; y <= 15; ++y) for(let z = 0; z <= 15; ++z) for(let x = MinX16; x <= 15; ++x) if(this.u32[CubeHeapIndex + 2 + (z << 8 | y << 4 | x)] !== 0){
        MinY16 = y;
        break Outer;
      }
      Outer: for(let z = 0; z <= 15; ++z) for(let y = MinY16; y <= 15; ++y) for(let x = MinX16; x <= 15; ++x) if(this.u32[CubeHeapIndex + 2 + (z << 8 | y << 4 | x)] !== 0){
        MinZ16 = z;
        break Outer;
      }

      Outer: for(let x = 15; x >= MinX16; --x) for(let z = MinZ16; z <= 15; ++z) for(let y = MinY16; y <= 15; ++y) if(this.u32[CubeHeapIndex + 2 + (z << 8 | y << 4 | x)] !== 0){
        MaxX16 = x;
        break Outer;
      }
      Outer: for(let y = 15; y >= MinY16; --y) for(let z = MinZ16; z <= 15; ++z) for(let x = MinX16; x <= MaxX16; ++x) if(this.u32[CubeHeapIndex + 2 + (z << 8 | y << 4 | x)] !== 0){
        MaxY16 = y;
        break Outer;
      }
      Outer: for(let z = 15; z >= MinZ16; --z) for(let y = MinY16; y <= MaxY16; ++y) for(let x = MinX16; x <= MaxX16; ++x) if(this.u32[CubeHeapIndex + 2 + (z << 8 | y << 4 | x)] !== 0){
        MaxZ16 = z;
        break Outer;
      }

      let MinYTerrain = 2147483647;
      for(let i = 0; i < 16; ++i){
        MinYTerrain = Math.min(this.u32[CubeHeapIndex + 4098 + i], MinYTerrain);
      }
      MinY16 = Math.min(Math.max(MinY16, MinYTerrain - (y128 << 7 | y16 << 4)), 15);

      let L0Allocations = 0;
      let L1Allocations = 0;
      let L2Allocations = 0;
      let TotalAllocations = 0;
      let L0Bitmap16 = 0;
      let L1Bitmap16 = 0;
      let L2Bitmap16 = 0;
      let L3Bitmap16 = 0;

      for(let y4 = MinY16 >> 1; y4 <= (MaxY16 >> 1); ++y4) for(let z4 = MinZ16 >> 2; z4 <= (MaxZ16 >> 2); ++z4) for(let x4 = MinX16 >> 2; x4 <= (MaxX16 >> 2); ++x4){
        const Offset = CubeHeapIndex + 2 + (z4 << 10 | y4 << 5 | x4 << 2);
        const Bitmap4 = (this.u32[Offset] && 1)
          | (this.u32[Offset + 0x001] && 2)
          | (this.u32[Offset + 0x002] && 4)
          | (this.u32[Offset + 0x003] && 8)
          | (this.u32[Offset + 0x100] && 16)
          | (this.u32[Offset + 0x101] && 32)
          | (this.u32[Offset + 0x102] && 64)
          | (this.u32[Offset + 0x103] && 128)
          | (this.u32[Offset + 0x200] && 256)
          | (this.u32[Offset + 0x201] && 512)
          | (this.u32[Offset + 0x202] && 1024)
          | (this.u32[Offset + 0x203] && 2048)
          | (this.u32[Offset + 0x300] && 4096)
          | (this.u32[Offset + 0x301] && 8192)
          | (this.u32[Offset + 0x302] && 16384)
          | (this.u32[Offset + 0x303] && 32768)
          | (this.u32[Offset + 0x010] && 65536)
          | (this.u32[Offset + 0x011] && 131072)
          | (this.u32[Offset + 0x012] && 262144)
          | (this.u32[Offset + 0x013] && 524288)
          | (this.u32[Offset + 0x110] && 1048576)
          | (this.u32[Offset + 0x111] && 2097152)
          | (this.u32[Offset + 0x112] && 4194304)
          | (this.u32[Offset + 0x113] && 8388608)
          | (this.u32[Offset + 0x210] && 16777216)
          | (this.u32[Offset + 0x211] && 33554432)
          | (this.u32[Offset + 0x212] && 67108864)
          | (this.u32[Offset + 0x213] && 134217728)
          | (this.u32[Offset + 0x310] && 268435456)
          | (this.u32[Offset + 0x311] && 536870912)
          | (this.u32[Offset + 0x312] && 1073741824)
          | (this.u32[Offset + 0x313] && 2147483648);
        if(Bitmap4 !== 0){
          this.u32[AllocationTemplateHeapIndex + 8 + TotalAllocations] = Bitmap4;
          TotalAllocations++;
          if(y4 < 2)      L0Bitmap16 |= 1 << (y4 << 4 | z4 << 2 | x4), L0Allocations++;
          else if(y4 < 4) L1Bitmap16 |= 1 << ((y4 & 1) << 4 | z4 << 2 | x4), L1Allocations++;
          else if(y4 < 6) L2Bitmap16 |= 1 << ((y4 & 1) << 4 | z4 << 2 | x4), L2Allocations++;
          else            L3Bitmap16 |= 1 << ((y4 & 1) << 4 | z4 << 2 | x4);
        }
      }

      if(MinX16 > MaxX16 || MinY16 > MaxY16 || MinZ16 > MaxZ16){
        MaxX16 = 0;
        MaxY16 = 0;
        MaxZ16 = 0;
        MinX16 = 0;
        MinY16 = 0;
        MinZ16 = 0;
      }

      this.u32[AllocationTemplateHeapIndex + 1] = TotalAllocations + 8; //Start of RLE
      this.u32[AllocationTemplateHeapIndex + 2] = MaxZ16 << 20 | MaxY16 << 16 | MaxX16 << 12 | MinZ16 << 8 | MinY16 << 4 | MinX16;
      this.u32[AllocationTemplateHeapIndex + 3] = L0Allocations << 23 | (L0Allocations + L1Allocations) << 16 | (L0Allocations + L1Allocations + L2Allocations) << 9 | z16 << 6 | y16 << 3 | x16;
      this.u32[AllocationTemplateHeapIndex + 4] = L0Bitmap16;
      this.u32[AllocationTemplateHeapIndex + 5] = L1Bitmap16;
      this.u32[AllocationTemplateHeapIndex + 6] = L2Bitmap16;
      this.u32[AllocationTemplateHeapIndex + 7] = L3Bitmap16;


      const TempRLEHeapIndex = (this.TempRLESegmentAndStackIndex & ~65535) | this.u32[this.TempRLESegmentAndStackIndex];

      self.WasmInstance.exports.SetClear(this.TypesSetSSI);

      for(let i = 0; i < 16; ++i) this.u32[TempRLEHeapIndex + 8194 + i] = 0;

      // RLE_0: 4509003, 917 fps, 2171 ms
      // RLE_1: 4505755, 912 fps, 2440 ms
      // RLE_2: 4325327, 929 fps, 2385 ms
      // RLE_3: 4105167, 936 fps, 2581 ms (didn't work correctly)
      // RLE_4: 6676175, 956 fps, 2393 ms
      // RLE_5: 4276946, 932 fps, 2305 ms
      // RLE_6: 4276946, 932 fps, 2069 ms
      // RLE_7: 4413594, 917 fps, 2492 ms (three types)
      for(let y1 = MinY16; y1 <= MaxY16; ++y1){
        let CurrentType = this.u32[CubeHeapIndex + 2 + (y1 << 4)]; //Get voxel at 0, y1, 0
        let LayerItems = 0;
        let CurrentBitmap = (y1 < 8 ? y1 < 4 ? L0Bitmap16 : L1Bitmap16 : y1 < 12 ? L2Bitmap16 : L3Bitmap16) >> ((y1 & 2) << 3); //Shifts by 16 if y1 % 4 >= 2.
        for(let z4 = 0; z4 < 4; ++z4, CurrentBitmap >>= 4){
          if((CurrentBitmap & 15) === 0){
            continue;
          }
          for(let z1 = 0; z1 < 4; ++z1){
            const Offset = CubeHeapIndex + 2 + (z4 << 10 | z1 << 8 | y1 << 4);
            for(let x4 = 0; x4 < 4; ++x4){
              if((CurrentBitmap & (1 << x4)) === 0){
                continue;
              }
              for(let x1 = 0; x1 < 4; ++x1){
                const Type = this.u32[Offset + (x4 << 2 | x1)];
                if(Type !== 0/* && ( //This can reduce memory usage by not taking into account the types of occluded voxels. It only works when I'm not skipping parts (like where I'm checking against the bitmap)
                  x1 === 0 || x1 === 15 || y1 === 0 || y1 === 15 || z1 === 0 || z1 === 15 ||
                  this.u32[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | (x1 - 1))] === 0 ||
                  this.u32[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | (x1 + 1))] === 0 ||
                  this.u32[CubeHeapIndex + 2 + (z1 << 8 | (y1 - 1) << 4 | x1)] === 0 ||
                  this.u32[CubeHeapIndex + 2 + (z1 << 8 | (y1 + 1) << 4 | x1)] === 0 ||
                  this.u32[CubeHeapIndex + 2 + ((z1 - 1) << 8 | y1 << 4 | x1)] === 0 ||
                  this.u32[CubeHeapIndex + 2 + ((z1 + 1) << 8 | y1 << 4 | x1)] === 0*/
                ){
                  if(CurrentType === 0) CurrentType = Type;
                  if((LayerItems === 0 || CurrentType !== Type)) self.WasmInstance.exports.SetAdd(this.TypesSetSSI, Type);
                  if(CurrentType !== Type){
                    this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 0)] = CurrentType;
                    this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 1)] = (z4 << 6 | z1 << 4 | x4 << 2 | x1) - 1; //-1 is so that it's in the range [0, 255] instead of [1, 256]
                    LayerItems++;
                    CurrentType = Type;
                  }
                }
              }
            }
          }
        }
        if(CurrentType !== 0){
          this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 0)] = CurrentType;
          this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 1)] = 255; //-1 is so that it's in the range [0, 255] instead of [1, 256]
          LayerItems++;
        }
        this.u32[TempRLEHeapIndex + 2 + (8192 | y1)] = LayerItems; //Will be 0 if this column was just air
      }

      if(self.WasmInstance.exports.SetSize(this.TypesSetSSI) === 0) continue; //TODO: Maybe this is bad?


      const TypeCount = self.WasmInstance.exports.SetSize(this.TypesSetSSI);
      const RLEOffset = AllocationTemplateHeapIndex + TotalAllocations + 8;

      let CurrentIndex = 0;
      this.u32[RLEOffset + CurrentIndex++] = TypeCount;

      const I_ItemsList = self.WasmInstance.exports.SetItemsListOffset(this.TypesSetSSI);

      if(TypeCount === 1){
        this.u32[RLEOffset + CurrentIndex++] = this.u32[I_ItemsList];
      } else if(TypeCount >= 2){
        //Before this will be the offsets
        CurrentIndex += 6;
        const TypesMapIntOffset = CurrentIndex;
        //This writes all the different types
        for(let i = 0; i < TypeCount; ++i){
          this.u32[RLEOffset + CurrentIndex++] = this.u32[I_ItemsList + i];
        }

        let LocalOffset = 0;
        this.u32[RLEOffset + CurrentIndex] = 0;

        if(TypeCount === 2){
          for(let y1 = 0; y1 < 16; ++y1){
            const Length = this.u32[TempRLEHeapIndex + 2 + 8192 + y1];
            this.u32[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
            if(Length === 0) continue; //Has no RLE data or is completely empty

            for(let i = 0; i < Length; ++i, ++LocalOffset){
              this.u32[RLEOffset + CurrentIndex] |= self.WasmInstance.exports.SetGet(this.TypesSetSSI, this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << (LocalOffset & 31);
              if((LocalOffset & 31) === 31){
                CurrentIndex++;
                this.u32[RLEOffset + CurrentIndex] = 0;
              }
            }
          }
          if((LocalOffset & 31) === 0) CurrentIndex--;
        } else if(TypeCount <= 4){
          for(let y1 = 0; y1 < 16; ++y1){
            const Length = this.u32[TempRLEHeapIndex + 2 + 8192 + y1];
            this.u32[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
            if(Length === 0) continue; //Has no RLE data or is completely empty

            for(let i = 0; i < Length; ++i, ++LocalOffset){
              this.u32[RLEOffset + CurrentIndex] |= self.WasmInstance.exports.SetGet(this.TypesSetSSI, this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 15) << 1);
              if((LocalOffset & 15) === 15){
                CurrentIndex++;
                this.u32[RLEOffset + CurrentIndex] = 0;
              }
            }
          }
          if((LocalOffset & 15) === 0) CurrentIndex--;
        } else if(TypeCount <= 16){
          for(let y1 = 0; y1 < 16; ++y1){
            const Length = this.u32[TempRLEHeapIndex + 2 + 8192 + y1];
            this.u32[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
            if(Length === 0) continue; //Has no RLE data or is completely empty

            for(let i = 0; i < Length; ++i, ++LocalOffset){
              this.u32[RLEOffset + CurrentIndex] |= self.WasmInstance.exports.SetGet(this.TypesSetSSI, this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 7) << 2);
              if((LocalOffset & 7) === 7){
                CurrentIndex++;
                this.u32[RLEOffset + CurrentIndex] = 0;
              }
            }
          }
          if((LocalOffset & 7) === 0) CurrentIndex--;
        } else if(TypeCount <= 256){
          for(let y1 = 0; y1 < 16; ++y1){
            const Length = this.u32[TempRLEHeapIndex + 2 + 8192 + y1];
            this.u32[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
            if(Length === 0) continue; //Has no RLE data or is completely empty

            for(let i = 0; i < Length; ++i, ++LocalOffset){
              this.u32[RLEOffset + CurrentIndex] |= self.WasmInstance.exports.SetGet(this.TypesSetSSI, this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 3) << 3);
              if((LocalOffset & 3) === 3){
                CurrentIndex++;
                this.u32[RLEOffset + CurrentIndex] = 0;
              }
            }
          }
          if((LocalOffset & 3) === 0) CurrentIndex--;
        } else{
          for(let y1 = 0; y1 < 16; ++y1){
            const Length = this.u32[TempRLEHeapIndex + 2 + 8192 + y1];
            this.u32[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
            if(Length === 0) continue; //Has no RLE data or is completely empty

            for(let i = 0; i < Length; ++i, ++LocalOffset){
              this.u32[RLEOffset + CurrentIndex] |= self.WasmInstance.exports.SetGet(this.TypesSetSSI, this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 1) << 4);
              if((LocalOffset & 1) === 1){
                CurrentIndex++;
                this.u32[RLEOffset + CurrentIndex] = 0;
              }
            }
          }
          if((LocalOffset & 1) === 0) CurrentIndex--;
        }


        CurrentIndex++;
        this.u32[RLEOffset + CurrentIndex] = 0;

        const LengthIntOffset = CurrentIndex;

        LocalOffset = 0;
        for(let y1 = 0; y1 < 16; ++y1){
          const Length = this.u32[TempRLEHeapIndex + 2 + 8192 + y1];
          if(
            Length === 0 || //Has no rle data
            (this.u32[TempRLEHeapIndex + 2 + (y1 << 9)] === 0 && this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | 1)] === 255) //Is fully empty
          ) continue;
          for(let i = 0; i < Length; ++i, ++LocalOffset){
            this.u32[RLEOffset + CurrentIndex] |= this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1 | 1)] << ((LocalOffset & 3) << 3);
            if((LocalOffset & 3) === 3){
              CurrentIndex++;
              this.u32[RLEOffset + CurrentIndex] = 0;
            }
          }
        }
        if((LocalOffset & 3) === 0) CurrentIndex--;
        CurrentIndex++;

        this.u32[RLEOffset + 1] = LengthIntOffset << 16 | TypesMapIntOffset;
        for(let i = 0; i < 5; ++i){
          const Reference = this.u32[AllocationTemplateHeapIndex + 8177 + i * 3];
          const Difference2 = this.u32[AllocationTemplateHeapIndex + 8178 + i * 3] - Reference;
          const Difference3 = this.u32[AllocationTemplateHeapIndex + 8179 + i * 3] - Reference;
          this.u32[RLEOffset + 2 + i] = Difference3 << 21 | Difference2 << 12 | Reference;
        }
      }


      //Copy memory to permanent allocation
      const AllocationSize = TotalAllocations + CurrentIndex + 8;

      const PermanentAllocationSegmentAndStackIndex = this.Memory.Allocate(AllocationSize, false);//self.WasmInstance.exports.Allocate(AllocationSize, false);
      const PermanentAllocationHeapIndex = (PermanentAllocationSegmentAndStackIndex & ~65535) | this.u32[PermanentAllocationSegmentAndStackIndex];


      for(let i = 1; i < AllocationSize; ++i){
        this.u32[PermanentAllocationHeapIndex + i] = this.u32[AllocationTemplateHeapIndex + i];
      }


      //this.Memory.RequestGPUUpload(PermanentAllocationSegmentAndStackIndex);
      self.WasmInstance.exports.RequestGPUUpload(PermanentAllocationSegmentAndStackIndex);
      Atomics.sub(this.u32, (PermanentAllocationSegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);

      Atomics.add(this.u32, M.I_INFO_LOADED_CUBES_COUNTER, 1);

      this.u32[Allocation128HeapIndex + 2 + (z16 << 1 | y16 >> 2)] |= 1 << ((y16 & 3) << 3) | x16;
      this.u32[Allocation128HeapIndex + 2 + 16 + (z16 << 6 | y16 << 3 | x16)] = PermanentAllocationSegmentAndStackIndex;
    }

    //this.Memory.RequestGPUUpload(Allocation128SegmentAndStackIndex);
    self.WasmInstance.exports.RequestGPUUpload(Allocation128SegmentAndStackIndex);
    Atomics.sub(this.u32, (Allocation128SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);

    this.u32[this.u32[M.I_WORLD_GRID_INDEX] + (0 << 15 | z128 << 10 | y128 << 5 | x128)] = Allocation128SegmentAndStackIndex;
    this.u32[M.I_UPDATED_LOD_LEVELS_MASK] |= 1 << 0;

    //Mark region as generated
    Atomics.or(this.u32, this.u32[M.I_WORLD_GRID_INFO_INDEX] + (0 << 13 | z128 << 8 | y128 << 3 | x128 >> 2), M.MASK_GENERATED << ((x128 & 3) << 3));

    self.Times[z128 << 5 | x128] = self.performance.now();

    const FreeCubeIndicesHeapIndex = (this.FreeCubeIndicesSegmentAndStackIndex & ~65535) | this.u32[this.FreeCubeIndicesSegmentAndStackIndex];
    /*for(let i = 0; i < FreeCubeIndex; ++i){
      const SSI = this.u32[FreeCubeIndicesHeapIndex + 2 + i];
      Atomics.sub(this.u32, (SSI & 0xffff0000) | M.I_USAGE_COUNTER, 1);
      this.Memory.Deallocate(SSI);
    }*/
    //Atomics.sub(this.u32, (this.FreeCubeIndicesSegmentAndStackIndex & 0xffff0000) | M.I_USAGE_COUNTER, 1);
  }
}
self.iWorkerMain = null;
self.WasmInstance = null;
self.onmessage = function(Event){
  const Data = Event.data;
  if(Data.Request === W.INITIALISE){
    self.WasmInstance = new WebAssembly.Instance(WasmModule, {console, "Main": {"MemoryBuffer": Data.WasmMemory}});
    self.iWorkerMain = new WorkerMain(Data);
  } else{
    self.iWorkerMain[Data.Request](Data);
  }
};
