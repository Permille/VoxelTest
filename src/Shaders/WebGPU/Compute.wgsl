struct UniformsStruct{
  ModelViewProjection : mat4x4<f32>,
  InverseModelViewProjection : mat4x4<f32>,
  Time : f32,
  Empty : u32,
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
  Quads : atomic<u32>,
  RenderList : atomic<u32>
}

struct TileInfoStruct{
  Index : atomic<u32>,
  NextTileInfo : u32,
  Tiles : array<u32, 30>
}


@binding(0) @group(0) var<storage, read> Data: array<u32>;
@binding(1) @group(0) var OutputTexture: texture_storage_2d<rgba8unorm, write>;
@binding(2) @group(0) var<uniform> Uniforms : UniformsStruct;
@binding(3) @group(0) var<storage, read_write> AtomicIndices : AtomicIndicesStruct;
@binding(4) @group(0) var<storage, read> RenderListBuffer : array<u32>;
@binding(5) @group(0) var<storage, read_write> TileInfo : array<TileInfoStruct>;
@binding(6) @group(0) var<storage, read_write> WriteBuffer : array<vec4<u32>>;
@binding(7) @group(0) var<storage, read_write> TilesStartW : array<u32>;
@binding(8) @group(0) var<storage, read> TilesStartR : array<u32>;

var<workgroup> SharedInitialRenderListIndex : u32; //This is the render index for the 0th local invocation
var<workgroup> SharedBoundingRectsArray : array<vec4<u32>, 256>; //This stores the bounding rectangles for each chunk to be rendered

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
    SharedBoundingRectsArray[LocalInvocationIndex] = vec4<u32>(1, 0, 0, 0);
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
    SharedBoundingRectsArray[LocalInvocationIndex] = vec4<u32>(1, 0, 0, 0);
    return;
  }
  MinPoint = floor((max(MinPoint, vec2<f32>(-.5)) + .5) * Uniforms.Resolution);
  MaxPoint = ceil((min(MaxPoint, vec2<f32>(0.5)) + .5) * Uniforms.Resolution);
  let u_MinPoint = vec2<u32>(MinPoint);
  let u_MaxPoint = vec2<u32>(MaxPoint);
  SharedBoundingRectsArray[LocalInvocationIndex] = vec4<u32>((u_MinPoint.y << 16) | u_MinPoint.x, (u_MaxPoint.y << 16) | u_MaxPoint.x, Region128_Coordinate, InstanceID - InstancesStart);

  /*
  struct TileInfoStruct{
    Index : atomic<u32>,
    NextTileInfo : u32,
    Tiles : array<u32, 30>
  }
  */

  let Min16 = u_MinPoint >> vec2<u32>(4);
  let Max16 = (u_MaxPoint + vec2<u32>(15)) >> vec2<u32>(4);
  let XSize = (u32(Uniforms.Resolution.x) + 15) >> 4;
  for(var x16 = Min16.x; x16 < Max16.x; x16++){
    for(var y16 = Min16.y; y16 < Max16.y; y16++){
      let TilesGroup = TilesStartW[y16 * XSize + x16];
      var TilesIndex = atomicAdd(&TileInfo[TilesGroup].Index, 1);
      if(TilesIndex == 0){

      } else if(TilesIndex == 30){
        atomicAdd(&AtomicIndices.TileInfoIndex, 1);
        for(var x = 0u; x < 16; x++){
          for(var y = 0u; y < 16; y++){
            textureStore(OutputTexture, vec2<u32>((x16 << 4) | x, (y16 << 4) | y), vec4<f32>(1., 0., 0., 1.));
          }
        }
      }
    }
  }
}

@compute @workgroup_size(16, 16, 1)
fn RasterizationMain(@builtin(local_invocation_id) LocalInvocationID : vec3<u32>, @builtin(local_invocation_index) LocalInvocationIndex: u32, @builtin(workgroup_id) WorkgroupID : vec3<u32>){
  let Resolution = vec2<u32>(Uniforms.Resolution);
  loop{
    GenerateBoundingRects(LocalInvocationIndex, WorkgroupID);
    workgroupBarrier();

    /*for(var i : u32 = 0u; i < 256u; i++){
      let Info = workgroupUniformLoad(&(SharedBoundingRectsArray[i]));
      if(all(Info == vec4<u32>(1, 0, 0, 0))){
        continue;
      }
      let MinRect = vec2<u32>(Info.x, Info.x >> 16u) & vec2<u32>(65535u);
      let MaxRect = vec2<u32>(Info.y, Info.y >> 16u) & vec2<u32>(65535u);

      let Region128_Coordinate = Info.z;
      let Index = Info.w;
      let Region128_SSI = Data[65536u + Region128_Coordinate];
      let Region128_HI = (Region128_SSI & ~65535u) | Data[Region128_SSI];

      var Position128 = vec3<f32>((vec3<u32>(Region128_Coordinate) >> vec3<u32>(0, 5, 10)) & vec3<u32>(31u)) * 128.;


      let Region16_Coordinate = Data[Region128_HI + 531u + Index];
      let Region16_SSI = Data[Region128_HI + 18u + Region16_Coordinate];
      if(Region16_SSI == 0){
        //This shouldn't happen
        continue;
      }
      let Region16_HI = (Region16_SSI & ~65535u) | Data[Region16_SSI];
      let Region16_Position = Data[Region16_HI + 3u] & 511u;

      let Temp = Data[Region16_HI + 2u];
      let Min_u = vec3<u32>(Temp, Temp >> 4, Temp >> 8) & vec3<u32>(15u);
      let Max_u = (vec3<u32>(Temp >> 12, Temp >> 16, Temp >> 20) & vec3<u32>(15u)) + vec3<u32>(1u);
      if(any(Min_u > Max_u)){
        continue;
      }

      let Position = Position128 + vec3<f32>((vec3<u32>(Region16_Position) >> vec3<u32>(0, 3, 6)) & vec3<u32>(7)) * 16.;
      let MinPos = Position + vec3<f32>(Min_u);
      let MaxPos = Position + vec3<f32>(Max_u);


      let InverseCuboidSize = 1. / (MaxPos - MinPos);
      let PositionOffset = Uniforms.CameraPosition - MinPos;

      let MinPosMinusRayOrigin = MinPos - Uniforms.CameraPosition;
      let MaxPosMinusRayOrigin = MaxPos - Uniforms.CameraPosition;

      let InverseResolution = 1. / Uniforms.Resolution;

      for(var x8 = MinRect.x; x8 < MaxRect.x; x8 += 16){
        for(var y8 = MinRect.y; y8 < MaxRect.y; y8 += 16){
          let x = x8 + LocalInvocationID.x;
          let y = y8 + LocalInvocationID.y;
          var Point = vec2<f32>(vec2<u32>(x, y)) * InverseResolution;
          let RayDirection = mix(mix(Uniforms.RayDirectionHL, Uniforms.RayDirectionLL, Point.x), mix(Uniforms.RayDirectionHH, Uniforms.RayDirectionLH, Point.x), Point.y);
          let InverseRayDirection = 1. / RayDirection;


          let t024 = MinPosMinusRayOrigin * InverseRayDirection;
          let t135 = MaxPosMinusRayOrigin * InverseRayDirection;

          let ComponentMin = min(t024, t135);
          let ComponentMax = max(t024, t135);

          let tmin = max(max(ComponentMin.x, ComponentMin.y), ComponentMin.z);
          let tmax = min(min(ComponentMax.x, ComponentMax.y), ComponentMax.z);

          let Hit = tmax >= 0 && tmin <= tmax;

          let HitCoordinate = (PositionOffset + tmin * RayDirection) * InverseCuboidSize;



          let UintDepth = u32(tmin * 256.);
          if(Hit
            //&& atomicMin(&(DepthBuffer[y * Resolution.x + x]), UintDepth) > UintDepth
          ){
            textureStore(OutputTexture, vec2<u32>(x, y), vec4<f32>(HitCoordinate.xyz, 1.));
          }

        }
      }
    }*/




    if(workgroupUniformLoad(&(SharedBoundingRectsArray[0])).z != 0xeeeeeeee){ //This is meant to always be true
      break;
    }
  }

}


@compute @workgroup_size(16, 16, 1)
fn TileProcessingMain(@builtin(local_invocation_id) LocalInvocationID : vec3<u32>, @builtin(local_invocation_index) LocalInvocationIndex: u32, @builtin(workgroup_id) WorkgroupID : vec3<u32>){
  let XSize = (u32(Uniforms.Resolution.x) + 15) >> 4;
  let Items = atomicLoad(&TileInfo[TilesStartR[WorkgroupID.y * XSize + WorkgroupID.x] ].Index);
  var Colour = vec4<f32>((f32(Items) - 64.) / 32., (f32(Items) - 32) / 32., f32(Items) / 32., 1.);

  let FontCoords = vec2<u32>(15u - LocalInvocationID.x, LocalInvocationID.y) + vec2<u32>(0xffffffff, 0xfffffffc);
  if(all(FontCoords < vec2<u32>(14, 8))){
    let Number = select(Items, 255, Items > 255);
    let Digit0 = Number & 15u;
    let Digit1 = (Number >> 4) & 15u;
    let Output0 = (Font[Digit0][(FontCoords.y >> 2u) & 1u] >> ((FontCoords.y & 3u) << 3u)) & 255u;
    let Output1 = ((Font[Digit1][(FontCoords.y >> 2u) & 1u] >> ((FontCoords.y & 3u) << 3u)) & 255u) << 7u;
    if((((Output0 | Output1) >> FontCoords.x) & 1u) == 1u){
      Colour = vec4<f32>(min(Colour.xyz * 0.7, vec3<f32>(0.7)), 1.);//vec4<f32>(.5 + .5 * cos(Uniforms.Time * vec3<f32>(0, 2, 4)), 1.);
    }
  }

  textureStore(OutputTexture, (WorkgroupID.xy << vec2<u32>(4)) | LocalInvocationID.xy, Colour);


}

@compute @workgroup_size(16, 16)
fn ClearBufferMain(@builtin(workgroup_id) ID : vec3<u32>, @builtin(local_invocation_index) Index : u32){
  WriteBuffer[(ID.y << 16) | (ID.x << 8) | Index] = vec4<u32>(0);
}

@compute @workgroup_size(16, 16)
fn ClearTilesStartBufferMain(@builtin(workgroup_id) ID : vec3<u32>, @builtin(local_invocation_index) Index : u32){
  WriteBuffer[(ID.y << 16) | (ID.x << 8) | Index] = vec4<u32>((ID.y << 18) | (ID.x << 10) | (Index << 2)) + vec4<u32>(0, 1, 2, 3);
}