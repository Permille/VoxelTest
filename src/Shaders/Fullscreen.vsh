#version 300 es
precision highp float;
precision highp int;
vec2[] Vertices = vec2[3](vec2(-1, -1), vec2(3, -1), vec2(-1, 3));
out vec2 uv;
void main(){
  vec2 Vertex = Vertices[gl_VertexID];
  gl_Position = vec4(Vertex, 0, 1);
  uv = Vertex;
}