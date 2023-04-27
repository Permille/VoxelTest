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
  FOV : f32
}

struct AtomicIndicesStruct{
  Tiles : atomic<u32>,
  Quads : atomic<u32>,
  RenderList : atomic<u32>
}

@binding(0) @group(0) var<storage, read> Data: array<u32>;
@binding(1) @group(0) var OutputTexture: texture_storage_2d<rgba8unorm, write>;
@binding(2) @group(0) var<uniform> Uniforms : UniformsStruct;
@binding(3) @group(0) var<storage, read_write> AtomicIndices : AtomicIndicesStruct;
@binding(4) @group(0) var<storage, read> RenderListBuffer : array<u32>;
@binding(5) @group(0) var<storage, read_write> DepthBuffer : array<atomic<u32>>;

var<workgroup> SharedInitialRenderListIndex : u32; //This is the render index for the 0th local invocation
var<workgroup> SharedBoundingRectsArray : array<vec4<u32>, 64>; //This stores the bounding rectangles for each chunk to be rendered

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
  let InstanceID = (WorkgroupID.x << 6) | LocalInvocationIndex;

  var RenderListIndex : u32 = 0u;
  for(var Bit : u32 = 1u << 15u; Bit > 0u; Bit >>= 1u){
    let TryRenderListIndex = RenderListIndex | Bit;
    let InstancesStart = RenderListBuffer[(TryRenderListIndex << 1) | 1];
    if(InstancesStart <= InstanceID){
      RenderListIndex = TryRenderListIndex;
    }
  }
  if(LocalInvocationIndex == 0u){
    SharedInitialRenderListIndex = RenderListIndex;
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
  if(!AllAreOutside){
    MinPoint = floor((max(MinPoint, vec2<f32>(-.5)) + .5) * Uniforms.Resolution);
    MaxPoint = ceil((min(MaxPoint, vec2<f32>(0.5)) + .5) * Uniforms.Resolution);
    let u_MinPoint = vec2<u32>(MinPoint);
    let u_MaxPoint = vec2<u32>(MaxPoint);
    SharedBoundingRectsArray[LocalInvocationIndex] = vec4<u32>((u_MinPoint.y << 16) | u_MinPoint.x, (u_MaxPoint.y << 16) | u_MaxPoint.x, Region128_Coordinate, InstanceID - InstancesStart);

    //textureStore(OutputTexture, vec2<i32>(MinPoint), vec4<f32>(1., 1., 1., 1.));
  } else{
    SharedBoundingRectsArray[LocalInvocationIndex] = vec4<u32>(1, 0, 0, 0);
  }
}

@compute @workgroup_size(8, 8, 1)
fn RasterizationMain(@builtin(local_invocation_id) LocalInvocationID : vec3<u32>, @builtin(local_invocation_index) LocalInvocationIndex: u32, @builtin(workgroup_id) WorkgroupID : vec3<u32>){
  let Resolution = vec2<u32>(Uniforms.Resolution);
  loop{
    GenerateBoundingRects(LocalInvocationIndex, WorkgroupID);
    workgroupBarrier();

    var RenderListIndex : u32 = workgroupUniformLoad(&SharedInitialRenderListIndex) - 1; //The -1 is there because this will be incremented in the loop

    var Position128 : vec3<f32>;



    for(var i : u32 = 0u; i < 64u; i++){
      /*if(i == NextRenderListIndexStart){
        RenderListIndex++;
        Offset = 531u + StartingInstanceID - RenderListBuffer[(RenderListIndex << 1) + 1];
        NextRenderListIndexStart = RenderListBuffer[((RenderListIndex + 1) << 1) | 1] - StartingInstanceID;

        let Region128_Coordinate = RenderListBuffer[RenderListIndex << 1];
        let Region128_SSI = Data[65536u + Region128_Coordinate];
        let Region128_HI = (Region128_SSI & ~65535u) | Data[Region128_SSI];
        Region16ListIndex = Region128_HI;
        Position128 = vec3<f32>((vec3<u32>(Region128_Coordinate) >> vec3<u32>(0, 5, 10)) & vec3<u32>(31u)) * 128.;
      }*/

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

      Position128 = vec3<f32>((vec3<u32>(Region128_Coordinate) >> vec3<u32>(0, 5, 10)) & vec3<u32>(31u)) * 128.;


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

      for(var x8 = MinRect.x; x8 < MaxRect.x; x8 += 8){
        for(var y8 = MinRect.y; y8 < MaxRect.y; y8 += 8){
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
          if(Hit && atomicMin(&(DepthBuffer[y * Resolution.x + x]), UintDepth) > UintDepth){
            textureStore(OutputTexture, vec2<u32>(x, y), vec4<f32>(HitCoordinate.xyz, 1.));
          }

        }
      }
    }




    if(RenderListIndex != 0xeeeeeeee){ //This is meant to always be true
      break;
    }
  }

}