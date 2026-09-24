import { Check, Copy } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { Token } from "../lib/highlight";

/**
 * Agent prose as a proper document — headings, lists and task lists, quotes, tables, rules, links
 * and highlighted code with a copy button — built as React elements. No HTML is ever injected, so
 * agent output can't smuggle markup into the page.
 */
export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return <div className="prose-agent">{blocks(text, streaming)}</div>;
}

function blocks(text: string, streaming?: boolean): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  const key = () => `b${out.length}`;
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!);
      const open = i >= lines.length && streaming;
      i++;
      out.push(<CodeBlock key={key()} code={body.join("\n")} lang={fence[2] || undefined} open={open} />);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const Tag = (["h3", "h3", "h4", "h5"] as const)[level - 1]!;
      out.push(<Tag key={key()}>{inline(heading[2]!)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={key()} />);
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={key()}>{blocks(quote.join("\n"))}</blockquote>);
      continue;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1] ?? "")) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) rows.push(cells(lines[i++]!));
      out.push(
        <div key={key()} className="table-wrap">
          <table>
            <thead>
              <tr>{head.map((h, k) => <th key={k}>{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>{head.map((_, c) => <td key={c}>{inline(r[c] ?? "")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    if (item.test(line)) {
      const ordered = /\d/.test(item.exec(line)![2]!);
      const entries: Array<{ depth: number; text: string; done?: boolean }> = [];
      while (i < lines.length) {
        const m = item.exec(lines[i]!);
        if (m) {
          const task = /^\[([ xX])\]\s+(.*)$/.exec(m[3]!);
          entries.push({ depth: Math.floor(m[1]!.length / 2), text: task ? task[2]! : m[3]!, done: task ? task[1] !== " " : undefined });
          i++;
        } else if (lines[i]!.trim() && /^\s{2,}/.test(lines[i]!) && entries.length) {
          entries[entries.length - 1]!.text += ` ${lines[i++]!.trim()}`; // a wrapped item
        } else break;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={key()}>
          {entries.map((e, k) => (
            <li key={k} style={e.depth ? { marginLeft: `${e.depth * 1.1}rem` } : undefined} className={e.done !== undefined ? "task" : undefined}>
              {e.done !== undefined && <span className={`task-box ${e.done ? "done" : ""}`} aria-label={e.done ? "done" : "to do"} />}
              {inline(e.text)}
            </li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*(```|~~~|#{1,4}\s|>|([-*+]|\d+[.)])\s)/.test(lines[i]!)) para.push(lines[i++]!);
    if (!para.length) para.push(lines[i++]!);
    out.push(
      <p key={key()}>
        {para.map((l, k) => (
          <Fragment key={k}>
            {k > 0 && " "}
            {inline(l)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return out;
}

function inline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\s][^*]*\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)<>]+[^\s)<>.,;:!?])/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) out.push(line.slice(last, match.index));
    const t = match[0];
    const k = match.index;
    if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={k}>{inline(t.slice(2, -2))}</strong>);
    else if (t.startsWith("~~")) out.push(<del key={k}>{t.slice(2, -2)}</del>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]"));
      out.push(<a key={k} href={match[2]} target="_blank" rel="noreferrer noopener">{label}</a>);
    } else if (t.startsWith("http")) out.push(<a key={k} href={t} target="_blank" rel="noreferrer noopener">{t.replace(/^https?:\/\//, "")}</a>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = k + t.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** Code the agent wrote or quoted: highlighted, labelled, one click to copy. */
export function CodeBlock({ code, lang, open, label, maxLines = 40 }: { code: string; lang?: string; open?: boolean; label?: string; maxLines?: number }) {
  const [lines, setLines] = useState<Token[][] | null>(null);
  const [copied, setCopied] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    void import("../lib/highlight").then((m) => alive && setLines(m.highlight(code, lang)));
    return () => {
      alive = false;
    };
  }, [code, lang]);
  const plain: Token[][] = code.split("\n").map((text) => [{ text }]);
  const shown = lines ?? plain;
  const long = shown.length > maxLines && !all;
  return (
    <div className="code-block not-prose">
      <div className="code-head">
        <span className="mono">{label ?? lang ?? "text"}</span>
        {open && <span className="text-amber">writing…</span>}
        <button
          onClick={() => void navigator.clipboard?.writeText(code).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1400)))}
          className="ml-auto flex items-center gap-1 hover:text-fg"
          aria-label="Copy code"
        >
          {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={long ? "clipped" : undefined}>
        <code>
          {(long ? shown.slice(0, maxLines) : shown).map((tokens, n) => (
            <div key={n} className="code-line">
              {tokens.length ? tokens.map((t, j) => (t.className ? <span key={j} className={t.className}>{t.text}</span> : t.text)) : "​"}
            </div>
          ))}
        </code>
      </pre>
      {shown.length > maxLines && (
        <button onClick={() => setAll((v) => !v)} className="code-more">
          {all ? "Show less" : `Show all ${shown.length} lines`}
        </button>
      )}
    </div>
  );
}
