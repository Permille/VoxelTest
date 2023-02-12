import HTML from "./index.html";
import CSS from "./style.css";
import WindowFrame from "../Libraries/WindowFrame/WindowFrame.mjs";
import SVGGraph from "../Libraries/SVGGraph/SVGGraph.mjs";
import * as M from "./../Constants/Memory.mjs";
export default class Inspector{
  constructor(){
    [this.Element, this.ID] = HTML("Inspector");
    CSS("Inspector");
    this.Frame = new WindowFrame(600, 400, false);
    this.Frame.SetBody(this.Element)

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
          let LastUpdate = 0;
          let LastCubes = 0;
          return function(){
            const Now = window.performance.now();
            const Cubes = Atomics.load(Main.Memory.u32, M.I_INFO_LOADED_CUBES_COUNTER);
            const CubesPerSecond = Math.floor((Cubes - LastCubes) / (Now - LastUpdate) * 1000.);
            LastUpdate = Now;
            LastCubes = Cubes;
            return CubesPerSecond;
          };
        }(),
        "Colour": "rgb(39,109,255)",
        "UpdateIntervalOptions": {"DefaultValue": 100}
      })
    ];
    window.setTimeout(function(){
      for(const Graph of this.Graphs) this.GraphSection.appendChild(Graph.Element);
    }.bind(this), 1);
  }
};