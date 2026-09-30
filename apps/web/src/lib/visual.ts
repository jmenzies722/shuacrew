/**
 * Visual cards: when a picture explains it better than words, Spark adds a ```visual {…}``` block and the notch drops
 * open with an animated card — a number counting up, bars growing, a forecast strip, a timeline, steps, a ranked list —
 * while the voice walks through it. Spark fills it with real data (from its search or your Mac), never made up.
 */

export type Visual =
  | { type: "stat"; title: string; value: number; unit?: string; prefix?: string; delta?: number; deltaLabel?: string; sub?: string }
  | { type: "compare"; title: string; items: Array<{ label: string; value: number; display?: string }>; better?: "high" | "low" }
  | { type: "forecast"; title: string; items: Array<{ label: string; temp: number; icon: WeatherIcon; rain?: number }> }
  | { type: "timeline"; title: string; items: Array<{ time: string; label: string; now?: boolean }> }
  | { type: "steps"; title: string; steps: string[] }
  | { type: "list"; title: string; items: Array<{ label: string; detail?: string; score?: number }> }
  // Teaching: system design and concepts, animated so the idea flows.
  | { type: "flow"; title: string; nodes: Array<{ id: string; label: string; kind: NodeKind }>; edges: Array<{ from: string; to: string; label?: string }> }
  | { type: "sequence"; title: string; actors: string[]; messages: Array<{ from: number; to: number; label: string }> }
  | { type: "layers"; title: string; layers: Array<{ label: string; detail?: string }> }
  | { type: "cycle"; title: string; steps: string[] }
  | { type: "concept"; title: string; term: string; definition: string; points: string[]; analogy?: string }
  // More data.
  | { type: "chart"; title: string; points: Array<{ label: string; value: number }>; prefix?: string; unit?: string }
  | { type: "score"; title: string; home: { name: string; score: number }; away: { name: string; score: number }; status?: string }
  | { type: "gauge"; title: string; value: number; max: number; unit?: string; label?: string }
  | { type: "proscons"; title: string; pros: string[]; cons: string[] }
  // Live: ticks down in the notch until the moment (a launch, a flight, kickoff).
  | { type: "countdown"; title: string; target: string; sub?: string }
  // Teaching, engineer-first: the working, not just the picture.
  | { type: "math"; title: string; steps: Array<{ expr: string; note?: string }>; answer?: string }
  | { type: "code"; title: string; lang?: string; code: string; focus: number[]; note?: string }
  | { type: "table"; title: string; columns: string[]; rows: string[][]; best?: number }
  | { type: "quiz"; title: string; question: string; options: string[]; answer: number; why?: string };

export const NODE_KINDS = ["user", "client", "cdn", "lb", "api", "service", "server", "worker", "cache", "db", "queue", "storage", "search", "external", "auth"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const WEATHER_ICONS = ["sun", "partly", "cloud", "rain", "storm", "snow", "wind", "fog", "night"] as const;
export type WeatherIcon = (typeof WEATHER_ICONS)[number];

const s = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** A card from Spark's block, checked field by field; anything malformed is dropped rather than drawn wrong. */
export function parseVisual(raw: string): Visual | null {
  const body = raw.replace(/^```visual\s*/i, "").replace(/```\s*$/, "").trim();
  let o: Record<string, unknown>;
  try { o = rec(JSON.parse(body)); } catch { return null; }
  const title = s(o.title, 60) ?? "";
  switch (o.type) {
    case "stat": {
      const value = n(o.value); if (value === undefined) return null;
      const delta = n(o.delta), unit = s(o.unit, 12), prefix = s(o.prefix, 4), deltaLabel = s(o.deltaLabel, 30), sub = s(o.sub, 80);
      return { type: "stat", title, value, ...(unit ? { unit } : {}), ...(prefix ? { prefix } : {}), ...(delta !== undefined ? { delta } : {}), ...(deltaLabel ? { deltaLabel } : {}), ...(sub ? { sub } : {}) };
    }
    case "compare": {
      const items = arr(o.items, 6).map(rec).map((i) => ({ label: s(i.label, 30), value: n(i.value), display: s(i.display, 16) }))
        .filter((i): i is { label: string; value: number; display: string | undefined } => !!i.label && i.value !== undefined)
        .map(({ display, ...i }) => ({ ...i, ...(display ? { display } : {}) }));
      return items.length >= 2 ? { type: "compare", title, items, ...(o.better === "low" || o.better === "high" ? { better: o.better } : {}) } : null;
    }
    case "forecast": {
      const items = arr(o.items, 8).map(rec).map((i) => ({ label: s(i.label, 8), temp: n(i.temp), icon: WEATHER_ICONS.find((w) => w === i.icon) ?? "cloud", rain: n(i.rain) }))
        .filter((i): i is { label: string; temp: number; icon: WeatherIcon; rain: number | undefined } => !!i.label && i.temp !== undefined)
        .map(({ rain, ...i }) => ({ ...i, ...(rain !== undefined ? { rain: Math.max(0, Math.min(100, Math.round(rain))) } : {}) }));
      return items.length >= 2 ? { type: "forecast", title, items } : null;
    }
    case "timeline": {
      const items = arr(o.items, 8).map(rec).map((i) => ({ time: s(i.time, 14), label: s(i.label, 50), now: i.now === true }))
        .filter((i): i is { time: string; label: string; now: boolean } => !!i.time && !!i.label).map(({ now, ...i }) => ({ ...i, ...(now ? { now } : {}) }));
      return items.length >= 2 ? { type: "timeline", title, items } : null;
    }
    case "steps": {
      const steps = arr(o.steps, 6).map((x) => s(x, 90)).filter((x): x is string => !!x);
      return steps.length >= 2 ? { type: "steps", title, steps } : null;
    }
    case "list": {
      const items = arr(o.items, 6).map(rec).map((i) => ({ label: s(i.label, 40), detail: s(i.detail, 60), score: n(i.score) }))
        .filter((i): i is { label: string; detail: string | undefined; score: number | undefined } => !!i.label)
        .map(({ detail, score, ...i }) => ({ ...i, ...(detail ? { detail } : {}), ...(score !== undefined ? { score } : {}) }));
      return items.length >= 2 ? { type: "list", title, items } : null;
    }
    case "flow": {
      const nodes = arr(o.nodes, 9).map(rec).map((x) => ({ id: s(x.id, 24), label: s(x.label, 22), kind: NODE_KINDS.find((k) => k === x.kind) ?? "service" }))
        .filter((x): x is { id: string; label: string; kind: NodeKind } => !!x.id && !!x.label);
      const ids = new Set(nodes.map((x) => x.id));
      const edges = arr(o.edges, 14).map(rec).map((e) => ({ from: s(e.from, 24), to: s(e.to, 24), label: s(e.label, 18) }))
        .filter((e): e is { from: string; to: string; label: string | undefined } => !!e.from && !!e.to && ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
        .map(({ label, ...e }) => ({ ...e, ...(label ? { label } : {}) }));
      return nodes.length >= 2 && edges.length >= 1 ? { type: "flow", title, nodes, edges } : null;
    }
    case "sequence": {
      const actors = arr(o.actors, 4).map((x) => s(x, 16)).filter((x): x is string => !!x);
      const messages = arr(o.messages, 8).map(rec).map((m) => ({ from: n(m.from), to: n(m.to), label: s(m.label, 30) }))
        .filter((m): m is { from: number; to: number; label: string } => m.from !== undefined && m.to !== undefined && !!m.label && m.from !== m.to && m.from >= 0 && m.to >= 0 && m.from < actors.length && m.to < actors.length);
      return actors.length >= 2 && messages.length >= 1 ? { type: "sequence", title, actors, messages } : null;
    }
    case "layers": {
      const layers = arr(o.layers, 7).map(rec).map((l) => ({ label: s(l.label, 30), detail: s(l.detail, 60) }))
        .filter((l): l is { label: string; detail: string | undefined } => !!l.label).map(({ detail, ...l }) => ({ ...l, ...(detail ? { detail } : {}) }));
      return layers.length >= 2 ? { type: "layers", title, layers } : null;
    }
    case "cycle": {
      const steps = arr(o.steps, 6).map((x) => s(x, 26)).filter((x): x is string => !!x);
      return steps.length >= 3 ? { type: "cycle", title, steps } : null;
    }
    case "concept": {
      const term = s(o.term, 40), definition = s(o.definition, 160), analogy = s(o.analogy, 120);
      const points = arr(o.points, 4).map((x) => s(x, 80)).filter((x): x is string => !!x);
      return term && definition ? { type: "concept", title, term, definition, points, ...(analogy ? { analogy } : {}) } : null;
    }
    case "chart": {
      const points = arr(o.points, 24).map(rec).map((p) => ({ label: s(p.label, 10), value: n(p.value) })).filter((p): p is { label: string; value: number } => !!p.label && p.value !== undefined);
      const prefix = s(o.prefix, 4), unit = s(o.unit, 8);
      return points.length >= 2 ? { type: "chart", title, points, ...(prefix ? { prefix } : {}), ...(unit ? { unit } : {}) } : null;
    }
    case "score": {
      const side = (v: unknown) => { const x = rec(v), name = s(x.name, 20), score = n(x.score); return name && score !== undefined ? { name, score } : null; };
      const home = side(o.home), away = side(o.away), status = s(o.status, 30);
      return home && away ? { type: "score", title, home, away, ...(status ? { status } : {}) } : null;
    }
    case "gauge": {
      const value = n(o.value), max = n(o.max) ?? 100, unit = s(o.unit, 8), label = s(o.label, 40);
      return value !== undefined && max > 0 ? { type: "gauge", title, value: Math.max(0, Math.min(value, max)), max, ...(unit ? { unit } : {}), ...(label ? { label } : {}) } : null;
    }
    case "proscons": {
      const pros = arr(o.pros, 4).map((x) => s(x, 60)).filter((x): x is string => !!x), cons = arr(o.cons, 4).map((x) => s(x, 60)).filter((x): x is string => !!x);
      return pros.length && cons.length ? { type: "proscons", title, pros, cons } : null;
    }
    case "countdown": {
      // Local wall-clock time ("2026-10-01T11:10:00"), as Spark writes dates; a zone suffix is fine too.
      const target = s(o.target ?? o.at, 40), sub = s(o.sub, 60);
      return target && Number.isFinite(new Date(target).getTime()) ? { type: "countdown", title, target, ...(sub ? { sub } : {}) } : null;
    }
    case "math": {
      const steps = arr(o.steps, 8).map(rec).map((st) => ({ expr: s(st.expr, 120), note: s(st.note, 60) }))
        .filter((st): st is { expr: string; note: string | undefined } => !!st.expr).map(({ note, ...st }) => ({ ...st, ...(note ? { note } : {}) }));
      const answer = s(o.answer, 80);
      return steps.length ? { type: "math", title, steps, ...(answer ? { answer } : {}) } : null;
    }
    case "code": {
      const code = typeof o.code === "string" ? o.code.replace(/\t/g, "  ").replace(/\s+$/, "") : "", lines = code.split("\n");
      if (!code.trim() || lines.length > 24 || code.length > 1600) return null;
      const focus = arr(o.focus, 24).map(n).filter((x): x is number => x !== undefined && Number.isInteger(x) && x >= 1 && x <= lines.length);
      const lang = s(o.lang, 16), note = s(o.note, 140);
      return { type: "code", title, code, focus, ...(lang ? { lang } : {}), ...(note ? { note } : {}) };
    }
    case "table": {
      // A blank corner header ("" over the row labels) is a real column: keep it, or every row shifts.
      const columns = arr(o.columns, 5).map((c) => s(c, 24) ?? "");
      if (!columns.some(Boolean)) return null;
      const rows = arr(o.rows, 7).map((r) => arr(r, columns.length).map((c) => s(typeof c === "number" ? String(c) : c, 40) ?? "")).filter((r) => r.length === columns.length && r.some(Boolean));
      const best = n(o.best);
      return columns.length >= 2 && rows.length ? { type: "table", title, columns, rows, ...(best !== undefined && Number.isInteger(best) && best >= 0 && best < rows.length ? { best } : {}) } : null;
    }
    case "quiz": {
      const question = s(o.question, 160), options = arr(o.options, 4).map((x) => s(x, 60)).filter((x): x is string => !!x), answer = n(o.answer), why = s(o.why, 160);
      return question && options.length >= 2 && answer !== undefined && Number.isInteger(answer) && answer >= 0 && answer < options.length
        ? { type: "quiz", title, question, options, answer, ...(why ? { why } : {}) } : null;
    }
    default: return null;
  }
}

/**
 * How much of the time left a countdown shows, biggest unit first — e.g. 20 h 47 m 3 s → [{value:20,unit:"h"},…].
 * Past the moment it returns []: the card says it's happening.
 */
export function countdownParts(ms: number): Array<{ value: number; unit: "d" | "h" | "m" | "s" }> {
  if (!(ms > 0)) return [];
  const sec = Math.floor(ms / 1000), d = Math.floor(sec / 86_400), h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = sec % 60;
  // A day or more out, seconds are noise: days, hours, minutes. Under a day it's a launch clock, to the second.
  // Zeros inside the row stay (1 d 0 h 5 m reads right); a leading zero unit never shows.
  const all = d ? [{ value: d, unit: "d" as const }, { value: h, unit: "h" as const }, { value: m, unit: "m" as const }]
    : [{ value: h, unit: "h" as const }, { value: m, unit: "m" as const }, { value: s, unit: "s" as const }];
  const first = all.findIndex((p) => p.value > 0);
  return all.slice(first === -1 ? all.length - 1 : first);
}

/**
 * Where each box of a flow diagram goes: columns by how far along the flow it is (longest path from where requests
 * start), rows within a column. Cycles are cut so every diagram lays out.
 */
export function flowLayout(nodes: Array<{ id: string }>, edges: Array<{ from: string; to: string }>): Map<string, { col: number; row: number; rows: number; cols: number }> {
  const depth = new Map(nodes.map((x) => [x.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of edges) { const d = (depth.get(e.from) ?? 0) + 1; if (d > (depth.get(e.to) ?? 0) && d < nodes.length) { depth.set(e.to, d); moved = true; } }
    if (!moved) break;
  }
  const cols = Math.max(...depth.values()) + 1, byCol = new Map<number, string[]>();
  for (const x of nodes) { const c = depth.get(x.id)!; byCol.set(c, [...(byCol.get(c) ?? []), x.id]); }
  const out = new Map<string, { col: number; row: number; rows: number; cols: number }>();
  for (const [col, ids] of byCol) ids.forEach((id, row) => out.set(id, { col, row, rows: ids.length, cols }));
  return out;
}

/** How Spark is told about cards (part of its instructions). */
export const VISUAL_GUIDE = [
  "VISUALS: when a picture explains it better than words — a price or score, a comparison, a forecast, a schedule or timeline, steps, top picks — add ONE ```visual {…}``` block with the REAL numbers you found (never invented; skip the card if you don't have the data). The notch drops open with it, animated, while you talk them through it; keep your spoken answer short since they can see the details. Shapes:",
  '```visual {"type":"stat","title":"Bitcoin","value":83979,"prefix":"$","delta":-1.8,"deltaLabel":"today","sub":"CoinDesk, 3:10 PM"}```',
  '```visual {"type":"compare","title":"Battery life (hours)","items":[{"label":"iPhone 17 Pro","value":31},{"label":"Pixel 11 Pro","value":28}],"better":"high"}```',
  '```visual {"type":"forecast","title":"North Babylon, tomorrow","items":[{"label":"9a","temp":64,"icon":"sun"},{"label":"12p","temp":71,"icon":"partly"},{"label":"3p","temp":73,"icon":"rain","rain":60}]}``` (icons: sun partly cloud rain storm snow wind fog night; temps as numbers)',
  '```visual {"type":"timeline","title":"Your afternoon","items":[{"time":"2:00","label":"Standup","now":true},{"time":"3:30","label":"Dentist"}]}```',
  '```visual {"type":"steps","title":"Soft-boiled egg","steps":["Boil water","Lower eggs in","6½ minutes","Ice bath 2 minutes"]}```',
  '```visual {"type":"list","title":"Best sushi nearby","items":[{"label":"Kumo","detail":"0.4 mi · open till 10","score":4.7},{"label":"Sakura","detail":"1.1 mi","score":4.5}]}```',
  '```visual {"type":"chart","title":"Tesla, 5 days","prefix":"$","points":[{"label":"Mon","value":241},{"label":"Tue","value":248},{"label":"Wed","value":244}]}```',
  '```visual {"type":"score","title":"NBA · final","home":{"name":"Knicks","score":112},"away":{"name":"Celtics","score":104},"status":"Final"}```',
  '```visual {"type":"gauge","title":"Battery","value":64,"max":100,"unit":"%","label":"about 5 h left"}```',
  '```visual {"type":"proscons","title":"Renting vs buying","pros":["Flexible","No repairs"],"cons":["No equity","Rent rises"]}```',
  "ENGINEER-FIRST TEACHING (math, science, CS, system design, AI — show the working, then check it): worked math, one line per step, Unicode math (², √, π, ≤, →, ∑, ∫) ```visual {\"type\":\"math\",\"title\":\"Solve x² − 5x + 6 = 0\",\"steps\":[{\"expr\":\"x² − 5x + 6 = 0\"},{\"expr\":\"(x − 2)(x − 3) = 0\",\"note\":\"factor: 2 × 3 = 6, 2 + 3 = 5\"},{\"expr\":\"x = 2 or x = 3\",\"note\":\"each factor = 0\"}],\"answer\":\"x = 2, 3\"}``` · real code (≤24 lines) with the lines that matter lit ```visual {\"type\":\"code\",\"title\":\"Binary search\",\"lang\":\"ts\",\"code\":\"let lo = 0, hi = a.length - 1\\nwhile (lo <= hi) {\\n  const mid = (lo + hi) >> 1\\n  if (a[mid] === x) return mid\\n  a[mid] < x ? (lo = mid + 1) : (hi = mid - 1)\\n}\",\"focus\":[3,5],\"note\":\"Halves the range each step: O(log n)\"}``` · trade-offs as a table ```visual {\"type\":\"table\",\"title\":\"Postgres vs DynamoDB\",\"columns\":[\"\",\"Postgres\",\"DynamoDB\"],\"rows\":[[\"Queries\",\"Any SQL, joins\",\"Key lookups\"],[\"Scale\",\"Vertical + replicas\",\"Horizontal, automatic\"],[\"Cost at idle\",\"Instance hours\",\"~$0 on demand\"]]}``` · then check they got it (tap to answer) ```visual {\"type\":\"quiz\",\"title\":\"Quick check\",\"question\":\"Binary search on 1M sorted items takes about how many steps?\",\"options\":[\"20\",\"1,000\",\"500,000\"],\"answer\":0,\"why\":\"log₂(1,000,000) ≈ 20\"}```. One card per reply; a quiz only after you've taught something.",
  '```visual {"type":"countdown","title":"SpaceX Crew-13 launch","target":"2026-10-01T11:10:00","sub":"Kennedy Space Center"}``` (a live countdown to a real moment: local time, from their calendar or your search)',
  "TEACHING (explaining a system, a design or a concept — ALWAYS add one so they can see it while you talk): system design as an animated flow (kinds: user client cdn lb api service server worker cache db queue storage search external auth) ```visual {\"type\":\"flow\",\"title\":\"URL shortener\",\"nodes\":[{\"id\":\"u\",\"label\":\"User\",\"kind\":\"user\"},{\"id\":\"lb\",\"label\":\"Load balancer\",\"kind\":\"lb\"},{\"id\":\"api\",\"label\":\"API\",\"kind\":\"api\"},{\"id\":\"c\",\"label\":\"Redis\",\"kind\":\"cache\"},{\"id\":\"db\",\"label\":\"Postgres\",\"kind\":\"db\"}],\"edges\":[{\"from\":\"u\",\"to\":\"lb\"},{\"from\":\"lb\",\"to\":\"api\"},{\"from\":\"api\",\"to\":\"c\",\"label\":\"hit?\"},{\"from\":\"api\",\"to\":\"db\",\"label\":\"miss\"}]}``` (≤9 nodes) · who-talks-to-whom in order ```visual {\"type\":\"sequence\",\"title\":\"TCP handshake\",\"actors\":[\"Client\",\"Server\"],\"messages\":[{\"from\":0,\"to\":1,\"label\":\"SYN\"},{\"from\":1,\"to\":0,\"label\":\"SYN-ACK\"},{\"from\":0,\"to\":1,\"label\":\"ACK\"}]}``` · a stack ```visual {\"type\":\"layers\",\"title\":\"Web app\",\"layers\":[{\"label\":\"UI\",\"detail\":\"React\"},{\"label\":\"API\"},{\"label\":\"Database\"}]}``` · a loop ```visual {\"type\":\"cycle\",\"title\":\"Event loop\",\"steps\":[\"Call stack\",\"Web APIs\",\"Task queue\",\"Next tick\"]}``` · one idea ```visual {\"type\":\"concept\",\"title\":\"Concept\",\"term\":\"Idempotency\",\"definition\":\"Doing it twice has the same effect as once.\",\"points\":[\"Safe retries\",\"PUT, not POST\"],\"analogy\":\"Pressing an elevator button again\"}```. Talk through it in the order it animates.",
].join(" ");
