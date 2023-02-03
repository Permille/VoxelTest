const AssignedEvents = new Map;
let ID = 0;

export function AddEventListener(Target, EventName, Listener, Options = null){
  Target.addEventListener(EventName, Listener, Options);
  AssignedEvents.set(ID, [Target, EventName, Listener, Options]);
  return ID++;
};

export function FireEvent(Target, Event){
  Target.dispatchEvent(Event);
};

export function RemoveEventListener(ID){
  const [Target, EventName, Listener, Options] = AssignedEvents.get(ID);
  AssignedEvents.delete(ID);
  Target.removeEventListener(EventName, Listener, Options);
};