/** Speech is an abbreviated presentation of the visible answer, never tool/thought content. */
export function spokenText(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`]*(?:`|$)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(?:sk-|ghp_|gho_|AKIA)[A-Za-z0-9_-]+/g, " ")
    .replace(/\b(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S+/gi, "[redacted]")
    .replace(/^[#>*-]+\s*/gm, "").replace(/[*_~]/g, "")
    .replace(/\s+/g, " ").trim();
}

export class SpeechSegmenter {
  private buffer = "";
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    let fenced = false, inline = false, end = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer.slice(i, i + 3) === "```") { fenced = !fenced; i += 2; continue; }
      if (!fenced && this.buffer[i] === "`") { inline = !inline; continue; }
      if (!fenced && !inline && /[.!?]/.test(this.buffer[i]!) && (i + 1 === this.buffer.length || /\s/.test(this.buffer[i + 1]!))) {
        const safe = spokenText(this.buffer.slice(end, i + 1));
        if (safe) out.push(safe);
        end = i + 1;
      }
    }
    this.buffer = this.buffer.slice(end);
    return out;
  }
  finish(): string[] { const safe = spokenText(this.buffer); this.reset(); return safe ? [safe] : []; }
  reset() { this.buffer = ""; }
}
