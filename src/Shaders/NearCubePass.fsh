#version 300 es
precision highp float;
precision highp int;

uniform vec3 iCameraPosition;
uniform vec3 iCameraRotation;
uniform float iFOV;
uniform vec2 iResolution;
uniform highp usampler3D iData;

in highp vec3 RayDirection;

layout(location = 0) out highp uvec2 outColor;

const uint WorldGridOffset = 65536u;

#define IndexDataTexture(A) (texelFetch(iData, ivec3((A) & 2047u, ((A) >> 11) & 2047u, (A) >> 22), 0).x)

uint popcnt(uint n){
  n = n - ((n >> 1) & 0x55555555u);
  n = (n & 0x33333333u) + ((n >> 2) & 0x33333333u);
  return ((n + (n >> 4) & 0x0f0f0f0fu) * 0x01010101u) >> 24;
}

struct RaytraceResult4{
  bool HitVoxel;
  ivec3 RayPosFloor;
};

struct RaytraceResult16{
  bool HitVoxel;
  vec3 FloatMask;
  ivec3 RayPosOffset;
};

ivec3 i_Min;
ivec3 i_Max;
vec3 f_Min;
vec3 f_Max;
vec3 RayDirection_Flat;
float Distance;
vec3 RayInverse;
vec3 AbsRayInverse;
vec3 RayInverse_Flat;
vec3 AbsRayInverse_Flat;
vec3 RaySign;
ivec3 i_RaySign;
vec3 HalfRaySignPlusHalf;

uint L0Bits4;
uint L1Bits4;
uint L2Bits4;
uint L3Bits4;
uint CurrentBits4;
uint Bits1;
uint CompressedAllocations;
uint Bits1Start;

bool IsSolid4(ivec3 c){
  //if((c.x | c.y | c.z) == 0) return true;
  return (Bits1 & (1u << (c.y << 4 | c.z << 2 | c.x))) != 0u;
}

bool IsSolid16(ivec3 c){
  return (CurrentBits4 & (1u << ((c.y & 1) << 4 | c.z << 2 | c.x))) != 0u;
}

RaytraceResult4 Raytrace4(vec3 RayOrigin, inout vec3 FloatMask){
  ivec3 i_RayPosFloor = ivec3(RayOrigin);
  vec3 SideDistance = (HalfRaySignPlusHalf - fract(RayOrigin)) * RayInverse;

  for(int i = 0; i < 8; ++i){
    if(IsSolid4(i_RayPosFloor)) return RaytraceResult4(true, i_RayPosFloor);
    FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    i_RayPosFloor += ivec3(FloatMask * RaySign);
    //any(bvec3(i_RayPosFloor & ~ivec3(3, 1, 3))) works too
    if(((i_RayPosFloor.x | i_RayPosFloor.z) & ~3 | i_RayPosFloor.y & ~1) != 0) break;
    SideDistance += FloatMask * AbsRayInverse;
  }
  return RaytraceResult4(false, i_RayPosFloor);
}

RaytraceResult16 Raytrace16(vec3 RayOrigin, vec3 Normal){
  RayOrigin *= vec3(.25, .5, .25);
  vec3 SideDistance = (HalfRaySignPlusHalf - fract(RayOrigin)) * RayInverse_Flat;
  ivec3 i_RayPosFloor = ivec3(RayOrigin);

  ivec3 Min16 = i_Min >> ivec3(2, 1, 2);
  ivec3 Max16 = i_Max >> ivec3(2, 1, 2);

  vec3 FloatMask = abs(Normal);

  for(int i = 0; i < 14; ++i){
    if(any(lessThan(i_RayPosFloor, Min16)) || any(greaterThan(i_RayPosFloor, Max16))) break;
    CurrentBits4 = (i_RayPosFloor.y < 2 ? L0Bits4 : i_RayPosFloor.y < 4 ? L1Bits4 : i_RayPosFloor.y < 6 ? L2Bits4 : L3Bits4);
    if(IsSolid16(i_RayPosFloor)){
      uint Offset4 = (CompressedAllocations >> (30 - (i_RayPosFloor.y >> 1) * 7)) & 127u;
      Offset4 += popcnt(CurrentBits4 & ~(0xffffffffu << ((i_RayPosFloor.y & 1) << 4 | i_RayPosFloor.z << 2 | i_RayPosFloor.x)));

      uint Location = Bits1Start + Offset4;
      Bits1 = IndexDataTexture(Location);

      float Distance = dot(SideDistance - AbsRayInverse_Flat, FloatMask);
      vec3 CurrentRayPosition = RayOrigin + RayDirection_Flat * Distance + (RaySign * FloatMask * 140e-7); //This epsilon value is somehow related to the one in the main function, if things break, this should be the first thing to check


      RaytraceResult4 Result = Raytrace4(fract(CurrentRayPosition) * vec3(4., 2., 4.), FloatMask);
      if(Result.HitVoxel) return RaytraceResult16(true, FloatMask, i_RayPosFloor << ivec3(2, 1, 2) | Result.RayPosFloor);
    }
    FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    SideDistance += FloatMask * AbsRayInverse_Flat;
    i_RayPosFloor += ivec3(FloatMask * RaySign);
  }
  return RaytraceResult16(false, FloatMask, i_RayPosFloor << ivec3(2, 1, 2));
}






/*float sdSphere(vec3 p, float d) { return length(p) - d; }

float sdBox( vec3 p, vec3 b )
{
  vec3 d = abs(p) - b;
  return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

bool getVoxel(ivec3 c) {
  c &= 15;
  vec3 p = vec3(c) + vec3(0.5);
  float d = min(max(-sdSphere(p, 7.5), sdBox(p, vec3(6.0))), -sdSphere(p, 25.0));
  return d < 0.0;
}
bvec3 mainImage(vec3 RayDirection){
  vec3 rayDir = RayDirection;//(normalize(vec3(uv, 1. / tan(iFOV / 2.))) * RotateX(-iCameraRotation.y)) * RotateY(iCameraRotation.x + 1.5);// * RotateX(-iCameraRotation.y) * RotateY(iCameraRotation.x - 3.14159));

  vec3 rayPos = iCameraPosition;

  ivec3 mapPos = ivec3(floor(rayPos + 0.));

  vec3 deltaDist = abs(vec3(length(rayDir)) / rayDir);

  ivec3 rayStep = ivec3(sign(rayDir));

  vec3 sideDist = (sign(rayDir) * (vec3(mapPos) - rayPos) + (sign(rayDir) * 0.5) + 0.5) * deltaDist;

  bvec3 mask;

  for (int i = 0; i < 64; i++) {
    if(i == 63) return bvec3(false);
    if (getVoxel(mapPos)) break;
    mask = lessThanEqual(sideDist.xyz, min(sideDist.yzx, sideDist.zxy));
    sideDist += vec3(mask) * deltaDist;
    mapPos += ivec3(vec3(mask)) * rayStep;
  }
  return mask;
}*/


void main(){
  float Epsilon = 331e-7;


  uvec3 Region128Coordinate = (uvec3(iCameraPosition) >> 7) & 31u;
  uint Region128CoordinateCompressed = Region128Coordinate.z << 10 | Region128Coordinate.y << 5 | Region128Coordinate.x;


  uvec3 Region16Coordinate = (uvec3(iCameraPosition) >> 4) & 7u;
  uint Region16CoordinateCompressed = Region16Coordinate.z << 6 | Region16Coordinate.y << 3 | Region16Coordinate.x;

  uvec3 CubePosition = Region128Coordinate << 3 | Region16Coordinate;

  uint TextureIndex = WorldGridOffset + Region128CoordinateCompressed;
  uint Region128_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
  uint Region128_HeapIndex = (Region128_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region128_SegmentAndStackIndex);

  TextureIndex = Region128_HeapIndex + 18u + Region16CoordinateCompressed;
  uint Region16_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
  uint Region16_HeapIndex = (Region16_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region16_SegmentAndStackIndex);
  TextureIndex = Region16_HeapIndex + 3u;
  uint Temp = IndexDataTexture(TextureIndex);
  CompressedAllocations = Temp;

  TextureIndex = Region16_HeapIndex + 2u;
  Temp = IndexDataTexture(TextureIndex);
  i_Min = ivec3(0);//ivec3(Temp & 15u, (Temp >> 4) & 15u, (Temp >> 8) & 15u);
  i_Max = ivec3(15);//ivec3((Temp >> 12) & 15u, (Temp >> 16) & 15u, (Temp >> 20) & 15u);

  f_Min = vec3(i_Min);
  f_Max = vec3(i_Max);

  TextureIndex = Region16_HeapIndex + 4u;
  L0Bits4 = IndexDataTexture(TextureIndex);
  TextureIndex = Region16_HeapIndex + 5u;
  L1Bits4 = IndexDataTexture(TextureIndex);
  TextureIndex = Region16_HeapIndex + 6u;
  L2Bits4 = IndexDataTexture(TextureIndex);
  TextureIndex = Region16_HeapIndex + 7u;
  L3Bits4 = IndexDataTexture(TextureIndex);

  Bits1Start = Region16_HeapIndex + 8u;



  vec3 Position = mod(iCameraPosition, 16.);//clamp(vPosition, vec3(f_Min + Epsilon), vec3(f_Max - Epsilon + 1.));
  vec3 CubePositionFloat = vec3(CubePosition);

  RayDirection_Flat = normalize(RayDirection * vec3(1., 2., 1.));

  RayInverse = 1. / RayDirection;
  AbsRayInverse = abs(RayInverse);
  RayInverse_Flat = 1. / RayDirection_Flat;
  AbsRayInverse_Flat = abs(RayInverse_Flat);
  RaySign = sign(RayDirection);
  i_RaySign = ivec3(RaySign);
  HalfRaySignPlusHalf = RaySign * .5 + .5;


  vec3 Normal = vec3(lessThan(abs(Position - vec3(f_Min + Epsilon)), vec3(Epsilon / 2.))) - vec3(lessThan(abs(Position - vec3(f_Max + 1. - Epsilon)), vec3(Epsilon / 2.)));


  RaytraceResult16 Result = Raytrace16(Position, Normal);

  if(Result.HitVoxel){
    uvec3 Side = uvec3(abs(Result.FloatMask));
    uint Sign = uint(any(lessThan(abs(Result.FloatMask) * RaySign, vec3(0.)))); //1 is negative, 0 is positive
    gl_FragDepth = 0.;
    outColor = uvec2(
      Region16CoordinateCompressed << 22 | Region128CoordinateCompressed << 3 | Sign << 2 | (Side.x + Side.y * 2u + Side.z * 3u),
      Result.RayPosOffset.z << 8 | Result.RayPosOffset.y << 4 | Result.RayPosOffset.x
    );
  } else{
    gl_FragDepth = 1.;
    outColor = uvec2(0u);
  }

}