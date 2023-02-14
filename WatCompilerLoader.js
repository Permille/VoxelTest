//Asynchronous loaders: https://webpack.js.org/api/loaders/#asynchronous-loaders
const fs = require("fs");
const path = require("path");
module.exports = function(RawContents, Map, Meta){
  const callback = this.async();
  const OwnFolder = this.context;
  require("wabt")().then(function(wabt){
    const Includes = [...RawContents.matchAll(/^;;#include ([a-zA-Z_]?[a-zA-Z0-9_]*) ?"(.*)".*$/mg)];
    let Contents = RawContents;
    for(const [IncludeText, Prefix, Path] of Includes){
      this.addDependency(path.join(OwnFolder, Path));
      try{
        const FileContents = fs.readFileSync(path.join(OwnFolder, Path), "utf8");
        if(/.*\.mjs$/.test(Path) !== null){
          //Including constants
          const Constants = [...FileContents.matchAll(/^export (let|const) ([a-zA-Z0-9_]+) ?= ?([abcdefox_ABCDEFOX\.0-9]+).*$/mg)];
          for(const [a, b, _Name, Value] of Constants){
            const Name = Prefix + _Name;
            Contents = Contents.replaceAll(Name, Value);
          }
        } else if(/.*\.wat$/.test(Path) !== null){
          console.warn("[WatCompiler] Not implemented");
        } else{
          console.warn("[WatCompiler] Unrecognised import: Path");
        }
      } catch(e){
        console.warn("[WatCompiler] Error");
        console.warn(e);
      }
    }
    try{
      const Module = wabt.parseWat("Test.wasm", Contents, {
        "simd": true,
        "threads": true,
        "multi_value": true,
        "bulk_memory": true
      });
      const Buffer = Module.toBinary({}).buffer;
      callback(null, "export default new WebAssembly.Module(new Uint8Array([" + Buffer + "]).buffer);", Map, Meta);
    } catch(e){
      callback(null, "Error while compiling wat: " + e, Map, Meta);
    }
  }.bind(this));
};