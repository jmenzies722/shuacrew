/** Instant chat commands: things the composer does itself, without an AI call. */
export type ChatAction =
  | { kind: "agent"; name: string; role?: string; persona?: string }
  | { kind: "agents" }
  | { kind: "room"; title: string; members: string[] }
  | { kind: "effort"; value: "" | "low" | "medium" | "high" | "max" }
  | { kind: "budget"; tokens: number | null }
  | { kind: "flow" };

export function parseChatAction(message: string): ChatAction | { kind: "error"; message: string } | null {
  const text = message.trim();
  const agent = /^\/agent\s+(.+)$/is.exec(text);
  if (agent) {
    // "/agent Nova as Security reviewer: checks every diff" · "/agent Nova: persona" · "/agent Nova"
    const m = /^([^:]+?)(?:\s+as\s+([^:]+?))?\s*(?::\s*([\s\S]+))?$/i.exec(agent[1]!.trim());
    const name = m?.[1]?.trim() ?? "";
    if (!name) return { kind: "error", message: "Try: /agent Nova as Security reviewer: checks every diff for leaked secrets" };
    return { kind: "agent", name, role: m?.[2]?.trim() || undefined, persona: m?.[3]?.trim() || undefined };
  }
  if (/^\/agents$/i.test(text)) return { kind: "agents" };
  const room = /^\/room\s+(.+)$/is.exec(text);
  if (room) {
    const members = [...room[1]!.matchAll(/@([a-z0-9-]+)/gi)].map((x) => x[1]!.toLowerCase());
    const title = room[1]!.replace(/\s+with\s+(@[a-z0-9-]+[\s,]*)+$/i, "").replace(/@[a-z0-9-]+/gi, "").trim();
    if (!title || !members.length) return { kind: "error", message: "Try: /room Launch week with @rhea @eli — the first member coordinates." };
    return { kind: "room", title, members: [...new Set(members)] };
  }
  const effort = /^\/effort\s+(auto|low|medium|med|high|max)$/i.exec(text);
  if (effort) { const v = effort[1]!.toLowerCase(); return { kind: "effort", value: v === "auto" ? "" : v === "med" ? "medium" : v as "low" | "medium" | "high" | "max" }; }
  if (/^\/effort\b/i.test(text)) return { kind: "error", message: "Try: /effort low · medium · high · max · auto" };
  const budget = /^\/budget\s+(off|\d+(?:\.\d+)?\s*[km]?)$/i.exec(text);
  if (budget) {
    const raw = budget[1]!.toLowerCase().replace(/\s/g, "");
    if (raw === "off") return { kind: "budget", tokens: null };
    const n = parseFloat(raw) * (raw.endsWith("m") ? 1e6 : raw.endsWith("k") ? 1e3 : 1);
    return n >= 1000 ? { kind: "budget", tokens: Math.round(n) } : { kind: "error", message: "Budgets start at 1k tokens. Try: /budget 500k" };
  }
  if (/^\/budget\b/i.test(text)) return { kind: "error", message: "Try: /budget 500k · 2m · off" };
  if (/^\/flow$/i.test(text)) return { kind: "flow" };
  return null;
}
