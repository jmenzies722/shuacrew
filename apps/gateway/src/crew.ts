/**
 * The crew: named members you keep. Each has a role, a persona it works in, a default model, the
 * phrases that route work to it, a standing thread you talk to it in, and lessons of its own.
 * Members are facts in the log like everything else.
 */
import { apply, emptyState, type AnyEvent, type CrewMember, type CrewState } from "@shuacrew/core";
import type { EventStore } from "./store.js";

export type MemberInput = Omit<CrewMember, "thread" | "sessions">;

/** A team that can take an idea to a product that makes money. Edit any of it. */
export const STARTER: MemberInput[] = [
  {
    id: "researcher",
    name: "Rhea",
    role: "Researcher",
    emoji: "telescope",
    color: "#6cb6ff",
    runtime: "claude",
    model: "claude-sonnet-5",
    triggers: ["research", "market", "competitors", "compare", "who pays", "pricing research", "find out", "sources", "survey", "validate"],
    persona:
      "You research before anyone builds. Find real evidence — competitors, pricing pages, communities, reviews, search demand — and say where each fact came from. Separate what you know from what you infer. End with the three findings that matter most and what they mean for the decision at hand.",
  },
  {
    id: "engineer",
    name: "Eli",
    role: "Engineer",
    emoji: "code",
    color: "#4ade80",
    runtime: "claude",
    model: "claude-opus-5-5",
    triggers: ["build", "implement", "fix", "bug", "refactor", "test", "api", "database", "deploy code", "feature", "code"],
    persona:
      "You build working software in small, verified steps. Read the code first, change the least that solves it, and run the tests. Prefer boring, proven tools. Never claim something works without having run it.",
  },
  {
    id: "designer",
    name: "Dani",
    role: "Designer",
    emoji: "pen-tool",
    color: "#f778ba",
    runtime: "claude",
    model: "claude-opus-5-5",
    triggers: ["design", "ui", "ux", "landing page", "brand", "logo", "layout", "onboarding", "copy the look", "style"],
    persona:
      "You design products people trust at first glance: clear hierarchy, generous spacing, one accent colour, real copy instead of lorem ipsum, accessible contrast. Ship designs as working code (HTML/CSS or the project's components), not descriptions.",
  },
  {
    id: "marketer",
    name: "Maya",
    role: "Marketer",
    emoji: "megaphone",
    color: "#ffb020",
    runtime: "claude",
    model: "claude-sonnet-5",
    triggers: ["marketing", "positioning", "launch", "copy", "headline", "social", "seo", "content", "email", "waitlist", "growth"],
    persona:
      "You make people want the product. Start from the customer's pain in their own words, sharpen one promise, then write the headline, the page, the launch posts and the emails. Draft everything; never publish or send without asking.",
  },
  {
    id: "operator",
    name: "Otto",
    role: "Operator",
    emoji: "chart-line",
    color: "#56d4dd",
    runtime: "claude",
    model: "claude-sonnet-5",
    triggers: ["stripe", "payments", "pricing", "revenue", "domain", "hosting", "analytics", "legal", "business", "metrics", "ops"],
    persona:
      "You turn a product into a business: pricing, payments, hosting, domains, analytics, the boring legal pages. Prepare everything and explain each step, but anything that spends money, signs up for a service or goes live waits for a yes.",
  },
];

const RELEVANT = new Set(["crew.member.set", "crew.member.removed", "run.created"]);

export class Crew {
  /** Members, kept current as facts arrive (only the events that shape members are folded). */
  private state: CrewState = emptyState();
  private unsubscribe: () => void;

  constructor(private store: EventStore) {
    for (const e of store.read(0)) this.take(e);
    this.unsubscribe = store.subscribe((e) => this.take(e));
  }

  private take(e: AnyEvent) {
    if (RELEVANT.has(e.kind)) apply(this.state, e);
  }

  stop() {
    this.unsubscribe();
  }

  list(): CrewMember[] {
    return Object.values(this.state.members);
  }

  get(id: string): CrewMember | undefined {
    return this.state.members[id];
  }

  set(input: MemberInput): CrewMember {
    const id = input.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    if (!id) throw new Error("give the member a name");
    if (!input.name.trim()) throw new Error("give the member a name");
    this.store.append("crew.member.set", { ...input, id, name: input.name.trim(), role: input.role.trim() || "Crew", persona: input.persona.trim(), triggers: input.triggers.map((t) => t.trim()).filter(Boolean) });
    return this.get(id)!;
  }

  remove(id: string) {
    if (!this.get(id)) throw new Error(`no crew member ${id}`);
    this.store.append("crew.member.removed", { id });
  }

  /** Add whichever starter members aren't on the crew yet. */
  starter(): CrewMember[] {
    const have = new Set(this.list().map((m) => m.id));
    for (const m of STARTER) if (!have.has(m.id)) this.set(m);
    return this.list();
  }

  /** How this member works, for the start of each of its conversations. */
  persona(id: string): string | undefined {
    const m = this.get(id);
    if (!m) return undefined;
    return `You are ${m.name}, the crew's ${m.role}. ${m.persona}`;
  }

  /**
   * Who should take this? The member whose trigger phrases best match the ask — a phrase counts
   * when most of its words appear. Nobody, when nothing matches well.
   */
  route(ask: string): CrewMember | undefined {
    const words = new Set(ask.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    let best: { member: CrewMember; score: number } | undefined;
    for (const member of this.list()) {
      let score = 0;
      for (const phrase of member.triggers) {
        const parts = phrase.toLowerCase().match(/[a-z0-9]+/g) ?? [];
        if (!parts.length) continue;
        const hit = parts.filter((p) => words.has(p) || words.has(`${p}s`) || (p.endsWith("s") && words.has(p.slice(0, -1)))).length / parts.length;
        if (hit >= 0.7) score += hit * parts.length;
      }
      if (score > 0 && (!best || score > best.score)) best = { member, score };
    }
    return best?.member;
  }
}
