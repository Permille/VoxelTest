import WindowFrame from "../Libraries/WindowFrame/WindowFrame.mjs";
import SVGGraph from "../Libraries/SVGGraph/SVGGraph.mjs";
export default class Inspector{
  constructor(){
    this.Frame = new WindowFrame;
    this.Graph = new SVGGraph;
    this.Frame.SetBody(this.Graph.Element);
    this.InitialiseDependencies();
  }
  async InitialiseDependencies(){
    await InitialisedMain;
    void function Load(){
      window.requestAnimationFrame(Load.bind(this));
      this.Graph.Data.push([Date.now(), /*Math.sin(window.performance.now() / 1000) < 0. ? NaN : */Main.Camera.PositionY]);
    }.bind(this)();
    void function Load(){
      window.requestAnimationFrame(Load.bind(this));
      this.Graph.Render();
    }.bind(this)();
  }
};