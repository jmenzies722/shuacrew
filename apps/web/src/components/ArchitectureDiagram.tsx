import { useEffect, useId, useMemo, useRef, useState } from "react";
import { layoutArchitecture } from "../lib/architecture-layout";
import type { ArchitectureLesson } from "../lib/notch-lesson";

export function ArchitectureDiagram({ lesson, group, focused = [], edgeFocus = [], maxHeight = 300 }: { lesson: ArchitectureLesson; group?: string; focused?: string[]; edgeFocus?: string[]; maxHeight?: number }) {
  const arrow = `architecture-arrow-${useId().replace(/:/g, "")}`;
  const layout = useMemo(() => layoutArchitecture(lesson, group), [lesson, group]);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600), [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    setWidth(element.clientWidth); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = zoomed ? 1 : Math.min(1, width / layout.width, maxHeight / layout.height);
  return <><button type="button" className="architecture-zoom" aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? "Fit architecture" : "Explore at full size"}</button><div ref={viewport} className="architecture-diagram-scroll" tabIndex={0} role="region" aria-label="Connected architecture diagram, scroll to explore">
    <div style={{ width: Math.max(width, layout.width * scale), height: layout.height * scale }}>
    <div className="architecture-diagram" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: "top left", marginLeft: Math.max(0, (width - layout.width * scale) / 2) }}>
      <svg width={layout.width} height={layout.height} aria-hidden="true"><defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
        {layout.edges.map(edge => <polyline key={edge.id} points={edge.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={edgeFocus.includes(edge.id) ? 3 : 1.5} className={edgeFocus.includes(edge.id) ? "is-focused" : ""} markerEnd={`url(#${arrow})`} />)}
      </svg>
      {layout.nodes.map(box => { const node = lesson.nodes.find(item => item.id === box.id)!; return <div key={node.id} className="architecture-node" data-focused={focused.includes(node.id)} style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height }}><small>{node.role || node.group || "COMPONENT"}</small><strong>{node.label}</strong><i /></div>; })}
    </div></div>
  </div></>;
}
