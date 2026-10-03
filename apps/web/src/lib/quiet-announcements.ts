export class QuietAnnouncements {
  private pending: Array<{ text: string; valid: () => boolean; expires: number; delivered?: () => void }> = [];
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private busy: () => boolean, private speak: (text: string) => void) {}
  add(text: string, valid = () => true, delivered?: () => void) {
    if (!this.pending.some(item => item.text === text)) this.pending.push({ text, valid, expires: Date.now() + 120_000, delivered });
    if (!this.timer) this.timer = setTimeout(this.flush, 750);
  }
  private flush = () => {
    this.timer = undefined;
    this.pending = this.pending.filter(item => item.expires > Date.now() && item.valid());
    if (!this.busy()) {
      const next = this.pending.shift();
      if (next) { this.speak(next.text); next.delivered?.(); }
    }
    if (this.pending.length) this.timer = setTimeout(this.flush, 750);
  };
  stop() { clearTimeout(this.timer); this.timer = undefined; this.pending = []; }
}
