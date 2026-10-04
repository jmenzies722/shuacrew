export class NativeInputBuffer {
  ready = false;
  capturing = false;
  private accepted = false;
  private frames: Float32Array[] = [];
  private samples = 0;
  private offset = 0;

  constructor(private limit: number) {}

  press() { this.cancel(); this.capturing = true; }
  accept() { this.accepted = true; }
  release() { this.capturing = false; }
  cancel() { this.capturing = false; this.accepted = false; this.frames = []; this.samples = 0; this.offset = 0; }
  push(frame: Float32Array) {
    if (!this.capturing) return true;
    if (this.samples + frame.length > this.limit) { this.cancel(); return false; }
    this.frames.push(frame.slice()); this.samples += frame.length;
    return true;
  }
  read(length: number) {
    const output = new Float32Array(length);
    if (!this.ready || !this.accepted) return output;
    let written = 0;
    while (written < length && this.frames.length) {
      const frame = this.frames[0]!, count = Math.min(length - written, frame.length - this.offset);
      output.set(frame.subarray(this.offset, this.offset + count), written);
      this.offset += count; written += count; this.samples -= count;
      if (this.offset === frame.length) { this.frames.shift(); this.offset = 0; }
    }
    return output;
  }
}
