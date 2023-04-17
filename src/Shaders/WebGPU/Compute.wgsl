@binding(0) @group(0) var<storage, read> Data: array<u32>;
@binding(1) @group(0) var OutputTexture: texture_storage_2d<rgba8unorm, write>;

struct UniformsStruct{
  ModelViewProjection : mat4x4<f32>,
  InverseModelViewProjection : mat4x4<f32>,
  Time : f32,
  AtomicListBufferLength : u32,
  Resolution : vec2<f32>,
  CameraRotation : vec2<f32>,
  RenderListLength : u32,
  CameraPosition : vec3<f32>,
}

@binding(2) @group(0) var<uniform> Uniforms : UniformsStruct;

struct AtomicIndicesStruct{
  Tiles : atomic<u32>,
  Quads : atomic<u32>,
  RenderList : atomic<u32>
}

@binding(3) @group(0) var<storage, read_write> AtomicIndices : AtomicIndicesStruct;
@binding(4) @group(0) var<storage, read_write> AtomicListBuffer : array<u32>;
@binding(5) @group(0) var<storage, read> RenderListBuffer : array<u32>;

//@id(0) override Test = 123;

fn EdgeFunction(p : vec2<f32>, u : vec2<f32>, v : vec2<f32>) -> bool{
  return ((p.x - u.x) * (v.y - u.y) - (p.y - u.y) * (v.x - u.x)) >= 0;
}

fn IsInsideQuad(p : vec2<f32>, a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>) -> bool{
  return all(
    vec4<bool>(
      EdgeFunction(p, a, b),
      EdgeFunction(p, b, c),
      EdgeFunction(p, c, d),
      EdgeFunction(p, d, a)
    )
  );
}
/*fn IsInsideHexagon(p : vec2<f32>, a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>, e : vec2<f32>, f : vec2<f32>) -> bool{
  return all(
    vec4<bool>(
      EdgeFunction(p, a, b),
      EdgeFunction(p, b, c),
      EdgeFunction(p, c, d),
      EdgeFunction(p, d, e)
    )
  ) && all(
    vec2<bool>(
      EdgeFunction(p, e, f),
      EdgeFunction(p, f, a)
    )
  );
}*/
fn EdgeFunction2(p : vec2<f32>, uv : vec4<f32>, vw : vec4<f32>) -> bool{
  return all(((p.xx - uv.xz) * (vw.yw - uv.yw) - (p.yy - uv.yw) * (vw.xz - uv.xz)) >= vec2<f32>(0));
}

fn IsInsideHexagon(p : vec2<f32>, ab : vec4<f32>, bc : vec4<f32>, cd : vec4<f32>, de : vec4<f32>, ef : vec4<f32>, fa : vec4<f32>) -> bool{
  return all(
    vec3<bool>(
      EdgeFunction2(p, ab, bc),
      EdgeFunction2(p, cd, de),
      EdgeFunction2(p, ef, fa)
    )
  );
}

fn Cross2D(u : vec2<f32>, v : vec2<f32>) -> f32{
  return u.x * v.y - u.y * v.x;
}

fn Rotate2D(v : vec2<f32>, a : f32) -> vec2<f32>{
  let sinA = sin(a);
  let cosA = cos(a);
  return vec2<f32>(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

/*fn InverseBilinearMapping(p : vec2<f32>, a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>) -> vec2<f32>{
  let A = Cross2D(a - p, a - d);
  let B = (Cross2D(a - p, b - c) + Cross2D(b - p, a - d)) / 2.;
  let C = Cross2D(b - p, b - c);
  let D = A - 2 * B + C;

  let s = select(((A - B) + sqrt(B * B - A * C)) / D, A / (A - C), abs(D) < 1);
  let t = ((1. - s) * (a.y - p.y) + s * (b.y - p.y)) / ((1. - s) * (a.y - d.y) + s * (b.y - c.y));

  return vec2<f32>(s, t);
}*/

/*//By Inigo Quilezles
fn InverseBilinearMapping(p : vec2<f32>, a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>) -> vec2<f32>{
  let e = b - a;
  let f = d - a;
  let g = a - b + c - d;
  let h = p - a;

  var k2 = Cross2D(g, f);
  var k1 = Cross2D(e, f) + Cross2D(h, g);
  var k0 = Cross2D(h, e);

  if(abs(k2)<0.001*abs(k0)){
    return vec2<f32>((h.x * k1 + f.x * k0) / (e.x * k1 - g.x * k0), -k0 / k1 );
  } else{
    let W = k1 * k1 - 4. * k0 * k2;
    if(W < 0.){
      return vec2<f32>(-1.); //This shouldn't happen
    }
    let w = sqrt(W);
    let ik2 = .5 / k2;

    let v = (-k1 - w)*ik2;

    return vec2<f32>(
      (h.x - f.x*v)/(e.x + g.x*v),
      v
    );
  }
}*/

fn BarycentricCoords(a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, p : vec2<f32>) -> vec3<f32>{
  let v0 = b - a;
  let v1 = c - a;
  let v2 = p - a;

  let d00 = dot(v0, v0);
  let d01 = dot(v0, v1);
  let d11 = dot(v1, v1);
  let d20 = dot(v2, v0);
  let d21 = dot(v2, v1);

  let denom = d00 * d11 - d01 * d01;
  let v = (d11 * d20 - d01 * d21) / denom;
  let w = (d00 * d21 - d01 * d20) / denom;
  let u = 1 - v - w;

  return vec3<f32>(u, v, w);
}

fn InverseBilinearMapping(p : vec2<f32>, a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>) -> vec2<f32>{
  let T1 = BarycentricCoords(a, b, d, p);
  let T2 = BarycentricCoords(b, c, d, p);
  return select(1. - T2.zx, T1.yz, all(T1 >= vec3<f32>(0.)));
}

/*fn InverseBilinearMapping(p : vec2<f32>, a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>) -> vec2<f32>{
  let v0 = vec4<f32>(b, c) - vec4<f32>(a, b);
  let v1 = vec4<f32>(d, d) - vec4<f32>(a, b);
  let v2 = vec4<f32>(p, p) - vec4<f32>(a, b);
  let s0 = b - a;
  let s1 = d - a;
  let s2 = p - a;
  let t0 = c - b;
  let t1 = d - b;
  let t2 = p - b;

  let d00 = vec2<f32>(dot(s0, s0), dot(t0, t0));
  let d01 = vec2<f32>(dot(s0, s1), dot(t0, t1));
  let d11 = vec2<f32>(dot(s1, s1), dot(t1, t1));
  let d20 = vec2<f32>(dot(s2, s0), dot(t2, t0));
  let d21 = vec2<f32>(dot(s2, s1), dot(t2, t1));

  let denom = d00 * d11 - d01 * d01;
  let v = (d11 * d20 - d01 * d21) / denom;
  let w = (d00 * d21 - d01 * d20) / denom;
  let u = 1 - v - w;
  let T1 = vec3<f32>(u.x, v.x, w.x);//BarycentricCoords(a, b, d, p);
  let T2 = vec3<f32>(u.y, v.y, w.y);//BarycentricCoords(b, c, d, p);
  return select(1. - T2.zx, T1.yz, all(T1 >= vec3<f32>(0.)));
}*/


/*fn Rasterize(LocalCoordinate : vec2<i32>, a: vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>){
  if(!IsInsideQuad((a + b + c + d) / 4., a, b, c, d)){
    return;
  }
  let Min = vec2<i32>(floor(min(min(a, b), min(c, d))));
  let Max = vec2<i32>(floor(max(max(a, b), max(c, d))));
  let Offset8 = Min & vec2<i32>(7);
  let Min8 = Min >> vec2<u32>(3);
  let Max8 = (Max + vec2<i32>(8) - Offset8) >> vec2<u32>(3);

  for(var x8 = Min8.x; x8 < Max8.x; x8++){
    for(var y8 = Min8.y; y8 < Max8.y; y8++){
      let p = vec2<i32>((x8 << 3) | LocalCoordinate.x, (y8 << 3) | LocalCoordinate.y) + Offset8;
      if(IsInsideQuad(vec2<f32>(p), a, b, c, d)){
        textureStore(OutputTexture, p, vec4<f32>(InverseBilinearMapping(vec2<f32>(p), a, b, c, d), 0., 1.));
      } else{
        textureStore(OutputTexture, p, vec4<f32>(0., 0., 1., 1.));
      }
    }
  }
}*/

/*const v0 = vec3<f32>(0,0,0);
const v1 = vec3<f32>(0,0,1);
const v2 = vec3<f32>(0,1,0);
const v3 = vec3<f32>(0,1,1);
const v4 = vec3<f32>(1,0,0);
const v5 = vec3<f32>(1,0,1);
const v6 = vec3<f32>(1,1,0);
const v7 = vec3<f32>(1,1,1);

const Vertices = array<vec3<f32>, 56>(
  v4, v6, v5, v7, v1, v3, v2,
  v5, v4, v7, v6, v3, v2, v0,
  v6, v7, v4, v5, v0, v1, v3,
  v7, v5, v6, v4, v2, v0, v1,
  v0, v1, v2, v3, v6, v7, v5,
  v1, v3, v0, v2, v4, v6, v7,
  v2, v0, v3, v1, v7, v5, v4,
  v3, v2, v1, v0, v5, v4, v6
);*/

const MaxTileSegmentSize = 512;

var<workgroup> Covered : atomic<u32>;
var<workgroup> NonAtomicCovered : u32;
var<workgroup> SharedMin8x : i32;
var<workgroup> SharedMin8y : i32;
var<workgroup> SharedMax8x : i32;
var<workgroup> SharedMax8y : i32;

var<workgroup> TileArray : array<u32, MaxTileSegmentSize>;
var<workgroup> TileArrayIndex : u32;

var<workgroup> SharedRenderIndex : u32;

var<workgroup> SharedTileSegmentIndex : u32;

var<workgroup> SharedCuboidPoints : array<vec4<f32>, 8>;
var<workgroup> SharedCuboidVertices : array<vec3<f32>, 8>;

var<workgroup> SharedMin : vec3<f32>;
var<workgroup> SharedMax : vec3<f32>;

fn PolarAngle(Point : vec3<f32>, Centroid : vec3<f32>) -> f32{
  let Delta = Point - Centroid;
  return -atan2(Delta.y, Delta.x);
}

fn RotateX(a : f32) -> mat3x3<f32>{
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(
    1.,0.,0.,
    0., c,-s,
    0., s, c
  );
}

fn RotateY(a : f32) -> mat3x3<f32>{
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(
    c,  0., s,
    0., 1.,0.,
    -s, 0., c
  );
}

fn RasterizeHexagon(LocalCoordinate : vec2<i32>, LocalIndex : u32){
  let Points = workgroupUniformLoad(&SharedCuboidVertices);
  let a = Points[0].xy;
  let b = Points[1].xy;
  let c = Points[2].xy;
  let d = Points[3].xy;
  let e = Points[4].xy;
  let f = Points[5].xy;
  let ab = vec4<f32>(a, b);
  let bc = vec4<f32>(b, c);
  let cd = vec4<f32>(c, d);
  let de = vec4<f32>(d, e);
  let ef = vec4<f32>(e, f);
  let fa = vec4<f32>(f, a);
  let Min = floor(max(min(min(min(a, b), min(c, d)), min(e, f)), vec2<f32>(0.)));
  let Max = ceil(min(max(max(max(a, b), max(c, d)), max(e, f)), Uniforms.Resolution));
  let Min8 = vec2<i32>(Min) >> vec2<u32>(3, 2);
  let Max8 = (vec2<i32>(Max) >> vec2<u32>(3, 2)) + vec2<i32>(1);

  /*let CameraDirection = vec3<f32>(
    cos(Uniforms.CameraRotation.x) * cos(Uniforms.CameraRotation.y),
    sin(Uniforms.CameraRotation.x),
    cos(Uniforms.CameraRotation.x) * sin(Uniforms.CameraRotation.y)
  );*/
  /*
  vec3 RayDirection = (normalize(vec3(uv, 1. / tan(FOV / 2.))) * RotateX(-iRotation.x) * RotateY(iRotation.y - PI));
  RayDirection += vec3(equal(RayDirection, vec3(0.))) * 1e-3;
  */


  for(var x8 = Min8.x; x8 < Max8.x; x8++){
    for(var y4 = Min8.y; y4 < Max8.y; y4++){
      {
        let TilesIndex = workgroupUniformLoad(&TileArrayIndex);
        if(TilesIndex == MaxTileSegmentSize - 2){
          WriteTilesToBuffer(LocalIndex, TilesIndex);
        }
      }

      let p = vec2<i32>((x8 << 3) | LocalCoordinate.x, (y4 << 2) | LocalCoordinate.y);

      var IsInside : bool = IsInsideHexagon(vec2<f32>(p), ab, bc, cd, de, ef, fa);
      if(IsInside){
        atomicOr(&Covered, 1u << LocalIndex);
      }
      workgroupBarrier();
      if(LocalIndex == 0u){
        NonAtomicCovered = atomicLoad(&Covered);
        atomicStore(&Covered, 0u);
        if(NonAtomicCovered != 0u){
          TileArray[TileArrayIndex] = u32((y4 << 16) | x8);
          TileArray[TileArrayIndex | 1] = NonAtomicCovered;

          TileArrayIndex += 2;
        }
      }
      workgroupBarrier();
      if(workgroupUniformLoad(&NonAtomicCovered) == 0u){
        continue;
      }
      if(IsInside){

        let FOV : f32 = 70.;

        var Point = vec2<f32>(Uniforms.Resolution.x - f32(p.x), f32(p.y)) / Uniforms.Resolution * 2. - 1.;
        Point.x *= Uniforms.Resolution.x / Uniforms.Resolution.y;
        let RayDirection = (normalize(vec3<f32>(Point, 2. / tan(FOV * 0.0087266461)))) * RotateX(Uniforms.CameraRotation.y) * RotateY(3.14159 - Uniforms.CameraRotation.x);
        let RayOrigin = Uniforms.CameraPosition;


        //let Point = vec2<f32>(p) / Uniforms.Resolution * 2. - 1.;
        //let ClipSpaceCoords = vec4<f32>(Point, 4 / 24000., 1.);
        //let ViewSpaceCoords = Uniforms.InverseModelViewProjection * ClipSpaceCoords;
        //let RayDirection = normalize(ViewSpaceCoords.xyz / ViewSpaceCoords.w);
        //let RayOrigin = vec3(0.);



        let MinPos = vec3<f32>(0.);
        let MaxPos = vec3<f32>(10.);

        /*let InverseDir = 1. / RayDirection;
        let TBottom = InverseDir * (MinPos - RayOrigin);
        let TTop = InverseDir * (MaxPos - RayOrigin);
        let TMin = min(TTop, TBottom);
        let TMax = max(TTop, TBottom);

        var Traverse = max(TMin.xx, TMin.yz);
        let TraverseLow = max(Traverse.x, Traverse.y);
        Traverse = min(TMax.xx, TMax.yz);

        let TraverseHigh = min(Traverse.x, Traverse.y);

        let Hit = TraverseHigh > max(TraverseLow, 0.);*/

        let t0 = (MinPos.x - RayOrigin.x) / RayDirection.x;
        let t1 = (MaxPos.x - RayOrigin.x) / RayDirection.x;
        let t2 = (MinPos.y - RayOrigin.y) / RayDirection.y;
        let t3 = (MaxPos.y - RayOrigin.y) / RayDirection.y;
        let t4 = (MinPos.z - RayOrigin.z) / RayDirection.z;
        let t5 = (MaxPos.z - RayOrigin.z) / RayDirection.z;

        let tmin = max(max(min(t0, t1), min(t2, t3)), min(t4, t5));
        let tmax = min(min(max(t0, t1), max(t2, t3)), max(t4, t5));

        let Hit = tmax >= 0 && tmin <= tmax;

        let HitCoordinate = (RayOrigin + (tmin * RayDirection)) / (MaxPos - MinPos);





        textureStore(OutputTexture, p, vec4<f32>(HitCoordinate.xyz, 1.));
      } else{
        textureStore(OutputTexture, p, vec4<f32>(0., 0., 1., 1.));
      }
    }
  }
  let TilesIndex = workgroupUniformLoad(&TileArrayIndex);
  WriteTilesToBuffer(LocalIndex, TilesIndex);
}

fn ConditionalSwap1(i : u32, j : u32){
  let a = SharedCuboidPoints[i];
  let b = SharedCuboidPoints[j];
  if(a.w > b.w){
    SharedCuboidPoints[i] = b;
    SharedCuboidPoints[j] = a;
  }
}

fn ConditionalSwap2(i : u32, j : u32){
  let a = SharedCuboidVertices[i];
  let b = SharedCuboidVertices[j];
  if(a.z > b.z){
    SharedCuboidVertices[i] = b;
    SharedCuboidVertices[j] = a;
  }
}

fn WriteTilesToBuffer(LocalIndex : u32, TilesIndex : u32){
  if(LocalIndex == 0u){
    let OldTileSegmentIndex = SharedTileSegmentIndex;
    SharedTileSegmentIndex = atomicAdd(&AtomicIndices.Tiles, TilesIndex + 2);
    // ^^ The + 2 is to leave space for a pointer to the next segment if there is one.
    if(OldTileSegmentIndex != 0xffffffff){
      //Leave pointer to next segment
      AtomicListBuffer[OldTileSegmentIndex + MaxTileSegmentSize - 2] = SharedTileSegmentIndex;
      AtomicListBuffer[OldTileSegmentIndex + MaxTileSegmentSize - 1] = TilesIndex >> 1;
    } else{
      //Create quad index (information about the quad)
      let QuadIndex = Uniforms.AtomicListBufferLength - (atomicAdd(&AtomicIndices.Quads, 1) + 1) * 8;
      AtomicListBuffer[QuadIndex + 0] = 0; //X
      AtomicListBuffer[QuadIndex + 1] = 0; //Y
      AtomicListBuffer[QuadIndex + 2] = 0; //Z
      AtomicListBuffer[QuadIndex + 3] = (TilesIndex >> 1) << 7; //LOD level (4 bits), Side (3 bits), Tiles count (8 bits)
      AtomicListBuffer[QuadIndex + 4] = SharedTileSegmentIndex;
      AtomicListBuffer[QuadIndex + 5] = 0; //Voxel heap index
    }
    TileArrayIndex = 0;
  }
  let StartSegmentIndex = workgroupUniformLoad(&SharedTileSegmentIndex);
  let Iterations = i32(TilesIndex + 31u) >> 5;
  for(var i = 0; i < Iterations; i++){
    let Index = u32(i << 5) | LocalIndex;
    if(Index > TilesIndex){
      break;
    }
    //Write to global array
    AtomicListBuffer[StartSegmentIndex + Index] = TileArray[Index];
  }
}

fn Rasterize(LocalCoordinate : vec2<i32>, LocalIndex : u32, a: vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>){
  if(!IsInsideQuad((a + b + c + d) / 4., a, b, c, d)){
    return;
  }

  let Min = vec2<i32>(max(vec2<f32>(0., 0.), floor(min(min(a, b), min(c, d)))));
  let Max = vec2<i32>(min(Uniforms.Resolution, floor(max(max(a, b), max(c, d)))));
  let _Min8 = Min >> vec2<u32>(3, 2);
  let _Max8 = (Max >> vec2<u32>(3, 2)) + vec2<i32>(1);

  if(LocalIndex == 0u){
    SharedMin8x = _Min8.x;
    SharedMin8y = _Min8.y;
    SharedMax8x = _Max8.x;
    SharedMax8y = _Max8.y;
    NonAtomicCovered = 0u;
    SharedTileSegmentIndex = 0xffffffff;

    atomicStore(&Covered, 0u);
  }
  workgroupBarrier();

  let Min8x = workgroupUniformLoad(&SharedMin8x);
  let Min8y = workgroupUniformLoad(&SharedMin8y);
  let Max8x = workgroupUniformLoad(&SharedMax8x);
  let Max8y = workgroupUniformLoad(&SharedMax8y);


  for(var x8 = Min8x; x8 < Max8x; x8++){
    for(var y4 = Min8y; y4 < Max8y; y4++){
      {
        let TilesIndex = workgroupUniformLoad(&TileArrayIndex);
        if(TilesIndex == MaxTileSegmentSize - 2){
          WriteTilesToBuffer(LocalIndex, TilesIndex);
        }
      }

      let p = vec2<i32>((x8 << 3) | LocalCoordinate.x, (y4 << 2) | LocalCoordinate.y);
      var IsInside : bool = IsInsideQuad(vec2<f32>(p) + .5, a, b, c, d);
      if(IsInside){
        atomicOr(&Covered, 1u << LocalIndex);
      }
      workgroupBarrier();
      if(LocalIndex == 0u){
        NonAtomicCovered = atomicLoad(&Covered);
        atomicStore(&Covered, 0u);
        if(NonAtomicCovered != 0u){
          TileArray[TileArrayIndex] = u32((y4 << 16) | x8);
          TileArray[TileArrayIndex | 1] = NonAtomicCovered;

          TileArrayIndex += 2;
        }
      }
      workgroupBarrier();
      if(workgroupUniformLoad(&NonAtomicCovered) == 0u){
        continue;
      }

      if(IsInside){
        textureStore(OutputTexture, p, vec4<f32>(InverseBilinearMapping(vec2<f32>(p), a, b, c, d), 0., 1.));
      } else{
        textureStore(OutputTexture, p, vec4<f32>(0., 0., 1., 1.));
      }
    }
  }

  /*let TileCount = i32(workgroupUniformLoad(&TileArrayIndex) >> 1u);

  for(var i = 0; i < TileCount; i++){
    let Tile = TileArray[(i << 1) | 1];
    if(((Tile >> LocalIndex) & 1u) == 1u){
      textureStore(OutputTexture, vec2<u32>(LocalIndex & 7, (LocalIndex >> 3) | u32(i << 3)), vec4<f32>(0., 0., 1., 1.));
    }
  }*/

  let TilesIndex = workgroupUniformLoad(&TileArrayIndex);
  WriteTilesToBuffer(LocalIndex, TilesIndex);
}



@compute @workgroup_size(8, 4)
fn Main(@builtin(local_invocation_id) Local: vec3<u32>, @builtin(local_invocation_index) Index: u32){
  loop{ //I need this loop because of a WebGPU implementation bug
    if(Index == 0u){
      SharedRenderIndex = atomicAdd(&AtomicIndices.RenderList, 1);
    }
    let RenderIndex = workgroupUniformLoad(&SharedRenderIndex);
    let Region128_Coordinate = RenderListBuffer[RenderIndex];
    var Position = vec3<f32>(vec3<u32>(Region128_Coordinate, Region128_Coordinate >> 5, Region128_Coordinate >> 10) & vec3<u32>(31)) * 128.;

    var Region128_SSI = Data[65536u + Region128_Coordinate];
    var Region128_HI = (Region128_SSI & ~65535u) | Data[Region128_SSI];

    let Region16Count = Data[Region128_HI + 530u];

    //This only chooses the first one.
    let Region16_Coordinate = Data[Region128_HI + 531u];
    let Region16_SSI = Data[Region128_HI + 18u + Region16_Coordinate];
    let Region16_HI = (Region16_SSI & ~65535u) | Data[Region16_SSI];

    let Temp = Data[Region16_HI + 2u];
    let Min_u = vec3<u32>(Temp, Temp >> 4, Temp >> 8) & vec3<u32>(15u);
    let Max_u = (vec3<u32>(Temp >> 12, Temp >> 16, Temp >> 20) & vec3<u32>(15u)) + vec3<u32>(1u);

    let Position16 = Data[Region16_HI + 3u] & 511u;

    Position += vec3<f32>((vec3<u32>(Position16) >> vec3<u32>(0, 3, 6)) & vec3<u32>(7)) * 16.;


    let Min_f = vec3<f32>(Min_u);
    let Max_f = vec3<f32>(Max_u);

    let Min = vec3<f32>(0.);
    let Max = vec3<f32>(10.);

    /*let Projection0 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Min.x, Min.y, Min.z), 1.);
    let Projection1 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Max.x, Min.y, Min.z), 1.);
    let Projection2 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Min.x, Max.y, Min.z), 1.);
    let Projection3 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Max.x, Max.y, Min.z), 1.);
    let Projection4 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Min.x, Min.y, Max.z), 1.);
    let Projection5 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Max.x, Min.y, Max.z), 1.);
    let Projection6 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Min.x, Max.y, Max.z), 1.);
    let Projection7 = Uniforms.ModelViewProjection * vec4<f32>(vec3<f32>(Max.x, Max.y, Max.z), 1.);
    let P0 = ((Projection0.xy / Projection0.ww) + .5) * Uniforms.Resolution;
    let P1 = ((Projection1.xy / Projection1.ww) + .5) * Uniforms.Resolution;
    let P2 = ((Projection2.xy / Projection2.ww) + .5) * Uniforms.Resolution;
    let P3 = ((Projection3.xy / Projection3.ww) + .5) * Uniforms.Resolution;
    let P4 = ((Projection4.xy / Projection4.ww) + .5) * Uniforms.Resolution;
    let P5 = ((Projection5.xy / Projection5.ww) + .5) * Uniforms.Resolution;
    let P6 = ((Projection6.xy / Projection6.ww) + .5) * Uniforms.Resolution;
    let P7 = ((Projection7.xy / Projection7.ww) + .5) * Uniforms.Resolution;*/
    if(Index < 8){
      let Point = vec3<f32>(
        select(Max.x, Min.x, (Index & 1) == 0),
        select(Max.y, Min.y, (Index & 2) == 0),
        select(Max.z, Min.z, (Index & 4) == 0)
      );
      SharedCuboidPoints[Index] = vec4(Point, length(Uniforms.CameraPosition - Point));
    }
    workgroupBarrier();
    var Inbetween = (
      select(0, 1, Uniforms.CameraPosition.x > Min.x && Uniforms.CameraPosition.x < Max.x) +
      select(0, 1, Uniforms.CameraPosition.y > Min.y && Uniforms.CameraPosition.y < Max.y) +
      select(0, 1, Uniforms.CameraPosition.z > Min.z && Uniforms.CameraPosition.z < Max.z)
    );
    if(Index == 0u){
      ConditionalSwap1(0, 2);
      ConditionalSwap1(1, 3);
      ConditionalSwap1(4, 6);
      ConditionalSwap1(5, 7);

      ConditionalSwap1(0, 4);
      ConditionalSwap1(1, 5);
      ConditionalSwap1(2, 6);
      ConditionalSwap1(3, 7);

      ConditionalSwap1(0, 1);
      ConditionalSwap1(2, 3);
      ConditionalSwap1(4, 5);
      ConditionalSwap1(6, 7);

      ConditionalSwap1(2, 4);
      ConditionalSwap1(3, 5);

      ConditionalSwap1(1, 4);
      ConditionalSwap1(3, 6);

      //ConditionalSwap1(1, 2);
      //ConditionalSwap1(3, 4);
      ConditionalSwap1(5, 6);

      if(Inbetween == 0){
        SharedCuboidPoints[0] = SharedCuboidPoints[6];
      } else if(Inbetween == 2){
        var Temp = SharedCuboidPoints[3];
        SharedCuboidPoints[4] = Temp;
        SharedCuboidPoints[5] = Temp;
      }

      for(var i = 0; i < 6; i++){
        let Point = SharedCuboidPoints[i].xyz;
        let Projection = Uniforms.ModelViewProjection * vec4<f32>(Point, 1.);
        SharedCuboidVertices[i] = vec3<f32>(((Projection.xy / Projection.ww) + .5) * Uniforms.Resolution, 0);
      }

      var Centroid = (
        SharedCuboidVertices[0] +
        SharedCuboidVertices[1] +
        SharedCuboidVertices[2] +
        SharedCuboidVertices[3] +
        SharedCuboidVertices[4] +
        SharedCuboidVertices[5]
      ) * .166666667;

      for(var i = 0; i < 6; i++){
        SharedCuboidVertices[i].z = PolarAngle(SharedCuboidVertices[i], Centroid);
      }

      ConditionalSwap2(1, 3);
      ConditionalSwap2(2, 4);
      ConditionalSwap2(0, 5);

      ConditionalSwap2(1, 2);
      ConditionalSwap2(3, 4);

      ConditionalSwap2(0, 3);
      ConditionalSwap2(2, 5);

      ConditionalSwap2(0, 1);
      ConditionalSwap2(2, 3);
      ConditionalSwap2(4, 5);

      ConditionalSwap2(1, 2);
      ConditionalSwap2(3, 4);

      /*var Min = SharedCuboidVertices[0];
      var Max = SharedCuboidVertices[1];
      var Temp : f32;
      var Comparison = Max < Min;
      if(Comparison.x){
        Temp = Min.x;
        Min.x = Max.x;
        Max.x = Temp;
      }
      if(Comparison.y){
        Temp = Min.y;
        Min.y = Max.y;
        Max.y = Temp;
      }

      var a = SharedCuboidVertices[2];
      var b = SharedCuboidVertices[3];
      Comparison = b < a;
      if(Comparison.x){
        Temp = a.x;
        a.x = b.x;
        b.x = Temp;
      }
      if(Comparison.y){
        Temp = a.y;
        a.y = b.y;
        b.y = Temp;
      }
      Min = min(a, Min);
      Max = max(a, Max);

      a = SharedCuboidVertices[4];
      b = SharedCuboidVertices[5];
      Comparison = b < a;
      if(Comparison.x){
        Temp = a.x;
        a.x = b.x;
        b.x = Temp;
      }
      if(Comparison.y){
        Temp = a.y;
        a.y = b.y;
        b.y = Temp;
      }
      Min = min(a, Min);
      Max = max(a, Max);

      SharedMin = Min;
      SharedMax = Max;*/
    }
    workgroupBarrier();
    RasterizeHexagon(vec2<i32>(Local.xy), Index);





    /*for(var i = 0; i < 6; i++){
      var Projection = Uniforms.ModelViewProjection * vec4<f32>(workgroupUniformLoad(&(SharedCuboidPoints[i])).xyz, 1.);
      var Vertex = ((Projection.xy / Projection.ww) + .5) * Uniforms.Resolution;
      Rasterize(vec2<i32>(Local.xy), Index, Vertex + vec2<f32>(-5, -5), Vertex + vec2<f32>(-5, 5), Vertex + vec2<f32>(5, 5), Vertex + vec2<f32>(5, -5));
    }*/








    if(RenderIndex != 2147483647){
      break;
    }
  }

}