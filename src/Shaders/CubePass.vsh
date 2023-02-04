#version 300 es
precision highp float;
precision highp int;

uniform mat4 iModelViewMatrix;
uniform mat4 iProjectionMatrix;
uniform mat4 iModelViewProjectionMatrix;
uniform vec3 iCameraPosition;

uniform highp usampler3D iData;
uniform highp usampler2D iRenderList;

out highp vec3 vPosition;
out highp float vRegion128Coordinate;
out highp float vRegion16Coordinate;

const uint WorldGridOffset = 65536u;

#define v0 vec3(0,0,0)
#define v1 vec3(0,0,1)
#define v2 vec3(0,1,0)
#define v3 vec3(0,1,1)
#define v4 vec3(1,0,0)
#define v5 vec3(1,0,1)
#define v6 vec3(1,1,0)
#define v7 vec3(1,1,1)

vec3[] Vertices = vec3[56](
v4, v6, v5, v7, v1, v3, v2,
v5, v4, v7, v6, v3, v2, v0,
v6, v7, v4, v5, v0, v1, v3,
v7, v5, v6, v4, v2, v0, v1,
v0, v1, v2, v3, v6, v7, v5,
v1, v3, v0, v2, v4, v6, v7,
v2, v0, v3, v1, v7, v5, v4,
v3, v2, v1, v0, v5, v4, v6
);

#define IndexDataTexture(A) (texelFetch(iData, ivec3((A) & 2047u, ((A) >> 11) & 2047u, (A) >> 22), 0).x)

void main(){
  vec3 Position = vec3(0.);

  uint u_InstanceID = uint(gl_InstanceID);

  uint LoadedRegionID = 0u;
  for(uint Bit = 1u << 15u; Bit > 0u; Bit >>= 1u){
    uint TryLoadedRegionID = LoadedRegionID | Bit;
    uint InstancesStart = texelFetch(iRenderList, ivec2(TryLoadedRegionID & 255u, TryLoadedRegionID >> 8), 0).y;

    if(InstancesStart <= u_InstanceID) LoadedRegionID = TryLoadedRegionID;
  }
  uvec2 RenderInfo = texelFetch(iRenderList, ivec2(LoadedRegionID & 255u, LoadedRegionID >> 8), 0).xy;
  uint Region128_Coordinate = RenderInfo.x;
  uint InstancesStart = RenderInfo.y;

  vRegion128Coordinate = float(Region128_Coordinate); //Maximum possible value: 524283

  Position += vec3(Region128_Coordinate & 31u, (Region128_Coordinate >> 5) & 31u, (Region128_Coordinate >> 10) & 31u) * 128.;

  uint TextureIndex = WorldGridOffset + Region128_Coordinate;
  uint Region128_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
  uint Region128_HeapIndex = (Region128_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region128_SegmentAndStackIndex);

  uint LocalInstanceID = u_InstanceID - InstancesStart;

  TextureIndex = Region128_HeapIndex + 531u + LocalInstanceID;
  uint Region16_Coordinate = IndexDataTexture(TextureIndex);

  vRegion16Coordinate = float(Region16_Coordinate); //Maximum value: 511

  TextureIndex = Region128_HeapIndex + 18u + Region16_Coordinate;
  uint Region16_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
  uint Region16_HeapIndex = (Region16_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region16_SegmentAndStackIndex);

  TextureIndex = Region16_HeapIndex + 2u;
  uint Temp = IndexDataTexture(TextureIndex);
  vec3 Min = vec3(Temp & 15u, (Temp >> 4) & 15u, (Temp >> 8) & 15u);
  vec3 Max = vec3((Temp >> 12) & 15u, (Temp >> 16) & 15u, (Temp >> 20) & 15u) + 1.;

  TextureIndex = Region16_HeapIndex + 3u;
  uint Position16 = IndexDataTexture(TextureIndex) & 511u;

  Position += vec3(Position16 & 7u, (Position16 >> 3) & 7u, Position16 >> 6) * 16.;



  ivec3 Sign = ivec3(lessThan(iCameraPosition, Min + Position));
  vPosition = Min + Vertices[(Sign.x << 2 | Sign.y << 1 | Sign.z) * 7 + gl_VertexID] * (Max - Min);

  gl_Position = iModelViewProjectionMatrix * vec4(vPosition + Position, 1.);
}