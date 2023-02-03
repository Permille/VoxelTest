import "./GLMath.mjs";
import * as M from "./Constants/Memory.mjs";

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

export default class Renderer{
  static IndexArray = new Uint8Array([0,1,2,3,4,3,5,1,6]);
  constructor(Canvas, Camera, Memory){
    this.Canvas = Canvas;
    this.Camera = Camera;
    this.Memory = Memory;
    this.gl = this.Canvas.getContext("webgl2", {
      "antialias": false,
      "stencil": false,
      "power-preference": "high-performance",
      "desynchronized": false,
      "depth": false
    });
    const gl = this.gl;

    this.FOV = 70.;
    this.Near = 4.;
    this.Far = 24000.;

    this.CanvasScale = 1.;

    this.LastRender = 0.;
    this.Frames = 0;

    this.Renderbuffer = null; //These will be generated when Resize is called
    this.FramebufferTexture = null;
    this.Framebuffer = null;


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

    this.IndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.IndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Renderer.IndexArray, gl.STATIC_DRAW);

    this.EmptyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(1), gl.STATIC_DRAW);

    this.DataTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.DataTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R32UI, 2048, 2048, this.Memory.MemorySize >> 22 >> 2); //Shifted by extra 2 because this size is in 4 byte integers

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


    window.addEventListener("resize", this.Resize().bind(this));
  }
  GenerateVoxelPassFramebuffer(){
    const gl = this.gl;
    this.FramebufferTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.FramebufferTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32UI, this.Canvas.width, this.Canvas.height, 0, gl.RG_INTEGER, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    this.Framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.Framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.FramebufferTexture, 0);


    this.Renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.Renderbuffer);

    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.Canvas.width, this.Canvas.height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.Renderbuffer);
  }
  Resize(){
    const gl = this.gl;
    this.Canvas.width = window.innerWidth * this.CanvasScale;
    this.Canvas.height = window.innerHeight * this.CanvasScale;
    gl.viewport(0., 0., this.Canvas.width, this.Canvas.height);
    this.Canvas.style.width = "100vw";
    this.Canvas.style.height = "100vh";


    if(this.Framebuffer !== null) gl.deleteFramebuffer(this.Framebuffer);
    if(this.FramebufferTexture !== null) gl.deleteTexture(this.FramebufferTexture);
    if(this.Renderbuffer !== null) gl.deleteRenderbuffer(this.Renderbuffer);

    this.GenerateVoxelPassFramebuffer();
    return this.Resize;
  }
  UploadSegment(Segment){
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.DataTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, (Segment << 5) & 2047, Segment >> 6, 2048, 32, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, this.Memory.u32, Segment << 16);
  }
  Render(){
    const gl = this.gl;
    const Now = window.performance.now();
    /*if(Math.floor(this.LastRender / 1000.) !== Math.floor(Now / 1000.)){
      this.UpdateStatistics();
    }*/
    this.LastRender = Now;
    this.Frames++;

    gl.useProgram(null);

    const ProjectionMatrix = mat4.create();
    mat4.perspective(ProjectionMatrix, (this.FOV * Math.PI) / 180., this.Canvas.width / this.Canvas.height, this.Near, this.Far);

    const ModelViewMatrix = mat4.create();
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, -this.Camera.RotationY, [1, 0, 0]);
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, this.Camera.RotationX, [0, 1, 0]);
    mat4.translate(ModelViewMatrix, ModelViewMatrix, [-this.Camera.PositionX, -this.Camera.PositionY, -this.Camera.PositionZ]);

    const ModelViewProjectionMatrix = mat4.create();
    mat4.mul(ModelViewProjectionMatrix, ProjectionMatrix, ModelViewMatrix);



    let UploadCounter = 0;
    const UpdatedLODLevels = this.Memory.u32[M.I_UPDATED_LOD_LEVELS_MASK];
    let UploadedLODLevels = 0;


    Outer: for(let Level = 0; Level < 16; ++Level){
      if(((UpdatedLODLevels >> Level) & 1) === 0) continue;

      const Offset = this.Memory.u32[M.I_WORLD_GRID_INDEX] + (Level << 15);
      for(let z = 0; z < 32; ++z) for(let y = 0; y < 32; ++y) for(let x = 0; x < 32; ++x){
        if(UploadCounter > 1) break Outer;
        if(((this.Memory.u32[M.I_FULLY_UPLOADED_BITMAP_START + (Level << 10 | z << 5 | y)] >> x) & 1) === 1) continue; //Something else should handle setting this to unuploaded (e.g. in the event that the world offset moves)
        const Region128_SegmentAndStackIndex = this.Memory.u32[Offset | z << 10 | y << 5 | x];
        if(Region128_SegmentAndStackIndex === 0){
          //TODO: I should set it to fully uploaded, but only if I'm sure that I have finished generating the region.
          //this.Memory.u32[M.I_FULLY_UPLOADED_BITMAP_START + (Level << 10 | z << 5 | y)] |= 1 << x;
          continue;
        }
        Atomics.add(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);
        if(Atomics.load(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_MANAGEMENT_LOCK)){
          Atomics.sub(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);
          continue;
        }

        //This is for uploading the 128³ that holds references to the 16³s
        if(Atomics.load(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD) !== 0){
          UploadCounter++;
          this.UploadSegment(Region128_SegmentAndStackIndex >> 16);
          UploadedLODLevels |= 1 << Level;
          Atomics.store(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD, 0);
        }
        const Region128_HeapIndex = (Region128_SegmentAndStackIndex & ~65535) | Atomics.load(this.Memory.u32, Region128_SegmentAndStackIndex);
        const Length = this.Memory.u32[Region128_HeapIndex + 530];
        for(let i = 0; i < Length; ++i){
          const LocalCoordinate = this.Memory.u32[Region128_HeapIndex + 531 + i];
          const ChildSegmentAndStackIndex = this.Memory.u32[Region128_HeapIndex + 18 + LocalCoordinate];
          if(Atomics.load(this.Memory.u32, (ChildSegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD) !== 0){
            UploadCounter++;
            this.UploadSegment(ChildSegmentAndStackIndex >> 16);
            UploadedLODLevels |= 1 << Level;
            Atomics.store(this.Memory.u32, (ChildSegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD, 0);
          }
        }
        this.Memory.u32[M.I_FULLY_UPLOADED_BITMAP_START + (Level << 10 | z << 5 | y)] |= 1 << x;

        Atomics.sub(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);
      }
      this.Memory.u32[M.I_UPDATED_LOD_LEVELS_MASK] &= ~(1 << Level);
    }
    for(let Level = 0; Level < 16; ++Level) if(((UploadedLODLevels >> Level) & 1) === 1) this.UploadSegment(1 + Level);
    if(UpdatedLODLevels !== 0) this.UploadSegment(0); //This is to update the fully uploaded bitmap
    //for(let i = 0; i < 128; ++i) this.UploadSegment(i);

    const UpdateRegion = this.CullRegions(ModelViewProjectionMatrix);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.RenderListTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, /*round up to next 256 */ ((UpdateRegion + 255) & ~255) >> 8, gl.RG_INTEGER, gl.UNSIGNED_INT, this.RenderListArray);


    gl.bindFramebuffer(gl.FRAMEBUFFER, this.Framebuffer);
    gl.viewport(0, 0, this.Canvas.width, this.Canvas.height);


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
    gl.uniform3f(this.VoxelUniforms.iCameraPosition, this.Camera.PositionX, this.Camera.PositionY, this.Camera.PositionZ);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.IndexBuffer);
    gl.drawElementsInstanced(gl.TRIANGLE_STRIP, Renderer.IndexArray.length, gl.UNSIGNED_BYTE, 0, this.RenderInstances);


    //Render to canvas now
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.Canvas.width, this.Canvas.height);


    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.useProgram(this.ProcessShaderProgram);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  CullRegions(m){
    const ChunkSphereRadius = Math.sqrt(3. * (128. / 2.) ** 2.);
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

    const WorldGridStart = this.Memory.u32[M.I_WORLD_GRID_INDEX];
    for(let z = 0; z < 32; ++z) for(let y = 0; y < 32; ++y) Iterator: for(let x = 0; x < 32; ++x){
      const Allocation128SegmentAndStackIndex = this.Memory.u32[WorldGridStart + (z << 10 | y << 5 | x)];
      if(Allocation128SegmentAndStackIndex === 0) continue;

      const X = (x + .5) * 128.;
      const Y = (y + .5) * 128.;
      const Z = (z + .5) * 128.;

      for(let i = 0; i < 24; i += 4){
        if(X * FrustumPlanes[i] + Y * FrustumPlanes[i | 1] + Z * FrustumPlanes[i | 2] + FrustumPlanes[i | 3] <- ChunkSphereRadius){
          continue Iterator; //Not in frustum
        }
      }

      RenderRegions.push(Math.floor(Math.hypot(X - this.Camera.PositionX, Y - this.Camera.PositionY, Z - this.Camera.PositionZ)) * 524288 + (0 << 15 | z << 10 | y << 5 | x));
      this.RenderListLength++;
    }

    RenderRegions.sort(function(A, B){
      return A - B;
    });

    for(let i = 0; i < this.RenderListLength; ++i){
      const RegionID = RenderRegions[i] & 524287;
      const Allocation128SegmentAndStackIndex = this.Memory.u32[WorldGridStart + RegionID];

      //TODO: This could be problematic, especially if this is accessed whilst the segment is being defragmented
      const Allocation128HeapIndex = (Allocation128SegmentAndStackIndex & ~65535) | this.Memory.u32[Allocation128SegmentAndStackIndex];

      this.RenderListArray[i << 1 | 0] = RegionID; //Allocation128SegmentAndStackIndex;
      this.RenderListArray[i << 1 | 1] = this.RenderInstances;

      const Instances = this.Memory.u32[Allocation128HeapIndex + 530];
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
    const gl = this.gl;
    const AttributesObject = {};
    for(const Attribute of Attributes){
      AttributesObject[Attribute] = gl.getAttribLocation(Program, Attribute);
    }
    return AttributesObject;
  }
  GetUniformLocations(Program, Uniforms){
    const gl = this.gl;
    const UniformsObject = {};
    for(const Uniform of Uniforms){
      UniformsObject[Uniform] = gl.getUniformLocation(Program, Uniform);
    }
    return UniformsObject;
  }
  InitShaderProgram(vsh, fsh){
    const gl = this.gl;
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
    const gl = this.gl;
    const Shader = gl.createShader(Type);
    gl.shaderSource(Shader, Source);
    gl.compileShader(Shader);
    if(!gl.getShaderParameter(Shader, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(Shader));
    }
    return Shader;
  }
};