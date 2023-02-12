import Slider from "./Slider.mjs";
import {FireEvent} from "../../Events.mjs";

export default class WeightedSlider extends Slider{
  constructor({
    Name = "Slider",
    DefaultValue = 0,
    Disabled = false,
    Weighting,
    InverseWeighting
  }){
    super({Name, "MinValue": 0, "MaxValue": 1, DefaultValue, "Step": "any", Disabled});
    this.Weighting = Weighting;
    this.InverseWeighting = InverseWeighting;
  }
  Initialise(){
    this.TextInputElement.value = this.DefaultValue;
    this.SetSliderValue(this.DefaultValue);
    return this;
  }
  SetTextInputValue(Value){
    this.TextInputElement.value = this.Weighting(Value);
    FireEvent(this.Events, new CustomEvent("Change"));
  }
  SetSliderValue(Value){
    this.SliderElement.value = this.InverseWeighting(Value);
    FireEvent(this.Events, new CustomEvent("Change"));
  }
};