const Size : f32 = 10.;
const MaxIterations : i32 = 64 * i32(ceil(Size));

struct VertexOut{
  @builtin(position) Position : vec4<f32>,
  @location(0) UV : vec2<f32>
}

struct UniformsStruct{
  ModelViewProjection : mat4x4<f32>,
  InverseModelViewProjection : mat4x4<f32>,
  Time : f32,
  Empty : f32,
  Resolution : vec2<f32>
}
@binding(0) @group(0) var<uniform> Uniforms : UniformsStruct;
@binding(1) @group(0) var ComputeOutputTexture : texture_2d<f32>;
@binding(2) @group(0) var Sampler : sampler;

@vertex
fn VertexMain(@builtin(vertex_index) VertexIndex : u32) -> VertexOut{
  var Position = array<vec2<f32>, 3>(
    vec2(-1., -1.),
    vec2(-1., 3.),
    vec2(3., -1.)
  );
  return VertexOut(vec4(Position[VertexIndex], 0.0, 1.0), Position[VertexIndex]);
}

fn SDSphere(p : vec3<f32>, d : f32) -> f32{
  return length(p) - d;
}
fn SDBox(p : vec3<f32>, b : vec3<f32>) -> f32{
  let d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.) + length(max(d, vec3<f32>(0.)));
}

fn GetVoxel(c : vec3<f32>) -> bool{
  let p : vec3<f32> = c / Size + vec3<f32>(.5);
  let d : f32 = min(max(-SDSphere(p, 7.5), SDBox(p, vec3<f32>(6.))), -SDSphere(p, 25.));
  return d < 0.;
}

fn Rotate2D(v : vec2<f32>, a : f32) -> vec2<f32>{
  let SinA : f32 = sin(a);
  let CosA : f32 = cos(a);
  return vec2<f32>(v.x * CosA - v.y * SinA, v.y * CosA + v.x * SinA);
}

@fragment
fn FragmentMain(Data : VertexOut) -> @location(0) vec4<f32>{
  let UV = Data.UV;
  return textureLoad(ComputeOutputTexture, vec2<i32>((UV + 1.) / 2. * Uniforms.Resolution), 0);
  let Time : f32 = Uniforms.Time;
  let CameraDirection = vec3<f32>(0., 0., .8);
  let CameraPlaneU = vec3<f32>(1., 0., 0.);
  let CameraPlaneV = vec3<f32>(0., Uniforms.Resolution.y / Uniforms.Resolution.x, 0.);
  var RayDirection = CameraDirection + UV.x * CameraPlaneU + UV.y * CameraPlaneV;
  var RayPosition = vec3<f32>(0., 2. * sin(Time * 2.7), -12.);

  let DirectionRotation = Rotate2D(RayDirection.xz, Time);
  let PositionRotation = Rotate2D(RayPosition.xz, Time);

  RayDirection = vec3<f32>(DirectionRotation.x, RayDirection.y, DirectionRotation.y);
  RayPosition = vec3<f32>(PositionRotation.x, RayPosition.y, PositionRotation.y) * Size;


  let DeltaDistance = abs(vec3(length(RayDirection)) / RayDirection);
  let RayStep = sign(RayDirection);

  var MapPosition = floor(RayPosition);
  var SideDistance = (sign(RayDirection) * (MapPosition - RayPosition) + (sign(RayDirection) * .5) + .5) * DeltaDistance;
  var Mask : vec3<f32> = vec3<f32>(0.);

  /*for(var i : i32 = 0; i < MaxIterations; i++)*/ loop{
    if(GetVoxel(MapPosition)){
      break;
    }
    Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    SideDistance = fma(Mask, DeltaDistance, SideDistance);
    MapPosition = fma(Mask, RayStep, MapPosition);
  }

  return vec4<f32>(Mask, 1.);
}