import * as M from "./Constants/Memory.mjs";
import * as W from "./Constants/Worker.mjs";
import MemoryManager from "./MemoryManager.mjs";
import IterableSet from "./DataStructures/IterableSet.mjs";
import GetHeight from "./GetHeight.mjs";

const Heights = new Float32Array(256 * 256);
for(let z = 0; z < 256; ++z) for(let x = 0; x < 256; ++x){
  Heights[z << 8 | x] = GetHeight(x * 16, z * 16);
}

const InterpolatedHeights = new Float32Array(18 * 18);
const Min4s = new Float32Array(16);
const Max4s = new Float32Array(16);



class WorkerMain{
  constructor(MessageData){
    this.MemoryBuffer = MessageData.MemoryBuffer;
    this.u32 = new Uint32Array(this.MemoryBuffer);
    this.i32 = new Int32Array(this.MemoryBuffer);
    this.ID = MessageData.ID;


    this.Memory = new MemoryManager(this.MemoryBuffer);

    const Children128SegmentAndStackIndex = this.Memory.Allocate(514, true);

    const AllocationTemplateSegmentAndStackIndex = this.Memory.Allocate(8192, true);

    let FreeCubeIndex = 0;

    const FreeCubeIndicesSegmentAndStackIndex = this.Memory.Allocate(514, true);

    {
      const FreeCubeSegmentHeapIndex = (FreeCubeIndicesSegmentAndStackIndex & ~65535) | this.u32[FreeCubeIndicesSegmentAndStackIndex];
      for(let i = 2; i < 514; ++i){
        this.u32[FreeCubeSegmentHeapIndex + i] = 0;
      }
    }

    const TypesSet = new IterableSet(8192, this.Memory);


    const TempRLESegmentAndStackIndex = this.Memory.Allocate(8210, true);











    for(let z128 = 0; z128 < 31; ++z128) for(let x128 = 0; x128 < 31; ++x128){
      if(z128 === 7 && x128 === 0) console.time("Initialisation");
      //Find bounds for y values in 128² region
      let MinY = 32767;
      let MaxY = -32768;
      for(let z = 0; z < 10; ++z) for(let x = 0; x < 10; ++x){
        const Height = Heights[((z128 << 11) + (z << 8)) | ((x128 << 3) + x)];
        MinY = Math.min(MinY, Height);
        MaxY = Math.max(MaxY, Height);
      }
      for(let y128 = Math.floor(MinY / 128), y128_Max = Math.floor(MaxY / 128); y128 <= y128_Max; ++y128){
        const Children128HeapIndex = (Children128SegmentAndStackIndex & ~65535) | this.u32[Children128SegmentAndStackIndex];
        for(let i = 2; i < 514; ++i) this.u32[Children128HeapIndex + i] = 0;

        let NonEmptyChildrenCount = 0;

        for(let z16 = 0; z16 < 8; ++z16){
          for(let x16 = 0; x16 < 8; ++x16){
            const HeightMM = Heights[((z128 << 11) + (z16 << 8)) | ((x128 << 3) + x16)];
            const HeightM0 = Heights[((z128 << 11) + (z16 << 8)) | ((x128 << 3) + (x16 + 1))];
            const HeightMP = Heights[((z128 << 11) + (z16 << 8)) | ((x128 << 3) + (x16 + 2))];
            const Height0M = Heights[((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + x16)];
            const Height00 = Heights[((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + (x16 + 1))];
            const Height0P = Heights[((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + (x16 + 2))];
            const HeightPM = Heights[((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + x16)];
            const HeightP0 = Heights[((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + (x16 + 1))];
            const HeightPP = Heights[((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + (x16 + 2))];


            for(let z = 0; z < 9; ++z) for(let x = 0; x < 9; ++x){
              InterpolatedHeights[z * 18 + x] = (
                HeightMM * (16. - (x + 7)) * (16. - (z + 7)) +
                HeightM0 * (x + 7) * (16. - (z + 7)) +
                Height0M * (16. - (x + 7)) * (z + 7) +
                Height00 * (x + 7) * (z + 7)
              ) / 256.;


              InterpolatedHeights[z * 18 + (x + 9)] = (
                HeightM0 * (16. - x) * (16. - (z + 7)) +
                HeightMP * x * (16. - (z + 7)) +
                Height00 * (16. - x) * (z + 7) +
                Height0P * x * (z + 7)
              ) / 256.;


              InterpolatedHeights[(z + 9) * 18 + x] = (
                Height0M * (16. - (x + 7)) * (16. - z) +
                Height00 * (x + 7) * (16. - z) +
                HeightPM * (16. - (x + 7)) * z +
                HeightP0 * (x + 7) * z
              ) / 256.;


              InterpolatedHeights[(z + 9) * 18 + (x + 9)] = (
                Height00 * (16. - x) * (16. - z) +
                Height0P * x * (16. - z) +
                HeightP0 * (16. - x) * z +
                HeightPP * x * z
              ) / 256.;
            }


            let YMin = 2147483647;
            let YMax = -2147483648;

            Min4s.fill(2147483647);
            Max4s.fill(-2147483648);

            for(let z4 = 0; z4 < 4; ++z4) for(let x4 = 0; x4 < 4; ++x4){
              const Offset = (z4 * 4) * 18 + (x4 * 4);
              let Min = 2147483647;
              let Max = -2147483648;
              for(let z1 = 0; z1 < 6; ++z1) for(let x1 = 0; x1 < 6; x1 += 2){
                let Large = InterpolatedHeights[Offset + z1 * 18 + x1];
                let Small = InterpolatedHeights[Offset + z1 * 18 + x1 + 1];
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
              const FreeCubeIndicesHeapIndex = (FreeCubeIndicesSegmentAndStackIndex & ~65535) | this.u32[FreeCubeIndicesSegmentAndStackIndex];
              let CubeSegmentAndStackIndex = this.u32[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex];
              if(CubeSegmentAndStackIndex === 0){
                CubeSegmentAndStackIndex = this.Memory.Allocate(4130, true);
                this.u32[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex] = CubeSegmentAndStackIndex;
              }
              FreeCubeIndex++;
              const CubeHeapIndex = (CubeSegmentAndStackIndex & ~65535) | this.u32[CubeSegmentAndStackIndex];

              for(let i = 0; i < 16; ++i){
                this.u32[CubeHeapIndex + 4098 + i] = Min4s[i];
                this.u32[CubeHeapIndex + 4114 + i] = Max4s[i];
              }

              //The start of the memory allocation, plus two for the header, plus the specific region
              this.u32[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)] = CubeSegmentAndStackIndex;
              NonEmptyChildrenCount++;

              for(let z1 = 0; z1 < 16; ++z1) for(let y1 = 0; y1 < 16; ++y1) for(let x1 = 0; x1 < 16; ++x1){
                let HeightDifference = InterpolatedHeights[(z1 + 1) * 18 + (x1 + 1)] - (y128 << 7 | y16 << 4 | y1);
                let Type;
                if(HeightDifference < 0) Type = 0;
                else if(HeightDifference < 1) Type = 2;
                else if(HeightDifference < 2) Type = 1;
                else Type = 3;
                this.u32[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | x1)] = Type; //This gets the type
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

        const Allocation128SegmentAndStackIndex = this.Memory.Allocate(531 + NonEmptyChildrenCount, false);
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

          const AllocationTemplateHeapIndex = (AllocationTemplateSegmentAndStackIndex & ~65535) | this.u32[AllocationTemplateSegmentAndStackIndex];
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
            /*let Bitmap4 = 0;
            for(let y1 = 0; y1 < 2; ++y1) for(let z1 = 0; z1 < 4; ++z1) for(let x1 = 0; x1 < 4; ++x1){
              if(CubeHeapArrayView[z4 << 10 | z1 << 8 | y4 << 5 | y1 << 4 | x4 << 2 | x1] !== 0) Bitmap4 |= 1 << (y1 << 4 | z1 << 2 | x1);
            }*/
            const Offset = z4 << 10 | y4 << 5 | x4 << 2;
            const Bitmap4 = (this.u32[CubeHeapIndex + 2 + (Offset | 0x000)] && 1)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x001)] && 2)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x002)] && 4)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x003)] && 8)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x100)] && 16)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x101)] && 32)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x102)] && 64)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x103)] && 128)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x200)] && 256)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x201)] && 512)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x202)] && 1024)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x203)] && 2048)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x300)] && 4096)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x301)] && 8192)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x302)] && 16384)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x303)] && 32768)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x010)] && 65536)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x011)] && 131072)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x012)] && 262144)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x013)] && 524288)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x110)] && 1048576)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x111)] && 2097152)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x112)] && 4194304)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x113)] && 8388608)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x210)] && 16777216)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x211)] && 33554432)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x212)] && 67108864)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x213)] && 134217728)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x310)] && 268435456)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x311)] && 536870912)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x312)] && 1073741824)
                          | (this.u32[CubeHeapIndex + 2 + (Offset | 0x313)] && 2147483648);

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


          const TempRLEHeapIndex = (TempRLESegmentAndStackIndex & ~65535) | this.u32[TempRLESegmentAndStackIndex];

          TypesSet.Clear();

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
            let RunEnd = 0;
            let LayerItems = 0;
            for(let z1 = 0; z1 < 16; ++z1) for(let x1 = 0; x1 < 16; ++x1){
              const Type = this.u32[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | x1)];
              if(Type !== 0 && (
                x1 === 0 || x1 === 15 || y1 === 0 || y1 === 15 || z1 === 0 || z1 === 15 ||
                this.u32[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | (x1 - 1))] === 0 ||
                this.u32[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | (x1 + 1))] === 0 ||
                this.u32[CubeHeapIndex + 2 + (z1 << 8 | (y1 - 1) << 4 | x1)] === 0 ||
                this.u32[CubeHeapIndex + 2 + (z1 << 8 | (y1 + 1) << 4 | x1)] === 0 ||
                this.u32[CubeHeapIndex + 2 + ((z1 - 1) << 8 | y1 << 4 | x1)] === 0 ||
                this.u32[CubeHeapIndex + 2 + ((z1 + 1) << 8 | y1 << 4 | x1)] === 0
              )){
                if(CurrentType === 0) CurrentType = Type;
                if((LayerItems === 0 || CurrentType !== Type)) TypesSet.Add(Type);
                if(CurrentType !== Type){
                  this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 0)] = CurrentType;
                  this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 1)] = RunEnd - 1; //-1 is so that it's in the range [0, 255] instead of [1, 256]
                  LayerItems++;
                  CurrentType = Type;
                }
              }
              RunEnd++;
            }
            if(CurrentType !== 0){
              this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 0)] = CurrentType;
              this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | LayerItems << 1 | 1)] = RunEnd - 1; //-1 is so that it's in the range [0, 255] instead of [1, 256]
              LayerItems++;
            }
            this.u32[TempRLEHeapIndex + 2 + (8192 | y1)] = LayerItems; //Will be 0 if this column was just air
          }

          if(TypesSet.Size() === 0) continue; //TODO: Maybe this is bad?


          const TypeCount = TypesSet.Size();
          const RLEOffset = AllocationTemplateHeapIndex + TotalAllocations + 8;

          let CurrentIndex = 0;
          this.u32[RLEOffset + CurrentIndex++] = TypeCount;

          const I_ItemsList = TypesSet.ItemsListOffset();

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
                  this.u32[RLEOffset + CurrentIndex] |= TypesSet.Get(this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << (LocalOffset & 31);
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
                  this.u32[RLEOffset + CurrentIndex] |= TypesSet.Get(this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 15) << 1);
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
                  this.u32[RLEOffset + CurrentIndex] |= TypesSet.Get(this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 7) << 2);
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
                  this.u32[RLEOffset + CurrentIndex] |= TypesSet.Get(this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 3) << 3);
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
                  this.u32[RLEOffset + CurrentIndex] |= TypesSet.Get(this.u32[TempRLEHeapIndex + 2 + (y1 << 9 | i << 1)]) << ((LocalOffset & 1) << 4);
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

          const PermanentAllocationSegmentAndStackIndex = this.Memory.Allocate(AllocationSize, false);
          const PermanentAllocationHeapIndex = (PermanentAllocationSegmentAndStackIndex & ~65535) | this.u32[PermanentAllocationSegmentAndStackIndex];


          for(let i = 1; i < AllocationSize; ++i){
            this.u32[PermanentAllocationHeapIndex + i] = this.u32[AllocationTemplateHeapIndex + i];
          }


          this.Memory.RequestGPUUpload(PermanentAllocationSegmentAndStackIndex >> 16, PermanentAllocationSegmentAndStackIndex & 65535);
          Atomics.sub(this.u32, (PermanentAllocationSegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);

          this.u32[Allocation128HeapIndex + 2 + (z16 << 1 | y16 >> 2)] |= 1 << ((y16 << 3) & 3) | x16;
          this.u32[Allocation128HeapIndex + 2 + 16 + (z16 << 6 | y16 << 3 | x16)] = PermanentAllocationSegmentAndStackIndex;
        }

        this.Memory.RequestGPUUpload(Allocation128SegmentAndStackIndex >> 16, Allocation128SegmentAndStackIndex & 65535);
        Atomics.sub(this.u32, (Allocation128SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);

        this.u32[this.u32[M.I_WORLD_GRID_INDEX] + (0 << 15 | z128 << 10 | y128 << 5 | x128)] = Allocation128SegmentAndStackIndex;
        this.u32[M.I_UPDATED_LOD_LEVELS_MASK] |= 1 << 0;

        FreeCubeIndex = 0;
      }
    } //End z128/x128
  }
}
self.iWorkerMain = null;
self.onmessage = function(Event){
  const Data = Event.data;
  if(Data.Request === W.INITIALISE){
    self.iWorkerMain = new WorkerMain(Data);
    console.timeEnd("Initialisation");
  } else{
    self.iWorkerMain[Data.Request](Data);
  }
};
