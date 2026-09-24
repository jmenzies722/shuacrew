/**
 * Terminal colour codes → styled runs of text. Command output keeps its colours in the thread
 * without ever becoming HTML. Covers SGR: reset, bold, dim, italic, underline, the 16 colours,
 * 256-colour and truecolour; every other escape (cursor moves, titles) is dropped.
 */
export interface Run {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

// The Night Operations terminal palette (shared with the terminal drawer).
export const PALETTE = [
  "#1b1f26", "#ff6b6b", "#4ade80", "#ffb020", "#6cb6ff", "#f778ba", "#56d4dd", "#c9d1d9",
  "#5c6370", "#ff8f8f", "#7ee8a4", "#ffc857", "#9ccfff", "#ff9bd2", "#8ae6ec", "#f0f3f6",
];

function color256(n: number): string {
  if (n < 16) return PALETTE[n]!;
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  const i = n - 16;
  const level = (x: number) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${level(Math.floor(i / 36))},${level(Math.floor(i / 6) % 6)},${level(i % 6)})`;
}

export function parseAnsi(input: string): Run[] {
  const runs: Run[] = [];
  let style: Omit<Run, "text"> = {};
  // Strip OSC (titles, links) and non-colour CSI sequences; keep SGR (…m).
  const text = input.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "").replace(/\r(?!\n)/g, "");
  const pattern = /\x1b\[([\d;]*)([A-Za-z])/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), ...style });
    last = match.index + match[0].length;
    if (match[2] !== "m") continue;
    const codes = (match[1] || "0").split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]!;
      if (c === 0) style = {};
      else if (c === 1) style.bold = true;
      else if (c === 2) style.dim = true;
      else if (c === 3) style.italic = true;
      else if (c === 4) style.underline = true;
      else if (c === 22) style.bold = style.dim = false;
      else if (c === 23) style.italic = false;
      else if (c === 24) style.underline = false;
      else if (c >= 30 && c <= 37) style.fg = PALETTE[c - 30];
      else if (c >= 90 && c <= 97) style.fg = PALETTE[c - 90 + 8];
      else if (c >= 40 && c <= 47) style.bg = PALETTE[c - 40];
      else if (c >= 100 && c <= 107) style.bg = PALETTE[c - 100 + 8];
      else if (c === 39) style.fg = undefined;
      else if (c === 49) style.bg = undefined;
      else if ((c === 38 || c === 48) && codes[i + 1] === 5) {
        style[c === 38 ? "fg" : "bg"] = color256(codes[i + 2] ?? 0);
        i += 2;
      } else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
        style[c === 38 ? "fg" : "bg"] = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
        i += 4;
      }
    }
  }
  if (last < text.length) runs.push({ text: text.slice(last), ...style });
  return runs.filter((r) => r.text);
}
