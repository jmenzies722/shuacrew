/**
 * One edit as a diff: unified or side by side, with the file's syntax highlighting on both sides.
 * Highlighting loads on demand; plain text shows until it arrives.
 */
import { useEffect, useState } from "react";
import type { Token } from "../lib/highlight";

type Line = { sign: " " | "+" | "-"; tokens: Token[] };

export function DiffView({ before, after, file, split }: { before: string; after: string; file: string; split: boolean }) {
  const [hl, setHl] = useState<{ a: Token[][]; b: Token[][] } | null>(null);
  useEffect(() => {
    let alive = true;
    void import("../lib/highlight").then((m) => alive && setHl({ a: m.highlight(before, file), b: m.highlight(after, file) }));
    return () => {
      alive = false;
    };
  }, [before, after, file]);
  const a = hl?.a ?? before.split("\n").map((text) => [{ text }]);
  const b = hl?.b ?? after.split("\n").map((text) => [{ text }]);
  const lines = diffLines(before.split("\n"), after.split("\n"));

  if (split) {
    const rows: Array<{ left?: { n: number; t: Token[]; kind: string }; right?: { n: number; t: Token[]; kind: string } }> = [];
    let ai = 0;
    let bi = 0;
    // Within one change, removed and added lines pair up in order: first with first.
    let unpaired: typeof rows = [];
    for (const l of lines) {
      if (l === " ") {
        unpaired = [];
        rows.push({ left: { n: ai + 1, t: a[ai++] ?? [], kind: "" }, right: { n: bi + 1, t: b[bi++] ?? [], kind: "" } });
      } else if (l === "-") {
        const row = { left: { n: ai + 1, t: a[ai++] ?? [], kind: "diff-del" } };
        rows.push(row);
        unpaired.push(row);
      } else {
        const cell = { n: bi + 1, t: b[bi++] ?? [], kind: "diff-add" };
        const open = unpaired.shift();
        if (open) open.right = cell;
        else rows.push({ right: cell });
      }
    }
    return (
      <div className="diff-split">
        {rows.map((r, i) => (
          <div key={i} className="diff-split-row">
            <Cell cell={r.left} />
            <Cell cell={r.right} />
          </div>
        ))}
      </div>
    );
  }

  let ai = 0;
  let bi = 0;
  const unified: Line[] = lines.map((l) => (l === "+" ? { sign: "+", tokens: b[bi++] ?? [] } : l === "-" ? { sign: "-", tokens: a[ai++] ?? [] } : (bi++, { sign: " ", tokens: a[ai++] ?? [] })));
  return (
    <pre className="diff-body">
      {unified.map((l, i) => (
        <div key={i} className={l.sign === "+" ? "diff-add" : l.sign === "-" ? "diff-del" : "diff-ctx"}>
          <span className="diff-sign">{l.sign === " " ? "" : l.sign === "+" ? "+" : "−"}</span>
          <Tokens tokens={l.tokens} />
        </div>
      ))}
    </pre>
  );
}

function Cell({ cell }: { cell?: { n: number; t: Token[]; kind: string } }) {
  if (!cell) return <div className="diff-cell diff-empty" />;
  return (
    <div className={`diff-cell ${cell.kind}`}>
      <span className="diff-n">{cell.n}</span>
      {/* One inline run: as direct flex children, the spaces between tokens would collapse. */}
      <span className="diff-text">
        <Tokens tokens={cell.t} />
      </span>
    </div>
  );
}

function Tokens({ tokens }: { tokens: Token[] }) {
  return <>{tokens.length ? tokens.map((t, j) => (t.className ? <span key={j} className={t.className}>{t.text}</span> : t.text)) : "​"}</>;
}

/** A line diff (LCS). Edits in a thread are small, so the quadratic table is fine; big ones fall back. */
function diffLines(a: string[], b: string[]): Array<" " | "+" | "-"> {
  if (a.length * b.length > 400_000) return [...a.map(() => "-" as const), ...b.map(() => "+" as const)];
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: Array<" " | "+" | "-"> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) (out.push(" "), i++, j++);
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) (out.push("-"), i++);
    else (out.push("+"), j++);
  }
  while (i++ < a.length) out.push("-");
  while (j++ < b.length) out.push("+");
  return out;
}

/** +added / −removed by real line diff, not by counting both sides. */
export function diffStat(before: string, after: string): { added: number; removed: number } {
  const lines = diffLines(before ? before.split("\n") : [], after ? after.split("\n") : []);
  return { added: lines.filter((l) => l === "+").length, removed: lines.filter((l) => l === "-").length };
}
