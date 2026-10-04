export class NativePlayback {
  muted = false;
  private seen = new Set<string>();
  private user = "";
  private userDone = false;

  constructor(private change: (muted: boolean) => void) {}

  stop() {
    this.muted = true;
    this.user = "";
    this.userDone = false;
    this.change(true);
  }

  event(message: { type?: string; turn?: { id?: string; role?: string } }) {
    const turn = message.turn;
    if (!turn?.id) return;
    if (message.type === "turn.created") {
      if (this.seen.has(turn.id)) return;
      this.seen.add(turn.id);
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
      if (!this.muted) return;
      if (turn.role === "user") { this.user = turn.id; this.userDone = false; }
      else if (turn.role === "assistant" && this.userDone) {
        this.muted = false;
        this.change(false);
      }
    } else if (message.type === "turn.done" && turn.role === "user" && turn.id === this.user) this.userDone = true;
  }
}
