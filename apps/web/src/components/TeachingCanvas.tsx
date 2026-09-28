import { useMemo, useRef, useState, useEffect, useId } from "react";
import type { TeachingDocument } from "@shuacrew/core";
import { layoutTeaching } from "../lib/teaching-layout";
export function TeachingCanvas({
  doc,
  onChange,
}: {
  doc: TeachingDocument;
  onChange: (change: Record<string, unknown>) => void;
}) {
  const marker = useId().replace(/:/g, ""),
    host = useRef<HTMLDivElement>(null),
    [overview, setOverview] = useState(false),
    [view, setView] = useState({ x: 0, y: 0, zoom: 1 }),
    [size, setSize] = useState({ width: 600, height: 420 });
  const layout = useMemo(() => {
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d")!;
    ctx.font = "14px system-ui";
    return layoutTeaching(doc, (s) => ctx.measureText(s).width);
  }, [doc.objects, doc.positions]);
  const index = doc.steps.findIndex((s) => s.id === doc.stepId),
    visible = new Set(
      overview ? doc.objects.map((o) => o.id) : [...(doc.steps[index]?.objects ?? []), ...doc.selected],
    );
  for (const o of doc.objects)
    if (visible.has(o.id) && o.kind === "connector") {
      if (o.from) visible.add(o.from);
      if (o.to) visible.add(o.to);
    }
  const shown = (id: string) => index < 0 || visible.size === 0 || visible.has(id);
  const displayed = [...layout.boxes, ...layout.groups].filter((n) => shown(n.id)),
    edges = layout.edges.filter((e) => shown(e.id) && shown(e.object.from!) && shown(e.object.to!));
  const left = Math.min(
      ...(displayed.length ? [] : [0]),
      ...displayed.map((n) => n.x - 30),
      ...edges.map((e) => e.x - e.width / 2 - 20),
    ),
    top = Math.min(...(displayed.length ? [] : [0]), ...displayed.map((n) => n.y - 30));
  const visibleBounds = {
    x: left,
    y: top,
    width:
      Math.max(
        300,
        ...displayed.map((n) => n.x + n.width + 30),
        ...edges.map((e) => e.x + e.width / 2 + 20),
      ) - left,
    height:
      Math.max(
        180,
        ...displayed.map((n) => n.y + n.height + 30),
        ...edges.map((e) => e.y + e.height / 2 + 20),
      ) - top,
  };
  const fit = () => {
    const b = visibleBounds,
      z = Math.min(1.4, (size.width - 40) / b.width, (size.height - 40) / b.height);
    setView({
      x: (size.width - b.width * z) / 2 - b.x * z,
      y: (size.height - b.height * z) / 2 - b.y * z,
      zoom: Math.max(0.08, z),
    });
  };
  useEffect(() => {
    if (!host.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    fit();
  }, [doc.sessionId, doc.stepId, doc.objects.length, size.width, size.height, overview]);
  useEffect(() => {
    const box = layout.boxes.find((n) => n.id === doc.focusId);
    if (box)
      setView((v) => ({
        ...v,
        x: size.width / 2 - (box.x + box.width / 2) * v.zoom,
        y: size.height / 2 - (box.y + box.height / 2) * v.zoom,
      }));
  }, [doc.focusId]);
  const drag = useRef<{
      x: number;
      y: number;
      view: typeof view;
      id?: string;
      ox: number;
      oy: number;
    } | null>(null),
    [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const selected = doc.objects.find((o) => doc.selected.includes(o.id));
  return (
    <div className="teaching-drawing">
      <div className="teaching-canvas-tools">
        <span>Learning canvas</span>
        <button aria-pressed={overview} onClick={() => setOverview((v) => !v)}>
          {overview ? "Whole lesson" : "This step"}
        </button>
        <button
          onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.08, v.zoom / 1.25) }))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button onClick={fit}>Fit</button>
        <button
          onClick={() => setView((v) => ({ ...v, zoom: Math.min(4, v.zoom * 1.25) }))}
          aria-label="Zoom in"
        >
          +
        </button>
        <small>{Math.round(view.zoom * 100)}%</small>
        <select
          aria-label="Select visual object"
          value={doc.selected[0] ?? ""}
          onChange={(e) => onChange({ action: "select", id: e.target.value || undefined })}
        >
          <option value="">Objects</option>
          {doc.objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label.slice(0, 50) || o.id}
            </option>
          ))}
        </select>
      </div>
      <div
        ref={host}
        className="teaching-canvas"
        role="region"
        aria-label="Editable learning canvas. Drag the background to pan; drag a shape to move it."
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setView((v) => ({
              ...v,
              zoom: Math.max(0.08, Math.min(4, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))),
            }));
          } else if (e.shiftKey) setView((v) => ({ ...v, x: v.x - e.deltaY, y: v.y - e.deltaX }));
        }}
      >
        <svg
          width="100%"
          height="100%"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const id =
              (e.target as Element).closest("[data-object]")?.getAttribute("data-object") ?? undefined;
            const b = layout.boxes.find((n) => n.id === id);
            drag.current = { x: e.clientX, y: e.clientY, view, id: b?.id, ox: b?.x ?? 0, oy: b?.y ?? 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (d.id) setPreview({ id: d.id, x: d.ox + dx / view.zoom, y: d.oy + dy / view.zoom });
            else setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            const distance = Math.hypot(e.clientX - d.x, e.clientY - d.y);
            if (d.id) {
              if (distance > 4)
                onChange({
                  action: "move",
                  id: d.id,
                  x: d.ox + (e.clientX - d.x) / view.zoom,
                  y: d.oy + (e.clientY - d.y) / view.zoom,
                });
              else onChange({ action: "select", id: d.id });
            } else if (distance < 4) onChange({ action: "select" });
            setPreview(null);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setPreview(null);
          }}
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-2)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {layout.groups
              .filter((n) => shown(n.id))
              .map((n) => (
                <g key={n.id} className="teaching-group">
                  <rect x={n.x} y={n.y} width={n.width} height={n.height} rx="18" />
                  <text x={n.x + 16} y={n.y + 22}>
                    {n.lines.map((line, i) => (
                      <tspan key={i} x={n.x + 16} dy={i ? 20 : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              ))}
            {layout.edges
              .filter((e) => shown(e.id) && shown(e.object.from!) && shown(e.object.to!))
              .map((e) => (
                <g key={e.id} className="teaching-edge">
                  <path
                    d={e.path}
                    fill="none"
                    stroke="var(--text-2)"
                    strokeWidth="1.6"
                    markerEnd={`url(#${marker})`}
                  />
                  {e.object.label && (
                    <>
                      <rect
                        x={e.x - e.width / 2}
                        y={e.y - e.height / 2}
                        width={e.width}
                        height={e.height}
                        rx="6"
                      />
                      <text textAnchor="middle" x={e.x} y={e.y - (e.label.length - 1) * 9 + 5}>
                        {e.label.map((line, i) => (
                          <tspan key={i} x={e.x} dy={i ? 18 : 0}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </>
                  )}
                </g>
              ))}
            {layout.boxes
              .filter((n) => shown(n.id))
              .map((n) => {
                const pos = preview?.id === n.id ? preview : n;
                return (
                  <g
                    key={n.id}
                    data-object={n.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.object.kind}: ${n.object.label}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onChange({ action: "select", id: n.id });
                      }
                    }}
                    transform={`translate(${pos.x} ${pos.y})`}
                    className={`teaching-node tone-${n.object.tone} ${doc.selected.includes(n.id) ? "is-selected" : ""} ${doc.highlighted.includes(n.id) ? "is-highlighted" : ""}`}
                  >
                    {n.object.kind === "circle" ? (
                      <ellipse cx={n.width / 2} cy={n.height / 2} rx={n.width / 2} ry={n.height / 2} />
                    ) : (
                      <rect
                        width={n.width}
                        height={n.height}
                        rx={n.object.kind === "callout" ? 4 : 12}
                        className={n.object.kind === "text" ? "text-only" : ""}
                      />
                    )}
                    <text textAnchor="middle" x={n.width / 2} y={(n.height - n.lines.length * 20) / 2 + 15}>
                      {n.lines.map((line, i) => (
                        <tspan key={i} x={n.width / 2} dy={i ? 20 : 0}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>
      </div>
      {selected && (
        <label className="teaching-object-editor">
          <span>Edit label</span>
          <input
            key={`${selected.id}:${selected.label}`}
            defaultValue={selected.label}
            maxLength={600}
            onBlur={(e) => {
              if (e.target.value !== selected.label)
                onChange({ action: "label", id: selected.id, label: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <small>User edits are protected</small>
        </label>
      )}
    </div>
  );
}
