export type ArchitectureLesson = {
  type: "architecture";
  version?: 2;
  id?: string;
  revision?: number;
  scope?: string;
  assumptions?: string[];
  tradeoffs?: string[];
  failureModes?: string[];
  sources?: Array<{ title: string; url: string }>;
  followups?: string[];
  title: string;
  summary: string;
  nodes: Array<{ id: string; label: string; role?: string; group?: string }>;
  edges: Array<{ id?: string; from: string; to: string; label: string }>;
  steps: Array<{ id?: string; title: string; body: string; focus: string[]; edgeFocus?: string[] }>;
  example: string;
  quiz?: { question: string; options: string[]; answer: number; why: string };
};

export function parseArchitecture(value: Record<string, unknown>): ArchitectureLesson | null {
  const text = (input: unknown, limit: number) => typeof input === "string" && input.trim().length <= limit ? input.trim() : "";
  const records = (input: unknown, limit: number): Record<string, unknown>[] => Array.isArray(input) && input.length <= limit ? input.map(item => item && typeof item === "object" ? item : {}) : [];
  if (value.version !== undefined && value.version !== 2) return null;
  if (value.revision !== undefined && (!Number.isInteger(value.revision) || Number(value.revision) < 1)) return null;
  const title = text(value.title, 100), summary = text(value.summary, 1200), example = text(value.example, 1200);
  const nodes = records(value.nodes, 12).map(node => ({ id: text(node.id, 80), label: text(node.label, 80), role: text(node.role, 80), group: text(node.group, 80) }));
  const ids = new Set(nodes.map(node => node.id));
  if (!title || !summary || !example || nodes.length < 2 || ids.size !== nodes.length || nodes.some(node => !node.id || !node.label)) return null;
  const edges = records(value.edges, 20).map((edge, index) => ({ id: edge.id === undefined ? `edge-${index + 1}` : text(edge.id, 80), from: text(edge.from, 80), to: text(edge.to, 80), label: text(edge.label, 160) }));
  const edgeIds = new Set(edges.map(edge => edge.id));
  if (!edges.length || edgeIds.size !== edges.length || edges.some(edge => !edge.id || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to)) return null;
  const references = (input: unknown, known: Set<string>): string[] | null => input === undefined ? [] : Array.isArray(input) && input.length <= known.size && input.every(id => typeof id === "string" && known.has(id)) ? [...new Set(input)] : null;
  const steps = records(value.steps, 12).map((step, index) => ({ id: step.id === undefined ? `step-${index + 1}` : text(step.id, 80), title: text(step.title, 100), body: text(step.body, 1200), focus: references(step.focus, ids), edgeFocus: references(step.edgeFocus, edgeIds) }));
  if (!steps.length || new Set(steps.map(step => step.id)).size !== steps.length || steps.some(step => !step.id || !step.title || !step.body || !step.focus || !step.edgeFocus)) return null;
  const list = (input: unknown, limit: number): string[] | null => input === undefined ? [] : Array.isArray(input) && input.length <= limit && input.every(item => text(item, 600)) ? input as string[] : null;
  const assumptions = list(value.assumptions, 8), tradeoffs = list(value.tradeoffs, 8), failureModes = list(value.failureModes, 8), followups = list(value.followups, 3);
  if (!assumptions || !tradeoffs || !failureModes || !followups) return null;
  if (value.sources !== undefined && (!Array.isArray(value.sources) || value.sources.length > 8)) return null;
  const sources = records(value.sources, 8).map(source => ({ title: text(source.title, 200), url: text(source.url, 2048) }));
  if (sources.some(source => { try { const url = new URL(source.url); return !source.title || !["https:", "http:"].includes(url.protocol) || !!url.username || !!url.password; } catch { return true; } })) return null;
  let quiz: ArchitectureLesson["quiz"];
  if (value.quiz !== undefined) {
    const raw = records([value.quiz], 1)[0]!;
    const options = Array.isArray(raw.options) ? raw.options.slice(0, 4).map(option => text(option, 160)) : [];
    if (!text(raw.question, 240) || options.length < 2 || options.some(option => !option) || !Number.isInteger(raw.answer) || Number(raw.answer) < 0 || Number(raw.answer) >= options.length) return null;
    quiz = { question: text(raw.question, 240), options, answer: Number(raw.answer), why: text(raw.why, 400) };
  }
  const id = value.id === undefined ? `legacy-${Array.from(title).reduce((hash, character) => Math.imul(hash, 31) + character.charCodeAt(0) | 0, 0) >>> 0}` : text(value.id, 80);
  if (!id) return null;
  return { type: "architecture", version: 2, id, revision: Number(value.revision ?? 1), scope: text(value.scope, 600) || "Proposed teaching example", assumptions, tradeoffs, failureModes, sources, followups, title, summary, nodes, edges, steps: steps as ArchitectureLesson["steps"], example, ...(quiz ? { quiz } : {}) };
}

export function normalizeArchitecture(value: unknown): ArchitectureLesson | null {
  return value && typeof value === "object" && !Array.isArray(value) ? parseArchitecture(value as Record<string, unknown>) : null;
}

export function lessonFocus(nodes: ArchitectureLesson["nodes"], sentence: string): string[] {
  const words = ` ${sentence.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return nodes.filter(node => words.includes(` ${node.label.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `)).map(node => node.id);
}

export function voiceEnvelope(previous: number, sample: number, speaking: boolean): number {
  if (!speaking) return 0;
  const target = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample * 6)) : 0;
  return previous + (target - previous) * (target > previous ? 0.45 : 0.16);
}
