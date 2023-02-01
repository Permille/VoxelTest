import "./GLMath.mjs";
import GetHeight from "./GetHeight.mjs";
import * as I from "./Indices.mjs";

const Canvas = document.createElement("canvas");
const gl = Canvas.getContext("webgl2", {
  "antialias": false,
  "stencil": false,
  "power-preference": "high-performance",
  "desynchronized": false,
  "depth": false
});

document.body.appendChild(Canvas);
document.body.style.margin = "0";
Canvas.style.display = "block";

const FPS = document.createElement("div");
//FPS.style.filter = "url(#test) hue-rotate(90deg) saturate(300%)";
FPS.style.filter = "url(#test) drop-shadow(0 -128px #000000) url(#test2)";
FPS.style.overflow = "hidden";
FPS.style.fontFamily = "ESCAPE";
FPS.style.padding = "2px 3px 1px 3px";
FPS.style.fontSize = "16px";
//FPS.style.backgroundColor = "#7f7f7f7f";
FPS.style.color = "#ffffff";
FPS.style.position = "absolute";
FPS.style.top = "0";
FPS.style.left = "0";
document.body.appendChild(FPS);

const vsh = `#version 300 es
  #line 33
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
`;

const fsh = `#version 300 es
#line 129
  precision highp float;
  precision highp int;
  
  uniform float iTime;
  uniform vec3 iCameraPosition;
  
  uniform highp usampler3D iData;
  
  in highp vec3 vPosition;
  in highp float vRegion128Coordinate;
  in highp float vRegion16Coordinate;
  
  layout(location = 0) out highp uvec2 outColor;
  //out vec4 outColor;
  
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
    vec3 FloatMask;
    ivec3 RayPosOffset;
  };
  
  ivec3 i_Min;
  ivec3 i_Max;
  vec3 f_Min;
  vec3 f_Max;
  vec3 RayDirection;
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
    return (Bits1 & (1u << (c.y << 4 | c.z << 2 | c.x))) != 0u;
  }
  
  bool IsSolid16(ivec3 c){
    return (CurrentBits4 & (1u << ((c.y & 1) << 4 | c.z << 2 | c.x))) != 0u;
  }
  
  RaytraceResult4 Raytrace4(vec3 RayOrigin, inout vec3 FloatMask){
    ivec3 i_RayPosFloor = ivec3(RayOrigin);
    vec3 SideDistance = (HalfRaySignPlusHalf - fract(RayOrigin)) * RayInverse;
    /* //This is slightly slower. Offset was i_RayPosFloor from Raytrace16
    Offset <<= 2;
    ivec3 LocalMin = max(ivec3(0), i_Min - Offset);
    ivec3 LocalMax = min(ivec3(3), i_Max - Offset);
    // Then use this in the for loop:
    
    //if(any(lessThan(i_RayPosFloor, LocalMin)) || any(greaterThan(i_RayPosFloor, LocalMax))) break;
    */
    
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
    
    
    CurrentBits4 = (i_RayPosFloor.y < 4 ? i_RayPosFloor.y < 2 ? L0Bits4 : L1Bits4 : i_RayPosFloor.y < 6 ? L2Bits4 : L3Bits4);
    if(IsSolid16(i_RayPosFloor)){
      uint Offset4 = (CompressedAllocations >> (30 - (i_RayPosFloor.y >> 1) * 7)) & 127u;
      Offset4 += popcnt(CurrentBits4 & ~(0xffffffffu << ((i_RayPosFloor.y & 1) << 4 | i_RayPosFloor.z << 2 | i_RayPosFloor.x)));
      
      uint Location = Bits1Start + Offset4;
      Bits1 = IndexDataTexture(Location);
      
      RaytraceResult4 Result = Raytrace4(fract(RayOrigin) * vec3(4., 2., 4.), FloatMask);
      if(Result.HitVoxel) return RaytraceResult16(FloatMask, i_RayPosFloor << ivec3(2, 1, 2) | Result.RayPosFloor);
      
      FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      SideDistance += FloatMask * AbsRayInverse_Flat;
      i_RayPosFloor += ivec3(FloatMask * RaySign);
    }
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
        if(Result.HitVoxel) return RaytraceResult16(FloatMask, i_RayPosFloor << ivec3(2, 1, 2) | Result.RayPosFloor);
      }
      FloatMask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      SideDistance += FloatMask * AbsRayInverse_Flat;
      i_RayPosFloor += ivec3(FloatMask * RaySign);
    }
    discard;
  }
  
  void main(){
    float Epsilon = 331e-7;
    
    uint Region128CoordinateCompressed = uint(round(vRegion128Coordinate));
    uvec3 Region128Coordinate = uvec3(Region128CoordinateCompressed & 31u, (Region128CoordinateCompressed >> 5) & 31u, (Region128CoordinateCompressed >> 10) & 31u);
    
    uint Region16CoordinateCompressed = uint(round(vRegion16Coordinate));
    uvec3 Region16Coordinate = uvec3(Region16CoordinateCompressed & 7u, (Region16CoordinateCompressed >> 3) & 7u, (Region16CoordinateCompressed >> 6) & 7u);
    
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
    i_Min = ivec3(Temp & 15u, (Temp >> 4) & 15u, (Temp >> 8) & 15u);
    i_Max = ivec3((Temp >> 12) & 15u, (Temp >> 16) & 15u, (Temp >> 20) & 15u);
    
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
    
    
    
    vec3 Position = clamp(vPosition, vec3(f_Min + Epsilon), vec3(f_Max - Epsilon + 1.));
    vec3 CubePositionFloat = vec3(CubePosition);
    
    vec3 RayOrigin = Position + CubePositionFloat * 16.;
    RayDirection = normalize(vPosition + CubePositionFloat * 16. - iCameraPosition);
    RayDirection_Flat = normalize(RayDirection * vec3(1., 2., 1.));
    
    RayInverse = 1. / RayDirection;
    AbsRayInverse = abs(RayInverse);
    RayInverse_Flat = 1. / RayDirection_Flat;
    AbsRayInverse_Flat = abs(RayInverse_Flat);
    RaySign = sign(RayDirection);
    i_RaySign = ivec3(RaySign);
    HalfRaySignPlusHalf = RaySign * .5 + .5;
    
    Distance = length(RayOrigin - iCameraPosition);
    
    vec3 Normal = vec3(lessThan(abs(Position - vec3(f_Min + Epsilon)), vec3(Epsilon / 2.))) - vec3(lessThan(abs(Position - vec3(f_Max + 1. - Epsilon)), vec3(Epsilon / 2.)));
    
    
    RaytraceResult16 Result = Raytrace16(Position, Normal);
    
    uvec3 Side = uvec3(abs(Result.FloatMask));
    uint Sign = uint(any(lessThan(abs(Result.FloatMask) * RaySign, vec3(0.)))); //1 is negative, 0 is positive
    
    outColor = uvec2(
      Region16CoordinateCompressed << 22 | Region128CoordinateCompressed << 3 | Sign << 2 | (Side.x + Side.y * 2u + Side.z * 3u),
      Result.RayPosOffset.z << 8 | Result.RayPosOffset.y << 4 | Result.RayPosOffset.x
    );
  }
`;

const fshClear = `#version 300 es
  precision highp float;
  precision highp int;
  layout(location = 0) out highp uvec2 outColor;
  in vec2 uv;
  void main(){
    outColor = uvec2(0u);
  }
`;

const vsh2 = `#version 300 es
  precision highp float;
  precision highp int;
  vec2[] Vertices = vec2[3](vec2(-1, -1), vec2(3, -1), vec2(-1, 3));
  out vec2 uv;
  void main(){
    vec2 Vertex = Vertices[gl_VertexID];
    gl_Position = vec4(Vertex, 0, 1);
    uv = Vertex;
  }
`;

const fsh2 = `#version 300 es
  precision highp float;
  precision highp int;
  
  in vec2 uv;
  out vec4 outColor;
  
  uniform highp usampler3D iData;
  uniform highp usampler2D iVoxelPassTexture;
  
  int[] CompressedSignToSign = int[2](1, -1);
  ivec3[] CompressedMaskToMask = ivec3[4](ivec3(0), ivec3(0, 0, 1), ivec3(0, 1, 0), ivec3(1, 0, 0));
  
  //https://www.shadertoy.com/view/lsS3Wc
  vec3 hsl2rgb( in vec3 c ){
    vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
  }
  vec4[] Colours = vec4[4](
    vec4(1., 0., 0., 1.),
    vec4(142.,173., 42., 255.) / 255.,
    vec4( 91.,183.,  0., 255.) / 255.,
    vec4( 99., 63., 27., 255.) / 255.
  );
  ivec3 ConvertToTextureCoordinate(int x){
    return ivec3(x & 255, (x >> 8) & 255, x >> 16);
  }
  ivec3 ConvertToTextureCoordinate(uint x){
    return ivec3(x & 255u, (x >> 8) & 255u, x >> 16);
  }
  #define TEX_TypeRLE(A) (texelFetch(iTypeRLE,ConvertToTextureCoordinate((A)),0).x)
  #define IndexDataTexture(A) (texelFetch(iData, ivec3((A) & 2047u, ((A) >> 11) & 2047u, (A) >> 22), 0).x)
  const uint WorldGridOffset = 65536u;
  void main(){
    vec2 TextureUV = (uv + 1.) / 2.;
    uvec2 VoxelSample = texture(iVoxelPassTexture, TextureUV).xy;
    if(VoxelSample == uvec2(0)){
      outColor = vec4(1.);
      return;
    }
    //vec3 Sign = vec3(VoxelSample.x >> 2 & 1u, VoxelSample.x >> 1 & 1u, VoxelSample.x & 1u) * 2. - 1.;
    float Sign = (VoxelSample.x >> 2 & 1u) == 0u ? 1. : -1.;
    uint CompressedSide = VoxelSample.x & 3u;
    vec3 Side = vec3(CompressedSide == 1u, CompressedSide == 2u, CompressedSide == 3u);
    uvec3 Pos = uvec3((VoxelSample.y) & 15u, (VoxelSample.y >> 4u) & 15u, (VoxelSample.y >> 8u) & 15u);
    
    
    uint Region128CoordinateCompressed = (VoxelSample.x >> 3) & 524287u;
    uint Region16CoordinateCompressed = (VoxelSample.x >> 22) & 511u;
    
    
    uint TextureIndex = WorldGridOffset + Region128CoordinateCompressed;
    uint Region128_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
    uint Region128_HeapIndex = (Region128_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region128_SegmentAndStackIndex);
    
    TextureIndex = Region128_HeapIndex + 18u + Region16CoordinateCompressed;
    uint Region16_SegmentAndStackIndex = IndexDataTexture(TextureIndex);
    uint Region16_HeapIndex = (Region16_SegmentAndStackIndex & ~65535u) | IndexDataTexture(Region16_SegmentAndStackIndex);
    
    uint Temp = Region16_HeapIndex + 1u;
    uint RLEStart = IndexDataTexture(Temp);
    
    Temp = Region16_HeapIndex + RLEStart;
    uint TypeCount = IndexDataTexture(Temp);
    
    //outColor = vec4(0., 1., 1., 1.);
    //outColor.xyz *= length(vec3(.8, 1., .9) * vec3(CompressedSide == 1u, CompressedSide == 2u, CompressedSide == 3u));
    //return;
    
    uint Type;
    if(TypeCount == 1u){
      Temp = Region16_HeapIndex + RLEStart + 1u;
      Type = IndexDataTexture(Temp);
      outColor = Colours[Type];
    }
    else{
      uint SearchIndex = Pos.z << 4 | Pos.x;
      uint LayerOffset = 0u;
      if(Pos.y != 0u){
        uint Divided = (Pos.y * 5u) >> 4u; //Equivalent to (Pos.y - 1u) / 3u;
        Temp = Region16_HeapIndex + RLEStart + 2u + Divided;
        uint Data = IndexDataTexture(Temp);
        uint Reference = Data & 0xfffu;
        uint Column = Pos.y - 1u - Divided * 3u; //Equivalent to (Pos.y - 1u) % 3u;
        LayerOffset = Reference + (Column == 0u ? 0u : (Column == 1u ? Data >> 12u : Data >> 21u) & 0x1ffu);
      }
      Temp = Region16_HeapIndex + RLEStart + 1u;
      uint Offsets = IndexDataTexture(Temp);
      uint TypesStart = Region16_HeapIndex + RLEStart + (Offsets & 0xffffu);
      uint LengthsStart = Region16_HeapIndex + RLEStart + (Offsets >> 16);
      uint CheckedLengthOffset = LayerOffset;
      uint CheckedLength = 0u;
      
      //TODO: I could turn this into a binary search
      Temp = LengthsStart + (CheckedLengthOffset >> 2);
      uint Lengths = IndexDataTexture(Temp);
      for(uint j = CheckedLengthOffset & 3u; j < 4u; ++j, ++CheckedLengthOffset){
        CheckedLength = (Lengths >> (j << 3u)) & 255u;
        if(CheckedLength >= SearchIndex) break;
      }
      
      for(uint i = 0u; i < 64u; ++i){
        if(CheckedLength >= SearchIndex) break;
        Temp = LengthsStart + (CheckedLengthOffset >> 2);
        Lengths = IndexDataTexture(Temp);
        uint j = 0u;
        for(; j < 4u; ++j){
          CheckedLength = (Lengths >> (j << 3u)) & 255u;
          if(CheckedLength >= SearchIndex) break;
        }
        CheckedLengthOffset += j;
      }
      //if(CheckedLength == 256u) outColor = vec4(0., 1., 0., 1.);
      //else{
      //  outColor = vec4(vec3(CheckedLength) / 511., 1.);
      //  if(CheckedLength > 256u) outColor.x = 1.;
      //}
      uint IterationNumber = CheckedLengthOffset - LayerOffset;
      uint CompressedType = 0u;
      if(TypeCount == 2u){
        Temp = TypeCount + TypesStart + ((LayerOffset + IterationNumber) >> 5);
        uint CompressedTypes = IndexDataTexture(Temp);
        CompressedType = (CompressedTypes >> ((LayerOffset + IterationNumber) & 31u)) & 1u;
      } else if(TypeCount <= 4u){
        Temp = TypeCount + TypesStart + ((LayerOffset + IterationNumber) >> 4);
        uint CompressedTypes = IndexDataTexture(Temp);
        CompressedType = (CompressedTypes >> (((LayerOffset + IterationNumber) & 15u) << 1)) & 3u;
      } else{
        outColor = vec4(Pos, 15u) / 15.;//vec4((-Sign * Side + 1.) * .5, 1.);
        return;
      }
      Temp = Region16_HeapIndex + RLEStart + 7u + CompressedType;
      Type = IndexDataTexture(Temp);
      outColor = Colours[Type];
    }
    outColor.xyz *= length(vec3(.8, 1., .9) * vec3(CompressedSide == 1u, CompressedSide == 2u, CompressedSide == 3u));
  }
`;

function GaussianKernel(Radius, Sigma){
  const Width = Radius * 2 + 1;
  const Kernel = new Float32Array(Width * Width);
  const SigmaSquared = Sigma * Sigma;
  let Sum = 0.;
  for(let x = 0; x < Width; ++x) for(let y = 0; y < Width; ++y){
    const XWeight = x - Radius;
    const YWeight = y - Radius;
    const Value = Math.exp(-.5 * ((XWeight / Sigma) ** 2 + (YWeight / Sigma) ** 2)) / (2. * Math.PI * SigmaSquared);
    Sum += Value;
    Kernel[x * Width + y] = Value;
  }
  for(let i = Width * Width; i >= 0; --i) Kernel[i] /= Sum;
  return Kernel;
}

function SetAdd(SegmentArray, HeapIndex, Value){
  let Hash = Value;/*Math.imul(((Value >>> 16) ^ Value), 0x45d9f3b);
  Hash = Math.imul(((Hash >>> 16) ^ Hash), 0x45d9f3b);
  Hash = ((Hash >>> 16) ^ Hash) & 8191;*/
  for(let i = 0; i < 8192; ++i){
    const CurrentValue = SegmentArray[HeapIndex + 2 + (((Hash + i) & 8191) << 1)];
    if(CurrentValue === Value) return; //Set already contains element
    if(CurrentValue === 0xffffffff){
      Hash = (Hash + i) & 8191;
      SegmentArray[HeapIndex + 2 + (Hash << 1)] = Value;
      SegmentArray[HeapIndex + 2 + (Hash << 1 | 1)] = SegmentArray[HeapIndex + 1]; //This sets the ID of the entry for easy access
      SegmentArray[HeapIndex + 16386 + SegmentArray[HeapIndex + 1]++] = Value;
      return;
    }
  }
  //throw new Error("Ran out of space"); //This should never happen because I'll add at most 4096 items. The capacity is 8192 so that it's not slow when there's many types (over 2000), which should be pretty rare anyway.
}
function SetClear(SegmentArray, HeapIndex){
  const SetItems = SegmentArray[HeapIndex + 1];
  for(let i = 0; i < SetItems; ++i){
    const Value = SegmentArray[HeapIndex + 16386 + i];
    let Hash = Value;/*Math.imul(((Value >>> 16) ^ Value), 0x45d9f3b);
    Hash = Math.imul(((Hash >>> 16) ^ Hash), 0x45d9f3b);
    Hash = ((Hash >>> 16) ^ Hash) >>> 0;*/

    SegmentArray[HeapIndex + 16386 + i] = 0xffffffff;
    for(let i = 0; i < 8192; ++i){
      if(SegmentArray[HeapIndex + 2 + (((Hash + i) & 8191) << 1)] === 0xffffffff) break;
      SegmentArray[HeapIndex + 2 + (((Hash + i) & 8191) << 1)] = 0xffffffff;
      SegmentArray[HeapIndex + 2 + (((Hash + i) & 8191) << 1 | 1)] = 0xffffffff;
    }
  }
  SegmentArray[HeapIndex + 1] = 0; //Set item count to 0
}
function SetGet(SegmentArray, HeapIndex, Value){
  const SetSize = SegmentArray[HeapIndex + 1];
  //Should be faster in this case because it takes a little to calculate the hash
  if(SetSize < 4){
    for(let i = 0; i < SetSize; ++i) if(SegmentArray[HeapIndex + 16386 + i] === Value) return i;
    return 0xffffffff;
  }
  let Hash = Value;/*Math.imul(((Value >>> 16) ^ Value), 0x45d9f3b);
  Hash = Math.imul(((Hash >>> 16) ^ Hash), 0x45d9f3b);
  Hash = ((Hash >>> 16) ^ Hash) >>> 0;*/
  for(let i = 0; i < 8192; ++i){
    const CurrentValue = SegmentArray[HeapIndex + 2 + (((Hash + i) & 8191) << 1)];
    if(CurrentValue === Value) return SegmentArray[HeapIndex + 2 + (((Hash + i) & 8191) << 1 | 1)];
    if(CurrentValue === 0xffffffff) return 0xffffffff;
  }
  return 0xffffffff;
}
function SetSize(SegmentArray, HeapIndex){
  return SegmentArray[HeapIndex + 1];
}

const ChunkSphereRadius = Math.sqrt(3. * (128. / 2.) ** 2.);

//2634, 2694, 2552, 2526, 2593
class Main{
  constructor(){
    this.FOV = 70.;
    this.Near = 4.;
    this.Far = 24000.;

    this.RotationX = 0.;
    this.RotationY = 0.;

    this.PositionX = 0.;
    this.PositionY = 0.;
    this.PositionZ = -3.;

    this.CanvasScale = 1.;
//
    this.PositionX = this.PositionZ = -300., this.PositionY = 2400., this.RotationX = 2.356, this.RotationY = -.5;
    //this.PositionX = this.PositionZ = 2348., this.PositionY = 2400., this.RotationX = Math.PI + 2.356, this.RotationY = -.5;
    this.MovementSpeed = 1.025;//1.25;
    this.LastRender = 0.;
    this.Frames = 0;

    this.Renderbuffer = null;
    this.FramebufferTexture = null;
    this.Framebuffer = null; //This will be generated when Resize is called in Initialise

    this.MemorySize = 1 << 28; //256 MB
    this.MemoryBuffer = new SharedArrayBuffer(this.MemorySize);
    this.Data = new Uint32Array(this.MemoryBuffer);

    //Regions should have a CPU-side last update time, and a GPU-side last upload time, to know whether the buffer sections need to be uploaded again
    console.time();
    this.Initialise();
    console.timeEnd();
  }
  Initialise(){
    this.VoxelShaderProgram = this.InitShaderProgram(vsh, fsh);
    this.ProcessShaderProgram = this.InitShaderProgram(vsh2, fsh2);
    this.ClearBufferShaderProgram = this.InitShaderProgram(vsh2, fshClear);
    this.Attributes = this.GetAttributeLocations(this.VoxelShaderProgram, [
      //"position",
      //"color"
    ]);
    this.VoxelUniforms = this.GetUniformLocations(this.VoxelShaderProgram, [
      "iModelViewMatrix",
      "iProjectionMatrix",
      "iModelViewProjectionMatrix",
      "iCameraPosition",
      "iData",
      "iRenderList"
    ]);
    this.ProcessUniforms = this.GetUniformLocations(this.ProcessShaderProgram, [
      "iVoxelPassTexture",
      "iData"
    ]);

    this.IndexArray = new Uint8Array([0,1,2,3,4,3,5,1,6]);
    this.IndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.IndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.IndexArray, gl.STATIC_DRAW);

    this.EmptyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(1), gl.STATIC_DRAW);


    const HeightDataArraysCount = 64;


    let ByteIndex = 0;



    this.Data[I.I_MEMORY_SIZE] = this.MemorySize; //In bytes

    ByteIndex = 16 * 4;

    this.Data[I.I_HEIGHT_DATA_INFO_INDEX] = ByteIndex >> 2;

    //Nothing to do, memory is already initialised to zeros
    ByteIndex += HeightDataArraysCount * 2 * 4;

    let ByteIndexAtHeaderSection = ByteIndex; //This will be used to add allocation segments info when they are generated



    ByteIndex = (ByteIndex + 262143) & ~262143; //Round up to next 262144 alignment


    this.WorldGrid = new Uint32Array(this.MemoryBuffer, ByteIndex, 32*32*32*16); //Allocates 2MB
    this.Data[I.I_WORLD_GRID_INDEX] = ByteIndex >> 2;
    ByteIndex += 32*32*32*16*4;
    this.HeightDataArrays = [];
    this.Data[I.I_HEIGHT_DATA_INDEX] = ByteIndex >> 2;
    this.Data[I.I_HEIGHT_DATA_COUNT] = HeightDataArraysCount;

    for(let i = 0; i < HeightDataArraysCount; ++i){ //Allocates 4MB in total, HeightDataArraysCount == 64
      this.HeightDataArrays.push(new Float32Array(this.MemoryBuffer, ByteIndex, 128*128));
      ByteIndex += 128*128*4;
    }
    this.MemorySegments_i32 = [];
    this.MemorySegments_u32 = [];

    for(let i = 0; i < ByteIndex; i += 65536 * 4){ //Prefill non-existing memory segments with nulls for easier access
      this.MemorySegments_i32.push(null);
      this.MemorySegments_u32.push(null);
    }

    for(; ByteIndex < this.MemorySize; ByteIndex += 65536 * 4 /* => 65536 u32s */){
      const MemorySegment_i32 = new Int32Array(this.MemoryBuffer, ByteIndex, 65536);
      const MemorySegment_u32 = new Uint32Array(this.MemoryBuffer, ByteIndex, 65536);
      MemorySegment_u32[I.I_STACK] = 65527;
      MemorySegment_u32[I.I_LIST_END] = 65527;
      this.MemorySegments_u32.push(MemorySegment_u32);
      this.MemorySegments_i32.push(MemorySegment_i32);

      this.Data[ByteIndexAtHeaderSection >> 2] = ByteIndex;
      ByteIndexAtHeaderSection += 4;

      this.Data[I.I_ALLOCATION_SEGMENTS_COUNT]++;
    }

    this.Data[I.I_ALLOCATION_SEGMENTS_LIST_INDEX] = (this.Data[I.I_MEMORY_SIZE] >> 18) - this.Data[I.I_ALLOCATION_SEGMENTS_COUNT];




    //897/1498
    //820/1296

    const Heights = new Float32Array(256 * 256);
    for(let z = 0; z < 256; ++z) for(let x = 0; x < 256; ++x){
      Heights[z << 8 | x] = GetHeight(x * 16, z * 16);
    }
    const InterpolatedHeights = new Float32Array(18 * 18);
    const Min4s = new Float32Array(16);
    const Max4s = new Float32Array(16);

    const Children128SegmentAndStackIndex = this.AllocateMemory(514, true);
    const Children128SegmentIndex = Children128SegmentAndStackIndex >> 16;
    const Children128StackIndex = Children128SegmentAndStackIndex & 65535;
    const Children128SegmentArray = this.MemorySegments_u32[Children128SegmentIndex];

    const AllocationTemplateSegmentAndStackIndex = this.AllocateMemory(8192, true);
    const AllocationTemplateSegmentIndex = AllocationTemplateSegmentAndStackIndex >> 16;
    const AllocationTemplateStackIndex = AllocationTemplateSegmentAndStackIndex & 65535;
    const AllocationTemplateSegmentArray = this.MemorySegments_u32[AllocationTemplateSegmentIndex];

    let FreeCubeIndex = 0;

    const FreeCubeIndicesSegmentAndStackIndex = this.AllocateMemory(514, true);
    const FreeCubeIndicesSegmentIndex = FreeCubeIndicesSegmentAndStackIndex >> 16;
    const FreeCubeIndicesStackIndex = FreeCubeIndicesSegmentAndStackIndex & 65535;
    const FreeCubeIndicesSegmentArray = this.MemorySegments_u32[FreeCubeIndicesSegmentIndex];

    {
      const FreeCubeSegmentHeapIndex = FreeCubeIndicesSegmentArray[FreeCubeIndicesStackIndex];
      for(let i = 2; i < 514; ++i){
        FreeCubeIndicesSegmentArray[FreeCubeSegmentHeapIndex + i] = 0;
      }
    }

    const TypesSetSegmentAndStackIndex = this.AllocateMemory(20482, true);
    const TypesSetSegmentIndex = TypesSetSegmentAndStackIndex >> 16;
    const TypesSetStackIndex = TypesSetSegmentAndStackIndex & 65535;
    const TypesSetSegmentArray = this.MemorySegments_u32[TypesSetSegmentIndex];

    {
      const TypesSetHeapIndex = TypesSetSegmentArray[TypesSetStackIndex];
      TypesSetSegmentArray[TypesSetHeapIndex + 1] = 0;
      for(let i = 2; i < 20482; ++i){
        TypesSetSegmentArray[TypesSetHeapIndex + i] = 0xffffffff;
      }
    }

    const TempRLESegmentAndStackIndex = this.AllocateMemory(8210, true);
    const TempRLESegmentIndex = TempRLESegmentAndStackIndex >> 16;
    const TempRLEStackIndex = TempRLESegmentAndStackIndex & 65535;
    const TempRLESegmentArray = this.MemorySegments_u32[TempRLESegmentIndex];




    for(let z128 = 0; z128 < 16; ++z128) for(let x128 = 0; x128 < 16; ++x128){
      //Find bounds for y values in 128² region
      let MinY = 32767;
      let MaxY = -32768;
      for(let z = 0; z < 10; ++z) for(let x = 0; x < 10; ++x){
        const Height = Heights[((z128 << 11) + (z << 8)) | ((x128 << 3) + x)];
        MinY = Math.min(MinY, Height);
        MaxY = Math.max(MaxY, Height);
      }
      for(let y128 = Math.floor(MinY / 128), y128_Max = Math.floor(MaxY / 128); y128 <= y128_Max; ++y128){
        const Children128HeapIndex = Children128SegmentArray[Children128StackIndex];
        for(let i = 2; i < 514; ++i) Children128SegmentArray[Children128HeapIndex + i] = 0;

        let NonEmptyChildrenCount = 0;

        for(let z16 = 0; z16 < 8; ++z16){
          for(let x16 = 0; x16 < 8; ++x16){
            const HeightMM = Heights[((z128 << 11) + (z16 << 8)) | ((x128 << 3) + x16)];
            const HeightM0 = Heights[((z128 << 11) + (z16 << 8)) | ((x128 << 3) + (x16 + 1))];
            const HeightMP = Heights[((z128 << 11) + (z16 << 8)) | ((x128 << 3) + (x16 + 2))];
            const Height0M = Heights[((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + x16)];
            const Height00 = Heights[((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + (x16 + 1))];
            const Height0P = Heights[((z128 << 11) + ((z16 + 1) << 8)) | ((x128 << 3) + (x16 + 2))];
            const HeightPM = Heights[((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + x16)];
            const HeightP0 = Heights[((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + (x16 + 1))];
            const HeightPP = Heights[((z128 << 11) + ((z16 + 2) << 8)) | ((x128 << 3) + (x16 + 2))];


            for(let z = 0; z < 9; ++z) for(let x = 0; x < 9; ++x){
              InterpolatedHeights[z * 18 + x] = (
                HeightMM * (16. - (x + 7)) * (16. - (z + 7)) +
                HeightM0 * (x + 7) * (16. - (z + 7)) +
                Height0M * (16. - (x + 7)) * (z + 7) +
                Height00 * (x + 7) * (z + 7)
              ) / 256.;


              InterpolatedHeights[z * 18 + (x + 9)] = (
                HeightM0 * (16. - x) * (16. - (z + 7)) +
                HeightMP * x * (16. - (z + 7)) +
                Height00 * (16. - x) * (z + 7) +
                Height0P * x * (z + 7)
              ) / 256.;


              InterpolatedHeights[(z + 9) * 18 + x] = (
                Height0M * (16. - (x + 7)) * (16. - z) +
                Height00 * (x + 7) * (16. - z) +
                HeightPM * (16. - (x + 7)) * z +
                HeightP0 * (x + 7) * z
              ) / 256.;


              InterpolatedHeights[(z + 9) * 18 + (x + 9)] = (
                Height00 * (16. - x) * (16. - z) +
                Height0P * x * (16. - z) +
                HeightP0 * (16. - x) * z +
                HeightPP * x * z
              ) / 256.;
            }


            let YMin = 2147483647;
            let YMax = -2147483648;

            Min4s.fill(2147483647);
            Max4s.fill(-2147483648);

            for(let z4 = 0; z4 < 4; ++z4) for(let x4 = 0; x4 < 4; ++x4){
              const Offset = (z4 * 4) * 18 + (x4 * 4);
              let Min = 2147483647;
              let Max = -2147483648;
              for(let z1 = 0; z1 < 6; ++z1) for(let x1 = 0; x1 < 6; x1 += 2){
                let Large = InterpolatedHeights[Offset + z1 * 18 + x1];
                let Small = InterpolatedHeights[Offset + z1 * 18 + x1 + 1];
                if(Large < Small){
                  const Temp = Large;
                  Large = Small;
                  Small = Temp;
                }
                Min = Math.min(Small, Min);
                Max = Math.max(Large, Max);
              }
              YMin = Math.min(YMin, Min);
              YMax = Math.max(YMax, Max);

              Min4s[z4 << 2 | x4] = Math.floor(Min);
              Max4s[z4 << 2 | x4] = Math.floor(Max);
            }


            const y16_Min = Math.max(Math.floor((YMin - (y128 << 7)) / 16), 0);
            const y16_Max = Math.min(Math.floor((YMax - (y128 << 7)) / 16), 7);

            for(let y16 = y16_Min; y16 <= y16_Max; ++y16){
              const FreeCubeIndicesHeapIndex = FreeCubeIndicesSegmentArray[FreeCubeIndicesStackIndex];
              let CubeSegmentAndStackIndex = FreeCubeIndicesSegmentArray[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex];
              if(CubeSegmentAndStackIndex === 0){
                CubeSegmentAndStackIndex = this.AllocateMemory(4130, true);
                FreeCubeIndicesSegmentArray[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex] = CubeSegmentAndStackIndex;
              }
              FreeCubeIndex++;
              const CubeSegmentIndex = CubeSegmentAndStackIndex >> 16;
              const CubeStackIndex = CubeSegmentAndStackIndex & 65535;
              const CubeSegmentArray = this.MemorySegments_u32[CubeSegmentIndex];
              const CubeHeapIndex = CubeSegmentArray[CubeStackIndex];

              for(let i = 0; i < 16; ++i){
                CubeSegmentArray[CubeHeapIndex + 4098 + i] = Min4s[i];
                CubeSegmentArray[CubeHeapIndex + 4114 + i] = Max4s[i];
              }

              //The start of the memory allocation, plus two for the header, plus the specific region
              Children128SegmentArray[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)] = CubeSegmentAndStackIndex;
              NonEmptyChildrenCount++;

              for(let z1 = 0; z1 < 16; ++z1) for(let y1 = 0; y1 < 16; ++y1) for(let x1 = 0; x1 < 16; ++x1){
                let HeightDifference = InterpolatedHeights[(z1 + 1) * 18 + (x1 + 1)] - (y128 << 7 | y16 << 4 | y1);
                let Type;
                if(HeightDifference < 0) Type = 0;
                else if(HeightDifference < 1) Type = 2;
                else if(HeightDifference < 2) Type = 1;
                else Type = 3;
                CubeSegmentArray[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | x1)] = Type; //This gets the type
              }
            }
          }
        } //End z16

        //Test structure spawn
        if(false){
          const FreeCubeIndicesHeapIndex = FreeCubeIndicesSegmentArray[FreeCubeIndicesStackIndex];
          if(true || x128 === 3 && z128 === 3){
            for(let z16 = 0; z16 < 8; ++z16) for(let y16 = 0; y16 < 8; ++y16) for(let x16 = 0; x16 < 8; ++x16){
              let CubeSegmentAndStackIndex = 0;
              let CubeSegmentArray;
              let CubeHeapIndex;
              for(let z1 = 0; z1 < 16; ++z1) for(let y1 = 0; y1 < 16; ++y1) for(let x1 = 0; x1 < 16; ++x1){
                const Distance = Math.abs((z16 << 4 | z1) - 64) + Math.abs((y16 << 4 | y1) - 64) + Math.abs((x16 << 4 | x1) - 64);
                if(Distance < ((x16 << 4 | x1) ^ (y16 << 4 | y1) ^ (z16 << 4 | z1))){
                  if(CubeSegmentAndStackIndex === 0){
                    CubeSegmentAndStackIndex = Children128SegmentArray[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)];
                    if(CubeSegmentAndStackIndex === 0){
                      CubeSegmentAndStackIndex = FreeCubeIndicesSegmentArray[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex];
                      if(CubeSegmentAndStackIndex === 0){
                        CubeSegmentAndStackIndex = this.AllocateMemory(4130, true);
                        FreeCubeIndicesSegmentArray[FreeCubeIndicesHeapIndex + 2 + FreeCubeIndex] = CubeSegmentAndStackIndex;
                      }
                      Children128SegmentArray[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)] = CubeSegmentAndStackIndex;
                      NonEmptyChildrenCount++;
                      FreeCubeIndex++;


                      const CubeSegmentIndex = CubeSegmentAndStackIndex >> 16;
                      const CubeStackIndex = CubeSegmentAndStackIndex & 65535;
                      CubeSegmentArray = this.MemorySegments_u32[CubeSegmentIndex];
                      CubeHeapIndex = CubeSegmentArray[CubeStackIndex];
                      for(let i = 0; i < 4096; ++i) CubeSegmentArray[CubeHeapIndex + 2 + i] = 0;
                    }
                    const CubeSegmentIndex = CubeSegmentAndStackIndex >> 16;
                    const CubeStackIndex = CubeSegmentAndStackIndex & 65535;
                    CubeSegmentArray = this.MemorySegments_u32[CubeSegmentIndex];
                    CubeHeapIndex = CubeSegmentArray[CubeStackIndex];
                    for(let i = 0; i < 16; ++i){
                      CubeSegmentArray[CubeHeapIndex + 4098 + i] = 0;
                      CubeSegmentArray[CubeHeapIndex + 4114 + i] = 15;
                    }

                  }
                  CubeSegmentArray[CubeHeapIndex + 2 + (z1 << 8 | y1 << 4 | x1)] = 3;

                }
              }
            }
          }
        }

        const Allocation128SegmentAndStackIndex = this.AllocateMemory(531 + NonEmptyChildrenCount, false);
        const Allocation128SegmentIndex = Allocation128SegmentAndStackIndex >> 16;
        const Allocation128StackIndex = Allocation128SegmentAndStackIndex & 65535;
        const Allocation128SegmentArray = this.MemorySegments_u32[Allocation128SegmentIndex];
        const Allocation128HeapIndex = Allocation128SegmentArray[Allocation128StackIndex];
        for(let i = 2; i < 530; ++i) Allocation128SegmentArray[Allocation128HeapIndex + i] = 0;

        Allocation128SegmentArray[Allocation128HeapIndex + 530] = NonEmptyChildrenCount;
        for(let i = 0, Counter = Allocation128HeapIndex + 531; i < 512; ++i){
          if(Children128SegmentArray[Children128HeapIndex + 2 + i] !== 0){
            Allocation128SegmentArray[Counter++] = i; //Store the local coordinate (8x8x8) of every 16-cube that's not empty
          }
        }

        for(let z16 = 0; z16 < 8; ++z16) for(let y16 = 0; y16 < 8; ++y16) for(let x16 = 0; x16 < 8; ++x16){
          const CubeSegmentAndStackIndex = Children128SegmentArray[Children128HeapIndex + 2 + (z16 << 6 | y16 << 3 | x16)];
          if(CubeSegmentAndStackIndex === 0) continue; //Is either hidden below ground or empty

          const AllocationTemplateHeapIndex = AllocationTemplateSegmentArray[AllocationTemplateStackIndex];
          for(let i = 1; i < 8; ++i) AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + i] = 0;

          const CubeSegmentIndex = CubeSegmentAndStackIndex >> 16;
          const CubeStackIndex = CubeSegmentAndStackIndex & 65535;
          const CubeSegmentArray = this.MemorySegments_u32[CubeSegmentIndex];
          const CubeHeapIndex = CubeSegmentArray[CubeStackIndex];
          const CubeHeapArrayView = new Uint32Array(this.MemoryBuffer, (((CubeSegmentIndex << 16 | CubeHeapIndex) + 2) * 4) >>> 0, (CubeSegmentArray[CubeHeapIndex] >> 16) - 2);

          let MinX16 = 15;
          let MinY16 = 15;
          let MinZ16 = 15;
          let MaxX16 = 0;
          let MaxY16 = 0;
          let MaxZ16 = 0;

          Outer: for(let x = 0; x <= 15; ++x) for(let z = 0; z <= 15; ++z) for(let y = 0; y <= 15; ++y) if(CubeHeapArrayView[z << 8 | y << 4 | x] !== 0){
            MinX16 = x;
            break Outer;
          }
          Outer: for(let y = 0; y <= 15; ++y) for(let z = 0; z <= 15; ++z) for(let x = MinX16; x <= 15; ++x) if(CubeHeapArrayView[z << 8 | y << 4 | x] !== 0){
            MinY16 = y;
            break Outer;
          }
          Outer: for(let z = 0; z <= 15; ++z) for(let y = MinY16; y <= 15; ++y) for(let x = MinX16; x <= 15; ++x) if(CubeHeapArrayView[z << 8 | y << 4 | x] !== 0){
            MinZ16 = z;
            break Outer;
          }

          Outer: for(let x = 15; x >= MinX16; --x) for(let z = MinZ16; z <= 15; ++z) for(let y = MinY16; y <= 15; ++y) if(CubeHeapArrayView[z << 8 | y << 4 | x] !== 0){
            MaxX16 = x;
            break Outer;
          }
          Outer: for(let y = 15; y >= MinY16; --y) for(let z = MinZ16; z <= 15; ++z) for(let x = MinX16; x <= MaxX16; ++x) if(CubeHeapArrayView[z << 8 | y << 4 | x] !== 0){
            MaxY16 = y;
            break Outer;
          }
          Outer: for(let z = 15; z >= MinZ16; --z) for(let y = MinY16; y <= MaxY16; ++y) for(let x = MinX16; x <= MaxX16; ++x) if(CubeHeapArrayView[z << 8 | y << 4 | x] !== 0){
            MaxZ16 = z;
            break Outer;
          }

          let MinYTerrain = 2147483647;
          for(let i = 0; i < 16; ++i){
            MinYTerrain = Math.min(CubeSegmentArray[CubeHeapIndex + 4098 + i], MinYTerrain);
          }
          MinY16 = Math.min(Math.max(MinY16, MinYTerrain - (y128 << 7 | y16 << 4)), 15);

          let L0Allocations = 0;
          let L1Allocations = 0;
          let L2Allocations = 0;
          let TotalAllocations = 0;
          let L0Bitmap16 = 0;
          let L1Bitmap16 = 0;
          let L2Bitmap16 = 0;
          let L3Bitmap16 = 0;

          for(let y4 = MinY16 >> 1; y4 <= (MaxY16 >> 1); ++y4) for(let z4 = MinZ16 >> 2; z4 <= (MaxZ16 >> 2); ++z4) for(let x4 = MinX16 >> 2; x4 <= (MaxX16 >> 2); ++x4){
            /*let Bitmap4 = 0;
            for(let y1 = 0; y1 < 2; ++y1) for(let z1 = 0; z1 < 4; ++z1) for(let x1 = 0; x1 < 4; ++x1){
              if(CubeHeapArrayView[z4 << 10 | z1 << 8 | y4 << 5 | y1 << 4 | x4 << 2 | x1] !== 0) Bitmap4 |= 1 << (y1 << 4 | z1 << 2 | x1);
            }*/
            const Offset = z4 << 10 | y4 << 5 | x4 << 2;
            const Bitmap4 = (CubeHeapArrayView[Offset | 0x000] && 1)
              | (CubeHeapArrayView[Offset | 0x001] && 2)
              | (CubeHeapArrayView[Offset | 0x002] && 4)
              | (CubeHeapArrayView[Offset | 0x003] && 8)
              | (CubeHeapArrayView[Offset | 0x100] && 16)
              | (CubeHeapArrayView[Offset | 0x101] && 32)
              | (CubeHeapArrayView[Offset | 0x102] && 64)
              | (CubeHeapArrayView[Offset | 0x103] && 128)
              | (CubeHeapArrayView[Offset | 0x200] && 256)
              | (CubeHeapArrayView[Offset | 0x201] && 512)
              | (CubeHeapArrayView[Offset | 0x202] && 1024)
              | (CubeHeapArrayView[Offset | 0x203] && 2048)
              | (CubeHeapArrayView[Offset | 0x300] && 4096)
              | (CubeHeapArrayView[Offset | 0x301] && 8192)
              | (CubeHeapArrayView[Offset | 0x302] && 16384)
              | (CubeHeapArrayView[Offset | 0x303] && 32768)
              | (CubeHeapArrayView[Offset | 0x010] && 65536)
              | (CubeHeapArrayView[Offset | 0x011] && 131072)
              | (CubeHeapArrayView[Offset | 0x012] && 262144)
              | (CubeHeapArrayView[Offset | 0x013] && 524288)
              | (CubeHeapArrayView[Offset | 0x110] && 1048576)
              | (CubeHeapArrayView[Offset | 0x111] && 2097152)
              | (CubeHeapArrayView[Offset | 0x112] && 4194304)
              | (CubeHeapArrayView[Offset | 0x113] && 8388608)
              | (CubeHeapArrayView[Offset | 0x210] && 16777216)
              | (CubeHeapArrayView[Offset | 0x211] && 33554432)
              | (CubeHeapArrayView[Offset | 0x212] && 67108864)
              | (CubeHeapArrayView[Offset | 0x213] && 134217728)
              | (CubeHeapArrayView[Offset | 0x310] && 268435456)
              | (CubeHeapArrayView[Offset | 0x311] && 536870912)
              | (CubeHeapArrayView[Offset | 0x312] && 1073741824)
              | (CubeHeapArrayView[Offset | 0x313] && 2147483648);

            if(Bitmap4 !== 0){
              AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8 + TotalAllocations] = Bitmap4;
              TotalAllocations++;
              if(y4 < 2)      L0Bitmap16 |= 1 << (y4 << 4 | z4 << 2 | x4), L0Allocations++;
              else if(y4 < 4) L1Bitmap16 |= 1 << ((y4 & 1) << 4 | z4 << 2 | x4), L1Allocations++;
              else if(y4 < 6) L2Bitmap16 |= 1 << ((y4 & 1) << 4 | z4 << 2 | x4), L2Allocations++;
              else            L3Bitmap16 |= 1 << ((y4 & 1) << 4 | z4 << 2 | x4);
            }
          }

          if(MinX16 > MaxX16 || MinY16 > MaxY16 || MinZ16 > MaxZ16){
            MaxX16 = 0;
            MaxY16 = 0;
            MaxZ16 = 0;
            MinX16 = 0;
            MinY16 = 0;
            MinZ16 = 0;
          }

          AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 1] = TotalAllocations + 8; //Start of RLE
          AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 2] = MaxZ16 << 20 | MaxY16 << 16 | MaxX16 << 12 | MinZ16 << 8 | MinY16 << 4 | MinX16;
          AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 3] = L0Allocations << 23 | (L0Allocations + L1Allocations) << 16 | (L0Allocations + L1Allocations + L2Allocations) << 9 | z16 << 6 | y16 << 3 | x16;
          AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 4] = L0Bitmap16;
          AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 5] = L1Bitmap16;
          AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 6] = L2Bitmap16;
          AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 7] = L3Bitmap16;


          const Cube000HeapArrayView = CubeHeapArrayView;


          const TempRLEHeapIndex = TempRLESegmentArray[TempRLEStackIndex];
          const TempRLEHeapArrayView = new Uint32Array(this.MemoryBuffer, (((TempRLESegmentIndex << 16 | TempRLEHeapIndex) + 2) * 4) >>> 0, (TempRLESegmentArray[TempRLEHeapIndex] >> 16) - 2);

          const TypesSetHeapIndex = TypesSetSegmentArray[TypesSetStackIndex];
          SetClear(TypesSetSegmentArray, TypesSetHeapIndex);

          for(let i = 0; i < 256; ++i) TempRLEHeapArrayView[8192 + i] = 0; //TODO: Maybe I don't need this?

          // RLE_0: 4509003, 917 fps, 2171 ms
          // RLE_1: 4505755, 912 fps, 2440 ms
          // RLE_2: 4325327, 929 fps, 2385 ms
          // RLE_3: 4105167, 936 fps, 2581 ms (didn't work correctly)
          // RLE_4: 6676175, 956 fps, 2393 ms
          // RLE_5: 4276946, 932 fps, 2305 ms
          // RLE_6: 4276946, 932 fps, 2069 ms
          // RLE_7: 4413594, 917 fps, 2492 ms (three types)
          for(let y1 = MinY16; y1 <= MaxY16; ++y1){
            let CurrentType = Cube000HeapArrayView[y1 << 4]; //Get voxel at 0, y1, 0
            let RunEnd = 0;
            let LayerItems = 0;
            for(let z1 = 0; z1 < 16; ++z1) for(let x1 = 0; x1 < 16; ++x1){
              const Type = Cube000HeapArrayView[z1 << 8 | y1 << 4 | x1];
              if(Type !== 0 && (
                x1 === 0 || x1 === 15 || y1 === 0 || y1 === 15 || z1 === 0 || z1 === 15 ||
                Cube000HeapArrayView[z1 << 8 | y1 << 4 | (x1 - 1)] === 0 ||
                Cube000HeapArrayView[z1 << 8 | y1 << 4 | (x1 + 1)] === 0 ||
                Cube000HeapArrayView[z1 << 8 | (y1 - 1) << 4 | x1] === 0 ||
                Cube000HeapArrayView[z1 << 8 | (y1 + 1) << 4 | x1] === 0 ||
                Cube000HeapArrayView[(z1 - 1) << 8 | y1 << 4 | x1] === 0 ||
                Cube000HeapArrayView[(z1 + 1) << 8 | y1 << 4 | x1] === 0
              )){
                if(CurrentType === 0) CurrentType = Type;
                if((LayerItems === 0 || CurrentType !== Type)) SetAdd(TypesSetSegmentArray, TypesSetHeapIndex, Type);
                if(CurrentType !== Type){
                  TempRLEHeapArrayView[y1 << 9 | LayerItems << 1 | 0] = CurrentType;
                  TempRLEHeapArrayView[y1 << 9 | LayerItems << 1 | 1] = RunEnd - 1; //-1 is so that it's in the range [0, 255] instead of [1, 256]
                  LayerItems++;
                  CurrentType = Type;
                }
              }
              RunEnd++;
            }
            if(CurrentType !== 0){
              TempRLEHeapArrayView[y1 << 9 | LayerItems << 1 | 0] = CurrentType;
              TempRLEHeapArrayView[y1 << 9 | LayerItems << 1 | 1] = RunEnd - 1; //-1 is so that it's in the range [0, 255] instead of [1, 256]
              LayerItems++;
            }
            TempRLEHeapArrayView[8192 | y1] = LayerItems; //Will be 0 if this column was just air
          }

          if(SetSize(TypesSetSegmentArray, TypesSetHeapIndex) === 0) continue; //TODO: Maybe this is bad?


          const TypeCount = SetSize(TypesSetSegmentArray, TypesSetHeapIndex);
          const RLEOffset = AllocationTemplateHeapIndex + TotalAllocations + 8;

          let CurrentIndex = 0;
          AllocationTemplateSegmentArray[RLEOffset + CurrentIndex++] = TypeCount;

          if(TypeCount === 1){
            AllocationTemplateSegmentArray[RLEOffset + CurrentIndex++] = TypesSetSegmentArray[TypesSetHeapIndex + 16386];
          } else if(TypeCount >= 2){
            //Before this will be the offsets
            CurrentIndex += 6;
            const TypesMapIntOffset = CurrentIndex;
            //This writes all the different types
            for(let i = 0; i < TypeCount; ++i){
              AllocationTemplateSegmentArray[RLEOffset + CurrentIndex++] = TypesSetSegmentArray[TypesSetHeapIndex + 16386 + i];
            }

            let LocalOffset = 0;
            AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;

            if(TypeCount === 2){
              for(let y1 = 0; y1 < 16; ++y1){
                const Length = TempRLEHeapArrayView[8192 + y1];
                AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
                if(Length === 0) continue; //Has no RLE data or is completely empty

                for(let i = 0; i < Length; ++i, ++LocalOffset){
                  AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] |= SetGet(TypesSetSegmentArray, TypesSetHeapIndex, TempRLEHeapArrayView[y1 << 9 | i << 1]) << (LocalOffset & 31);
                  if((LocalOffset & 31) === 31){
                    CurrentIndex++;
                    AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;
                  }
                }
              }
              if((LocalOffset & 31) === 0) CurrentIndex--;
            } else if(TypeCount <= 4){
              for(let y1 = 0; y1 < 16; ++y1){
                const Length = TempRLEHeapArrayView[8192 + y1];
                AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
                if(Length === 0) continue; //Has no RLE data or is completely empty

                for(let i = 0; i < Length; ++i, ++LocalOffset){
                  AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] |= SetGet(TypesSetSegmentArray, TypesSetHeapIndex, TempRLEHeapArrayView[y1 << 9 | i << 1]) << ((LocalOffset & 15) << 1);
                  if((LocalOffset & 15) === 15){
                    CurrentIndex++;
                    AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;
                  }
                }
              }
              if((LocalOffset & 15) === 0) CurrentIndex--;
            } else if(TypeCount <= 16){
              for(let y1 = 0; y1 < 16; ++y1){
                const Length = TempRLEHeapArrayView[8192 + y1];
                AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
                if(Length === 0) continue; //Has no RLE data or is completely empty

                for(let i = 0; i < Length; ++i, ++LocalOffset){
                  AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] |= SetGet(TypesSetSegmentArray, TypesSetHeapIndex, TempRLEHeapArrayView[y1 << 9 | i << 1]) << ((LocalOffset & 7) << 2);
                  if((LocalOffset & 7) === 7){
                    CurrentIndex++;
                    AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;
                  }
                }
              }
              if((LocalOffset & 7) === 0) CurrentIndex--;
            } else if(TypeCount <= 256){
              for(let y1 = 0; y1 < 16; ++y1){
                const Length = TempRLEHeapArrayView[8192 + y1];
                AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
                if(Length === 0) continue; //Has no RLE data or is completely empty

                for(let i = 0; i < Length; ++i, ++LocalOffset){
                  AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] |= SetGet(TypesSetSegmentArray, TypesSetHeapIndex, TempRLEHeapArrayView[y1 << 9 | i << 1]) << ((LocalOffset & 3) << 3);
                  if((LocalOffset & 3) === 3){
                    CurrentIndex++;
                    AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;
                  }
                }
              }
              if((LocalOffset & 3) === 0) CurrentIndex--;
            } else{
              for(let y1 = 0; y1 < 16; ++y1){
                const Length = TempRLEHeapArrayView[8192 + y1];
                AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8176 + y1] = LocalOffset;
                if(Length === 0) continue; //Has no RLE data or is completely empty

                for(let i = 0; i < Length; ++i, ++LocalOffset){
                  AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] |= SetGet(TypesSetSegmentArray, TypesSetHeapIndex, TempRLEHeapArrayView[y1 << 9 | i << 1]) << ((LocalOffset & 1) << 4);
                  if((LocalOffset & 1) === 1){
                    CurrentIndex++;
                    AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;
                  }
                }
              }
              if((LocalOffset & 1) === 0) CurrentIndex--;
            }


            CurrentIndex++;
            AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;

            const LengthIntOffset = CurrentIndex;

            LocalOffset = 0;
            for(let y1 = 0; y1 < 16; ++y1){
              const Length = TempRLEHeapArrayView[8192 + y1];
              if(
                Length === 0 || //Has no rle data
                (TempRLEHeapArrayView[y1 << 9] === 0 && TempRLEHeapArrayView[y1 << 9 | 1] === 255) //Is fully empty
              ) continue;
              for(let i = 0; i < Length; ++i, ++LocalOffset){
                AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] |= TempRLEHeapArrayView[y1 << 9 | i << 1 | 1] << ((LocalOffset & 3) << 3);
                if((LocalOffset & 3) === 3){
                  CurrentIndex++;
                  AllocationTemplateSegmentArray[RLEOffset + CurrentIndex] = 0;
                }
              }
            }
            if((LocalOffset & 3) === 0) CurrentIndex--;
            CurrentIndex++;

            AllocationTemplateSegmentArray[RLEOffset + 1] = LengthIntOffset << 16 | TypesMapIntOffset;
            for(let i = 0; i < 5; ++i){
              const Reference = AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8177 + i * 3];
              const Difference2 = AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8178 + i * 3] - Reference;
              const Difference3 = AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + 8179 + i * 3] - Reference;
              AllocationTemplateSegmentArray[RLEOffset + 2 + i] = Difference3 << 21 | Difference2 << 12 | Reference;
            }
          }




          //Copy memory to permanent allocation
          const AllocationSize = TotalAllocations + CurrentIndex + 8;

          const PermanentAllocationSegmentAndStackIndex = this.AllocateMemory(AllocationSize, false);
          const PermanentAllocationSegmentIndex = PermanentAllocationSegmentAndStackIndex >> 16;
          const PermanentAllocationStackIndex = PermanentAllocationSegmentAndStackIndex & 65535;
          const PermanentAllocationSegmentArray = this.MemorySegments_u32[PermanentAllocationSegmentIndex];
          const PermanentAllocationHeapIndex = PermanentAllocationSegmentArray[PermanentAllocationStackIndex];


          for(let i = 1; i < AllocationSize; ++i){
            PermanentAllocationSegmentArray[PermanentAllocationHeapIndex + i] = AllocationTemplateSegmentArray[AllocationTemplateHeapIndex + i];
          }


          this.RequestGPUUpload(PermanentAllocationSegmentIndex, PermanentAllocationStackIndex);
          Atomics.sub(PermanentAllocationSegmentArray, I.I_USAGE_COUNTER, 1);

          Allocation128SegmentArray[Allocation128HeapIndex + 2 + (z16 << 1 | y16 >> 2)] |= 1 << ((y16 << 3) & 3) | x16;
          Allocation128SegmentArray[Allocation128HeapIndex + 2 + 16 + (z16 << 6 | y16 << 3 | x16)] = PermanentAllocationSegmentIndex << 16 | PermanentAllocationStackIndex;
        }

        this.RequestGPUUpload(Allocation128SegmentIndex, Allocation128StackIndex);
        Atomics.sub(Allocation128SegmentArray, I.I_USAGE_COUNTER, 1);

        this.Data[this.Data[I.I_WORLD_GRID_INDEX] + (0 << 15 | z128 << 10 | y128 << 5 | x128)] = Allocation128SegmentIndex << 16 | Allocation128StackIndex;
        this.Data[I.I_UPDATED_LOD_LEVELS_MASK] |= 1 << 0;

        //Deallocate all temporary uncompressed 16 cubes
        /*for(let i = 0; i < 512; ++i){
          const CubeSegmentAndStackIndex = Children128SegmentArray[Children128HeapIndex + 2 + i];
          if(CubeSegmentAndStackIndex === 0) continue; //Did not allocate anything for this cube

          const CubeSegmentIndex = CubeSegmentAndStackIndex >> 16;
          const CubeStackIndex = CubeSegmentAndStackIndex & 65535;
          const CubeSegmentArray = this.MemorySegments_u32[CubeSegmentIndex];

          this.DeallocateMemory(CubeSegmentIndex, CubeStackIndex);
          Atomics.sub(CubeSegmentArray, I.I_USAGE_COUNTER, 1);
        }*/
        FreeCubeIndex = 0;


        this.DeallocateMemory(AllocationTemplateSegmentIndex, AllocationTemplateStackIndex);
        Atomics.sub(AllocationTemplateSegmentArray, I.I_USAGE_COUNTER, 1);

        this.DeallocateMemory(Children128SegmentIndex, Children128StackIndex);
        Atomics.sub(Children128SegmentArray, I.I_USAGE_COUNTER, 1);
      }
      /*for(let i = 25; i < 1024; ++i){
        //if(i === 562) debugger;
        this.DefragmentSegment(i);
      }*/
    } //End z128/x128

    this.DataTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.DataTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R32UI, 2048, 2048, this.MemorySize >> 22 >> 2); //Shifted by extra 2 because this size is in 4 byte integers
    //gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, 2048, 2048, this.MemorySize >> 22 >> 2, gl.RED_INTEGER, gl.UNSIGNED_INT, this.Data);

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    this.RenderListArray = new Uint32Array(131072).fill(0xffffffff);

    this.RenderInstances = 0;
    this.RenderListLength = 65535;

    this.RenderListTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.RenderListTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32UI, 256, 256);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 256, gl.RG_INTEGER, gl.UNSIGNED_INT, this.RenderListArray);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    gl.useProgram(this.VoxelShaderProgram);

    gl.bindAttribLocation(this.VoxelShaderProgram, 0, "vEmpty");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.vertexAttribPointer(0, 1, gl.UNSIGNED_INT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    gl.uniform1i(this.VoxelUniforms.iData, 0);
    gl.uniform1i(this.VoxelUniforms.iRenderList, 1);




    gl.useProgram(this.ProcessShaderProgram);
    gl.uniform1i(this.ProcessUniforms.iVoxelPassTexture, 8);

    gl.uniform1i(this.ProcessUniforms.iData, 0);


    gl.bindAttribLocation(this.VoxelShaderProgram, 0, "vEmpty");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.vertexAttribPointer(0, 1, gl.UNSIGNED_INT, false, 0, 0);
    gl.enableVertexAttribArray(0);


    this.SetupControls();

    window.addEventListener("resize", this.Resize().bind(this));

    void function Load(){
      window.requestAnimationFrame(Load.bind(this));
      this.Render();
    }.bind(this)();
  }

  AllocateMemory(Size, Temporary){
    //if(Size & 1) Size++; //Make size even. The size passed into the function should include space for the header (1x uint32, 4 bytes)
    const Max = this.MemorySize >> 18;

    let SegmentIndex = Atomics.load(this.Data, I.I_ALLOCATION_SEGMENTS_LIST_INDEX);
    if(Temporary){
      SegmentIndex = ((SegmentIndex + 512) % this.Data[I.I_ALLOCATION_SEGMENTS_COUNT]) + Max - this.Data[I.I_ALLOCATION_SEGMENTS_COUNT];
    }
    let i = 0;
    for(; i < Max; ++i, SegmentIndex++, /* wrap around and skip to first segment location -> */ SegmentIndex >= Max && (SegmentIndex = Max - this.Data[I.I_ALLOCATION_SEGMENTS_COUNT])){
      const SegmentArray_i32 = this.MemorySegments_i32[SegmentIndex];
      const SegmentArray_u32 = this.MemorySegments_u32[SegmentIndex];
      if(i === 900) debugger;
      //Check if there's enough space
      if(Math.min(Atomics.load(SegmentArray_u32, I.I_STACK), Atomics.load(SegmentArray_u32, I.I_LIST_END)) - Atomics.load(SegmentArray_u32, I.I_HEAP) > Size + 1){ // The +1 is for the stack item
        //Obtain mutex lock, https://v8.dev/features/atomics
        while(Atomics.compareExchange(SegmentArray_i32, I.I_ALLOCATION_LOCK, I.UNLOCKED, I.LOCKED) !== I.UNLOCKED){
          Atomics.wait(SegmentArray_i32, I.I_ALLOCATION_LOCK, I.LOCKED);
        }

        //Increment usage counter
        Atomics.add(SegmentArray_u32, I.I_USAGE_COUNTER, 1);

        if(
          Atomics.load(SegmentArray_u32, I.I_MANAGEMENT_LOCK) === I.LOCKED || //Check management lock
          Math.min(Atomics.load(SegmentArray_u32, I.I_STACK), Atomics.load(SegmentArray_u32, I.I_LIST_END)) - Atomics.load(SegmentArray_u32, I.I_HEAP) <= Size + 1 //Check again, might have changed
        ){
          // Unable to allocate now, so I have to remove the lock and try another segment
          Atomics.sub(SegmentArray_u32, I.I_USAGE_COUNTER, 1);
          Atomics.compareExchange(SegmentArray_i32, I.I_ALLOCATION_LOCK, I.LOCKED, I.UNLOCKED);
          Atomics.notify(SegmentArray_i32, I.I_ALLOCATION_LOCK, 1);
          continue;
        }
        break; //Found segment
      } else{
        //Only increment if it's not skipped before (so that good segments aren't skipped only because they were locked)
        if(SegmentIndex === Atomics.load(this.Data, I.I_ALLOCATION_SEGMENTS_LIST_INDEX) && !Temporary){
          //Increment and wrap around if at the end of the list
          Atomics.store(this.Data, I.I_ALLOCATION_SEGMENTS_LIST_INDEX, SegmentIndex + 1 >= Max ? Max - this.Data[I.I_ALLOCATION_SEGMENTS_COUNT] : SegmentIndex + 1);
        }
      }
    }


    if(i === Max) throw "Out of memory";


    // I may need to switch the following section to use atomic instructions if I run into issues
    const SegmentArray_i32 = this.MemorySegments_i32[SegmentIndex];
    const SegmentArray_u32 = this.MemorySegments_u32[SegmentIndex];

    let AllocationHeapIndex = -1;
    let AllocationStackIndex = -1;
    if(SegmentArray_u32[I.I_LIST_END] < SegmentArray_u32[I.I_LIST_START]){
      SegmentArray_u32[I.I_LIST_END]++;
      AllocationStackIndex = SegmentArray_u32[SegmentArray_u32[I.I_LIST_END]];
      SegmentArray_u32[SegmentArray_u32[I.I_LIST_END]] = 0;
    } else{
      AllocationStackIndex = SegmentArray_u32[I.I_STACK];
      SegmentArray_u32[I.I_STACK]--;
    }
    AllocationHeapIndex = SegmentArray_u32[I.I_HEAP];
    SegmentArray_u32[AllocationStackIndex] = AllocationHeapIndex;
    SegmentArray_u32[I.I_HEAP] += Size;


    SegmentArray_u32[AllocationHeapIndex] = Size << 16 | (~AllocationStackIndex & 65535);

    //Increment usage counter
    Atomics.add(SegmentArray_u32, I.I_USAGE_COUNTER, 1);

    //Free allocation lock
    Atomics.sub(SegmentArray_u32, I.I_USAGE_COUNTER, 1);
    Atomics.compareExchange(SegmentArray_i32, I.I_ALLOCATION_LOCK, I.LOCKED, I.UNLOCKED);
    Atomics.notify(SegmentArray_i32, I.I_ALLOCATION_LOCK, 1);

    return SegmentIndex << 16 | AllocationStackIndex;
  };

  DefragmentSegment(SegmentID){
    if(SegmentID < (this.Data[I.I_MEMORY_SIZE] >> 18) - this.Data[I.I_ALLOCATION_SEGMENTS_COUNT] || SegmentID > (this.Data[I.I_MEMORY_SIZE] >> 18)){
      return;
    }
    const SegmentArray_i32 = this.MemorySegments_i32[SegmentID];
    const SegmentArray_u32 = this.MemorySegments_u32[SegmentID];

    if(Atomics.compareExchange(SegmentArray_i32, I.I_MANAGEMENT_LOCK, I.UNLOCKED, I.LOCKED) !== I.UNLOCKED){
      //Couldn't obtain management lock
      return;
    }

    if(
      Atomics.load(SegmentArray_u32, I.I_ALLOCATION_LOCK) !== I.UNLOCKED || //Some thread is allocating to this segment
      Atomics.load(SegmentArray_u32, I.I_USAGE_COUNTER) > 0 || //Some thread is writing to this segment
      Atomics.load(SegmentArray_u32, I.I_NEEDS_GPU_UPLOAD) !== 0 //Segment is waiting for gpu upload
    ){
      Atomics.store(SegmentArray_i32, I.I_MANAGEMENT_LOCK, I.UNLOCKED); //Free management lock
      return; // Try again later
    }

    const Utilisation = (Math.min(65536 - Atomics.load(SegmentArray_u32, I.I_STACK), Atomics.load(SegmentArray_u32, I.I_LIST_END)) + Atomics.load(SegmentArray_u32, I.I_HEAP)) / 65536;
    const Collectable = Atomics.load(SegmentArray_u32, I.I_DEALLOCATION_COUNT) / 65536;

    if(!(Collectable !== 0 && (Utilisation > 0.87 || (Utilisation > 0.75 && Collectable > 0.1) || (Utilisation > 0.5 && Collectable > 0.2) || Collectable > 0.3))){
      //Not "worth" defragmenting now, lift lock and return
      Atomics.store(SegmentArray_i32, I.I_MANAGEMENT_LOCK, 0);
      Atomics.notify(SegmentArray_i32, I.I_MANAGEMENT_LOCK);
      return;
    }

    //Defragment. May need to change this to use atomic operations due to possible cache issues?
    let CurrentOldIndex = 0;
    let CurrentNewIndex = 0;
    let CurrentListIndex = Math.min(SegmentArray_u32[I.I_LIST_START], SegmentArray_u32[I.I_LIST_END]);

    const OldHeapIndex = SegmentArray_u32[I.I_HEAP];
    while(CurrentOldIndex < OldHeapIndex){
      const AllocationLength = SegmentArray_u32[CurrentOldIndex] >> 16 & 65535;
      const AllocationStackIndex = ~(SegmentArray_u32[CurrentOldIndex] & 65535) & 65535;

      if((SegmentArray_u32[AllocationStackIndex] & 1) === 0){ //This means that the allocation wasn't freed
        //Only copy if the indices have diverged
        if(CurrentNewIndex !== CurrentOldIndex){
          //Set new heap index
          SegmentArray_u32[AllocationStackIndex] = CurrentNewIndex;
          //Copy it to the new location
          for(let i = 0; i < AllocationLength; ++i){
            SegmentArray_u32[CurrentNewIndex++] = SegmentArray_u32[CurrentOldIndex++];
          }
        } else CurrentOldIndex += AllocationLength;
      } else{
        CurrentOldIndex += AllocationLength;
        SegmentArray_u32[CurrentListIndex--] = AllocationStackIndex; //Add deallocated stack index to free list
      }
    }
    SegmentArray_u32[I.I_LIST_END] = CurrentListIndex;
    SegmentArray_u32[I.I_HEAP] = CurrentNewIndex;
    SegmentArray_u32[I.I_DEALLOCATION_COUNT] = 0;

    //Lift management lock
    Atomics.store(SegmentArray_i32, I.I_MANAGEMENT_LOCK, 0);
    Atomics.notify(SegmentArray_i32, I.I_MANAGEMENT_LOCK);
  }

  DeallocateMemory(SegmentIndex, StackIndex){
    //I (hopefully) don't need to care about locks for this
    const SegmentArray_u32 = this.MemorySegments_u32[SegmentIndex];

    const Freeable = Atomics.load(SegmentArray_u32, StackIndex) & 65535; //Gets allocation size
    Atomics.add(SegmentArray_u32, I.I_DEALLOCATION_COUNT, Freeable); //Add allocation size to the amount of freeable memory
    Atomics.or(SegmentArray_u32, StackIndex, 1); // Mark as unloaded
  }

  RequestGPUUpload(SegmentIndex, StackIndex){
    const SegmentArray_u32 = this.MemorySegments_u32[SegmentIndex];
    Atomics.add(SegmentArray_u32, I.I_NEEDS_GPU_UPLOAD, Atomics.load(SegmentArray_u32, StackIndex) & 65535);
  }

  GenerateVoxelPassFramebuffer(){
    this.FramebufferTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.FramebufferTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32UI, Canvas.width, Canvas.height, 0, gl.RG_INTEGER, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    this.Framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.Framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.FramebufferTexture, 0);


    this.Renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.Renderbuffer);

    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, Canvas.width, Canvas.height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.Renderbuffer);
  }
  Resize(){
    Canvas.width = window.innerWidth * this.CanvasScale;
    Canvas.height = window.innerHeight * this.CanvasScale;
    gl.viewport(0., 0., Canvas.width, Canvas.height);
    Canvas.style.width = "100vw";
    Canvas.style.height = "100vh";


    if(this.Framebuffer !== null) gl.deleteFramebuffer(this.Framebuffer);
    if(this.FramebufferTexture !== null) gl.deleteTexture(this.FramebufferTexture);
    if(this.Renderbuffer !== null) gl.deleteRenderbuffer(this.Renderbuffer);

    this.GenerateVoxelPassFramebuffer();
    return this.Resize;
  }
  UpdateStatistics(){
    const Text = `${this.Frames} fps`;
    FPS.innerText = Text;
    this.Frames = 0;
    return Text;
  }
  UploadSegment(Segment){
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.DataTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, (Segment << 5) & 2047, Segment >> 6, 2048, 32, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, this.Data, Segment << 16);
  }
  Render(){
    const Now = window.performance.now();
    if(Math.floor(this.LastRender / 1000.) !== Math.floor(Now / 1000.)){
      this.UpdateStatistics();
    }
    this.LastRender = Now;
    this.Frames++;

    gl.useProgram(null);

    const ProjectionMatrix = mat4.create();
    mat4.perspective(ProjectionMatrix, (this.FOV * Math.PI) / 180., Canvas.width / Canvas.height, this.Near, this.Far);

    const ModelViewMatrix = mat4.create();
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, -this.RotationY, [1, 0, 0]);
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, this.RotationX, [0, 1, 0]);
    mat4.translate(ModelViewMatrix, ModelViewMatrix, [-this.PositionX, -this.PositionY, -this.PositionZ]);

    const ModelViewProjectionMatrix = mat4.create();
    mat4.mul(ModelViewProjectionMatrix, ProjectionMatrix, ModelViewMatrix);



    let UploadCounter = 0;
    const UpdatedLODLevels = this.Data[I.I_UPDATED_LOD_LEVELS_MASK];
    let UploadedLODLevels = 0;
    Outer: for(let Level = 0; Level < 16; ++Level){
      if(((UpdatedLODLevels >> Level) & 1) === 0) continue;

      const Offset = this.Data[I.I_WORLD_GRID_INDEX] + (Level << 15);
      for(let z = 0; z < 32; ++z) for(let y = 0; y < 32; ++y) for(let x = 0; x < 32; ++x){
        if(UploadCounter > 1) break Outer;
        if(((this.Data[I.I_FULLY_UPLOADED_BITMAP_START + (Level << 10 | z << 5 | y)] >> x) & 1) === 1) continue; //Something else should handle setting this to unuploaded (e.g. in the event that the world offset moves)
        const Region128_SegmentAndStackIndex = this.Data[Offset | z << 10 | y << 5 | x];
        if(Region128_SegmentAndStackIndex === 0){
          this.Data[I.I_FULLY_UPLOADED_BITMAP_START + (Level << 10 | z << 5 | y)] |= 1 << x;
          continue;
        }
        Atomics.add(this.Data, (Region128_SegmentAndStackIndex & ~65535) | I.I_USAGE_COUNTER, 1);
        if(Atomics.load(this.Data, (Region128_SegmentAndStackIndex & ~65535) | I.I_MANAGEMENT_LOCK)){
          Atomics.sub(this.Data, (Region128_SegmentAndStackIndex & ~65535) | I.I_USAGE_COUNTER, 1);
          continue;
        }
        //This is for uploading the 128³ that holds references to the 16³s
        if(Atomics.load(this.Data, (Region128_SegmentAndStackIndex & ~65535) | I.I_NEEDS_GPU_UPLOAD) !== 0){
          UploadCounter++;
          this.UploadSegment(Region128_SegmentAndStackIndex >> 16);
          UploadedLODLevels |= 1 << Level;
          Atomics.store(this.Data, (Region128_SegmentAndStackIndex & ~65535) | I.I_NEEDS_GPU_UPLOAD, 0);
        }
        const Region128_HeapIndex = (Region128_SegmentAndStackIndex & ~65535) | Atomics.load(this.Data, Region128_SegmentAndStackIndex);
        const Length = this.Data[Region128_HeapIndex + 530];
        for(let i = 0; i < Length; ++i){
          const LocalCoordinate = this.Data[Region128_HeapIndex + 531 + i];
          const ChildSegmentAndStackIndex = this.Data[Region128_HeapIndex + 18 + LocalCoordinate];
          if(Atomics.load(this.Data, (ChildSegmentAndStackIndex & ~65535) | I.I_NEEDS_GPU_UPLOAD) !== 0){
            UploadCounter++;
            this.UploadSegment(ChildSegmentAndStackIndex >> 16);
            UploadedLODLevels |= 1 << Level;
            Atomics.store(this.Data, (ChildSegmentAndStackIndex & ~65535) | I.I_NEEDS_GPU_UPLOAD, 0);
          }
        }
        this.Data[I.I_FULLY_UPLOADED_BITMAP_START + (Level << 10 | z << 5 | y)] |= 1 << x;

        Atomics.sub(this.Data, (Region128_SegmentAndStackIndex & ~65535) | I.I_USAGE_COUNTER, 1);
      }
      this.Data[I.I_UPDATED_LOD_LEVELS_MASK] &= ~(1 << Level);
    }
    for(let Level = 0; Level < 16; ++Level) if(((UploadedLODLevels >> Level) & 1) === 1) this.UploadSegment(1 + Level);
    if(UpdatedLODLevels !== 0) this.UploadSegment(0); //This is to update the fully uploaded bitmap

    const UpdateRegion = this.CullRegions(ModelViewProjectionMatrix);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.RenderListTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, /*round up to next 256 */ ((UpdateRegion + 255) & ~255) >> 8, gl.RG_INTEGER, gl.UNSIGNED_INT, this.RenderListArray);


    gl.bindFramebuffer(gl.FRAMEBUFFER, this.Framebuffer);
    gl.viewport(0, 0, Canvas.width, Canvas.height);


    //Running a shader to clear the buffer is faster for some reason
    //TODO: I could use this to render the voxels that are clipped by the near plane
    //gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
    gl.useProgram(this.ClearBufferShaderProgram);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.clear(gl.DEPTH_BUFFER_BIT);


    gl.useProgram(this.VoxelShaderProgram);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.uniformMatrix4fv(
      this.VoxelUniforms.iProjectionMatrix,
      false,
      ProjectionMatrix
    );
    gl.uniformMatrix4fv(
      this.VoxelUniforms.iModelViewMatrix,
      false,
      ModelViewMatrix
    );
    gl.uniformMatrix4fv(
      this.VoxelUniforms.iModelViewProjectionMatrix,
      false,
      ModelViewProjectionMatrix
    );
    gl.uniform3f(this.VoxelUniforms.iCameraPosition, this.PositionX, this.PositionY, this.PositionZ);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.IndexBuffer);
    gl.drawElementsInstanced(gl.TRIANGLE_STRIP, this.IndexArray.length, gl.UNSIGNED_BYTE, 0, this.RenderInstances);


    //Render to canvas now
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, Canvas.width, Canvas.height);


    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.useProgram(this.ProcessShaderProgram);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  CullRegions(m){
    const FrustumPlanes = new Float64Array([
      m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12],
      m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12],
      m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13],
      m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13],
      m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14],
      m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]
    ]);
    for(let i = 0; i < 6; ++i){
      const InverseLength = 1. / Math.hypot(FrustumPlanes[i << 2], FrustumPlanes[i << 2 | 1], FrustumPlanes[i << 2 | 2]);
      for(let j = 0; j < 4; ++j) FrustumPlanes[i << 2 | j] *= InverseLength;
    }

    this.RenderInstances = 0;

    const PreviousRenderListLength = this.RenderListLength;
    this.RenderListLength = 0;

    const RenderRegions = [];

    const WorldGridStart = this.Data[I.I_WORLD_GRID_INDEX];
    for(let z = 0; z < 32; ++z) for(let y = 0; y < 32; ++y) Iterator: for(let x = 0; x < 32; ++x){
      const Allocation128SegmentAndStackIndex = this.Data[WorldGridStart + (z << 10 | y << 5 | x)];
      if(Allocation128SegmentAndStackIndex === 0) continue;

      const X = (x + .5) * 128.;
      const Y = (y + .5) * 128.;
      const Z = (z + .5) * 128.;

      for(let i = 0; i < 24; i += 4){
        if(X * FrustumPlanes[i] + Y * FrustumPlanes[i | 1] + Z * FrustumPlanes[i | 2] + FrustumPlanes[i | 3] <- ChunkSphereRadius){
          continue Iterator; //Not in frustum
        }
      }

      RenderRegions.push(Math.floor(Math.hypot(X - this.PositionX, Y - this.PositionY, Z - this.PositionZ)) * 524288 + (0 << 15 | z << 10 | y << 5 | x));
      this.RenderListLength++;
    }

    RenderRegions.sort(function(A, B){
      return A - B;
    });

    for(let i = 0; i < this.RenderListLength; ++i){
      const RegionID = RenderRegions[i] & 524287;
      const Allocation128SegmentAndStackIndex = this.Data[WorldGridStart + RegionID];

      //TODO: This could be problematic, especially if this is accessed whilst the segment is being defragmented
      const Allocation128SegmentIndex = Allocation128SegmentAndStackIndex >> 16;
      const Allocation128StackIndex = Allocation128SegmentAndStackIndex & 65535;
      const Allocation128SegmentArray = this.MemorySegments_u32[Allocation128SegmentIndex];
      const Allocation128HeapIndex = Allocation128SegmentArray[Allocation128StackIndex];

      this.RenderListArray[i << 1 | 0] = RegionID; //Allocation128SegmentAndStackIndex;
      this.RenderListArray[i << 1 | 1] = this.RenderInstances;

      const Instances = Allocation128SegmentArray[Allocation128HeapIndex + 530];
      this.RenderInstances += Instances;
    }

    for(let i = this.RenderListLength; i < PreviousRenderListLength; ++i) this.RenderListArray[i << 1 | 1] = 0xffffffff;

    return Math.max(this.RenderListLength, PreviousRenderListLength);
  }

  SetCanvasScale(NewScale){
    this.CanvasScale = NewScale;
    this.Resize();
  }
  GetAttributeLocations(Program, Attributes){
    const AttributesObject = {};
    for(const Attribute of Attributes){
      AttributesObject[Attribute] = gl.getAttribLocation(Program, Attribute);
    }
    return AttributesObject;
  }
  GetUniformLocations(Program, Uniforms){
    const UniformsObject = {};
    for(const Uniform of Uniforms){
      UniformsObject[Uniform] = gl.getUniformLocation(Program, Uniform);
    }
    return UniformsObject;
  }
  InitShaderProgram(vsh, fsh){
    const VertexShader = this.LoadShader(gl.VERTEX_SHADER, vsh);
    const FragmentShader = this.LoadShader(gl.FRAGMENT_SHADER, fsh);

    const ShaderProgram = gl.createProgram();
    gl.attachShader(ShaderProgram, VertexShader);
    gl.attachShader(ShaderProgram, FragmentShader);
    gl.linkProgram(ShaderProgram);

    if(!gl.getProgramParameter(ShaderProgram, gl.LINK_STATUS)){
      console.error(gl.getProgramInfoLog(ShaderProgram));
    }
    return ShaderProgram;
  }
  LoadShader(Type, Source){
    const Shader = gl.createShader(Type);
    gl.shaderSource(Shader, Source);
    gl.compileShader(Shader);
    if(!gl.getShaderParameter(Shader, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(Shader));
    }
    return Shader;
  }
  SetupControls(){
    let IsPointerLocked = false;
    Canvas.addEventListener("click", function(){
      Canvas.requestPointerLock();
      IsPointerLocked = Canvas === document.pointerLockElement;
    });
    document.addEventListener("pointerlockchange", function(){
      IsPointerLocked = Canvas === document.pointerLockElement;
    });
    const PressedKeys = {};
    document.addEventListener("keydown", function(Event){
      PressedKeys[Event.code] = true;
      switch(Event.code){
        case "AltLeft":
        case "Escape":{
          if(IsPointerLocked) document.exitPointerLock();
          return;
        }
      }
    });
    document.addEventListener("keyup", function(Event){
      delete PressedKeys[Event.code];
    });
    document.addEventListener("mousemove", function(Event){
      if(!IsPointerLocked) return;
      this.RotationX += Event.movementX / 1000.;
      this.RotationY += Event.movementY / 1000.;
    }.bind(this));
    let Last = window.performance.now();
    void function Load(){
      window.requestAnimationFrame(Load.bind(this));

      const Now = window.performance.now();
      const Difference = Now - Last;
      Last = Now;

      const MovementX = ~~PressedKeys["KeyW"] - ~~PressedKeys["KeyS"];
      const MovementZ = ~~PressedKeys["KeyA"] - ~~PressedKeys["KeyD"];
      const MovementY = ~~PressedKeys["Space"] - ~~PressedKeys["ShiftLeft"];
      if(MovementX !== 0 || MovementY !== 0 || MovementZ !== 0){
        this.PositionX -= this.MovementSpeed * Difference * (-Math.sin(this.RotationX) * MovementX + Math.cos(this.RotationX) * MovementZ);
        this.PositionY += this.MovementSpeed * Difference * MovementY;
        this.PositionZ -= this.MovementSpeed * Difference * (Math.cos(this.RotationX) * MovementX + Math.sin(this.RotationX) * MovementZ);
      }
    }.bind(this)();
  }
}

window.Main = new Main;
window.gl = gl;