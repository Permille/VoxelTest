import "./index.html?copy";
import "./Escape.ttf?copy";
import MemoryManager from "./MemoryManager.mjs";
import * as M from "./Constants/Memory.mjs";
import * as W from "./Constants/Worker.mjs";
import Camera from "./Controls/Camera.mjs";
import KeyboardControls from "./Controls/KeyboardControls.mjs";
import MouseControls from "./Controls/MouseControls.mjs";
import Renderer from "./Renderer.mjs";
import {AddEventListener} from "./Events.mjs";
import DebugInfo from "./DebugInfo/DebugInfo.mjs";
import DeferredPromise from "./Libraries/DeferredPromise.mjs";

class Main{
  constructor(){
    this.MemorySize = 1 << 28; //256 MB
    this.MemoryBuffer = new SharedArrayBuffer(this.MemorySize);
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
    this.DebugInfo = new DebugInfo;

    this.Workers = [];
    for(let i = 0; i < 4; ++i){
      const iWorker = new Worker(new URL("./Worker.mjs", import.meta.url), {"name": "Worker" + i, "type": "module"});
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
        "ID": i
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
  GetUsedMemory(){

  }
}


AddEventListener(window, "load", function(){
  window.InitialisedMain = new DeferredPromise;
  window.Main = new Main;
  InitialisedMain.resolve();
});
