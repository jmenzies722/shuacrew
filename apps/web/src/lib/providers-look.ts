/** How each model provider looks everywhere in the Tools hub: one name and one colour per subscription. */
const NAMES: Record<string, string> = { claude: "Claude", codex: "Codex", local: "This Mac", all: "Tokens" };
const TINTS: Record<string, string> = { claude: "#e8916b", codex: "#7aa2ff", local: "#34d399", all: "var(--amber)" };
const SPARE = ["#c084fc", "#f472b6", "#facc15", "#22d3ee", "#a3e635"];
export const providerName = (id: string) => NAMES[id] ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Unknown");
export const providerTint = (id: string) => TINTS[id] ?? SPARE[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SPARE.length]!;
/** Session titles from Shua carry a "Shua · " prefix the tables don't need. */
export const plainTitle = (title: string) => title.replace(/^(Spark|Shua) · /, "").trim();
export const statusTone = (s: string) => (["done", "merged"].includes(s) ? "ok" : s === "failed" ? "bad" : s === "awaiting_approval" ? "wait" : ["running", "planning", "queued"].includes(s) ? "live" : "idle");
export const statusLabel = (s: string) => (s === "awaiting_approval" ? "needs you" : s.replaceAll("_", " "));
