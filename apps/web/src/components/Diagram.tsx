import { useEffect, useId, useRef, useState } from "react";
import { Copy, Download, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import "./diagram.css";

type Mermaid = typeof import("mermaid").default;
let loading: Promise<Mermaid> | null = null;
/** Mermaid is big; it loads the first time a diagram appears, never before. */
function mermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then((m) => m.default);
  return loading;
}

/** Mermaid's colour parser takes plain colours only: blend in JS, and fall back when a theme token isn't one. */
function mix(a: string, b: string, t: number) {
  const n = (h: string) => parseInt(h.slice(1), 16), x = n(a), y = n(b);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}
function theme(color: string) {
  const css = getComputedStyle(document.documentElement);
  const v = (k: string, d: string) => { const x = css.getPropertyValue(k).trim(); return /^#[0-9a-f]{6}$/i.test(x) || /^rgba?\(/.test(x) ? x : d; };
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#8b7cf6", panel = v("--panel", "#16161a");
  return {
    startOnLoad: false, securityLevel: "strict" as const, theme: "base" as const, fontFamily: "Geist Variable, ui-sans-serif, system-ui",
    flowchart: { curve: "basis" as const, padding: 14, nodeSpacing: 46, rankSpacing: 56, htmlLabels: true },
    themeVariables: {
      darkMode: true, background: "#0f0f12", fontSize: "14px",
      primaryColor: v("--raised", "#1c1c21"), primaryTextColor: v("--text", "#ececf1"), primaryBorderColor: c,
      secondaryColor: panel, tertiaryColor: v("--sunken", "#0f0f12"),
      lineColor: mix(c, "#9a9aa6", 0.35), textColor: v("--text-2", "#b7b7c2"),
      clusterBkg: mix("#0f0f12", c, 0.07), clusterBorder: mix("#0f0f12", c, 0.45),
      edgeLabelBackground: panel, nodeTextColor: v("--text", "#ececf1"),
      actorBkg: v("--raised", "#1c1c21"), actorBorder: c, actorTextColor: v("--text", "#ececf1"), signalColor: mix(c, "#9a9aa6", 0.35), signalTextColor: v("--text-2", "#b7b7c2"),
      noteBkgColor: mix("#0f0f12", c, 0.18), noteTextColor: v("--text", "#ececf1"), noteBorderColor: c,
    },
  };
}

/** One Mermaid diagram, rendered in your colours, with zoom, copy, save and a bigger canvas. */
export function Diagram({ code, color = "#8b7cf6", onExpand, expanded, onSave }: { code: string; color?: string; onExpand?: (open: boolean) => void; expanded?: boolean; onSave?: (name: string, svg: string) => void }) {
  const id = `d${useId().replace(/[^a-z0-9]/gi, "")}`, host = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState(""), [error, setError] = useState(""), [zoom, setZoom] = useState(1), [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const m = await mermaid();
        m.initialize(theme(color));
        // Light fills from a model make pale-on-pale nodes on the dark canvas: keep its outlines, drop its fills.
        const readable = code.trim().replace(/^(\s*(?:classDef|style)\b.*)$/gm, (line) => line.replace(/(^|[\s,;])(fill|color):[^,;\n]+[,;]?/g, "$1"));
        const out = await m.render(id, readable);
        if (live) { setSvg(out.svg); setError(""); }
      } catch (e) { if (live) setError((e as Error).message.split("\n")[0] ?? "Couldn't draw this diagram."); }
    })();
    return () => { live = false; };
  }, [code, color, id]);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const title = /^\s*%%\s*title:\s*(.+)$/m.exec(code)?.[1]?.trim() ?? "architecture";
  return <figure className={`diagram ${expanded ? "is-expanded" : ""}`}>
    <div className="diagram-bar">
      <span>{title}</span>
      <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}><Minus size={12} /></button>
      <button type="button" className="diagram-zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}><Plus size={12} /></button>
      <button type="button" aria-label="Copy Mermaid source" title="Copy Mermaid source" onClick={() => void copy()}><Copy size={12} />{copied && <em>Copied</em>}</button>
      {onSave && svg && <button type="button" aria-label="Save as SVG" title="Save as SVG" onClick={() => onSave(`${title.replace(/[^\w-]+/g, "-").toLowerCase()}.svg`, svg)}><Download size={12} /></button>}
      {onExpand && <button type="button" aria-label={expanded ? "Smaller" : "Bigger canvas"} title={expanded ? "Smaller" : "Bigger canvas"} onClick={() => onExpand(!expanded)}>{expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button>}
    </div>
    <div className="diagram-canvas" ref={host}>
      {svg ? <div className="diagram-svg" style={{ transform: `scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }} />
        : error ? <pre className="diagram-error">{error}{"\n\n"}{code}</pre> : <p className="diagram-loading">Drawing…</p>}
    </div>
  </figure>;
}
