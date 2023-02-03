export default class KeyboardControls{
  constructor(Camera){
    this.Camera = Camera;
    this.MovementSpeed = 1.025;
    this.PressedKeys = new Map;

    document.addEventListener("keydown", this.HandleKeyDown.bind(this));
    document.addEventListener("keyup", this.HandleKeyUp.bind(this));

    this.LastUpdate = window.performance.now();
    void function Load(){
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
};