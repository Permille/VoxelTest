import "./index.html?copy";
import "./Escape.ttf?copy";
import "./GlobalStyle/GlobalStyle.mjs";
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
import Inspector from "./Inspector/Inspector.mjs";
import {LOAD_REGIONS} from "./Constants/Worker.mjs";
import {I_LOADED_VOLUME_BOUNDS_START} from "./Constants/Memory.mjs";
import WebGPURenderer from "./WebGPURenderer.mjs";

class Main{
  constructor(){
    this.MemorySize = 1 << 27;
    this.WasmMemory = new WebAssembly.Memory({"initial": this.MemorySize >> 16, "maximum": this.MemorySize >> 16, "shared": true});
    this.MemoryBuffer = this.WasmMemory.buffer;
    this.Memory = new MemoryManager(this.MemoryBuffer);
    this.Memory.InitialiseMemory();

    const Canvas = document.createElement("canvas");
    document.body.appendChild(Canvas);
    document.body.style.margin = "0";
    Canvas.style.display = "block";

    this.Camera = new Camera;
    //this.Renderer = new Renderer(Canvas, this.Camera, this.Memory);
    this.Renderer = new WebGPURenderer(Canvas, this.Camera, this.Memory);
    this.Renderer.Initialise();
    this.KeyboardControls = new KeyboardControls(this.Camera);
    this.MouseControls = new MouseControls(this.Camera, Canvas);
    this.DebugInfo = new DebugInfo;

    this.Camera.RotationX = 8.6109999999999887;//8.619000000000012;
    this.Camera.RotationY = 1.0640000000000025;//0.5480000000000046;
    this.Camera.PositionX = 21.158676800640972;//-10.1831588486443;
    this.Camera.PositionY = 1306.6745001811541;//1110.6695000071086;
    this.Camera.PositionZ = 29.649728025836264;//-10.6725504788376;
    this.KeyboardControls.MovementSpeed = 1.;

    //this.Inspector = new Inspector;

    this.Workers = [];
    for(let i = 0; i < 1; ++i){
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
        "WasmMemory": this.WasmMemory,
        "ID": i
      });
      this.Workers.push(iWorker);
    }

    //Set loaded region
    this.Memory.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MIN_X)] = 0;
    this.Memory.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MIN_Y)] = 0;
    this.Memory.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MIN_Z)] = 0;
    this.Memory.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MAX_X)] = 31;
    this.Memory.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MAX_Y)] = 31;
    this.Memory.u32[M.I_LOADED_VOLUME_BOUNDS_START + (0 << 3 | M.MAX_Z)] = 31;

    //Send message to workers
    for(let i = 0; i < 1; ++i){
      this.Workers[i].postMessage({
        "Request": W.LOAD_REGIONS
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
