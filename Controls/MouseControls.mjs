export default class MouseControls{
  constructor(Camera, MouseElement){
    this.Camera = Camera;
    this.MouseElement = MouseElement;
    this.InvertY = true;
    this.IsPointerLocked = false;
    this.MouseSensitivity = 1.;

    this.MouseElement.addEventListener("click", this.HandleClick.bind(this));
    document.addEventListener("pointerlockchange", this.HandlePointerLockChange.bind(this));
    document.addEventListener("keydown", this.HandleKeyDown.bind(this));
    document.addEventListener("mousemove", this.HandleMouseMove.bind(this));
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
    this.Camera.RotationY += Event.movementY / 1000.;
  }
};