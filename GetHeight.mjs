import Simplex from "./Simplex.mjs";
import NewSimplexGenerator from "./NewSimplex.mjs";
import Worley from "./Worley.mjs";
const WorleyNoise = new Worley;

const NewSimplex = NewSimplexGenerator(17);

function ReSeed(NewSeed){
  Simplex.seed(NewSeed);
  WorleyNoise.setSeed(NewSeed);
}

ReSeed(17);





function smoothstep(a, b, x){
  const t = Math.min(Math.max((x - a) / (b - a), 0.), 1.);
  return t * t * (3. - 2. * t);
}

function fract(x){
  return x - Math.floor(x);
}

/*function Hash(x, y){
  const kx = .3183099;
  const ky = .3678794;
  x = x * kx + ky;
  y = y * ky + kx;
  return [
    -1. + 2. * fract(16. * kx * fract(x * y * (x + y))),
    -1. + 2. * fract(16. * ky * fract(x * y * (x + y)))
  ];
}*/

// Hash without Sine
// MIT License...
//Copyright (c)2014 David Hoskins.
//https://choosealicense.com/licenses/mit/

function Hash(x, y){
  let px = fract(x * .1031);
  let py = fract(y * .1030);
  let pz = fract(x * .0973);
  const Dot = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += Dot;
  py += Dot;
  pz += Dot;
  return [
    fract((px + py) * pz) * 2. - 1.,
    fract((px + pz) * py) * 2. - 1.
  ]
}




//Weighting functions:
//https://www.desmos.com/calculator/jc40rsanua

function SerpentineWeightingFunction(Value, Exponent){
  const Intermediate = (2 * Value - 1) / ((2 * Value - 1) ** 2 + 1);
  return (Math.sign(Intermediate) * Math.abs(Intermediate) ** Exponent + 0.5 ** Exponent) / Exponent ** (-Exponent);
}

function BiasedSerpentineWeightingFunction(Value){
  const Intermediate = (2 * Value - 1) / ((2 * Value - 1) ** 2 + 1);
  return Math.sign(Intermediate) * (1. - (1. - (2. * Math.abs(Intermediate))) ** (1. + Value)) * .5 + .5;
}

function BetterSerpentineWeightingFunction(Value, Exponent){
  const Intermediate = (2 * Value - 1) / ((2 * Value - 1) ** 2 + 1);
  return Math.sign(Intermediate) * (1. - (1. - (2. * Math.abs(Intermediate))) ** Exponent) * .5 + .5;
}

function ExponentialWeightingFunction(Value, Exponent){
  return Math.expm1(Math.pow(Value, Exponent)) / Math.expm1(1);
}

const SerpentineWeighting = [];
for(let i = 0; i < 150; i++){
  SerpentineWeighting[i] = new Float32Array(501);
  for(let j = 0, Weighting = SerpentineWeighting[i]; j < 501; j++){
    Weighting[j] = SerpentineWeightingFunction(j / 500, i / 150);
  }
}

const BetterSerpentineWeighting = [];
for(let i = 0; i < 150; i++){
  BetterSerpentineWeighting[i] = new Float32Array(501);
  for(let j = 0, Weighting = BetterSerpentineWeighting[i]; j < 501; j++){
    Weighting[j] = BetterSerpentineWeightingFunction(j / 2000, i / 150);
  }
}

const ExponentialWeighting = [];
for(let i = 250; i < 450; i++){
  ExponentialWeighting[i] = new Float32Array(771);
  for(let j = 0, Weighting = ExponentialWeighting[i]; j < 771; j++){
    Weighting[j] = ExponentialWeightingFunction(j / 500, i / 150);
  }
}

//Less expensive approximation functions:

function GetSerpentineWeightingAt(Value, Exponent){
  let ValueIndex = Value * 100;
  let ExponentIndex = Exponent * 2000;
  let ValueOffset = ValueIndex - (ValueIndex >>= 0);
  let ExponentOffset = ExponentIndex - (ExponentIndex >>= 0);
  //Precalculate derivatives?
  let CurrentValue = SerpentineWeighting[ValueIndex][ExponentIndex];
  return CurrentValue + (ValueOffset * (SerpentineWeighting[ValueIndex + 1][ExponentIndex] - CurrentValue) + ExponentOffset * (SerpentineWeighting[ValueIndex][ExponentIndex + 1] - CurrentValue));
}

function GetBetterSerpentineWeightingAt(Value, Exponent){
  let ValueIndex = Value * 100;
  let ExponentIndex = Exponent * 500;
  let ValueOffset = ValueIndex - (ValueIndex >>= 0);
  let ExponentOffset = ExponentIndex - (ExponentIndex >>= 0);
  //Precalculate derivatives?
  let CurrentValue = BetterSerpentineWeighting[ValueIndex][ExponentIndex];
  return CurrentValue + (ValueOffset * (BetterSerpentineWeighting[ValueIndex + 1][ExponentIndex] - CurrentValue) + ExponentOffset * (BetterSerpentineWeighting[ValueIndex][ExponentIndex + 1] - CurrentValue));
}

function GetExponentialWeightingAt(Value, Exponent){
  let ValueIndex = Value * 100;
  let ExponentIndex = Exponent * 500;
  let ValueOffset = ValueIndex - (ValueIndex >>= 0);
  let ExponentOffset = ExponentIndex - (ExponentIndex >>= 0);
  //Precalculate derivatives?
  let CurrentValue = ExponentialWeighting[ValueIndex][ExponentIndex];
  return CurrentValue + (ValueOffset * (ExponentialWeighting[ValueIndex + 1][ExponentIndex] - CurrentValue) + ExponentOffset * (ExponentialWeighting[ValueIndex][ExponentIndex + 1] - CurrentValue));
}

function GetDerivedArcTangentWeightingAt(Value){
  return 1 / (Value ** 2 + 1);
}

function WeightTowards(PeakX, Distribution, Exponent){
  return function(X){
    return GetDerivedArcTangentWeightingAt((X - PeakX) / Distribution) ** Exponent;
  };
}

function GetSharpWeightingAt(Value){
  const z = 1;
  const f = 1;
  return (z ** 2 + 1) / ((Math.abs(f * Value) + z) ** 2 + 1);
}

function GetAsymmetricWeightingAt1(Value){
  return 2. / (1. + (Math.abs(((2. - Math.sign(Value)) * Value) ** (1.75 + Math.sign(Value) * .75)) + 1.) ** 2.);
}

function GetAsymmetricWeightingAt(Value){
  return 2. / (1. + (Math.abs((2. - 3. * Math.sign(Value)) * Value) + 1.) ** 2.);
}

function WeightTowardsSharp(PeakX, Distribution){
  return function(X){
    return GetSharpWeightingAt((X - PeakX) / Distribution);
  };
}

function WeightTowardsAsymmetric(PeakX, Distribution){
  return function(X){
    return GetAsymmetricWeightingAt((X - PeakX) / Distribution);
  };
}

function GetRepeatingSharpWeightingAt(Value){
  return 1 - Math.abs(Math.sin(Value));
}

function WeightTowardsRepeatingSharp(PeakX, Distribution){
  return function(X){
    return GetRepeatingSharpWeightingAt((X - PeakX) / Distribution);
  };
}

function GetRepeatingSharpWeightingAt2(Value){
  return 1 - Math.abs(Math.sin(.25 * Value));
}

function WeightTowardsRepeatingSharp2(PeakX, Distribution){
  return function(X){
    return GetRepeatingSharpWeightingAt2((X - PeakX) / Distribution);
  };
}

/*

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

function DerivativeNoise(x, y){
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fract(x);
  const fy = fract(y);

  const ux = fx * fx * fx * (fx * (fx * 6. - 15.) + 10.);
  const uy = fy * fy * fy * (fy * (fy * 6. - 15.) + 10.);

  const dux = 30. * fx * fx * (fx * (fx - 2.) + 1.);
  const duy = 30. * fy * fy * (fy * (fy - 2.) + 1.);

  const ga = Hash(ix + 0., iy + 0.);
  const gb = Hash(ix + 1., iy + 0.);
  const gc = Hash(ix + 0., iy + 1.);
  const gd = Hash(ix + 1., iy + 1.);

  const va = ga[0] * (fx - 0.) + ga[1] * (fy - 0.);
  const vb = gb[0] * (fx - 1.) + gb[1] * (fy - 0.);
  const vc = gc[0] * (fx - 0.) + gc[1] * (fy - 1.);
  const vd = gd[0] * (fx - 1.) + gd[1] * (fy - 1.);

  return [
    (va + ux * (vb - va) + uy * (vc - va) + ux * uy * (va - vb - vc + vd)),
    ga[0] + ux * (gb[0] - ga[0]) + uy * (gc[0] - ga[0]) + ux * uy * (ga[0] - gb[0] - gc[0] + gd[0]) + dux * (uy * (va - vb - vc + vd) + vb - va),
    ga[1] + ux * (gb[1] - ga[1]) + uy * (gc[1] - ga[1]) + ux * uy * (ga[1] - gb[1] - gc[1] + gd[1]) + duy * (ux * (va - vb - vc + vd) + vc - va)
  ];
}



function DerivativeNoise2(X, Z){

  const Octaves = new Float32Array(16);
  for(let i = 0; i < 15; i++){
    Octaves[i] = Simplex.simplex3(X / 2 ** i, Z / 2 ** i, 1536);
  }

  let OctaveSum6_15 = 0.;
  for(let i = 0, Min = 6, Max = 15, Count = Max - Min; i < Count; ++i) OctaveSum6_15 += Octaves[i + Min] / (2 ** (Count - i));

  let OctaveSum1_5 = 0.;
  for(let i = 0, Min = 1, Max = 5, Count = Max - Min; i < Count; ++i) OctaveSum1_5 += Octaves[i + Min] / (2 ** (Count - i));

  let OctaveSum3_9 = 0.;
  for(let i = 0, Min = 3, Max = 9, Count = Max - Min; i < Count; ++i) OctaveSum3_9 += Octaves[i + Min] / (2 ** (Count - i));



  //const Worley1 = WorleyNoise.Euclidean(X / 300. + OctaveSum1_5 / 45., Z / 300. + OctaveSum1_5 / 45., 0.);

  const DistributionNoise = Simplex.simplex3(X / 32768, Z / 32768, 1542);

  const CliffNoise1 = Simplex.simplex3(X / 512., Z / 512., 1539) * .75 * OctaveSum1_5 * .25;
  const CliffNoise2 = Simplex.simplex3(X / 256., Z / 256., 1539.4);

  const Worley2 = WorleyNoise.FasterNoise(X / 2000., Z / 2000.);// + WorleyNoise.FasterNoise(X / 3000., Z / 3000.);

  const Other1 = Simplex.simplex3(X / 16384., Z / 16384., 1555);
  const Other2 = Simplex.simplex3(X / 4096., Z / 4096., 1555);
  const Other3 = Simplex.simplex3(X / 16384., Z / 16384., 1555.5);

  let MountainMap = WeightTowards(.47 + .10 * Other3, .10 + .06 * (Other1 * .8 + Other2 * .2), .57)(OctaveSum6_15);

  //MountainMap *= Worley2;
  //MountainMap += WeightTowardsAsymmetric(.15, .0094)(MountainMap) * .0106 * Math.max(0., Octaves[8] * 2. - 1.);
  //MountainMap += WeightTowardsAsymmetric(.43, .0094)(1. - OctaveSum6_15) * .0106 * Math.min(1., Math.max(0., 2. - MountainMap * 5.));// * Math.max(0., Octaves[9] * 2. - 1.);
  //MountainMap += WeightTowardsAsymmetric(.38, .0094)(1. - OctaveSum6_15) * .0106 * Math.min(1., Math.max(0., 3.3 - MountainMap * 7.)) * (CliffNoise2 + 1.) / 2.;
  //MountainMap += WeightTowardsAsymmetric(.33, .0096)(1. - OctaveSum6_15) * CliffNoise1 * .0106;
  //MountainMap += Cliffs1(MountainMap) * .039 * OctaveSum3_9 * Math.max(0., Math.min(1.6 - 2. * MountainMap));

  return MountainMap;
}

function MountainNoise(x, y){
  return DerivativeNoise2(x, y);

  return Simplex.simplex2(x / 3., y / 3.) * Math.max(0., 1. - Math.hypot(x, y) / 10.);
}



function DerivativeNoise_(x, y){
  const Value = MountainNoise(x, y);
  return [
    Value,
    MountainNoise(x + 1., y) - Value,
    MountainNoise(x, y + 1.) - Value
  ];
}






function Erosion(px, py, dirx, diry){
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = fract(px);
  const fy = fract(py);

  const f = 3.;

  let vax = 0.;
  let vay = 0.;
  let vaz = 0.;

  let wt = 0.;

  for(let i = -2; i < 2; ++i) for(let j = -2; j < 2; ++j){
    const CalcHash = Hash(ix - i, iy - j);
    CalcHash[0] *= .5;
    CalcHash[1] *= .5;

    const ppx = fx + i + CalcHash[0];
    const ppy = fy + j + CalcHash[1];

    const Distance = ppx * ppx + ppy * ppy;
    const Worley = Math.exp(-Distance * 2.);
    wt += Worley;

    const Magnitude = dirx * ppx + diry * ppy;
    const Intermediate = Math.cos(Magnitude * f) * Worley;
    vax += Intermediate;
    vay += Intermediate * (ppx - dirx);
    vaz += Intermediate * (ppy - diry);
  }

  return [
    vax / wt,
    vay / wt,
    vaz / wt
  ];
}

function Mountain(px, py, s, InputScale, DerivativeScale){
  let nx = 0.;
  let ny = 0.;
  let nz = 0.;

  let nf = 1.;
  let na = .6;

  for(let i = 0; i < 2; ++i){
    const CalcNoise = DerivativeNoise((px * s * nf) * InputScale, (py * s * nf) * InputScale);
    nx += CalcNoise[0] * na * 1.;
    ny += CalcNoise[1] * na * nf * DerivativeScale;
    nz += CalcNoise[2] * na * nf * DerivativeScale;

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
    const CalcErosion = Erosion(px * f, py * f, dirx + hz, diry - hy);
    CalcErosion[0] *= a;
    CalcErosion[1] *= a * f;
    CalcErosion[2] *= a * f;

    hx += CalcErosion[0];
    hy += CalcErosion[1];
    hz += CalcErosion[2];

    a *= .4;
    f *= 2.;
  }

  return [
    smoothstep(-1., 1., nx) + hx * .05,
    (ny + hy) * .5 + .5,
    (nz + hz) * .5 + .5
  ];
}

export default function GetHeight(X, Z) {
  //if((((Math.floor(X / 256.) - 16) & 31) - 16) === 15 || (((Math.floor(Z / 256.) - 16) & 31) - 16) === 15) return 9999.;
  const ErosionScale = 10.;
  const TerrainScale = 1000.;
  const InputScale = 1.;
  const DerivativeScale = 1.;
  const TerrainHeight = 1250.;

  const Factor = 1.;//Math.max(0., 1. - Math.hypot(X, Z) / 2000.);

  return Factor * Mountain(X * ErosionScale / TerrainScale / InputScale, Z * ErosionScale / TerrainScale / InputScale, 1. / ErosionScale, InputScale, DerivativeScale)[0] * TerrainHeight;

};*/



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
function DerivativeNoise(x, y){
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fract(x);
  const fy = fract(y);

  const ux = fx * fx * fx * (fx * (fx * 6. - 15.) + 10.);
  const uy = fy * fy * fy * (fy * (fy * 6. - 15.) + 10.);

  const dux = 30. * fx * fx * (fx * (fx - 2.) + 1.);
  const duy = 30. * fy * fy * (fy * (fy - 2.) + 1.);

  const ga = Hash(ix + 0., iy + 0.);
  const gb = Hash(ix + 1., iy + 0.);
  const gc = Hash(ix + 0., iy + 1.);
  const gd = Hash(ix + 1., iy + 1.);

  const va = ga[0] * (fx - 0.) + ga[1] * (fy - 0.);
  const vb = gb[0] * (fx - 1.) + gb[1] * (fy - 0.);
  const vc = gc[0] * (fx - 0.) + gc[1] * (fy - 1.);
  const vd = gd[0] * (fx - 1.) + gd[1] * (fy - 1.);

  return [
    (va + ux * (vb - va) + uy * (vc - va) + ux * uy * (va - vb - vc + vd)),
    ga[0] + ux * (gb[0] - ga[0]) + uy * (gc[0] - ga[0]) + ux * uy * (ga[0] - gb[0] - gc[0] + gd[0]) + dux * (uy * (va - vb - vc + vd) + vb - va),
    ga[1] + ux * (gb[1] - ga[1]) + uy * (gc[1] - ga[1]) + ux * uy * (ga[1] - gb[1] - gc[1] + gd[1]) + duy * (ux * (va - vb - vc + vd) + vc - va)
  ];
}

//const Weighting = WeightTowardsSharp(0., .3);

function WeightingTowardsZero(x){ //2022-11-22
  return (.5 - ((x ** 2. - 1.) / (x ** 2. + 1.)) / 2.) ** (Math.abs(x * 20.) + 40.);
}

function NoiseFunction(x, y){
  x *= 8.;
  y *= 8.;
  //const Second = Math.max(0., Simplex.simplex2(x / 20., y / 20.)) * WeightingTowardsZero(Simplex.simplex2(x / 6., y / 6.)) * 2.1;
  //return Simplex.simplex2(x, y) / 2. * Math.max(0.3, 1. - Second) + Second;

  let Value = NewSimplex(x, y);
  //const Booster = Math.abs(Simplex.simplex2(x / 10., y / 10.));
  //if(Booster > 0.65){
  //  const Smoothstep = smoothstep(0.65, 0.98, Booster)
  //  Value = Value * (1. - Smoothstep) + 1.7 * Smoothstep;
  //}
  return Value;

  //return  + (1. + ( ** 5.) * 4.);
}

function SimplexDerivativeNoise(x, y){
  x /= 32.;
  y /= 32.;
  const Value = NoiseFunction(x, y);
  return [
    Value,
    (NoiseFunction(x + .01, y) - NoiseFunction(x - .01, y)) * 50.,
    (NoiseFunction(x, y + .01) - NoiseFunction(x, y - .01)) * 50.
  ];
}




function Erosion(Samples, px, py, dirx, diry){
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
    const CalcHash = Hash(ix - i, iy - j);
    //CalcHash[0] *= .5;
    //CalcHash[1] *= .5;

    const ppx = fx + i + CalcHash[0];
    const ppy = fy + j + CalcHash[1];

    const Distance = ppx * ppx + ppy * ppy;
    const Worley = Math.exp(-Distance * 2.);
    wt += Worley;

    const Magnitude = dirx * ppx + diry * ppy;
    const Intermediate = Math.cos(Magnitude * f) * Worley;
    vax += Intermediate;
    vay += Intermediate * (ppx - dirx);
    vaz += Intermediate * (ppy - diry);
  }

  return [
    vax / wt,
    vay / wt,
    vaz / wt
  ];
}

function Mountain(px, py, s, InputScale, DerivativeScale){
  let nx = 0.;
  let ny = 0.;
  let nz = 0.;

  let nf = 1.;
  let na = .6;

  for(let i = 0; i < 1; ++i){
    const CalcNoise = SimplexDerivativeNoise((px * s * nf) * InputScale, (py * s * nf) * InputScale);
    nx += CalcNoise[0] * na * 1.;
    ny += CalcNoise[1] * na * nf * DerivativeScale;
    nz += CalcNoise[2] * na * nf * DerivativeScale;

    na *= .5;
    nf *= 2.;
  }

  const dirx = nz;
  const diry = ny;

  let hx = 0.;
  let hy = 0.;
  let hz = 0.;

  let a = .7 * smoothstep(.3, .5, nx * .5 + .5);
  let f = 1.;

  for(let i = 0; i < 2; ++i){
    const CalcErosion = Erosion(3, px * f, py * f, dirx * .197 + hz, diry * .197 - hy);
    CalcErosion[0] *= a;
    CalcErosion[1] *= a * f;
    CalcErosion[2] *= a * f;

    hx += CalcErosion[0];
    hy += CalcErosion[1];
    hz += CalcErosion[2];

    a *= .4;
    f *= 2.;
  }

  return [
    (nx * 2. + 1.) * .1 + ((nx * 2. + 1.)) * (1. + hx) * .1,
    (nz + hz) * .5 + .5,
    (ny + hy) * .5 + .5
  ];
}

function NormalMountain(px, py, s, InputScale, DerivativeScale){
  let nx = 0.;
  let ny = 0.;
  let nz = 0.;

  let nf = 1.;
  let na = .6;

  for(let i = 0; i < 2; ++i){
    const CalcNoise = DerivativeNoise((px * s * nf) * InputScale, (py * s * nf) * InputScale);
    nx += CalcNoise[0] * na * 1.;
    ny += CalcNoise[1] * na * nf * DerivativeScale;
    nz += CalcNoise[2] * na * nf * DerivativeScale;

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
    const CalcErosion = Erosion(2, px * f, py * f, dirx + hz, diry - hy);
    CalcErosion[0] *= a;
    CalcErosion[1] *= a * f;
    CalcErosion[2] *= a * f;

    hx += CalcErosion[0];
    hy += CalcErosion[1];
    hz += CalcErosion[2];

    a *= .4;
    f *= 2.;
  }

  return [
    smoothstep(-1., 1., nx) + hx * .05,
    (ny + hy) * .5 + .5,
    (nz + hz) * .5 + .5
  ];
}

function Mountain2(px, py, nx, ny, nz, InputScale, DerivativeScale){
  nx *= .6;
  ny *= .6;
  nz *= .6;

  const dirx = nz;
  const diry = ny;

  let hx = 0.;
  let hy = 0.;
  let hz = 0.;

  let a = .7 * smoothstep(.3, .5, nx * .5 + .5);
  let f = 1.;

  for(let i = 0; i < 5; ++i){
    const CalcErosion = Erosion(3, px * f, py * f, dirx * .197 + hz, diry * .197 - hy);
    CalcErosion[0] *= a;
    CalcErosion[1] *= a * f;
    CalcErosion[2] *= a * f;

    hx += CalcErosion[0];
    hy += CalcErosion[1];
    hz += CalcErosion[2];

    a *= .4;
    f *= 2.;
  }

  return hx;
}



function DerivativeNoise2(X, Z){

  const Octaves = new Float32Array(16);
  for(let i = 0; i < 15; i++){
    Octaves[i] = Simplex.simplex3(X / 2 ** i, Z / 2 ** i, 1536);
  }

  let OctaveSum11_15 = 0.;
  for(let i = 0, Min = 11, Max = 15, Count = Max - Min; i < Count; ++i) OctaveSum11_15 += Octaves[i + Min] / (2 ** (Count - i));

  let OctaveSum1_5 = 0.;
  for(let i = 0, Min = 1, Max = 5, Count = Max - Min; i < Count; ++i) OctaveSum1_5 += Octaves[i + Min] / (2 ** (Count - i));

  let OctaveSum3_9 = 0.;
  for(let i = 0, Min = 3, Max = 9, Count = Max - Min; i < Count; ++i) OctaveSum3_9 += Octaves[i + Min] / (2 ** (Count - i));



  //const Worley1 = WorleyNoise.Euclidean(X / 300. + OctaveSum1_5 / 45., Z / 300. + OctaveSum1_5 / 45., 0.);

  const DistributionNoise = Simplex.simplex3(X / 32768, Z / 32768, 1542);

  const CliffNoise1 = Simplex.simplex3(X / 512., Z / 512., 1539) * .75 * OctaveSum1_5 * .25;
  const CliffNoise2 = Simplex.simplex3(X / 256., Z / 256., 1539.4);

  const Worley2 = WorleyNoise.FasterNoise(X / 2000., Z / 2000.);// + WorleyNoise.FasterNoise(X / 3000., Z / 3000.);

  const Other1 = Simplex.simplex3(X / 16384., Z / 16384., 1555);
  const Other2 = Simplex.simplex3(X / 4096., Z / 4096., 1555);
  const Other3 = Simplex.simplex3(X / 16384., Z / 16384., 1555.5);

  let MountainMap = WeightTowards(.47 + .10 * Other3, .10 + .06 * (Other1 * .8 + Other2 * .2), .57)(OctaveSum11_15);

  //MountainMap *= Worley2;
  //MountainMap += WeightTowardsAsymmetric(.15, .0094)(MountainMap) * .0106 * Math.max(0., Octaves[8] * 2. - 1.);
  //MountainMap += WeightTowardsAsymmetric(.43, .0094)(1. - OctaveSum6_15) * .0106 * Math.min(1., Math.max(0., 2. - MountainMap * 5.));// * Math.max(0., Octaves[9] * 2. - 1.);
  //MountainMap += WeightTowardsAsymmetric(.38, .0094)(1. - OctaveSum6_15) * .0106 * Math.min(1., Math.max(0., 3.3 - MountainMap * 7.)) * (CliffNoise2 + 1.) / 2.;
  //MountainMap += WeightTowardsAsymmetric(.33, .0096)(1. - OctaveSum6_15) * CliffNoise1 * .0106;
  //MountainMap += Cliffs1(MountainMap) * .039 * OctaveSum3_9 * Math.max(0., Math.min(1.6 - 2. * MountainMap));

  return MountainMap;
}



function MountainNoise(x, y){
  return Simplex.simplex2(x, y);// * Math.max(0., 1. - Math.hypot(x, y) / 10.);
}



function DerivativeNoise_(x, y){
  const Value = MountainNoise(x, y);
  return [
    Value,
    (MountainNoise(x + .01, y) - MountainNoise(x - .01, y)) * -50.,
    (MountainNoise(x, y + .01) - MountainNoise(x, y - .01)) * -50.
  ];
}



export default function GetHeight(X, Z){
  //X /= 6.;
  //Z /= 6.;
  //if((((Math.floor(X / 256.) - 16) & 31) - 16) === 15 || (((Math.floor(Z / 256.) - 16) & 31) - 16) === 15) return 9999.;
  //const ErosionScale = 10.;
  //const TerrainScale = 2000.;
  //const InputScale = 2.7;
  //const DerivativeScale = .9;
  //const TerrainHeight = 2200.;

  //return (Simplex.simplex2(X / 10000., Z / 10000.) + 1.) * 2400.;
  /*let Result1;
  {

    const ErosionScale = 1.;
    const TerrainScale = 2000.;
    const InputScale = 1.;
    const DerivativeScale = 1.;

    //Math.max(0., 1. - Math.hypot(X, Z) / 2000.);
    //return SimplexDerivativeNoise(X / TerrainScale, Z / TerrainScale)[0] * TerrainHeight;
    //return 2200. * (DerivativeNoise_(X / 1000., Z / 1000.)[1] / 2. + .5);
    Result1 = Mountain(X * ErosionScale / TerrainScale / InputScale, Z * ErosionScale / TerrainScale / InputScale, 1. / ErosionScale, InputScale, DerivativeScale)[0];
  }*/

  let Result2;
  {
    const ErosionScale = 10.;
    const TerrainScale = 2000.;
    const InputScale = 1.;
    const DerivativeScale = 1.;
    const TerrainHeight = 2700.;

    Result2 = NormalMountain(X * ErosionScale / TerrainScale / InputScale, Z * ErosionScale / TerrainScale / InputScale, 1. / ErosionScale, InputScale, DerivativeScale)[0] * TerrainHeight;
  }

  return /*Result1 * */Result2;
};
/*

function SerpentineWeightingFunction(Value, Exponent){
  const Intermediate = (2 * Value - 1) / ((2 * Value - 1) ** 2 + 1);
  return (Math.sign(Intermediate) * Math.abs(Intermediate) ** Exponent + 0.5 ** Exponent) / Exponent ** (-Exponent);
}

function ExponentialWeightingFunction(Value, Exponent){
  return Math.expm1(Math.pow(Value, Exponent)) / Math.expm1(1);
}

const SerpentineWeighting = [];
for(let i = 0; i < 150; i++){
  SerpentineWeighting[i] = new Float32Array(501);
  for(let j = 0, Weighting = SerpentineWeighting[i]; j < 501; j++){
    Weighting[j] = SerpentineWeightingFunction(j / 500, i / 150);
  }
}

const ExponentialWeighting = [];
for(let i = 250; i < 450; i++){
  ExponentialWeighting[i] = new Float32Array(771);
  for(let j = 0, Weighting = ExponentialWeighting[i]; j < 771; j++){
    Weighting[j] = ExponentialWeightingFunction(j / 500, i / 150);
  }
}

//Less expensive approximation functions:

function GetSerpentineWeightingAt(Value, Exponent){
  let ValueIndex = Value * 100;
  let ExponentIndex = Exponent * 500;
  let ValueOffset = ValueIndex - (ValueIndex >>= 0);
  let ExponentOffset = ExponentIndex - (ExponentIndex >>= 0);
  //Precalculate derivatives?
  let CurrentValue = SerpentineWeighting[ValueIndex][ExponentIndex];
  return CurrentValue + (ValueOffset * (SerpentineWeighting[ValueIndex + 1][ExponentIndex] - CurrentValue) + ExponentOffset * (SerpentineWeighting[ValueIndex][ExponentIndex + 1] - CurrentValue));
}

function GetExponentialWeightingAt(Value, Exponent){
  let ValueIndex = Value * 100;
  let ExponentIndex = Exponent * 500;
  let ValueOffset = ValueIndex - (ValueIndex >>= 0);
  let ExponentOffset = ExponentIndex - (ExponentIndex >>= 0);
  //Precalculate derivatives?
  let CurrentValue = ExponentialWeighting[ValueIndex][ExponentIndex];
  return CurrentValue + (ValueOffset * (ExponentialWeighting[ValueIndex + 1][ExponentIndex] - CurrentValue) + ExponentOffset * (ExponentialWeighting[ValueIndex][ExponentIndex + 1] - CurrentValue));
}

function GetDerivedArcTangentWeightingAt(Value){
  return 1 / (Value ** 2 + 1);
}

function WeightTowards(PeakX, Distribution, Exponent){
  return function(X){
    return GetDerivedArcTangentWeightingAt((X - PeakX) / Distribution) ** Exponent;
  };
}

function GetSharpWeightingAt(Value){
  const z = 1;
  const f = 1;
  return (z ** 2 + 1) / ((Math.abs(f * Value) + z) ** 2 + 1);
}

function GetAsymmetricWeightingAt1(Value){
  return 2. / (1. + (Math.abs(((2. - Math.sign(Value)) * Value) ** (1.75 + Math.sign(Value) * .75)) + 1.) ** 2.);
}

function GetAsymmetricWeightingAt(Value){
  return 2. / (1. + (Math.abs((2. - 3. * Math.sign(Value)) * Value) + 1.) ** 2.);
}

function WeightTowardsSharp(PeakX, Distribution){
  return function(X){
    return GetSharpWeightingAt((X - PeakX) / Distribution);
  };
}

function WeightTowardsAsymmetric(PeakX, Distribution){
  return function(X){
    return GetAsymmetricWeightingAt((X - PeakX) / Distribution);
  };
}

function GetRepeatingSharpWeightingAt(Value){
  return 1 - Math.abs(Math.sin(Value));
}

function WeightTowardsRepeatingSharp(PeakX, Distribution){
  return function(X){
    return GetRepeatingSharpWeightingAt((X - PeakX) / Distribution);
  };
}

function GetRepeatingSharpWeightingAt2(Value){
  return 1 - Math.abs(Math.sin(.25 * Value));
}

function WeightTowardsRepeatingSharp2(PeakX, Distribution){
  return function(X){
    return GetRepeatingSharpWeightingAt2((X - PeakX) / Distribution);
  };
}

let RockyWeighting = WeightTowards(1000, 200, 1);
let SmoothShoreWeighting = WeightTowards(-0, 30, 1);
let MountainWeighting = WeightTowards(300, 200, 1);
let SharperMountainWeighting = WeightTowards(300, 50, 1);
let OtherMountainWeighting = WeightTowards(1200, 300, 1);
let SmootherValleyWeighting = WeightTowards(0, 150, 1);
let OneWeighting = WeightTowards(1.02, 0.17, 1);
let OneSmallerWeighting = WeightTowards(1.01, 0.05, 1);

let Weighting150 = WeightTowardsSharp(150, 20);
let Weighting100 = WeightTowardsSharp(100, 25);

let Things = WeightTowardsRepeatingSharp(0, 0.1);

let Cliffs1 = WeightTowardsRepeatingSharp(0., .0251);
const Cliffs2 = WeightTowardsRepeatingSharp2(0., .00251);


const Weighting1 = WeightTowards(.47, .12, .57);
const Weighting2 = WeightTowardsSharp(.4, .04);

const Weighting15 = WeightTowardsSharp(.15, .0014);

export default function GetHeight(X, Z){
  X -= 1024.;
  Z -= 1024.;

  const Octaves = new Float32Array(16);
  for(let i = 0; i < 15; i++){
    Octaves[i] = Simplex.simplex3(X / 2 ** i, Z / 2 ** i, 1536);
  }

  let OctaveSum6_15 = 0.;
  for(let i = 0, Min = 6, Max = 15, Count = Max - Min; i < Count; ++i) OctaveSum6_15 += Octaves[i + Min] / (2 ** (Count - i));

  //let OctaveSum1_5 = 0.;
  //for(let i = 0, Min = 1, Max = 5, Count = Max - Min; i < Count; ++i) OctaveSum1_5 += Octaves[i + Min] / (2 ** (Count - i));

  let OctaveSum3_9 = 0.;
  for(let i = 0, Min = 3, Max = 9, Count = Max - Min; i < Count; ++i) OctaveSum3_9 += Octaves[i + Min] / (2 ** (Count - i));



  //const Worley1 = WorleyNoise.Euclidean(X / 300. + OctaveSum1_5 / 45., Z / 300. + OctaveSum1_5 / 45., 0.);

  //const DistributionNoise = Simplex.simplex3(X / 32768, Z / 32768, 1542);
//
  //const CliffNoise1 = Simplex.simplex3(X / 512., Z / 512., 1539) * .75 * OctaveSum1_5 * .25;
  //const CliffNoise2 = Simplex.simplex3(X / 256., Z / 256., 1539.4);

  const Worley2 = WorleyNoise.FasterNoise(X / 2000., Z / 2000.);// + WorleyNoise.FasterNoise(X / 3000., Z / 3000.);

  const Other1 = Simplex.simplex3(X / 16384., Z / 16384., 1555);
  const Other2 = Simplex.simplex3(X / 4096., Z / 4096., 1555);
  const Other3 = Simplex.simplex3(X / 16384., Z / 16384., 1555.5);

  let MountainMap = 1;//WeightTowards(.47 + .10 * Other3, .10 + .06 * (Other1 * .8 + Other2 * .2), .57)(OctaveSum6_15);


  MountainMap *= Worley2;
  //const Before = MountainMap;
  //MountainMap += WeightTowardsAsymmetric(.38, .0094)(1. - OctaveSum6_15) * .0106 * Math.min(1., Math.max(0., 3.3 - MountainMap * 7.)) * (CliffNoise2 + 1.) / 2.;
  //const After = MountainMap;

  //This on its own produces pretty interesting shapes when the absolute value is taken
  MountainMap += Cliffs1(MountainMap) * .039 * OctaveSum3_9 * Math.max(0., 1.6 - 2. * MountainMap);




  return MountainMap * 2200.;// / 4.;
};
 */