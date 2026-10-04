type Voice = { say(text: string): void; stop(): void; beginTurn(): void };

export class LiveNarration {
  private offset = 0;
  private text = "";
  private interrupted = "";
  constructor(private voice: Voice) {}

  update(text: string, final: boolean) {
    if (this.interrupted && text.startsWith(this.interrupted)) return;
    this.interrupted = "";
    if (!this.text) this.voice.beginTurn();
    this.text = text;
    while (this.offset < text.length) {
      const remaining = text.slice(this.offset);
      let length = 0;
      for (const boundary of remaining.matchAll(/[.!?,;:—](?:\s+|$)/g)) {
        const end = boundary.index! + boundary[0].length;
        const phrase = remaining.slice(0, end).trim();
        const sentence = /^[.!?]/.test(boundary[0]);
        const openingClause = this.offset === 0 && phrase.length >= 24 && phrase.split(/\s+/).length >= 5;
        const numeric = /\d/.test(remaining[boundary.index! - 1] ?? "") && /^[.,:]/.test(boundary[0]);
        if (!numeric && (sentence || openingClause)) { length = end; break; }
      }
      if (!length && final) length = remaining.length;
      if (!length) break;
      const ready = remaining.slice(0, length).trim();
      if (ready) this.voice.say(ready);
      this.offset += length;
    }
    if (final) { this.offset = 0; this.text = ""; }
  }

  interrupt() {
    if (this.text) this.interrupted = this.text;
    this.offset = 0;
    this.text = "";
    this.voice.stop();
  }
}
