import MemoryManager from "./MemoryManager.mjs";
import * as M from "./Constants/Memory.mjs";
import * as W from "./Constants/Worker.mjs";
import Camera from "./Controls/Camera.mjs";
import KeyboardControls from "./Controls/KeyboardControls.mjs";
import MouseControls from "./Controls/MouseControls.mjs";
import Renderer from "./Renderer.mjs";

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




class Main{
  constructor(){
    this.MemorySize = 1 << 28; //256 MB
    this.MemoryBuffer = new SharedArrayBuffer(this.MemorySize);
    this.Data = new Uint32Array(this.MemoryBuffer);
    this.Memory = new MemoryManager(this.MemoryBuffer);
    this.Memory.InitialiseMemory();

    const Canvas = document.createElement("canvas");
    document.body.appendChild(Canvas);
    document.body.style.margin = "0";
    Canvas.style.display = "block";

    this.Camera = new Camera;
    this.Renderer = new Renderer(Canvas, this.Camera, this.Memory);
    this.KeyboardControls = new KeyboardControls(this.Camera);
    this.MouseControls = new MouseControls(this.Camera, Canvas);

    this.Workers = [];
    for(let i = 0; i < 4; ++i){
      const iWorker = new Worker("./Worker.mjs", {"name": "Worker1", "type": "module"});
      iWorker.onmessage = function(Event){
        console.log(Event);
      };
      iWorker.onerror = function(Event){
        console.log(Event);
      };
      iWorker.onmessageerror = function(Event){
        console.log(Event);
      };
      iWorker.postMessage({
        "Request": W.INITIALISE,
        "MemoryBuffer": this.MemoryBuffer,
        "ID": 1
      });
      this.Workers.push(iWorker);
    }



    for(let z = 0; z < 31; ++z) for(let x = 0; x < 31; ++x){
      this.Workers[(z * 31 + x) & 3].postMessage({
        "Request": W.LOAD_REGION,
        "x128": x,
        "z128": z
      });
    }

    void function Load(){
      window.requestAnimationFrame(Load.bind(this));
      this.Renderer.Render();
    }.bind(this)();
  }

  UpdateStatistics(){
    const Text = `${this.Frames} fps`;
    FPS.innerText = Text;
    this.Frames = 0;
    return Text;
  }
}

window.Main = new Main;