import type { TeachingDocument, VisualObject } from "@shuacrew/core";
export type Box = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  object: VisualObject;
};
export type Edge = {
  id: string;
  path: string;
  label: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  object: VisualObject;
};
export function wrapLabel(text: string, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && measure(line + char) > max) {
        const space = line.lastIndexOf(" ");
        if (space > line.length / 2) {
          lines.push(line.slice(0, space));
          line = line.slice(space + 1) + char;
        } else {
          lines.push(line);
          line = char;
        }
      } else line += char;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}
/** Layered graph layout, stable ordering and measured labels. Cycles use an outer return lane. */
export function layoutTeaching(doc: TeachingDocument, measure: (s: string) => number) {
  const nodes = doc.objects.filter((o) => o.kind !== "connector" && o.kind !== "group"),
    links = doc.objects.filter((o) => o.kind === "connector"),
    rank = new Map(nodes.map((n) => [n.id, 0]));
  // Only propagate along a deterministic acyclic spanning graph; back edges stay in external lanes.
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const e of links.filter((e) => e.to === id)) {
      if (e.from && rank.has(e.from) && !visiting.has(e.from)) {
        visit(e.from);
        rank.set(id, Math.max(rank.get(id)!, Math.min(nodes.length, rank.get(e.from)! + 1)));
      }
    }
    visiting.delete(id);
    visited.add(id);
  };
  nodes.forEach((n) => visit(n.id));
  const levels = [...new Set(rank.values())].sort((a, b) => a - b),
    boxes: Box[] = [];
  let x = 64;
  for (const level of levels) {
    const incomingY = (id: string) => {
      const parents = links.filter((e) => e.to === id).flatMap((e) => boxes.filter((b) => b.id === e.from));
      return parents.length ? parents.reduce((sum, b) => sum + b.y + b.height / 2, 0) / parents.length : 0;
    };
    const row = nodes
      .filter((n) => rank.get(n.id) === level)
      .sort((a, b) => (a.groupId ?? "").localeCompare(b.groupId ?? "") || incomingY(a.id) - incomingY(b.id));
    let y = 64,
      columnWidth = 0;
    for (const n of row) {
      const lines = wrapLabel(n.label, 208, measure),
        width = n.kind === "circle" ? Math.max(248, lines.length * 20 + 80) : 240,
        height = n.kind === "circle" ? width : Math.max(72, lines.length * 20 + 36);
      const point = doc.positions[n.id];
      boxes.push({ id: n.id, object: n, x: point?.x ?? x, y: point?.y ?? y, width, height, lines });
      y += height + 90;
      columnWidth = Math.max(columnWidth, width);
    }
    x += columnWidth + 190;
  }
  // Long single-path lessons fold into readable rows instead of one tiny horizontal strip.
  const groupRows = new Map<string, Set<number>>();
  for (const n of nodes)
    if (n.groupId) {
      const rows = groupRows.get(n.groupId) ?? new Set<number>();
      rows.add(Math.floor((rank.get(n.id) ?? 0) / 3));
      groupRows.set(n.groupId, rows);
    }
  const foldChain =
    nodes.length > 4 &&
    levels.length === nodes.length &&
    links.length === nodes.length - 1 &&
    nodes.every(
      (n) =>
        links.filter((e) => e.from === n.id).length <= 1 && links.filter((e) => e.to === n.id).length <= 1,
    ) &&
    [...groupRows.values()].every((rows) => rows.size === 1);
  if (foldChain) {
    const cellWidth = Math.max(...boxes.map((b) => b.width)) + 190;
    const cellHeight = Math.max(...boxes.map((b) => b.height)) + 160;
    for (const box of boxes) {
      if (doc.positions[box.id]) continue;
      const level = rank.get(box.id) ?? 0,
        row = Math.floor(level / 3),
        col = row % 2 ? 2 - (level % 3) : level % 3;
      box.x = 64 + col * cellWidth;
      box.y = 64 + row * cellHeight;
    }
  }
  const groups: Box[] = [];
  let pending = doc.objects.filter((o) => o.kind === "group");
  for (let pass = 0; pass < 80 && pending.length; pass++) {
    const next: VisualObject[] = [];
    for (const g of pending) {
      if (pending.some((o) => o.groupId === g.id)) {
        next.push(g);
        continue;
      }
      const children = [...boxes, ...groups].filter((n) => n.object.groupId === g.id);
      const lines = wrapLabel(g.label, 220, measure);
      const x = children.length ? Math.min(...children.map((n) => n.x)) - 24 : 64 + groups.length * 320,
        y = children.length ? Math.min(...children.map((n) => n.y)) - lines.length * 20 - 30 : 64;
      groups.push({
        id: g.id,
        object: g,
        x,
        y,
        width: children.length ? Math.max(...children.map((n) => n.x + n.width)) - x + 24 : 280,
        height: children.length ? Math.max(...children.map((n) => n.y + n.height)) - y + 24 : 100,
        lines,
      });
    }
    pending = next;
  }
  const all = [...boxes, ...groups],
    edges: Edge[] = [];
  for (const [i, e] of links.entries()) {
    const from = all.find((n) => n.id === e.from),
      to = all.find((n) => n.id === e.to);
    if (!from || !to) continue;
    const lines = wrapLabel(e.label, 164, measure),
      width = Math.max(40, ...lines.map(measure)) + 16,
      height = lines.length * 18 + 12;
    const x1 = from.x + from.width / 2,
      y1 = from.y + from.height,
      x2 = to.x + to.width / 2;
    let route: string, x: number, cy: number;
    if (Math.abs(x2 - x1) < 1 && to.y > y1 + height + 16) {
      x = x1;
      cy = (y1 + to.y) / 2;
      route = `M ${x1} ${y1} V ${to.y}`;
    } else if (to.x + to.width + width + 16 < from.x && Math.abs(to.y - from.y) < 1) {
      x = (from.x + to.x + to.width) / 2;
      cy = from.y + from.height / 2;
      route = `M ${from.x} ${cy} H ${to.x + to.width}`;
    } else if (to.x > from.x + from.width + width + 16) {
      const lane = from.x + from.width + (to.x - from.x - from.width) / 2;
      const startY = from.y + from.height / 2,
        endY = to.y + to.height / 2;
      route = `M ${from.x + from.width} ${startY} H ${lane} V ${endY} H ${to.x}`;
      x = lane;
      cy = (startY + endY) / 2;
    } else {
      const lane = Math.max(...all.map((n) => n.y + n.height)) + 60 + i * (height + 20);
      route = `M ${x1} ${y1} V ${lane} H ${x2} V ${to.y + to.height}`;
      x = (x1 + x2) / 2;
      cy = lane;
    }

    edges.push({ id: e.id, object: e, path: route, label: lines, x, y: cy, width, height });
  }
  const minX = Math.min(0, ...all.map((n) => n.x - 30)),
    minY = Math.min(0, ...all.map((n) => n.y - 30));
  return {
    boxes,
    groups,
    edges,
    bounds: {
      x: minX,
      y: minY,
      width:
        Math.max(400, ...all.map((n) => n.x + n.width + 40), ...edges.map((e) => e.x + e.width + 30)) - minX,
      height:
        Math.max(240, ...all.map((n) => n.y + n.height + 40), ...edges.map((e) => e.y + e.height + 30)) -
        minY,
    },
  };
}
