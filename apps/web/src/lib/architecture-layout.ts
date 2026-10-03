import type { ArchitectureLesson } from "./notch-lesson";

export function layoutArchitecture(lesson: ArchitectureLesson, group?: string) {
  const selected = group ? new Set(lesson.nodes.filter(node => node.group === group).map(node => node.id)) : null;
  if (selected) {
    const primary = new Set(selected);
    for (const edge of lesson.edges) if (primary.has(edge.from) || primary.has(edge.to)) { selected.add(edge.from); selected.add(edge.to); }
  }
  const nodes = lesson.nodes.filter(node => !selected || selected.has(node.id));
  const indices = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = lesson.edges.filter(edge => indices.has(edge.from) && indices.has(edge.to));
  const visiting = new Set<string>(), visited = new Set<string>(), order: string[] = [], forward: typeof edges = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of edges.filter(item => item.from === id)) {
      if (visiting.has(edge.to)) continue;
      forward.push(edge); visit(edge.to);
    }
    visiting.delete(id); visited.add(id); order.push(id);
  };
  nodes.forEach(node => visit(node.id));
  const ranks = new Map(nodes.map(node => [node.id, 0]));
  for (const id of order.reverse()) for (const edge of forward.filter(item => item.from === id)) ranks.set(edge.to, Math.max(ranks.get(edge.to)!, ranks.get(id)! + 1));
  const rows = new Map<number, number>();
  const boxes = nodes.map(node => {
    const rank = ranks.get(node.id)!, offset = rows.get(rank) ?? 0;
    const height = Math.max(114, Math.ceil(Array.from(node.label).length / 10) * 19 + Math.ceil(Array.from(node.role || node.group || "COMPONENT").length / 14) * 12 + 40);
    rows.set(rank, offset + height + 40);
    return { id: node.id, x: 24 + rank * 230, y: 40 + offset, width: 170, height };
  });
  const height = Math.max(220, ...boxes.map(node => node.y + node.height + 40));
  const routes = edges.map((edge, index) => {
    const from = boxes[indices.get(edge.from)!]!, to = boxes[indices.get(edge.to)!]!;
    const start = { x: from.x + from.width, y: from.y + from.height / 2 }, end = { x: to.x, y: to.y + to.height / 2 };
    const points = to.x - from.x === 230 ? [start, { x: start.x + 26 + index % 3 * 4, y: start.y }, { x: start.x + 26 + index % 3 * 4, y: end.y }, end]
      : [start, { x: start.x + 12 + index * 3, y: start.y }, { x: start.x + 12 + index * 3, y: height + index * 14 }, { x: end.x - 12, y: height + index * 14 }, { x: end.x - 12, y: end.y }, end];
    return { id: edge.id ?? `edge-${index + 1}`, points };
  });
  return { nodes: boxes, edges: routes, width: Math.max(220, ...boxes.map(node => node.x + node.width + 90)), height: height + edges.length * 14 + 15 };
}
