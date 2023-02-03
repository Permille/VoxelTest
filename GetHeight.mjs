function smoothstep(a, b, x){
  const t = Math.min(Math.max((x - a) / (b - a), 0.), 1.);
  return t * t * (3. - 2. * t);
}

function fract(x){
  return x - Math.floor(x);
}

//This is for manual return value memory management
//I need this because when I want to return multiple values from a function, I need to return them in an array
//which is slower because these arrays then have to be garbage collected...
//This method is around 30% faster than the original
const I_ga = 0;
const I_gb = 2;
const I_gc = 4;
const I_gd = 6;
const I_CalcHash = 8;
const I_CalcNoise = 11;
const I_CalcErosion = 14;

const R = new Float64Array(17); //Return values



// Hash without Sine
// MIT License...
//Copyright (c)2014 David Hoskins.
//https://choosealicense.com/licenses/mit/

function Hash(x, y, StartIndex){
  let px = fract(x * .1031);
  let py = fract(y * .1030);
  let pz = fract(x * .0973);
  const Dot = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += Dot;
  py += Dot;
  pz += Dot;
  R[StartIndex    ] = fract((px + py) * pz) * 2. - 1.;
  R[StartIndex + 1] = fract((px + pz) * py) * 2. - 1.;
}



//Copyright 2020 Clay John

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software
//and associated documentation files (the "Software"), to deal in the Software without restriction,
//including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
//and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do
//so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in all copies or
//substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
//NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
//IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
//WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
//SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
function DerivativeNoise(x, y, StartIndex){
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fract(x);
  const fy = fract(y);

  const ux = fx * fx * fx * (fx * (fx * 6. - 15.) + 10.);
  const uy = fy * fy * fy * (fy * (fy * 6. - 15.) + 10.);

  const dux = 30. * fx * fx * (fx * (fx - 2.) + 1.);
  const duy = 30. * fy * fy * (fy * (fy - 2.) + 1.);

  Hash(ix     , iy     , I_ga);
  Hash(ix + 1., iy     , I_gb);
  Hash(ix     , iy + 1., I_gc);
  Hash(ix + 1., iy + 1., I_gd);

  const va = R[I_ga] * (fx - 0.) + R[I_ga + 1] * (fy - 0.);
  const vb = R[I_gb] * (fx - 1.) + R[I_gb + 1] * (fy - 0.);
  const vc = R[I_gc] * (fx - 0.) + R[I_gc + 1] * (fy - 1.);
  const vd = R[I_gd] * (fx - 1.) + R[I_gd + 1] * (fy - 1.);


  R[StartIndex + 0] = (va + ux * (vb - va) + uy * (vc - va) + ux * uy * (va - vb - vc + vd));
  R[StartIndex + 1] = R[I_ga] + ux * (R[I_gb] - R[I_ga]) + uy * (R[I_gc] - R[I_ga]) + ux * uy * (R[I_ga] - R[I_gb] - R[I_gc] + R[I_gd]) + dux * (uy * (va - vb - vc + vd) + vb - va);
  R[StartIndex + 2] = R[I_ga + 1] + ux * (R[I_gb + 1] - R[I_ga + 1]) + uy * (R[I_gc + 1] - R[I_ga + 1]) + ux * uy * (R[I_ga + 1] - R[I_gb + 1] - R[I_gc + 1] + R[I_gd + 1]) + duy * (ux * (va - vb - vc + vd) + vc - va);
}

const MinusExpArray = new Float64Array(501);
for(let i = 0; i < 501; ++i){
  MinusExpArray[i] = Math.exp(-i / 100.);
}
function FastMinusExp(x){
  if(x >= 0) return 1;
  if(x <= -5) return 6.7e-3;
  const Index = Math.floor(-x * 100) | 0;
  return MinusExpArray[Index];
}

const CosArray = new Float64Array(10000);
for(let i = 0; i < 10000; ++i){
  CosArray[i] = Math.cos((i - 5000) / 100.);
}
function FastCos(x){
  x += 50;
  const Fract = fract(x * 100.);
  const Index = Math.floor(x * 100) | 0;
  const Current = CosArray[Index];
  const Next = CosArray[Index + 1];
  return Current + Fract * (Next - Current);
}


function Erosion(Samples, px, py, dirx, diry, StartIndex){
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = fract(px);
  const fy = fract(py);

  const f = 3.;

  let vax = 0.;
  let vay = 0.;
  let vaz = 0.;

  let wt = 0.;
  //Increased precision here
  for(let i = -Samples; i < Samples; ++i) for(let j = -Samples; j < Samples; ++j){
    Hash(ix - i, iy - j, I_CalcHash);

    const ppx = fx + i + R[I_CalcHash];
    const ppy = fy + j + R[I_CalcHash + 1];

    const Distance = ppx * ppx + ppy * ppy;
    const Parameter1 = -Distance * 2.;

    const Worley = FastMinusExp(Parameter1);
    wt += Worley;

    const Magnitude = dirx * ppx + diry * ppy;
    const Intermediate = FastCos(Magnitude * f) * Worley;
    vax += Intermediate;
    vay += Intermediate * (ppx - dirx);
    vaz += Intermediate * (ppy - diry);
  }


  R[StartIndex + 0] = vax / wt;
  R[StartIndex + 1] = vay / wt;
  R[StartIndex + 2] = vaz / wt;
}


function NormalMountain(px, py, s, InputScale, DerivativeScale){
  let nx = 0.;
  let ny = 0.;
  let nz = 0.;

  let nf = 1.;
  let na = .6;

  for(let i = 0; i < 2; ++i){
    DerivativeNoise((px * s * nf) * InputScale, (py * s * nf) * InputScale, I_CalcNoise);
    nx += R[I_CalcNoise + 0] * na * 1.;
    ny += R[I_CalcNoise + 1] * na * nf * DerivativeScale;
    nz += R[I_CalcNoise + 2] * na * nf * DerivativeScale;

    na *= .5;
    nf *= 2.;
  }

  const dirx = nz;
  const diry = -ny;

  let hx = 0.;
  let hy = 0.;
  let hz = 0.;

  let a = .7 * smoothstep(.3, .5, nx * .5 + .5);
  let f = 1.;

  for(let i = 0; i < 5; ++i){
    Erosion(2, px * f, py * f, dirx + hz, diry - hy, I_CalcErosion);
    R[I_CalcErosion + 0] *= a;
    R[I_CalcErosion + 1] *= a * f;
    R[I_CalcErosion + 2] *= a * f;

    hx += R[I_CalcErosion + 0];
    hy += R[I_CalcErosion + 1];
    hz += R[I_CalcErosion + 2];

    a *= .4;
    f *= 2.;
  }

  /*return [
    smoothstep(-1., 1., nx) + hx * .05,
    (ny + hy) * .5 + .5,
    (nz + hz) * .5 + .5
  ];*/
  return smoothstep(-1., 1., nx) + hx * .05;
}



export default function GetHeight(X, Z){
  const ErosionScale = 10.;
  const TerrainScale = 2000.;
  const InputScale = 1.;
  const DerivativeScale = 1.;
  const TerrainHeight = 2700.;

  return NormalMountain(X * ErosionScale / TerrainScale / InputScale, Z * ErosionScale / TerrainScale / InputScale, 1. / ErosionScale, InputScale, DerivativeScale) * TerrainHeight;
};