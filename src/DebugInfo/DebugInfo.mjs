import HTML from "./index.html";
import CSS from "./style.css";
import {AddEventListener} from "../Events.mjs";
export default class DebugInfo{
  constructor(){
    [this.Element, this.ID] = HTML("DebugInfo");
    CSS("DebugInfo");
    document.body.appendChild(this.Element);
    this.Handlers = [];
    this.LastUpdate = 0;

    this.InitialiseDependencies();
  }
  async InitialiseDependencies(){
    await InitialisedMain;
    AddEventListener(Main.Renderer.Events, "BeforeRender", function(){
      const Now = window.performance.now();
      //if(Math.floor(this.LastUpdate / 1000.) === Math.floor(Now / 1000.)) return;
      this.LastUpdate = Now;
      this.Update();
    }.bind(this));
  }
  Add(Handler){
    const Element = document.createElement("p");
    this.Element.appendChild(Element);
    this.Handlers.push([Element, Handler]);
  }
  Update(){
    for(const [Element, Handler] of this.Handlers) Element.textContent = Handler();
  }
};