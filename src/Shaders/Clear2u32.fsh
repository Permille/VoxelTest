#version 300 es
precision highp float;
precision highp int;
layout(location = 0) out highp uvec2 outColor;
in vec2 uv;
void main(){
  outColor = uvec2(0u);
}