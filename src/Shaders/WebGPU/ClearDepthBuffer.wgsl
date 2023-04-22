struct UniformsStruct{
  ModelViewProjection : mat4x4<f32>,
  InverseModelViewProjection : mat4x4<f32>,
  Time : f32,
  Empty : u32,
  Resolution : vec2<f32>,
  CameraRotation : vec2<f32>,
  RenderListLength : u32,
  CameraPosition : vec3<f32>,
}

@binding(0) @group(0) var<uniform> Uniforms : UniformsStruct;
@binding(1) @group(0) var<storage, read_write> DepthBuffer : array<u32>;

@compute @workgroup_size(16, 16)
fn Main(@builtin(global_invocation_id) ID : vec3<u32>){
  let Resolution = vec2<u32>(Uniforms.Resolution);
  if(any(ID.xy >= Resolution)){
    return;
  }
  DepthBuffer[ID.y * Resolution.x + ID.x] = 0xffffffff;
}