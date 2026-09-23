import { Fragment, type ReactNode } from "react";

/**
 * Just enough markdown for agent prose — paragraphs, lists, fenced code, `code`, **bold**,
 * *emphasis* — rendered as React elements. No HTML is ever injected, so agent output can't smuggle
 * markup into the dashboard.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  for (let i = 0; i < parts.length; i += 3) {
    const prose = parts[i] ?? "";
    for (const [j, para] of prose.split(/\n{2,}/).entries()) {
      const lines = para.split("\n").filter((l) => l.trim() !== "");
      if (!lines.length) continue;
      if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) {
        blocks.push(
          <ul key={`${i}-${j}`}>
            {lines.map((l, k) => (
              <li key={k}>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""))}</li>
            ))}
          </ul>,
        );
      } else {
        blocks.push(
          <p key={`${i}-${j}`}>
            {lines.map((l, k) => (
              <Fragment key={k}>
                {k > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>,
        );
      }
    }
    const code = parts[i + 2];
    if (code !== undefined) blocks.push(<pre key={`code-${i}`}>{code.replace(/\n$/, "")}</pre>);
  }
  return <div className="prose-agent">{blocks}</div>;
}

function inline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) out.push(line.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) out.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) out.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    else out.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
