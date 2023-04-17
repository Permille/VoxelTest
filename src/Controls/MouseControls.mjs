import {AddEventListener, RemoveEventListener} from "../Events.mjs";

export default class MouseControls{
  constructor(Camera, MouseElement){
    this.Camera = Camera;
    this.MouseElement = MouseElement;
    this.InvertY = true;
    this.IsPointerLocked = false;
    this.MouseSensitivity = 1.;

    this.HandleClickID = AddEventListener(this.MouseElement, "click", this.HandleClick.bind(this));
    this.HandlePointerLockChangeID = AddEventListener(document, "pointerlockchange", this.HandlePointerLockChange.bind(this));
    this.HandleKeyDownID = AddEventListener(document, "keydown", this.HandleKeyDown.bind(this));
    this.HandleMouseMoveID = AddEventListener(document, "mousemove", this.HandleMouseMove.bind(this));
  }
  HandleKeyDown(Event){
    switch(Event.code){
      case "AltLeft":
      case "Escape":{
        if(this.IsPointerLocked) document.exitPointerLock();
        return;
      }
    }
  }
  HandleClick(Event){
    this.MouseElement.requestPointerLock();
    this.IsPointerLocked = this.MouseElement === document.pointerLockElement;
  }
  HandlePointerLockChange(Event){
    this.IsPointerLocked = this.MouseElement === document.pointerLockElement;
  }
  HandleMouseMove(Event){
    if(!this.IsPointerLocked) return;
    this.Camera.RotationX += Event.movementX / 1000.;
    this.Camera.RotationY += Event.movementY / 1000. * (this.InvertY ? -1. : 1.) * this.MouseSensitivity;
  }
  Destroy(){
    if(this.IsPointerLocked) document.exitPointerLock();
    RemoveEventListener(this.HandleClickID);
    RemoveEventListener(this.HandlePointerLockChangeID);
    RemoveEventListener(this.HandleKeyDownID);
    RemoveEventListener(this.HandleMouseMoveID);
  }
};