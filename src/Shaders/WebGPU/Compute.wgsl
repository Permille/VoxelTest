struct UniformsStruct{
  ModelViewProjection : mat4x4<f32>,
  InverseModelViewProjection : mat4x4<f32>,
  Time : f32,
  DebugFlags : u32,
  Resolution : vec2<f32>,
  CameraRotation : vec2<f32>,
  RenderListLength : u32,
  CameraPosition : vec3<f32>,
  RayDirectionLL : vec3<f32>,
  RayDirectionLH : vec3<f32>,
  RayDirectionHL : vec3<f32>,
  RayDirectionHH : vec3<f32>,
  FOV : f32,
  TileInfoBufferSize : u32
}

struct AtomicIndicesStruct{
  TileInfoIndex : atomic<u32>,
  Fails : atomic<u32>,
  Empty1 : atomic<u32>,
  Empty2 : atomic<u32>
}

const TileInfoSize : u32 = 125u;
const MaxTileSearchIterations : u32 = 64u;
const MaxTileIndex : u32 = 65535u;

struct TileInfoStruct{
  Index : atomic<u32>, //Should be initialised to 0
  Padding0 : u32,
  TileID : atomic<u32>, //Should be initialised to 0xffffffff
  Padding1 : u32,
  TileGroupID : atomic<u32>, //Should be initialised to 0xffffffff
  Padding2 : u32,
  Tiles : array<vec2<u32>, TileInfoSize>
}

struct RaytraceResult16{
  HitVoxel : bool,
  RayPosOffset : vec3<i32>,
  FloatMask : vec3<f32>,
}

struct RaytraceResult4{
  HitVoxel : bool,
  RayPosFloor : vec3<i32>,
  FloatMask : vec3<f32>
}




@binding(0) @group(0) var<storage, read> Data: array<u32>;
@binding(1) @group(0) var OutputTexture: texture_storage_2d<rgba8unorm, write>;
@binding(2) @group(0) var<uniform> Uniforms : UniformsStruct;
@binding(3) @group(0) var<storage, read_write> AtomicIndices : AtomicIndicesStruct;
@binding(4) @group(0) var<storage, read> RenderListBuffer : array<u32>;
@binding(5) @group(0) var<storage, read_write> TileInfo : array<TileInfoStruct>;
@binding(6) @group(0) var<storage, read_write> WriteBuffer : array<vec4<u32>>;
@binding(7) @group(0) var<storage, read_write> TilesStart : array<atomic<u32>>;
@binding(8) @group(0) var<storage, read_write> TileInfoArray : array<vec2<u32>>;

const Font = array<vec2<u32>, 16>(
  vec2<u32>(0x3636361cu, 0x1c363636u),
  vec2<u32>(0x0c0c0c0cu, 0x0c1c3c0cu),
  vec2<u32>(0x1830303eu, 0x1c36060cu),
  vec2<u32>(0x0606361cu, 0x1c36061cu),
  vec2<u32>(0x363f0606u, 0x18183636u),
  vec2<u32>(0x0606361cu, 0x3e30303cu),
  vec2<u32>(0x3636361cu, 0x1c36303cu),
  vec2<u32>(0x0c181818u, 0x3e06060cu),
  vec2<u32>(0x3636361cu, 0x1c36361cu),
  vec2<u32>(0x0606361cu, 0x1c36361eu),
  vec2<u32>(0x1e36361eu, 0x00001c06u),
  vec2<u32>(0x3636363cu, 0x30303c36u),
  vec2<u32>(0x3030361cu, 0x00001c36u),
  vec2<u32>(0x3636361eu, 0x06061e36u),
  vec2<u32>(0x3e30361cu, 0x00001c36u),
  vec2<u32>(0x18181818u, 0x0e18183eu)
);


fn Cross2D(u : vec2<f32>, v : vec2<f32>) -> f32{
  return u.x * v.y - u.y * v.x;
}

fn Rotate2D(v : vec2<f32>, a : f32) -> vec2<f32>{
  let sinA = sin(a);
  let cosA = cos(a);
  return vec2<f32>(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

fn RotateX(a : f32) -> mat3x3<f32>{
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(
    1.,0.,0.,
    0., c,-s,
    0., s, c
  );
}

fn RotateY(a : f32) -> mat3x3<f32>{
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(
    c,  0., s,
    0., 1.,0.,
    -s, 0., c
  );
}

fn TileHash(x : u32) -> u32{
  let y = ((x >> 16) ^ x) * 0x119de1f3u;
  let z = ((y >> 16) ^ y) * 0x119de1f3u;
  return (z >> 16) ^ z;
}

fn GenerateBoundingRects(LocalInvocationIndex : u32, WorkgroupID : vec3<u32>){
  let InstanceID = (WorkgroupID.x << 8) | LocalInvocationIndex;

  var RenderListIndex : u32 = 0u;
  for(var Bit : u32 = 1u << 15u; Bit > 0u; Bit >>= 1u){
    let TryRenderListIndex = RenderListIndex | Bit;
    let InstancesStart = RenderListBuffer[(TryRenderListIndex << 1) | 1];
    if(InstancesStart <= InstanceID){
      RenderListIndex = TryRenderListIndex;
    }
  }

  let InstancesStart = RenderListBuffer[(RenderListIndex << 1) | 1];
  let Region128_Coordinate = RenderListBuffer[RenderListIndex << 1];

  var Position = vec3<f32>(vec3<u32>(Region128_Coordinate, Region128_Coordinate >> 5, Region128_Coordinate >> 10) & vec3<u32>(31)) * 128.;

  let Region128_SSI = Data[65536u + Region128_Coordinate];
  let Region128_HI = (Region128_SSI & ~65535u) | Data[Region128_SSI];

  let Region16_Coordinate = Data[Region128_HI + 531u + InstanceID - InstancesStart];
  let Region16_SSI = Data[Region128_HI + 18u + Region16_Coordinate];
  if(Region16_SSI == 0){
    return;
  }
  let Region16_HI = (Region16_SSI & ~65535u) | Data[Region16_SSI];

  let Temp = Data[Region16_HI + 2u];
  let Min_u = vec3<u32>(Temp, Temp >> 4, Temp >> 8) & vec3<u32>(15u);
  let Max_u = (vec3<u32>(Temp >> 12, Temp >> 16, Temp >> 20) & vec3<u32>(15u)) + vec3<u32>(1u);

  let Position16 = Data[Region16_HI + 3u] & 511u;

  Position += vec3<f32>((vec3<u32>(Position16) >> vec3<u32>(0, 3, 6)) & vec3<u32>(7)) * 16.;

  let MinVertex = Position + vec3<f32>(Min_u);
  let MaxVertex = Position + vec3<f32>(Max_u);

  var MinPoint = vec2<f32>(0.5);
  var MaxPoint = vec2<f32>(-.5);
  var AllAreOutside = true;
  for(var i = 0; i < 8; i++){
    let Vertex = vec4<f32>(
      select(MaxVertex.x, MinVertex.x, (i & 1) == 0),
      select(MaxVertex.y, MinVertex.y, (i & 2) == 0),
      select(MaxVertex.z, MinVertex.z, i > 3),
      1.
    );
    let Projection = Uniforms.ModelViewProjection * Vertex;
    let Point = vec2<f32>(Projection.xy / Projection.ww);
    if(Projection.w <= 0.){
      continue;
    }
    AllAreOutside = any(abs(Point) > vec2<f32>(.5)) && AllAreOutside;
    MinPoint = min(MinPoint, Point);
    MaxPoint = max(MaxPoint, Point);
  }
  if(AllAreOutside){
    return;
  }
  MinPoint = floor((max(MinPoint, vec2<f32>(-.5)) + .5) * Uniforms.Resolution);
  MaxPoint = ceil((min(MaxPoint, vec2<f32>(0.5)) + .5) * Uniforms.Resolution);
  let u_MinPoint = vec2<u32>(MinPoint);
  let u_MaxPoint = vec2<u32>(MaxPoint);

  let Min16 = u_MinPoint >> vec2<u32>(4);
  let Max16 = (u_MaxPoint + vec2<u32>(15)) >> vec2<u32>(4);
  let XSize = (u32(Uniforms.Resolution.x) + 15) >> 4;
  for(var x16 = Min16.x; x16 < Max16.x; x16++){
    for(var y16 = Min16.y; y16 < Max16.y; y16++){
      let TileID = y16 * XSize + x16;
      var TilesGroup = TileID;//atomicLoad(&TilesStart[TileID]);
      var TilesIndex = atomicAdd(&TileInfo[TilesGroup].Index, 1);
      var TileGroupID : u32 = 0u;
      if(TilesIndex >= TileInfoSize){
        for(var i = 0u; i < MaxTileSearchIterations; i++){
          //atomicMax(&AtomicIndices.Fails, i);
          let OldTilesGroup = TilesGroup;

          TilesGroup = TileHash(TilesGroup + TileID);
          let Pointer = &TileInfo[TilesGroup & MaxTileIndex].TileID;
          atomicCompareExchangeWeak(Pointer, 0xffffffffu, TileID);
          if(atomicLoad(Pointer) != TileID){
            continue;
          }
          TileGroupID++;
          let GroupID = atomicMin(&TileInfo[TilesGroup & MaxTileIndex].TileGroupID, TileGroupID); //This makes sure that I'm not trying to write to existing tile groups for this type
          if(GroupID < TileGroupID){
            continue;
          }
          TilesIndex = atomicAdd(&TileInfo[TilesGroup & MaxTileIndex].Index, 1);
          if(TilesIndex >= TileInfoSize){
            continue;
          }
          //atomicCompareExchangeWeak(&TilesStart[TileID], OldTilesGroup, TilesGroup);
          break;
        }
      }

      TileInfo[TilesGroup & MaxTileIndex].Tiles[TilesIndex] = vec2<u32>(
        (((InstanceID - InstancesStart) & 511) << 19) | Region128_Coordinate,
        u32(length(Uniforms.CameraPosition - (MaxVertex + MinVertex) * .5) * 16.)
      );
    }
  }
}

@compute @workgroup_size(16, 16, 1)
fn RasterizationMain(@builtin(local_invocation_id) LocalInvocationID : vec3<u32>, @builtin(local_invocation_index) LocalInvocationIndex: u32, @builtin(workgroup_id) WorkgroupID : vec3<u32>){
  GenerateBoundingRects(LocalInvocationIndex, WorkgroupID);
}


var<private> i_Min : vec3<i32>;
var<private> i_Max : vec3<i32>;
var<private> f_Min : vec3<f32>;
var<private> f_Max : vec3<f32>;
var<private> RayDirection : vec3<f32>;
var<private> RayDirection_Flat : vec3<f32>;
var<private> Distance : f32;
var<private> RayInverse : vec3<f32>;
var<private> AbsRayInverse : vec3<f32>;
var<private> RayInverse_Flat : vec3<f32>;
var<private> AbsRayInverse_Flat : vec3<f32>;
var<private> RaySign : vec3<f32>;
var<private> i_RaySign : vec3<i32>;
var<private> HalfRaySignPlusHalf : vec3<f32>;


var<private> L0Bits4 : u32;
var<private> L1Bits4 : u32;
var<private> L2Bits4 : u32;
var<private> L3Bits4 : u32;
var<private> CurrentBits4 : u32;
var<private> Bits1 : u32;
var<private> CompressedAllocations : u32;
var<private> Bits1Start : u32;

fn IsSolid4(c : vec3<i32>) -> bool{
  return (Bits1 & (1u << u32((c.y << 4) | (c.z << 2) | c.x))) != 0u;
}

fn IsSolid16(c : vec3<i32>) -> bool{
  return (CurrentBits4 & (1u << u32(((c.y & 1) << 4) | (c.z << 2) | c.x))) != 0u;
}

fn Raytrace4(p_RayOrigin : vec3<f32>, p_FloatMask : vec3<f32>) -> RaytraceResult4{
  var RayOrigin = p_RayOrigin;
  var FloatMask = p_FloatMask;
  var i_RayPosFloor = vec3<i32>(RayOrigin);
  var SideDistance = (HalfRaySignPlusHalf - fract(RayOrigin)) * RayInverse;

  for(var i = 0; i < 8; i++){
    if(IsSolid4(i_RayPosFloor)){
      return RaytraceResult4(true, i_RayPosFloor, FloatMask);
    }
    FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    i_RayPosFloor += vec3<i32>(FloatMask * RaySign);
    //any(bvec3(i_RayPosFloor & ~ivec3(3, 1, 3))) works too
    if((((i_RayPosFloor.x | i_RayPosFloor.z) & ~3) | (i_RayPosFloor.y & ~1)) != 0){
      break;
    }
    SideDistance += FloatMask * AbsRayInverse;
  }
  return RaytraceResult4(false, i_RayPosFloor, FloatMask);
}

fn Raytrace16(p_RayOrigin : vec3<f32>, Normal : vec3<f32>) -> RaytraceResult16{
  var RayOrigin = p_RayOrigin * vec3<f32>(.25, .5, .25);
  var SideDistance = (HalfRaySignPlusHalf - fract(RayOrigin)) * RayInverse_Flat;
  var i_RayPosFloor = vec3<i32>(RayOrigin);

  let Min16 = i_Min >> vec3<u32>(2, 1, 2);
  let Max16 = i_Max >> vec3<u32>(2, 1, 2);

  var FloatMask = abs(Normal);
  CurrentBits4 = select(
    select(
      L3Bits4,
      L2Bits4,
      i_RayPosFloor.y < 6
    ),
    select(
      L1Bits4,
      L0Bits4,
      i_RayPosFloor.y < 2
    ),
    i_RayPosFloor.y < 4
  );

  if(IsSolid16(i_RayPosFloor)){
    let Offset4 = ((CompressedAllocations >> u32(30 - (i_RayPosFloor.y >> 1) * 7)) & 127u) + countOneBits(CurrentBits4 & ~(0xffffffffu << u32(((i_RayPosFloor.y & 1) << 4) | (i_RayPosFloor.z << 2) | i_RayPosFloor.x)));

    Bits1 = Data[Bits1Start + Offset4];

    let Result = Raytrace4(fract(RayOrigin) * vec3(4., 2., 4.), FloatMask);
    FloatMask = Result.FloatMask;
    if(Result.HitVoxel){
      return RaytraceResult16(true, (i_RayPosFloor << vec3<u32>(2, 1, 2)) | Result.RayPosFloor, FloatMask);
    }

    FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    SideDistance += FloatMask * AbsRayInverse_Flat;
    i_RayPosFloor += vec3<i32>(FloatMask * RaySign);
  }

  for(var i = 0; i < 14; i++){
    if(any(i_RayPosFloor < Min16) || any(i_RayPosFloor > Max16)){
      break;
    }
    CurrentBits4 = select(
      select(
        L3Bits4,
        L2Bits4,
        i_RayPosFloor.y < 6
      ),
      select(
        L1Bits4,
        L0Bits4,
        i_RayPosFloor.y < 2
      ),
      i_RayPosFloor.y < 4
    );
    if(IsSolid16(i_RayPosFloor)){

      let Offset4 = ((CompressedAllocations >> u32(30 - (i_RayPosFloor.y >> 1) * 7)) & 127u) + countOneBits(CurrentBits4 & ~(0xffffffffu << u32(((i_RayPosFloor.y & 1) << 4) | (i_RayPosFloor.z << 2) | i_RayPosFloor.x)));

      Bits1 = Data[Bits1Start + Offset4];

      let Distance = dot(SideDistance - AbsRayInverse_Flat, FloatMask);
      let CurrentRayPosition = RayOrigin + RayDirection_Flat * Distance + (RaySign * FloatMask * 140e-7);

      let Result = Raytrace4(fract(CurrentRayPosition) * vec3(4., 2., 4.), FloatMask);
      FloatMask = Result.FloatMask;
      if(Result.HitVoxel){
        return RaytraceResult16(true, (i_RayPosFloor << vec3<u32>(2, 1, 2)) | Result.RayPosFloor, FloatMask);
      }
    }
    FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    SideDistance += FloatMask * AbsRayInverse_Flat;
    i_RayPosFloor += vec3<i32>(FloatMask * RaySign);
  }
  return RaytraceResult16(false, vec3<i32>(0), vec3<f32>(0));
}



fn ApplyFont(Pixel : vec2<u32>, Number : u32) -> bool{
  let FontCoords = vec2<u32>(15u - Pixel.x, Pixel.y) + vec2<u32>(0xffffffff, 0xfffffffc);
  if(any(FontCoords >= vec2<u32>(14, 8))){
    return false;
  }

  let ClampedNumber = select(Number, 255, Number > 255);
  let Digit0 = ClampedNumber & 15u;
  let Digit1 = (ClampedNumber >> 4) & 15u;
  let Output0 = (Font[Digit0][(FontCoords.y >> 2u) & 1u] >> ((FontCoords.y & 3u) << 3u)) & 255u;
  let Output1 = ((Font[Digit1][(FontCoords.y >> 2u) & 1u] >> ((FontCoords.y & 3u) << 3u)) & 255u) << 7u;
  return (((Output0 | Output1) >> FontCoords.x) & 1u) == 1u;
}

var<workgroup> SharedTilesCount : u32;
var<workgroup> SharedTileIndex : u32;
var<workgroup> SharedTileID : u32;
var<workgroup> SharedTest : u32;
var<workgroup> SharedShouldContinue : bool;
var<workgroup> SharedAtomicFilledPixels : atomic<u32>;
var<workgroup> SharedFilledPixels : u32;
var<workgroup> SharedMinDepth : u32;

@compute @workgroup_size(16, 16, 1)
fn TileProcessingMain(
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
  @builtin(local_invocation_index) LocalInvocationIndex: u32,
  @builtin(workgroup_id) WorkgroupID : vec3<u32>
){
  let MaxTileID = (u32(Uniforms.Resolution.y + 15.) >> 4) * (u32(Uniforms.Resolution.x + 15.) >> 4);
  loop{
    let XSize = (u32(Uniforms.Resolution.x) + 15) >> 4;
    if(LocalInvocationIndex == 0u){
      SharedTileID = atomicAdd(&AtomicIndices.Empty2, 1u);
      SharedTest = 0u;
      atomicStore(&SharedAtomicFilledPixels, 0u);
      SharedMinDepth = 0xffffffffu;
    }
    workgroupBarrier();
    let TileID = workgroupUniformLoad(&SharedTileID);//TileCoordinate.y * XSize + TileCoordinate.x;
    if(TileID >= MaxTileID){
      break;
    }
    var TileIndex = TileID;
    var TileGroupID : u32 = 0u;
    let TileCoordinate = vec2<u32>(TileID % XSize, TileID / XSize);


    let FloatPixel = vec2<f32>((TileCoordinate << vec2<u32>(4)) | LocalInvocationID.xy) / Uniforms.Resolution;
    RayDirection = mix(mix(Uniforms.RayDirectionHL, Uniforms.RayDirectionLL, FloatPixel.x), mix(Uniforms.RayDirectionHH, Uniforms.RayDirectionLH, FloatPixel.x), FloatPixel.y);
    RayInverse = 1. / RayDirection;

    RayDirection_Flat = normalize(RayDirection * vec3<f32>(1., 2., 1.));
    RayInverse = 1. / RayDirection;
    AbsRayInverse = abs(RayInverse);
    RayInverse_Flat = 1. / RayDirection_Flat;
    AbsRayInverse_Flat = abs(RayInverse_Flat);
    RaySign = sign(RayDirection);
    i_RaySign = vec3<i32>(RaySign);
    HalfRaySignPlusHalf = RaySign * .5 + .5;

    var Colour = vec4<f32>(0., 0., 0., 1.);//saturate(vec4<f32>((f32(TilesCount) - 64.) / 32., (f32(TilesCount) - 32) / 32., f32(TilesCount) / 32., 1.));
    var Depth = 3.4028234e38;

    var Done = false;


    if(LocalInvocationIndex == 0u){
      SharedTilesCount = atomicLoad(&TileInfo[TileIndex].Index);
    }
    workgroupBarrier();
    var TilesCount = workgroupUniformLoad(&SharedTilesCount);

    var Iterations = min(TilesCount, TileInfoSize);



    var h = 0u;
    for(; h < MaxTileSearchIterations; h++){
      if(h > 0){
        if(LocalInvocationIndex == 0u){
          SharedShouldContinue = false;
          TileIndex = TileHash(TileIndex + TileID);
          if(TileID == atomicLoad(&TileInfo[TileIndex & MaxTileIndex].TileID)){
            TileGroupID++;
            if(atomicLoad(&TileInfo[TileIndex & MaxTileIndex].TileGroupID) != TileGroupID){ //This confirms that this is the next part of the list
              SharedShouldContinue = true;
              SharedTest++;
            }
          } else{
            SharedShouldContinue = true;
            SharedTest++;
          }
          SharedTilesCount = atomicLoad(&TileInfo[TileIndex & MaxTileIndex].Index);
          SharedTileIndex = TileIndex;
        }
        workgroupBarrier();
        if(workgroupUniformLoad(&SharedShouldContinue)){
          continue;
        }
        TilesCount = workgroupUniformLoad(&SharedTilesCount);
        TileIndex = workgroupUniformLoad(&SharedTileIndex);

        Iterations = min(TilesCount, TileInfoSize);
      }
      for(var i = 0u; i < Iterations; i++){
        let Info = TileInfo[TileIndex & MaxTileIndex].Tiles[i];
        let Locations = Info.x;
        let Region128_Coordinate = Locations & 524287;
        let Region16Index = (Locations >> 19) & 511;

        let Region128_SSI = Data[65536u + Region128_Coordinate];
        let Region128_HI = (Region128_SSI & ~65535u) | Data[Region128_SSI];

        let Position128 = vec3<f32>((vec3<u32>(Region128_Coordinate) >> vec3<u32>(0, 5, 10)) & vec3<u32>(31u)) * 128.;


        let Region16_Coordinate = Data[Region128_HI + 531u + Region16Index];
        let Region16_SSI = Data[Region128_HI + 18u + Region16_Coordinate];

        let Region16_HI = (Region16_SSI & ~65535u) | Data[Region16_SSI];
        let Region16_Position = Data[Region16_HI + 3u] & 511u;

        let Temp = Data[Region16_HI + 2u];
        let Min_u = vec3<u32>(Temp, Temp >> 4, Temp >> 8) & vec3<u32>(15u);
        let Max_u = (vec3<u32>(Temp >> 12, Temp >> 16, Temp >> 20) & vec3<u32>(15u)) + vec3<u32>(1u);

        let Position = Position128 + vec3<f32>((vec3<u32>(Region16_Position) >> vec3<u32>(0, 3, 6)) & vec3<u32>(7)) * 16.;
        let MinPos = Position + vec3<f32>(Min_u);
        let MaxPos = Position + vec3<f32>(Max_u);

        let PositionOffset = Uniforms.CameraPosition - Position;

        let MinPosMinusRayOrigin = MinPos - Uniforms.CameraPosition;
        let MaxPosMinusRayOrigin = MaxPos - Uniforms.CameraPosition;

        let t024 = MinPosMinusRayOrigin * RayInverse;
        let t135 = MaxPosMinusRayOrigin * RayInverse;

        let ComponentMin = min(t024, t135);
        let ComponentMax = max(t024, t135);

        let tmin = max(max(ComponentMin.x, ComponentMin.y), ComponentMin.z);
        let tmax = min(min(ComponentMax.x, ComponentMax.y), ComponentMax.z);

        let Hit = tmax >= 0 && tmin <= tmax;

        let HitCoordinate = PositionOffset + tmin * RayDirection;



        if(Hit && tmin < Depth){
          CompressedAllocations = Data[Region16_HI + 3u];
          let Temp = Data[Region16_HI + 2u];

          i_Min = vec3<i32>(vec3<u32>(Temp & 15u, (Temp >> 4) & 15u, (Temp >> 8) & 15u));
          i_Max = vec3<i32>(vec3<u32>((Temp >> 12) & 15u, (Temp >> 16) & 15u, (Temp >> 20) & 15u));

          f_Min = vec3<f32>(i_Min);
          f_Max = vec3<f32>(i_Max);

          L0Bits4 = Data[Region16_HI + 4u];
          L1Bits4 = Data[Region16_HI + 5u];
          L2Bits4 = Data[Region16_HI + 6u];
          L3Bits4 = Data[Region16_HI + 7u];

          Bits1Start = Region16_HI + 8u;

          var Epsilon = 11331e-7;

          //TODO: I need to find a better way of doing this
          let Normal = vec3<f32>(abs(HitCoordinate - f_Min) < vec3<f32>(Epsilon)) + vec3<f32>(abs(HitCoordinate - f_Max - 1.) < vec3<f32>(Epsilon));

          let Result = Raytrace16(round(HitCoordinate) * (Normal + RaySign * 0.00001) + HitCoordinate * (1. - Normal), Normal);

          if(Result.HitVoxel){
            if(!Done){
              Done = true;
              atomicAdd(&SharedAtomicFilledPixels, 1u);
            }
            Depth = tmin;
            Colour = vec4<f32>(Result.FloatMask, 1.);
          }


        }
      }


      if(TilesCount <= TileInfoSize){
        break;
      }
    }
    workgroupBarrier();

    /*if(((Uniforms.DebugFlags >> 0) & 1u) == 1u && h != 0u){
      if(h == MaxTileSearchIterations){
        Colour = vec4<f32>(Colour.x, Colour.yz * .5, 1.);
      }
      if(ApplyFont(LocalInvocationID.xy, h - workgroupUniformLoad(&SharedTest))){
        Colour = vec4<f32>(1.);
      } else{
        Colour = vec4<f32>((Colour.xyz) * .7, 1.);
      }
    }*/

    if(LocalInvocationIndex == 0u){
      SharedFilledPixels = atomicLoad(&SharedAtomicFilledPixels);
    }
    workgroupBarrier();

    if(((Uniforms.DebugFlags >> 0) & 1u) == 1u){
      if(ApplyFont(LocalInvocationID.xy, workgroupUniformLoad(&SharedFilledPixels))){
        Colour = vec4<f32>(1.);
      } else{
        Colour = vec4<f32>((Colour.xyz) * .7, 1.);
      }
    }



    textureStore(OutputTexture, (TileCoordinate.xy << vec2<u32>(4)) | LocalInvocationID.xy, Colour);
  }
}

@compute @workgroup_size(16, 8)
fn ClearBufferMain(@builtin(workgroup_id) ID : vec3<u32>, @builtin(local_invocation_index) Index : u32){
  let TileID = (ID.y << 8) | ID.x;
  let TilesForResolution = (u32(Uniforms.Resolution.y + 15) >> 4) * (u32(Uniforms.Resolution.x + 15) >> 4);

  TileInfoArray[(ID.y << 15) | (ID.x << 7) | Index] = select(
    select(
      vec2<u32>(0u, 0u),
      vec2<u32>(select(0xffffffffu, TileID, TileID < TilesForResolution), 0u),
      Index == 1u
    ),
    select(
      vec2<u32>(0xffffffffu, 0u),
      vec2<u32>(0u, 0xffffffffu),
      Index > 2u
    ),
    Index > 1u
  );
}


var<workgroup> Items : array<vec2<u32>, 128>;
var<workgroup> SharedQuit : bool;
var<workgroup> SharedBounds : u32;
@compute @workgroup_size(16, 8)
fn BitonicSortBuffer(@builtin(workgroup_id) ID : vec3<u32>, @builtin(local_invocation_index) Index : u32){
  loop{
    if(Index == 0u){
      let Items = TileInfoArray[(ID.y << 15) | (ID.x << 7) | Index].x;
      SharedQuit = Items <= 1u;
      SharedBounds = min(128u, 2u << firstLeadingBit(Items + 2u));
    }

    workgroupBarrier();
    if(workgroupUniformLoad(&SharedQuit)){
      return;
    }
    let Bounds = workgroupUniformLoad(&SharedBounds);
    Items[Index] = TileInfoArray[(ID.y << 15) | (ID.x << 7) | Index];
    workgroupBarrier();
    for(var k = 2u; k <= 128u; k <<= 1){
      for(var j = k >> 1; j > 0; j >>= 1){
        var ixj = Index ^ j;
        if(ixj > Index){
          let Comparison = Items[Index].y > Items[ixj].y;
          if(select(!Comparison, Comparison, (Index & k) == 0)){
            let Temp = Items[Index];
            Items[Index] = Items[ixj];
            Items[ixj] = Temp;
          }
        }
        workgroupBarrier();
      }
    }
    TileInfoArray[(ID.y << 15) | (ID.x << 7) | Index] = Items[Index];
    /*if(Index > 0){
      if(Items[Index - 1].y > Items[Index].y){
        atomicAdd(&AtomicIndices.Fails, 1u);
      }
    }*/
    if(Bounds != 12345u){
      break;
    }
  }
}

@compute @workgroup_size(16, 16)
fn ClearTilesStartBufferMain(@builtin(workgroup_id) ID : vec3<u32>, @builtin(local_invocation_index) Index : u32){
  WriteBuffer[(ID.y << 16) | (ID.x << 8) | Index] = vec4<u32>((ID.y << 18) | (ID.x << 10) | (Index << 2)) + vec4<u32>(0, 1, 2, 3);
}