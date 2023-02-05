import {AddEventListener, RemoveEventListener} from "../Events.mjs";

export default class KeyboardControls{
  constructor(Camera){
    this.Camera = Camera;
    this.MovementSpeed = .025;
    this.PressedKeys = new Map;
    this.IsDestroyed = false;

    this.HandleKeyDownID = AddEventListener(document, "keydown", this.HandleKeyDown.bind(this));
    this.HandleKeyUpID = AddEventListener(document, "keyup", this.HandleKeyUp.bind(this));

    this.LastUpdate = window.performance.now();
    void function Load(){
      if(this.IsDestroyed) return;
      window.requestAnimationFrame(Load.bind(this));

      const Now = window.performance.now();
      const Difference = Now - this.LastUpdate;
      this.LastUpdate = Now;

      const MovementX = this.IsPressed("KeyS") - this.IsPressed("KeyW");
      const MovementZ = this.IsPressed("KeyD") - this.IsPressed("KeyA");
      const MovementY = this.IsPressed("Space") - this.IsPressed("ShiftLeft");
      if(MovementX !== 0 || MovementY !== 0 || MovementZ !== 0){
        this.Camera.PositionX += this.MovementSpeed * Difference * (-Math.sin(this.Camera.RotationX) * MovementX + Math.cos(this.Camera.RotationX) * MovementZ);
        this.Camera.PositionY += this.MovementSpeed * Difference * MovementY;
        this.Camera.PositionZ += this.MovementSpeed * Difference * (Math.cos(this.Camera.RotationX) * MovementX + Math.sin(this.Camera.RotationX) * MovementZ);
      }
    }.bind(this)();
  }
  IsPressed(Key){
    return this.PressedKeys.get(Key) ?? false;
  }
  HandleKeyDown(Event){
    this.PressedKeys.set(Event.code, true);
  }
  HandleKeyUp(Event){
    this.PressedKeys.set(Event.code, false);
  }
  Destroy(){
    this.IsDestroyed = true;
    RemoveEventListener(this.HandleKeyDownID);
    RemoveEventListener(this.HandleKeyUpID);
  }
};