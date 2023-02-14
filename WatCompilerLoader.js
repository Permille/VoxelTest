//Asynchronous loaders: https://webpack.js.org/api/loaders/#asynchronous-loaders
const fs = require("fs");
const path = require("path");

function ProcessIncludes(Code, OwnFolder){
  const Includes = [...Code.matchAll(/^;;#include ([a-zA-Z_]?[a-zA-Z0-9_]*) ?"(.*)".*$/mg)];
  const Dependencies = [];
  for(const [IncludeText, Prefix, Path] of Includes){
    const AbsolutePath = path.join(OwnFolder, Path);
    Dependencies.push(AbsolutePath);
    try{
      const FileContents = fs.readFileSync(AbsolutePath, "utf8");
      if(/.*\.mjs$/.test(Path) !== null){
        //Including constants
        const Constants = [...FileContents.matchAll(/^export (let|const) ([a-zA-Z0-9_]+) ?= ?([abcdefox_ABCDEFOX\.0-9]+).*$/mg)];
        for(const [a, b, _Name, Value] of Constants){
          const Name = Prefix + _Name;
          Code = Code.replaceAll(Name, Value);
        }
      } else if(/.*\.wat$/.test(Path) !== null){
        console.warn("[WatCompiler] Not implemented");
      } else{
        console.warn("[WatCompiler] Unrecognised import: " + AbsolutePath);
      }
    } catch(e){
      console.warn("[WatCompiler] Error");
      console.warn(e);
    }
  }
  return [Code, Dependencies];
}

function ProcessUnrolls(Code){
  let NextOpen, NextClose;
  let Iterations = 0;
  while((NextOpen = /^;;#unroll ([0-9]+)$/mg.exec(Code)) !== null){
    if(Iterations++ > 65536) throw new Error("Too many iterations while unrolling, this is probably caused by a bug");
    const UnrollTimes = Number.parseInt(NextOpen[1]);
    const StartOpen = NextOpen;
    const StartIndex = NextOpen.index//This includes the ;;#unroll part
    let CurrentIndex = NextOpen.index + NextOpen[0].length;
    let CurrentIndexOffset = 0;
    let Depth = 1;
    do{
      CurrentIndexOffset += CurrentIndex;
      NextOpen = /^;;#unroll ([0-9]+)$/mg.exec(Code.substr(CurrentIndexOffset));
      NextClose = /^;;#end-unroll$/mg.exec(Code.substr(CurrentIndexOffset));
      if(NextClose === null) throw new Error("Unroll wasn't closed");
      const NextOpenIndex = NextOpen === null ? Infinity : (NextOpen.index + NextOpen[0].length);
      const NextCloseIndex = NextClose.index + NextClose[0].length;
      Depth += Math.sign(NextCloseIndex - NextOpenIndex);
      CurrentIndex = Math.min(NextOpenIndex, NextCloseIndex);
    } while(Depth > 0);
    const EndIndex = NextClose.index + NextClose[0].length + CurrentIndexOffset;
    const CopyCode = Code.substring(StartOpen.index + StartOpen[0].length, NextClose.index + CurrentIndexOffset);
    Code = Code.substring(0, StartOpen.index) + new Array(1 + UnrollTimes).fill("").join(CopyCode) + Code.substring(EndIndex);
  }
  return Code;
}

module.exports = function(RawContents, Map, Meta){
  const callback = this.async();
  require("wabt")().then(function(wabt){
    let [Contents, Dependencies] = ProcessIncludes(RawContents, this.context);
    for(const AbsolutePath of Dependencies) this.addDependency(AbsolutePath);
    try{
      Contents = ProcessUnrolls(Contents);
    } catch(e){
      callback(null, "Error while compiling wat: " + e, Map, Meta);
      return;
    }



    try{
      const Module = wabt.parseWat("Test.wasm", Contents, {
        "simd": true,
        "threads": true,
        "multi_value": true,
        "bulk_memory": true
      });
      const Buffer = Module.toBinary({}).buffer;
      callback(null, "export default new Uint8Array([" + Buffer + "]).buffer;", Map, Meta);
    } catch(e){
      callback(null, "Error while compiling wat: " + e, Map, Meta);
    }
  }.bind(this));
};