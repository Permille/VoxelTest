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
  ivec3 RayPosOffset;
};

struct RaytraceResult128{
  bool HitVoxel;
  ivec3 RayPosOffset;
  vec3 FloatMask;
};

struct RaytraceResultWorldGrid{
  bool HitVoxel;
  ivec3 RayPosOffset;
  vec3 FloatMask;
};

vec3 RayDirection_Flat;
float Distance;
vec3 RayInverse;
vec3 AbsRayInverse;
vec3 RayInverse_Flat;
vec3 AbsRayInverse_Flat;
vec3 RaySign;
ivec3 i_RaySign;
vec3 HalfRaySignPlusHalf;

uint Region128CoordinateCompressed;
uint Region16CoordinateCompressed;

uint L0Bits4;
uint L1Bits4;
uint L2Bits4;
uint L3Bits4;
uint CurrentBits4;
uint Bits1;
uint CompressedAllocations;
uint Bits1Start;

bool IsSolid4(ivec3 c){
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

RaytraceResult16 Raytrace16(vec3 RayOrigin, inout vec3 FloatMask){
  RayOrigin *= vec3(.25, .5, .25);
  ivec3 i_RayPosFloor = ivec3(RayOrigin);
  vec3 SideDistance = (HalfRaySignPlusHalf - fract(RayOrigin)) * RayInverse_Flat;

  for(int i = 0; i < 14; ++i){
    if(((i_RayPosFloor.x | i_RayPosFloor.z) & ~3 | i_RayPosFloor.y & ~7) != 0) break;
    CurrentBits4 = (i_RayPosFloor.y < 2 ? L0Bits4 : i_RayPosFloor.y < 4 ? L1Bits4 : i_RayPosFloor.y < 6 ? L2Bits4 : L3Bits4);
    if(IsSolid16(i_RayPosFloor)){
      uint Offset4 = (CompressedAllocations >> (30 - (i_RayPosFloor.y >> 1) * 7)) & 127u;
      Offset4 += popcnt(CurrentBits4 & ~(0xffffffffu << ((i_RayPosFloor.y & 1) << 4 | i_RayPosFloor.z << 2 | i_RayPosFloor.x)));

      uint Location = Bits1Start + Offset4;
      Bits1 = IndexDataTexture(Location);

      float Distance = dot(SideDistance - AbsRayInverse_Flat, FloatMask);
      vec3 CurrentRayPosition = RayOrigin + RayDirection_Flat * Distance + (RaySign * FloatMask * 140e-6); //This epsilon value is somehow related to the one in the main function, if things break, this should be the first thing to check


      RaytraceResult4 Result = Raytrace4(fract(CurrentRayPosition) * vec3(4., 2., 4.), FloatMask);
      if(Result.HitVoxel) return RaytraceResult16(true, i_RayPosFloor << ivec3(2, 1, 2) | Result.RayPosFloor);
    }
    FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    SideDistance += FloatMask * AbsRayInverse_Flat;
    i_RayPosFloor += ivec3(FloatMask * RaySign);
  }
  return RaytraceResult16(false, i_RayPosFloor << ivec3(2, 1, 2));
}

//Currently, this doesn't stay inside of a single 128
RaytraceResult128 Raytrace128(vec3 RayOrigin, inout vec3 FloatMask){
  RayOrigin *= vec3(0.0625);
  ivec3 i_RayPosFloor = ivec3(RayOrigin);
  ivec3 i_OriginalRayPosFloor = i_RayPosFloor;
  vec3 SideDistance = (HalfRaySignPlusHalf - fract(RayOrigin)) * RayInverse;


  for(int i = 0; i < 4; ++i){
    uvec3 Region128Coordinate = (uvec3(i_RayPosFloor) >> 3) & 31u;
    Region128CoordinateCompressed = Region128Coordinate.z << 10 | Region128Coordinate.y << 5 | Region128Coordinate.x;
    uvec3 Region16Coordinate = uvec3(i_RayPosFloor) & 7u;
    Region16CoordinateCompressed = Region16Coordinate.z << 6 | Region16Coordinate.y << 3 | Region16Coordinate.x;

    uint TextureIndex = WorldGridOffset + Region128CoordinateCompressed;
    uint Region128_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
    if(Region128_SegmentAndStackIndex != 0u){
      uint Region128_HeapIndex = (Region128_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region128_SegmentAndStackIndex);

      TextureIndex = Region128_HeapIndex + 18u + Region16CoordinateCompressed;
      uint Region16_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
      if(Region16_SegmentAndStackIndex != 0u){
        uint Region16_HeapIndex = (Region16_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region16_SegmentAndStackIndex);

        Bits1Start = Region16_HeapIndex + 8u;

        TextureIndex = Region16_HeapIndex + 3u;
        uint Temp = IndexDataTexture(TextureIndex);
        CompressedAllocations = Temp;

        TextureIndex = Region16_HeapIndex + 2u;
        Temp = IndexDataTexture(TextureIndex);

        TextureIndex = Region16_HeapIndex + 4u;
        L0Bits4 = IndexDataTexture(TextureIndex);
        TextureIndex = Region16_HeapIndex + 5u;
        L1Bits4 = IndexDataTexture(TextureIndex);
        TextureIndex = Region16_HeapIndex + 6u;
        L2Bits4 = IndexDataTexture(TextureIndex);
        TextureIndex = Region16_HeapIndex + 7u;
        L3Bits4 = IndexDataTexture(TextureIndex);

        float Distance = dot(SideDistance - AbsRayInverse, FloatMask);
        vec3 CurrentRayPosition = RayOrigin + RayDirection * Distance + (RaySign * FloatMask * 5e-7);

        //Important: the clamp here solved some precision issues
        RaytraceResult16 Result = Raytrace16(clamp((CurrentRayPosition - vec3(i_RayPosFloor)) * vec3(16., 16., 16.), 0., 15.99999), FloatMask);
        if(Result.HitVoxel) return RaytraceResult128(true, i_RayPosFloor << ivec3(4) | Result.RayPosOffset, FloatMask);
        //return RaytraceResult128(true, i_RayPosFloor << ivec3(4)/* | Result.RayPosFloor*/, FloatMask);
      }
    }
    FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
    SideDistance += FloatMask * AbsRayInverse;
    i_RayPosFloor += ivec3(FloatMask * RaySign);
    if(any(greaterThan(abs(i_OriginalRayPosFloor - i_RayPosFloor), ivec3(1)))) break; //I only need to do this for the current 16-cube and the ones around it
  }
  return RaytraceResult128(false, i_RayPosFloor << ivec3(4), FloatMask);
}



void main(){
  vec3 Position = iCameraPosition;
  RayDirection_Flat = normalize(RayDirection * vec3(1., 2., 1.));

  RayInverse = 1. / RayDirection;
  AbsRayInverse = abs(RayInverse);
  RayInverse_Flat = 1. / RayDirection_Flat;
  AbsRayInverse_Flat = abs(RayInverse_Flat);
  RaySign = sign(RayDirection);
  i_RaySign = ivec3(RaySign);
  HalfRaySignPlusHalf = RaySign * .5 + .5;

  vec3 Normal = vec3(0.);

  RaytraceResult128 Result = Raytrace128(Position, Normal);
  ivec3 Local16Coordinate = Result.RayPosOffset & 15;
  if(Result.HitVoxel){
    uvec3 Side = uvec3(abs(Result.FloatMask));
    uint Sign = uint(any(lessThan(abs(Result.FloatMask) * RaySign, vec3(0.)))); //1 is negative, 0 is positive
    gl_FragDepth = 0.;
    outColor = uvec2(
      Region16CoordinateCompressed << 22 | Region128CoordinateCompressed << 3 | Sign << 2 | (Side.x + Side.y * 2u + Side.z * 3u),
      Local16Coordinate.z << 8 | Local16Coordinate.y << 4 | Local16Coordinate.x
    );
  } else{
    gl_FragDepth = 1.;
    outColor = uvec2(0u);
  }
}