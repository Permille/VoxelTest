import HTML from "./index.html";
import CSS from "./style.css";
const NS = "http://www.w3.org/2000/svg";
export default class SVGGraph{
  constructor(){
    [this.Element, this.ID] = HTML("SVGGraph", undefined, true);
    CSS("SVGGraph");
    this.Data = [];

    this.Graph = this.Element.querySelector(`#${this.ID}-Graph`);
    this.Horizontal = this.Element.querySelector(`#${this.ID}-Horizontal`);
    this.Vertical = this.Element.querySelector(`#${this.ID}-Vertical`);
    this.Wrapper = this.Element.querySelector(`#${this.ID}-Wrapper`);

    this.GraphSegments = [];
    this.HorizontalSegments = [];
    this.VerticalSegments = [];

    this.IsVisible = false;
    this.IntersectionObserver = new IntersectionObserver(function(Entries){
      if(Entries[0].isIntersecting) {
        this.IsVisible = true;
      }
      else this.IsVisible = false;
    }.bind(this), {
      root: null,
      threshold: .1, // Requires that at least 10% of the element is in the viewport
    });
    this.IntersectionObserver.observe(this.Element);

    this.ValidXDivisions = [1, 2, 5, 10, 20, 30, 60, 90, 120, 300, 600, 900, 1800, 3600];

    this.TimeScale = 10000;
    this.Render();
  }
  AddDataPoint(DataPoint){
    this.Data.push([Date.now(), DataPoint]);
  }
  GetHorizontalLine(ID, Height, Text, Width){
    let GroupElement;
    let LineElement;
    let TextElement;

    if(this.HorizontalSegments.length <= ID){
      GroupElement = document.createElementNS(NS, "g");
      LineElement = document.createElementNS(NS, "line");
      TextElement = document.createElementNS(NS, "text");
      GroupElement.appendChild(LineElement);
      GroupElement.appendChild(TextElement);
      LineElement.setAttributeNS(null, "stroke", "#ffffff");
      LineElement.setAttributeNS(null, "stroke-opacity", ".2");
      LineElement.setAttributeNS(null, "stroke-width", "2");
      TextElement.setAttributeNS(null, "text-anchor", "end");
      TextElement.setAttributeNS(null, "fill", "#ffffff");
      this.Horizontal.appendChild(GroupElement);
      this.HorizontalSegments.push([GroupElement, LineElement, TextElement]);
    } else{
      [GroupElement, LineElement, TextElement] = this.HorizontalSegments[ID];
    }
    GroupElement.setAttributeNS(null, "transform", "translate(0, " + Height + ")");
    LineElement.setAttributeNS(null, "x1", "-5");
    LineElement.setAttributeNS(null, "x2", "" + Width);
    TextElement.setAttributeNS(null, "dy", "5");
    TextElement.setAttributeNS(null, "x", "-8");
    TextElement.textContent = Text;

    return [GroupElement, LineElement, TextElement];
  }
  GetVerticalLine(ID, Offset, Text){
    let GroupElement;
    let LineElement;
    let TextElement;

    if(this.VerticalSegments.length <= ID){
      GroupElement = document.createElementNS(NS, "g");
      LineElement = document.createElementNS(NS, "line");
      TextElement = document.createElementNS(NS, "text");
      GroupElement.appendChild(LineElement);
      GroupElement.appendChild(TextElement);
      LineElement.setAttributeNS(null, "stroke", "#ffffff");
      LineElement.setAttributeNS(null, "stroke-opacity", ".2");
      LineElement.setAttributeNS(null, "stroke-width", "2");
      LineElement.setAttributeNS(null, "y2", "205");
      TextElement.setAttributeNS(null, "text-anchor", "middle");
      TextElement.setAttributeNS(null, "fill", "#ffffff");
      TextElement.setAttributeNS(null, "dy", "18");
      TextElement.setAttributeNS(null, "y", "200");
      this.Vertical.appendChild(GroupElement);
      this.VerticalSegments.push([GroupElement, LineElement, TextElement]);
    } else{
      [GroupElement, LineElement, TextElement] = this.VerticalSegments[ID];
    }
    GroupElement.setAttributeNS(null, "transform", "translate(" + Offset + ", 0)");
    TextElement.textContent = Text;

    return [GroupElement, LineElement, TextElement];
  }
  GetGraphSegment(ID){
    if(this.GraphSegments.length <= ID){
      const FillElement = document.createElementNS(NS, "path");
      FillElement.setAttributeNS(null, "fill", "rebeccapurple");
      FillElement.setAttributeNS(null, "fill-opacity", ".5");
      const StrokeElement = document.createElementNS(NS,"path");
      StrokeElement.setAttributeNS(null, "stroke", "rebeccapurple");
      StrokeElement.setAttributeNS(null, "stroke-width", "3");
      StrokeElement.setAttributeNS(null, "fill", "none");
      this.GraphSegments.push([FillElement, StrokeElement]);
      this.Graph.appendChild(FillElement);
      this.Graph.appendChild(StrokeElement);
    }
    return this.GraphSegments[ID];
  }
  GetYStep(YRange){
    const RoughStep = YRange / 5.;

    const PossibleValues = [1, 2, 5, 10];
    const Logged = RoughStep / (10 ** Math.floor(Math.log10(RoughStep)));
    for (let i = 0; i < PossibleValues.length; ++i) {
      if (PossibleValues[i] < Logged && PossibleValues[i + 1] > Logged) {
        if (Math.abs(PossibleValues[i] - Logged) < Math.abs(PossibleValues[i + 1] - Logged)) {
          return PossibleValues[i] * 10 ** Math.floor(Math.log10(RoughStep));
        } else return PossibleValues[i + 1] * 10 ** Math.floor(Math.log10(RoughStep));
      }
    }
    return .2;
  }
  GetXStep(XRange){
    const RoughStep = XRange / 5.;

    const Logged = RoughStep / 1000.;
    for (let i = 0; i < this.ValidXDivisions.length - 1; ++i) {
      if (this.ValidXDivisions[i] < Logged && this.ValidXDivisions[i + 1] > Logged) {
        if (Math.abs(this.ValidXDivisions[i] - Logged) < Math.abs(this.ValidXDivisions[i + 1] - Logged)) {
          return this.ValidXDivisions[i] * 10 ** Math.floor(Math.log10(RoughStep));
        } else return this.ValidXDivisions[i + 1] * 10 ** Math.floor(Math.log10(RoughStep));
      }
    }
    return RoughStep;
  }
  Render(){
    if(!this.IsVisible) return;
    const Now = Date.now();
    let MinValue = Infinity;
    let MaxValue = -Infinity;
    for(let i = 0; i < this.Data.length; ++i){
      if(this.Data[i][0] < Now - this.TimeScale && (i === this.Data.length - 1 || this.Data[i + 1][0] < Now - this.TimeScale)){
        this.Data.shift();
        i--;
        continue;
      }
      if(Number.isNaN(this.Data[i][1])) continue;
      MinValue = Math.min(MinValue, this.Data[i][1]);
      MaxValue = Math.max(MaxValue, this.Data[i][1]);
    }
    if(MaxValue < MinValue){
      //Display some warning about there being no data
      return;
    }
    if(MaxValue === MinValue){
      MinValue -= .5;
      MaxValue += .5;
    }

    //Grid line rendering

    let MaxHorizontalTextLength = 0;

    const YRange = MaxValue - MinValue;

    const YStep = this.GetYStep(YRange);
    const HorizontalLines = [];
    for(let i = 0, CurrentY = Math.floor(MinValue / YStep) * YStep; i < 10; ++i, CurrentY += YStep){
      if(CurrentY < MinValue) continue;
      if(CurrentY > MaxValue) break;
      const Text = "" + ((Math.abs(CurrentY) < 1e-4 || Math.abs(CurrentY) > 1e6) && CurrentY !== 0 ? CurrentY.toExponential(5).replace(/\.([0-9]*[1-9])?0*/g, ".$1").replace(/\.e/, ".0e") : Number.parseFloat(CurrentY.toFixed(5)));
      MaxHorizontalTextLength = Math.max(MaxHorizontalTextLength, Text.length);
      HorizontalLines.push([((MaxValue - CurrentY) / YRange) * 200., Text]);
    }

    const GraphWidth = 400 - (Math.max(40, 10 + 7 * MaxHorizontalTextLength) - 40);
    this.Wrapper.setAttributeNS(null, "transform", "translate(" + Math.max(40, 10 + 7 * MaxHorizontalTextLength) + ", 0)");

    for(let i = 0; i < HorizontalLines.length; ++i){
      const Height = HorizontalLines[i][0];
      const Text = HorizontalLines[i][1];
      this.GetHorizontalLine(i, Height, Text, GraphWidth);
    }
    if(HorizontalLines.length < this.HorizontalSegments.length) for(const [GroupElement] of this.HorizontalSegments.splice(HorizontalLines.length)) this.Horizontal.removeChild(GroupElement);



    const XRange = this.TimeScale;
    const XStep = this.GetXStep(XRange);
    let VerticalLines = 0;
    for(let i = 0, CurrentX = Math.floor((Now - this.TimeScale) / XStep) * XStep; i < 20; ++i, CurrentX += XStep){
      if(CurrentX < Now - this.TimeScale) continue;
      if(CurrentX > Now) break;
      const XPosition = (1. - ((Now - CurrentX) / XRange)) * GraphWidth;
      if(XPosition < 10. || XPosition > GraphWidth - 10.) continue;
      const DateAtX = new Date(CurrentX);
      const TextX = DateAtX.toTimeString().substring(0, 8);
      this.GetVerticalLine(VerticalLines++, XPosition, TextX);
    }
    if(VerticalLines < this.VerticalSegments.length) for(const [GroupElement] of this.VerticalSegments.splice(VerticalLines)) this.Vertical.removeChild(GroupElement);


    //Graph lines rendering
    let SegmentID = 0;
    let Start = -1;
    let End = -1;

    const ZeroHeight = Math.max(Math.min(200 - (0 - MinValue) / (MaxValue - MinValue) * 200, 200), 0);

    Outer: while(true){
      for(let i = End + 1;; ++i){
        if(i === this.Data.length) break Outer;
        if(!Number.isNaN(this.Data[i][1])){
          Start = i;
          break;
        }
      }
      for(let i = Start; i < this.Data.length; ++i){
        if(Number.isNaN(this.Data[i][1])) break;
        End = i;
      }
      if(Start === End) continue;

      const [FillElement, StrokeElement] = this.GetGraphSegment(SegmentID++);

      let PathString = "";
      for(let i = Start; i <= End; ++i){
        if(i === Start) PathString += "M";
        else PathString += " L";
        PathString += ` ${
          (1 - (Now - this.Data[i][0]) / this.TimeScale) * GraphWidth
        } ${
          200 - (this.Data[i][1] - MinValue) / (MaxValue - MinValue) * 200
        }`;
      }
      StrokeElement.setAttributeNS(null, "d", PathString);
      PathString += ` L ${(1 - (Now - this.Data[End][0]) / this.TimeScale) * GraphWidth} ${ZeroHeight} L ${(1 - (Now - this.Data[Start][0]) / this.TimeScale) * GraphWidth} ${ZeroHeight} Z`;
      FillElement.setAttributeNS(null, "d", PathString);
    }
    if(SegmentID < this.GraphSegments.length) for(const [FillElement, StrokeElement] of this.GraphSegments.splice(SegmentID)) this.Graph.removeChild(FillElement), this.Graph.removeChild(StrokeElement);
  }
};