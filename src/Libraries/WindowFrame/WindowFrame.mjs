import HTML from "./index.html";
import CSS from "./style.css";
import {AddEventListener, FireEvent, RemoveEventListener} from "../../Events.mjs";
export default class WindowFrame{
  static CurrentZIndex = 1;
  constructor(Width, Height, StrictDimensions){
    [this.Element, this.ID] = HTML("WindowFrame");
    CSS("WindowFrame");
    document.body.appendChild(this.Element);
    this.IsDestroyed = false;
    this.Events = new EventTarget;
    this.BodyElement = this.Element.querySelector(`#${this.ID}-Body`);
    this.TitleTextElement = this.Element.querySelector(`#${this.ID}-TitleText`);
    this.TitleBarElement = this.Element.querySelector(`#${this.ID}-TitleBar`);

    this.PositionX = 0;
    this.PositionY = 0;
    this.Width = Width;
    this.Height = Height;
    this.StrictDimensions = StrictDimensions;
    this.SetPosition(this.PositionX, this.PositionY);
    this.SetDimensions(this.Width, this.Height);
    this.Dragging = false;
    this.Resizing = false;
    this.ResizeDirection = [0, 0];

    this.EventIDs = [
      AddEventListener(this.TitleBarElement, "mousedown", function(Event){
        Event.preventDefault();
        this.Dragging = true;
      }.bind(this)),
      AddEventListener(window, "mousemove", function(Event){
        if(this.Dragging){
          Event.preventDefault();
          const CheckedMovementX = Event.clientX >= 0 && Event.clientX < window.innerWidth ? Event.movementX : 0;
          const CheckedMovementY = Event.clientY >= 0 && Event.clientY < window.innerHeight ? Event.movementY : 0;
          this.ApplyMovement(CheckedMovementX, CheckedMovementY);
        } else if(this.Resizing){
          Event.preventDefault();
          const CheckedMovementX = Event.clientX >= 0 && Event.clientX < window.innerWidth ? Event.movementX : 0;
          const CheckedMovementY = Event.clientY >= 0 && Event.clientY < window.innerHeight ? Event.movementY : 0;
          const OldWidth = this.Width;
          const OldHeight = this.Height;
          this.SetDimensions(OldWidth + this.ResizeDirection[0] * CheckedMovementX, OldHeight + this.ResizeDirection[1] * CheckedMovementY);
          this.SetPosition(this.PositionX + (this.ResizeDirection[0] === -1 ? OldWidth - this.Width : 0), this.PositionY + (this.ResizeDirection[1] === -1 ? OldHeight - this.Height : 0));
        }
      }.bind(this)),
      AddEventListener(window, "mouseup", function(Event){
        if(this.Dragging){
          Event.preventDefault();
          this.Dragging = false;
        } else if(this.Resizing){
          this.Resizing = false;
          document.documentElement.style.cursor = "auto";
        }
      }.bind(this)),
      AddEventListener(window, "resize", function(Event){
        this.SetPosition(this.PositionX, this.PositionY);
      }.bind(this)),
      AddEventListener(this.Element, "mousedown", function(Event){
        this.Element.style.zIndex = "" + WindowFrame.CurrentZIndex++;
        if(Event.target !== this.Element) return; //Clicked something inside of window
        this.ResizeDirection[0] = Event.offsetX < 8 ? -1 : Event.offsetX > this.Width + 8 ? 1 : 0;
        this.ResizeDirection[1] = Event.offsetY < 8 ? -1 : Event.offsetY > this.Height + 8 ? 1 : 0;
        if(this.ResizeDirection[0] === 0 && this.ResizeDirection[1] === 0) return void console.log("Clicked to resize but didn't detect resize direction. This is a bug.");
        this.Resizing = true;
        document.documentElement.style.cursor = `${this.ResizeDirection[1] === -1 ? "n" : this.ResizeDirection[1] === 1 ? "s" : ""}${this.ResizeDirection[0] === -1 ? "w" : this.ResizeDirection[0] === 1 ? "e" : ""}-resize`;
      }.bind(this)),
      AddEventListener(this.Element.querySelector(`#${this.ID}-CloseImage`), "click", function(Event){
        this.Destroy();
      }.bind(this))
    ];
  }
  Destroy(){
    this.IsDestroyed = true;
    for(const EventID of this.EventIDs) RemoveEventListener(EventID);
    this.Element.remove();
    FireEvent(this.Events, new CustomEvent("Close"));
  }
  SetDimensions(Width, Height){
    this.Width = Width;
    this.Height = Height;
    this.BodyElement.style.minWidth = this.BodyElement.style.maxWidth = Width + "px";
    this.BodyElement.style.minHeight = this.BodyElement.style.maxHeight = Height + "px";

    if(this.StrictDimensions){
      const Rect = this.Element.getBoundingClientRect();
      this.Width = Math.max(this.BodyElement.scrollWidth, Rect.width - 16);
      this.Height = this.BodyElement.scrollHeight

      this.BodyElement.style.minWidth = this.Width;
      this.BodyElement.style.minHeight = this.Height;
    }
  }
  SetPosition(x, y){
    x = Math.min(x, window.innerWidth - 16);
    y = Math.min(y, window.innerHeight - 16);
    this.PositionX = x;
    this.PositionY = y;
    this.Element.style.left = x + "px";
    this.Element.style.top = y + "px";
  }
  ApplyMovement(dx, dy){
    this.SetPosition(this.PositionX + dx, this.PositionY + dy);
  }
  SetTitle(Title){
    this.TitleTextElement.textContent = Title;
  }
  ClearBody(){
    let Child;
    while((Child = this.BodyElement.firstChild) !== null){
      this.BodyElement.removeChild(Child);
    }
  }
  SetBody(Element){
    this.ClearBody();
    this.BodyElement.append(Element);
  }
};