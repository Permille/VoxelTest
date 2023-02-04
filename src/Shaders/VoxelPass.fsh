#version 300 es
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