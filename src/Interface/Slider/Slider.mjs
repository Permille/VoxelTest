import HTML from "./Slider.html";
import CSS from "./Slider.css";
import {AddEventListener, FireEvent} from "../../Events.mjs";
export default class Slider{
  constructor({
    Name = "Slider",
    MinValue = 0,
    MaxValue = 1,
    DefaultValue = 0,
    Step = 1,
    Disabled = false
  }){
    [this.Element, this.ID] = HTML("Slider");
    CSS("Slider");
    this.Events = new EventTarget;
    this.MinValue = MinValue;
    this.MaxValue = MaxValue;

    this.DefaultValue = DefaultValue;
    this.Step = Step;
    this.Disabled = Disabled;
    this.SetDisabled(this.Disabled);

    this.NameElement = this.Element.querySelector(`#${this.ID}-Name`);
    this.SliderElement = this.Element.querySelector(`#${this.ID}-Slider`);
    this.TextInputElement = this.Element.querySelector(`#${this.ID}-TextInput`);

    this.NameElement.textContent = Name;
    this.SliderElement.min = this.MinValue;
    this.SliderElement.max = this.MaxValue;
    this.SliderElement.step = this.Step;
    this.TextInputElement.step = "any";

    AddEventListener(this.SliderElement, "input", function(){
      this.SetTextInputValue(this.SliderElement.value);
    }.bind(this));
    AddEventListener(this.TextInputElement, "input", function(){
      this.SetSliderValue(this.TextInputElement.value);
    }.bind(this));
    AddEventListener(this.Element, "mousedown", function(Event){
      if(Event.button !== 2) return;
      this.SetDisabled(!this.Disabled);
    }.bind(this));
  }
  Initialise(){
    this.SetTextInputValue(this.DefaultValue);
    this.SetSliderValue(this.DefaultValue);
    return this;
  }
  SetTextInputValue(Value){
    this.TextInputElement.value = Value;
    FireEvent(this.Events, new CustomEvent("Change"));
  }
  SetSliderValue(Value){
    this.SliderElement.value = Value;
    FireEvent(this.Events, new CustomEvent("Change"));
  }
  GetValue(){
    return Number.parseFloat(this.TextInputElement.value);
  }
  SetDisabled(Status){
    this.Disabled = Status;
    if(this.Disabled){
      if(!this.Element.classList.contains("Slider-Disabled")) this.Element.classList.add("Slider-Disabled");
    } else{
      if(this.Element.classList.contains("Slider-Disabled")) this.Element.classList.remove("Slider-Disabled");
    }
    FireEvent(this.Events, new CustomEvent("Change"));
  }
};