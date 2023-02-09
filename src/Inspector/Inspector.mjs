import WindowFrame from "../Libraries/WindowFrame/WindowFrame.mjs";
import SVGGraph from "../Libraries/SVGGraph/SVGGraph.mjs";
import DeferredPromise from "../Libraries/DeferredPromise.mjs";
export default class Inspector{
  static GraphID = 0;
  constructor(){
    this.Frame = new WindowFrame;
    this.Graphs = [];
    this.Graph = new SVGGraph;
    window.setTimeout(function(){
      this.Frame.SetBody(this.Graph.Element);
    }.bind(this), 1);

    this.InitialiseDependencies();
  }
  AddGraph(Settings){

  }
  async InitialiseDependencies(){
    await InitialisedMain;
    void function Load(){
      window.requestAnimationFrame(Load.bind(this));
      this.Graph.Render();
    }.bind(this)();

    const Generator = async function(){
      while(true){
        await new DeferredPromise({"Timeout": 1000, "Throw": false});
        this.Graph.AddDataPoint(Main.Renderer.FPS);
      }
    }.call(this);
  }
};