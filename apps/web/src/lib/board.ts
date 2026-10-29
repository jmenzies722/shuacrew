/**
 * Shua's board: a lesson drawn on a whiteboard over your screen, one idea at a time, as Shua says it.
 *
 * What makes it teach well (research, 2026: speech-synchronized whiteboard tutors and ExcaliTeach, arXiv 2603.25870):
 * say one idea, draw it, then the next; keep it to about a dozen shapes; never ask the model for pixel positions (it
 * places things badly) — it names the parts and the order, and a layout engine places them. So a board is a graph
 * (nodes, edges, optional groups) plus steps, and each step says which parts it introduces. The lesson Shua already
 * writes (```visual {"type":"architecture"}```) is exactly that, and its narration carries each step's id, so the board
 * draws a step when the voice reaches it.
 */
import { layout } from "dagre-d3-es/src/dagre/index.js";
import { Graph } from "dagre-d3-es/src/graphlib/index.js";
import type { ArchitectureLesson } from "./notch-lesson";
import type { NodeKind, Visual } from "./visual";

export type BoardKind = NodeKind | "generic";
export interface BoardNode { id: string; label: string; role?: string; group?: string; kind: BoardKind }
export interface BoardEdge { id: string; from: string; to: string; label?: string }
export interface BoardStep { id: string; title: string; body: string; nodes: string[]; edges: string[] }
export interface Board {
  /** `${lessonId}:${revision}`: the same key the voice's narration carries, so the board follows it. */
  key: string;
  lessonId: string;
  revision: number;
  title: string;
  summary: string;
  scope?: string;
  nodes: BoardNode[];
  edges: BoardEdge[];
  steps: BoardStep[];
  followups: string[];
  /** Whether the voice paces it (an architecture lesson), or it draws itself at reading pace (a flow). */
  paced: "voice" | "self";
}

// ── what each part is ─────────────────────────────────────────────────────────────────────

/** Most specific first: "API gateway" is an API, "Redis cache" a cache, "auth service" auth. */
const KIND_RULES: Array<[BoardKind, RegExp]> = [
  ["auth", /\b(auth\w*|login|identity|oauth|sso|iam|tokens?|sessions? store)\b/i],
  ["cache", /\b(cache\w*|redis|memcached?|cdn cache)\b/i],
  ["queue", /\b(queues?|kafka|sqs|sns|pub\/?sub|streams?|topics?|event bus|rabbitmq|broker|kinesis)\b/i],
  ["search", /\b(search|elastic\w*|opensearch|indexer|vector (db|store|index)|embeddings?)\b/i],
  ["db", /\b(databases?|db|postgres\w*|mysql|sql|dynamo\w*|mongo\w*|cassandra|sqlite|aurora|tables?|replicas?|primary|shards?)\b/i],
  ["storage", /\b(storage|s3|blobs?|buckets?|object store|disks?|files? store|artifact registry|registry|archive)\b/i],
  ["cdn", /\b(cdn|edge|cloudfront|akamai|fastly)\b/i],
  ["lb", /\b(load ?balancers?|lb|alb|nlb|ingress|nginx|haproxy|reverse proxy|traffic)\b/i],
  ["api", /\b(api|apis|gateway|endpoints?|rest|graphql|grpc|backend for frontend|bff)\b/i],
  ["worker", /\b(workers?|jobs?|cron|consumers?|processors?|pipelines?|batch|lambdas?|functions?|schedulers?|ci|cd|build)\b/i],
  ["external", /\b(third[- ]party|external|stripe|twilio|payment provider|providers?|vendors?|partners?|webhooks?|email service)\b/i],
  ["client", /\b(clients?|browsers?|mobile|apps?|frontend|web ui|ui|spa|ios|android)\b/i],
  ["user", /\b(users?|customers?|people|person|you|visitors?|developers?|team)\b/i],
  ["service", /\b(services?|microservices?|modules?|domain)\b/i],
  ["server", /\b(servers?|hosts?|vms?|containers?|pods?|clusters?|instances?|nodes?|production|staging|environments?)\b/i],
];
export function kindOf(label: string, role = ""): BoardKind {
  for (const text of [label, role]) for (const [kind, rule] of KIND_RULES) if (rule.test(text)) return kind;
  return "generic";
}

// ── from what Shua wrote ──────────────────────────────────────────────────────────────────

const clip = (text: string | undefined, max: number) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** An architecture lesson as a board: its steps keep their ids, so the voice's narration picks the step to draw. */
export function boardFromLesson(lesson: ArchitectureLesson): Board {
  const lessonId = lesson.id ?? lesson.title, revision = lesson.revision ?? 1;
  const nodes = lesson.nodes.slice(0, 16).map((n) => ({ id: n.id, label: clip(n.label, 48), role: clip(n.role, 60) || undefined, group: clip(n.group, 40) || undefined, kind: kindOf(n.label, n.role) }));
  const known = new Set(nodes.map((n) => n.id));
  const edges = lesson.edges.filter((e) => known.has(e.from) && known.has(e.to)).slice(0, 24).map((e, i) => ({ id: e.id ?? `edge-${i + 1}`, from: e.from, to: e.to, label: clip(e.label, 40) || undefined }));
  const edgeIds = new Set(edges.map((e) => e.id));
  const steps = lesson.steps.map((s, i) => ({ id: s.id ?? `step-${i + 1}`, title: clip(s.title, 80), body: clip(s.body, 600), nodes: s.focus.filter((id) => known.has(id)), edges: (s.edgeFocus ?? []).filter((id) => edgeIds.has(id)) }));
  return { key: `${lessonId}:${revision}`, lessonId, revision, title: clip(lesson.title, 90), summary: clip(lesson.summary, 400), scope: clip(lesson.scope, 160) || undefined, nodes, edges, steps, followups: (lesson.followups ?? []).slice(0, 3), paced: "voice" };
}

/** A flow (the quick system sketch) as a board: one step per connection, in the order written, drawn at reading pace. */
export function boardFromFlow(flow: Extract<Visual, { type: "flow" }>): Board {
  const nodes = flow.nodes.slice(0, 16).map((n) => ({ id: n.id, label: clip(n.label, 48), kind: n.kind as BoardKind }));
  const known = new Set(nodes.map((n) => n.id));
  const edges = flow.edges.filter((e) => known.has(e.from) && known.has(e.to)).slice(0, 24).map((e, i) => ({ id: `edge-${i + 1}`, from: e.from, to: e.to, label: clip(e.label, 40) || undefined }));
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const steps = edges.map((e, i) => ({ id: `step-${i + 1}`, title: `${label(e.from)} → ${label(e.to)}`, body: e.label ? `${label(e.from)} ${e.label} ${label(e.to)}.` : `${label(e.from)} talks to ${label(e.to)}.`, nodes: [e.from, e.to], edges: [e.id] }));
  const lessonId = `flow-${clip(flow.title, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return { key: `${lessonId}:1`, lessonId, revision: 1, title: clip(flow.title, 90), summary: "", nodes, edges, steps, followups: [], paced: "self" };
}

export function boardFromVisual(v: Visual): Board | null {
  if (v.type === "architecture") return v.nodes.length ? boardFromLesson(v) : null;
  if (v.type === "flow") return v.nodes.length ? boardFromFlow(v) : null;
  return null;
}

// ── what appears when ─────────────────────────────────────────────────────────────────────

/** Stage 0 is the overview (said before any step); stage i (1…) is step i. */
export interface Stage { step: string | null; nodes: string[]; edges: string[] }

/**
 * What each stage draws for the first time. A step draws the parts it's about (and the ends of any connection it
 * draws); a connection no step names appears as soon as both its ends are up; parts no step names are context, up
 * from the overview. Everything is drawn once, so by the last step the whole picture is there.
 */
export function stages(board: Board): Stage[] {
  const named = new Set(board.steps.flatMap((s) => s.nodes));
  for (const s of board.steps) for (const id of s.edges) { const e = board.edges.find((x) => x.id === id); if (e) { named.add(e.from); named.add(e.to); } }
  const namedEdges = new Set(board.steps.flatMap((s) => s.edges));
  const shownNodes = new Set<string>(), shownEdges = new Set<string>();
  const out: Stage[] = [];
  const close = (stage: Stage) => {
    // Connections nobody narrates join as soon as both ends are on the board.
    for (const e of board.edges) if (!namedEdges.has(e.id) && !shownEdges.has(e.id) && shownNodes.has(e.from) && shownNodes.has(e.to)) { shownEdges.add(e.id); stage.edges.push(e.id); }
    out.push(stage);
  };
  const overview: Stage = { step: null, nodes: [], edges: [] };
  for (const n of board.nodes) if (!named.has(n.id)) { shownNodes.add(n.id); overview.nodes.push(n.id); }
  close(overview);
  for (const s of board.steps) {
    const stage: Stage = { step: s.id, nodes: [], edges: [] };
    const add = (id: string) => { if (!shownNodes.has(id) && board.nodes.some((n) => n.id === id)) { shownNodes.add(id); stage.nodes.push(id); } };
    s.nodes.forEach(add);
    for (const id of s.edges) {
      const e = board.edges.find((x) => x.id === id);
      if (!e || shownEdges.has(id)) continue;
      add(e.from); add(e.to); shownEdges.add(id); stage.edges.push(id);
    }
    close(stage);
  }
  // Anything still missing (a step referenced nothing it could draw): it all lands with the last step.
  const last = out[out.length - 1]!;
  for (const n of board.nodes) if (!shownNodes.has(n.id)) { shownNodes.add(n.id); last.nodes.push(n.id); }
  for (const e of board.edges) if (!shownEdges.has(e.id)) { shownEdges.add(e.id); last.edges.push(e.id); }
  return out;
}

/** The stage the voice is on: the step it's saying, or the overview before the first step. */
export function stageIndex(board: Board, stepId: string | null | undefined): number {
  if (!stepId) return 0;
  const i = board.steps.findIndex((s) => s.id === stepId);
  return i < 0 ? 0 : i + 1;
}

/** How long a self-paced stage stays before the next is drawn: about reading speed, never rushed or sluggish. */
export function readingMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(2600, words * 330));
}

// ── where things go ───────────────────────────────────────────────────────────────────────

export interface Placed { x: number; y: number; w: number; h: number }
export interface BoardLayout {
  nodes: Map<string, Placed>;
  edges: Map<string, Array<{ x: number; y: number }>>;
  groups: Array<{ name: string } & Placed>;
  width: number;
  height: number;
  direction: "LR" | "TB";
}

/** A label in at most two lines of about 18 characters, broken at words. */
export function wrapLabel(label: string, width = 16): string[] {
  const words = label.split(/\s+/).filter(Boolean), lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  const second = lines.slice(1).join(" ");
  return [lines[0]!, second.length > width + 2 ? `${second.slice(0, width).trimEnd()}…` : second];
}

const NODE_H = 64, NODE_MIN_W = 112, NODE_MAX_W = 184;
export function nodeSize(node: BoardNode): { w: number; h: number } {
  const lines = wrapLabel(node.label);
  const longest = Math.max(...lines.map((l) => l.length), 6);
  return { w: Math.round(Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, longest * 8.1 + 58))), h: NODE_H + (lines.length > 1 ? 16 : 0) };
}

/**
 * Place every part with dagre's layered layout (groups as containers). Both directions are laid out and the one that
 * fills the canvas best wins: the board scales the drawing to fit (an SVG viewBox), and a long chain laid left to right
 * on a short canvas came out as a 4:1 strip of tiny boxes (measured: 2170×497 in a 978×529 canvas).
 */
export function layoutBoard(board: Board, canvas: { width: number; height: number } = { width: 1300, height: 560 }): BoardLayout {
  const fit = (l: BoardLayout) => Math.min(canvas.width / l.width, canvas.height / l.height);
  // Left to right reads more naturally for a request path: it wins a near tie.
  const best = (a: BoardLayout, b: BoardLayout) => (fit(a) >= fit(b) * 0.92 ? a : b);
  // Groups drawn around their parts after a plain layout fit ~20% bigger than dagre's containers (which add border
  // columns) — used whenever those boxes stay clear of each other and of every other part, so nothing overlaps.
  const flat = [layoutIn(board, "LR", false), layoutIn(board, "TB", false)].filter((l) => l.groups.length === 0 || clearGroups(board, l));
  const contained = [layoutIn(board, "LR", true), layoutIn(board, "TB", true)];
  return flat.length ? best(flat.length === 2 ? best(flat[0]!, flat[1]!) : flat[0]!, best(contained[0]!, contained[1]!)) : best(contained[0]!, contained[1]!);
}

const GROUP_PAD = { side: 16, top: 30, bottom: 14 };
/** The group boxes of a plain layout: each one hugs its own parts, with room for its name on top. */
function hullGroups(board: Board, nodes: Map<string, Placed>): Array<{ name: string } & Placed> {
  const names = [...new Set(board.nodes.map((n) => n.group).filter((g): g is string => !!g))];
  if (names.length < 2) return [];
  return names.map((name) => {
    const boxes = board.nodes.filter((n) => n.group === name).map((n) => nodes.get(n.id)!);
    const x = Math.min(...boxes.map((b) => b.x)) - GROUP_PAD.side, y = Math.min(...boxes.map((b) => b.y)) - GROUP_PAD.top;
    return { name, x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) + GROUP_PAD.side - x, h: Math.max(...boxes.map((b) => b.y + b.h)) + GROUP_PAD.bottom - y };
  });
}
const overlaps = (a: Placed, b: Placed, gap = 6) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
/** No two group boxes touch, and no box covers a part from another group (or from none). */
export function clearGroups(board: Board, l: BoardLayout): boolean {
  for (let i = 0; i < l.groups.length; i++) for (let j = i + 1; j < l.groups.length; j++) if (overlaps(l.groups[i]!, l.groups[j]!)) return false;
  for (const group of l.groups) for (const n of board.nodes) if (n.group !== group.name && overlaps(group, l.nodes.get(n.id)!, 0)) return false;
  return true;
}

function layoutIn(board: Board, direction: "LR" | "TB", contain: boolean): BoardLayout {
  const groups = [...new Set(board.nodes.map((n) => n.group).filter((g): g is string => !!g))];
  const compound = contain && groups.length > 1;
  const g = new Graph({ compound, multigraph: true });
  // Edge labels are drawn on the line, not given room of their own: as sized dagre labels they pushed every column
  // ~300 units apart. The gap between columns is wide enough for a short label instead.
  // In a container layout dagre adds a border column each side of every group, so the gap itself can be smaller.
  g.setGraph({ rankdir: direction, nodesep: direction === "LR" ? 36 : 48, ranksep: compound ? (direction === "LR" ? 56 : 48) : (direction === "LR" ? 104 : 80), edgesep: 18, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  if (compound) for (const name of groups) g.setNode(`group:${name}`, { label: name, paddingTop: 32, paddingBottom: 14, paddingLeft: 14, paddingRight: 14 });
  for (const n of board.nodes) {
    const { w, h } = nodeSize(n);
    g.setNode(n.id, { width: w, height: h });
    if (compound && n.group) g.setParent(n.id, `group:${n.group}`);
  }
  for (const e of board.edges) g.setEdge(e.from, e.to, {}, e.id);
  layout(g, {});
  const nodes = new Map<string, Placed>();
  for (const n of board.nodes) { const p = g.node(n.id) as { x: number; y: number; width: number; height: number }; nodes.set(n.id, { x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height }); }
  const edges = new Map<string, Array<{ x: number; y: number }>>();
  for (const e of board.edges) { const p = g.edge({ v: e.from, w: e.to, name: e.id }) as { points?: Array<{ x: number; y: number }> } | undefined; edges.set(e.id, (p?.points ?? []).map((pt) => ({ x: pt.x, y: pt.y }))); }
  const placedGroups = !compound ? hullGroups(board, nodes) : groups.flatMap((name) => { const p = g.node(`group:${name}`) as { x?: number; y?: number; width?: number; height?: number } | undefined; return p?.width && p.height && p.x !== undefined && p.y !== undefined ? [{ name, x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height }] : []; });
  const all = [...nodes.values(), ...placedGroups];
  // Hull boxes can reach past dagre's margin: shift everything so the drawing starts at the margin.
  const minX = Math.min(...all.map((p) => p.x)), minY = Math.min(...all.map((p) => p.y)), dx = minX < 24 ? 24 - minX : 0, dy = minY < 24 ? 24 - minY : 0;
  if (dx || dy) {
    for (const p of all) { p.x += dx; p.y += dy; }
    for (const pts of edges.values()) for (const pt of pts) { pt.x += dx; pt.y += dy; }
  }
  const width = Math.max(320, ...all.map((p) => p.x + p.w)) + 28, height = Math.max(200, ...all.map((p) => p.y + p.h)) + 28;
  return { nodes, edges, groups: placedGroups, width, height, direction };
}

// ── the bridge ────────────────────────────────────────────────────────────────────────────

/** What Shua's page tells the board window (through the Mac app). */
export type BoardMessage =
  | { op: "show"; board: Board; accent?: string }
  | { op: "step"; key: string; step: string | null }
  | { op: "speaking"; on: boolean }
  | { op: "hide" };
