import WindowFrame from "../Libraries/WindowFrame/WindowFrame.mjs";
import SVGGraph from "../Libraries/SVGGraph/SVGGraph.mjs";
import DeferredPromise from "../Libraries/DeferredPromise.mjs";
export default class Inspector{
  static GraphID = 0;
  constructor(){
    this.Frame = new WindowFrame;
    this.Graphs = [];
    this.Graph = new SVGGraph(() => Main.Renderer.FPS, InitialisedMain);
    window.setTimeout(function(){
      this.Frame.SetBody(this.Graph.Element);
    }.bind(this), 1);
  }
};