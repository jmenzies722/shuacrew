export class QuietAnnouncements {
  private pending: Array<{ key: string; text: string; valid: () => boolean; expires: number; delivered?: () => void }> = [];
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private busy: () => boolean, private speak: (text: string) => unknown) {}
  add(text: string, valid = () => true, delivered?: () => void, key = text, lifetime = 120_000) {
    if (!this.pending.some(item => item.key === key)) this.pending.push({ key, text, valid, expires: Date.now() + lifetime, delivered });
    if (!this.timer) this.timer = setTimeout(this.flush, 750);
  }
  private flush = () => {
    this.timer = undefined;
    this.pending = this.pending.filter(item => item.expires > Date.now() && item.valid());
    if (!this.busy()) {
      const next = this.pending.shift();
      if (next) { if (this.speak(next.text) === false) this.pending.unshift(next); else next.delivered?.(); }
    }
    if (this.pending.length) this.timer = setTimeout(this.flush, 750);
  };
  stop() { clearTimeout(this.timer); this.timer = undefined; this.pending = []; }
}
