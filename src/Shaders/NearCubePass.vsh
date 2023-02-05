#version 300 es
precision highp float;
precision highp int;
vec2[] Vertices = vec2[3](vec2(-1, -1), vec2(3, -1), vec2(-1, 3));
out vec3 RayDirection;
uniform vec2 iResolution;
uniform vec3 iCameraRotation;
uniform float iFOV;

mat3 RotateX(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(1.,0.,0.,
  0., c,-s,
  0., s, c);
}
mat3 RotateY(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0., s,
  0., 1.,0.,
  -s, 0., c);
}
mat3 RotateZ(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(c, s,0.,
  -s, c,0.,
  0.,0.,1.);
}

void main(){
  vec2 Vertex = Vertices[gl_VertexID];
  gl_Position = vec4(Vertex, 0., 1.);
  RayDirection = vec3(-Vertex.x * (iResolution.x / iResolution.y), Vertex.y, 1. / tan(iFOV / 2.));
  RayDirection *= RotateX(-iCameraRotation.y);
  RayDirection *= RotateY(3.14159 - iCameraRotation.x);
}