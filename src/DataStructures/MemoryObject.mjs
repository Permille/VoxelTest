export default class MemoryObject{
  constructor(Memory, AllocationSize){
    this.Memory = Memory;
    this.SegmentAndStackIndex = this.Memory.Allocate(AllocationSize);
    this.SegmentIndex = this.SegmentAndStackIndex >> 16;
    this.StackIndex = this.SegmentAndStackIndex & 65535;
    this.SegmentOffset = this.SegmentAndStackIndex & ~65535;
  }
};