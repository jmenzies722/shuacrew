import { AtSign, ChevronDown, Copy, Mail, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { composeEmail } from "../lib/native";

/** Markdown → text that reads well in an email or a post. */
export function plain(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const POST_TO = [
  { id: "x", label: "Post on X", url: (t: string) => `https://x.com/intent/post?text=${encodeURIComponent(t.slice(0, 280))}` },
  { id: "linkedin", label: "Post on LinkedIn", url: (t: string) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(t.slice(0, 2900))}` },
  { id: "threads", label: "Post on Threads", url: (t: string) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t.slice(0, 500))}` },
];

/**
 * Get a draft out of the Library and into the world — you press the final Send, always.
 * If you've selected part of the document, only that part goes.
 */
export function SendMenu({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const content = () => {
    const selected = window.getSelection()?.toString().trim();
    return selected && selected.length > 8 ? selected : plain(text);
  };
  const act = (what: string, fn: () => void) => {
    fn();
    setDone(what);
    setOpen(false);
    setTimeout(() => setDone(""), 1800);
  };
  return (
    <div ref={ref} className="relative">
      <button className="lib-link" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Send it — selected text only, if you've selected some">
        <Send size={13} /> {done || "Send"} <ChevronDown size={11} />
      </button>
      {open && (
        <div className="send-menu" role="menu">
          <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => act("Drafted", () => composeEmail(title, content()))}>
            <Mail size={13} /> Draft an email
          </button>
          {POST_TO.map((p) => (
            <button key={p.id} role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => act("Opened", () => window.open(p.url(content()), "_blank", "noopener"))}>
              <AtSign size={13} /> {p.label}
            </button>
          ))}
          <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => act("Copied", () => void navigator.clipboard.writeText(content()))}>
            <Copy size={13} /> Copy as plain text
          </button>
          <div className="send-hint">Selected text only, if you've selected some. You press the final Send.</div>
        </div>
      )}
    </div>
  );
}
