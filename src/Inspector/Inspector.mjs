import HTML from "./index.html";
import CSS from "./style.css";
import WindowFrame from "../Libraries/WindowFrame/WindowFrame.mjs";
import SVGGraph from "../Libraries/SVGGraph/SVGGraph.mjs";
import * as M from "./../Constants/Memory.mjs";
import {AddEventListener, RemoveEventListener} from "../Events.mjs";
export default class Inspector{
  constructor(){
    [this.Element, this.ID] = HTML("Inspector");
    CSS("Inspector");
    this.IsDestroyed = false;
    this.Frame = new WindowFrame(600, 400, false);
    this.Frame.SetTitle("Inspector");
    this.Frame.SetBody(this.Element);

    this.CloseEventID = AddEventListener(this.Frame.Events, "Close", function(){
      this.Destroy();
    }.bind(this));



    this.GraphSection = this.Element.querySelector(`#${this.ID}-Graphs`);

    this.Graphs = [
      new SVGGraph({
        "Title": "Frames per second",
        "Unit": "fps",
        "GeneratorFunction": () => Main.Renderer.FPS,
        "Colour": "rebeccapurple"
      }),
      new SVGGraph({
        "Title": "Milliseconds per frame",
        "Unit": "ms",
        "GeneratorFunction": () => Main.Renderer.FrameTime,
        "Colour": "purple",
        "UpdateIntervalOptions": {"DefaultValue": 16}
      }),
      new SVGGraph({
        "Title": "Memory utilisation",
        "Unit": "MB",
        "GeneratorFunction": () => Main.Memory.GetUsedMemory() / 1048576,
        "Colour": "rgb(0, 175, 255)",
        "UpdateIntervalOptions": {"DefaultValue": 16}
      }),
      new SVGGraph({
        "Title": "Generated cubes per second",
        "Unit": "cubes / s",
        "GeneratorFunction": function(){
          let LastUpdate = -1;
          let LastCubes = -1;
          return function(){
            const Now = window.performance.now();
            const Cubes = Atomics.load(Main.Memory.u32, M.I_INFO_LOADED_CUBES_COUNTER);
            const CubesPerSecond = Math.floor((Cubes - LastCubes) / (Now - LastUpdate) * 1000.);
            let Uninitialised = LastUpdate === -1;
            LastUpdate = Now;
            LastCubes = Cubes;
            return Uninitialised ? 0 : CubesPerSecond;
          };
        }(),
        "Colour": "rgb(39,109,255)",
        "UpdateIntervalOptions": {"DefaultValue": 100}
      })
    ];
    //I need to use setTimeout because otherwise the IntersectionObserver doesn't work
    window.setTimeout(async function(){
      await window.InitialisedMain;
      for(const Graph of this.Graphs) this.GraphSection.appendChild(Graph.Element);
    }.bind(this));
  }
  Destroy(){
    this.IsDestroyed = true;
    RemoveEventListener(this.CloseEventID);
    for(const Graph of this.Graphs){
      Graph.Destroy();
    }
  }
};