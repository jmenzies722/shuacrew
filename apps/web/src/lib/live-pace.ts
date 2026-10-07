/**
 * How much of a live reply has been heard. The realtime voice writes its transcript faster than it speaks (a whole
 * sentence of text lands in a blink, then takes seconds to say), so showing the text as it arrives ran ahead of the
 * voice. Here it's revealed at the voice's own speaking rate, only while the voice is audible, whole words at a time;
 * when the voice finishes, everything is heard and the real rate is learned for the next reply.
 */
export const DEFAULT_RATE = 0.0145; // characters per millisecond: ~14.5 a second, the realtime voices at 1×
const MIN_RATE = 0.008, MAX_RATE = 0.03;

export class LivePace {
  private audible = 0;   // ms of audible voice in this reply
  private shown = "";    // what's been published as heard
  private text = "";     // the reply so far (grows as the transcript streams)
  constructor(public rate = DEFAULT_RATE) {}

  /** A new reply (or the user spoke): start from nothing. */
  reset() { this.audible = 0; this.shown = ""; this.text = ""; }

  /** One tick of `ms` with the voice audible (or not): the heard text when it changed, else null. */
  tick(text: string, ms: number, audible: boolean): string | null {
    if (!text.startsWith(this.text.slice(0, Math.min(this.text.length, 12)))) this.reset(); // a different reply
    this.text = text;
    if (audible) this.audible += ms;
    const target = Math.min(text.length, Math.round(this.audible * this.rate));
    // Whole words only: up to the last space at or before the target (or all of it once the voice has caught up).
    const cut = target >= text.length ? text.length : Math.max(0, text.lastIndexOf(" ", target));
    const heard = text.slice(0, cut).trimEnd();
    if (heard.length <= this.shown.length) return null;
    this.shown = heard;
    return heard;
  }

  /** The voice finished this reply: all of it is heard. Learns the real rate when the reply was long enough to tell. */
  finish(text: string): string {
    if (text.length >= 40 && this.audible >= 1500) {
      const measured = text.length / this.audible;
      this.rate = Math.min(MAX_RATE, Math.max(MIN_RATE, this.rate * 0.7 + measured * 0.3));
    }
    this.shown = text; this.text = text;
    return text;
  }
}
