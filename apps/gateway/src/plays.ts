/**
 * Playbooks: reusable, multi-phase work. Each phase is handed to a crew member as its own session;
 * what it says and saves is carried into the next phase; a gate stops for your review. Start a
 * playbook and it becomes a play — you can approve, ask for changes, redo, skip, or restart from
 * any phase. Everything is a fact in the log, so a restart picks up where it was.
 */
import { randomUUID } from "node:crypto";
import { apply, emptyState, PlaybookDef, type AnyEvent, type CrewState, type PlayView } from "@shuacrew/core";
import type { Supervisor } from "./runs.js";
import type { EventStore } from "./store.js";

const FINISHED = new Set(["done", "reviewing", "merged"]);
const STOPPED = new Set(["failed", "cancelled"]);
const RELEVANT = /^(playbook\.|play\.|run\.created$|run\.status$|artifact\.|crew\.member\.|agent\.message$)/;

const SAFETY = "Draft and prepare everything, but never publish, post, send, sign up, buy or spend money without asking first.";

/** The built-in library: the path from an idea to a product that makes money. */
export const LIBRARY: PlaybookDef[] = [
  {
    id: "validate-idea",
    name: "Validate an idea",
    emoji: "lightbulb",
    description: "Find out if people want it and will pay — before you build. Market research, customer pains in their own words, and a go / no-go with the cheapest test to run this week.",
    inputs: [
      { key: "idea", label: "The idea", placeholder: "A budgeting app that turns freelancers' lumpy income into a steady weekly paycheck", long: true },
      { key: "customer", label: "Who it's for", placeholder: "Freelance designers and developers in the US", optional: true },
    ],
    phases: [
      {
        id: "market",
        name: "Market research",
        member: "researcher",
        gate: "auto",
        deliverable: "Market research",
        prompt:
          "Research the market for this idea: {{idea}}\nFor: {{customer}}\n\nFind and cite: direct and indirect competitors (what they charge, who they serve, what reviewers complain about), evidence of demand (communities, search interest, people asking for this), and how customers solve it today. Use the web. Separate facts (with sources) from your inferences. End with the 3 findings that matter most for whether to build this.",
      },
      {
        id: "customers",
        name: "Customer pains",
        member: "researcher",
        gate: "approve",
        deliverable: "Customer profile and interview script",
        prompt:
          "Using the market research, define the ideal first customer for: {{idea}}\n\nQuote real pains in customers' own words from public posts and reviews (with links). Then write: a one-paragraph ideal-customer profile, where to find 20 of them this week (specific communities, searches, lists), a short outreach message, and a 15-minute interview script with the 5 questions that would prove or kill the idea (no leading questions).",
      },
      {
        id: "verdict",
        name: "Go / no-go",
        member: "operator",
        gate: "approve",
        deliverable: "Go / no-go verdict",
        prompt:
          "Decide whether a solo founder should build: {{idea}}\n\nScore 1–5 with one line of evidence each: pain severity, willingness to pay, reachability of customers, competition, feasibility for one developer, time to first dollar. Suggest a price and the business model. State the single riskiest assumption and the cheapest test to run this week (a landing page with a waitlist, a concierge version, pre-sales…), with a clear pass/fail number. Finish with GO, NO-GO or PIVOT (and to what).",
      },
    ],
  },
  {
    id: "landing-page",
    name: "Landing page that converts",
    emoji: "layout-template",
    description: "Positioning, then a real, responsive landing page as HTML, then a conversion review. Ends with a page you can put a waitlist or checkout on.",
    inputs: [
      { key: "product", label: "Product", placeholder: "Fern — a steady weekly paycheck for freelancers", long: true },
      { key: "audience", label: "Audience", placeholder: "Freelancers with irregular income", optional: true },
      { key: "cta", label: "Call to action", placeholder: "Join the waitlist", optional: true },
    ],
    phases: [
      {
        id: "positioning",
        name: "Positioning",
        member: "marketer",
        gate: "approve",
        deliverable: "Positioning and page copy",
        prompt:
          "Write positioning and landing page copy for: {{product}}\nAudience: {{audience}}\nCall to action: {{cta}}\n\nCheck the library for research on this product first. Give: the one-sentence promise, 3 headline options (pick one and say why), the subhead, 3 benefit sections (pain → outcome), objections with answers, social-proof placeholders marked clearly as placeholders, an FAQ, and the CTA text. Plain words, no hype.",
      },
      {
        id: "page",
        name: "Build the page",
        member: "designer",
        gate: "approve",
        deliverable: "Landing page",
        prompt:
          "Build the landing page for {{product}} from the approved copy, as ONE self-contained HTML file (inline CSS, no external JS; system fonts or one Google Font). Responsive, accessible contrast, fast, one accent colour, generous spacing, a clear hero with the CTA ({{cta}}) above the fold, and a simple email form (action left as \"#\" for now). Save it with save_artifact using filename landing.html. If a Playwright browser tool is available, open the page and check it at phone and desktop widths before you finish.",
      },
      {
        id: "review",
        name: "Conversion review",
        member: "marketer",
        gate: "auto",
        deliverable: "Conversion review",
        prompt:
          "Review the landing page for {{product}} as a sceptical first-time visitor from the audience. List the top 7 fixes ranked by likely impact on sign-ups (clarity of the promise, friction, trust, CTA), each with the exact new wording or change. Then save an improved version of the page as a new version of the same artifact (pass its id to save_artifact).",
      },
    ],
  },
  {
    id: "mvp",
    name: "Spec and build an MVP",
    emoji: "hammer",
    description: "From idea to working software: a tight spec, key screens, then the build in small tested steps, and a ship checklist. Pick a repo to build in.",
    inputs: [
      { key: "idea", label: "What to build", placeholder: "The smallest version of Fern: connect income, see your weekly paycheck", long: true },
      { key: "stack", label: "Stack preferences", placeholder: "Next.js + Postgres, or whatever the repo already uses", optional: true },
    ],
    phases: [
      {
        id: "spec",
        name: "Spec",
        member: "engineer",
        gate: "approve",
        deliverable: "MVP spec",
        prompt:
          "Write the MVP spec for: {{idea}}\nStack: {{stack}}\n\nRead the repo (if any) and the library first. Include: the one core loop, user stories with acceptance criteria, what is explicitly OUT of scope, the data model, pages/endpoints, the stack and why, and a build plan of 4–8 steps that each leave the app working and tested. Keep it small enough to ship in days.",
      },
      {
        id: "screens",
        name: "Key screens",
        member: "designer",
        gate: "approve",
        deliverable: "Key screens",
        prompt: "Design the key screens for the approved MVP spec of {{idea}} as one self-contained HTML file with each screen as a section (real copy, real-looking data, one accent colour). Save it with filename screens.html.",
      },
      {
        id: "build",
        name: "Build",
        member: "engineer",
        gate: "approve",
        prompt:
          "Build the MVP from the approved spec and screens, following the build plan step by step. After each step run the tests and the app; don't move on while anything is red. If a Playwright browser tool is available, start the app and click through the core loop in a real browser, and say what you saw. Commit as you go. Finish with how to run it, what works, and what's left.",
      },
      {
        id: "ship",
        name: "Ship checklist",
        member: "operator",
        gate: "approve",
        deliverable: "Ship checklist",
        prompt: "Prepare to ship the MVP of {{idea}}: hosting recommendation with cost, environment variables and secrets needed, domain, analytics, error tracking, privacy policy and terms, and a step-by-step deploy checklist. Prepare configs in the repo where useful. {{safety}}",
      },
    ],
  },
  {
    id: "launch",
    name: "Launch plan",
    emoji: "rocket",
    description: "Channels, launch posts and emails, pricing and payments, and a launch-day run sheet — all drafted, nothing posted without you.",
    inputs: [
      { key: "product", label: "Product", placeholder: "Fern — steady paychecks for freelancers", long: true },
      { key: "date", label: "Launch date", placeholder: "Next Tuesday", optional: true },
    ],
    phases: [
      {
        id: "channels",
        name: "Channels",
        member: "marketer",
        gate: "approve",
        deliverable: "Launch channels",
        prompt: "Pick the 4–6 launch channels most likely to reach the first 100 customers of {{product}} (specific communities, newsletters, Product Hunt, Hacker News, Reddit, X, LinkedIn, directories). For each: why it fits, the rules/etiquette, best timing, and what a good post looks like there. Check the library for research and positioning first.",
      },
      {
        id: "assets",
        name: "Posts and emails",
        member: "marketer",
        gate: "approve",
        deliverable: "Launch posts and emails",
        prompt: "Write every launch asset for {{product}} for the approved channels: each post in the channel's native style, a Product Hunt tagline + description + first comment, a 3-email launch sequence for the waitlist, and a short personal DM for friends. {{safety}}",
      },
      {
        id: "pricing",
        name: "Pricing and payments",
        member: "operator",
        gate: "approve",
        deliverable: "Pricing and payments plan",
        prompt: "Set launch pricing for {{product}} (tiers, trial, annual discount, launch offer) with reasoning from the research, and write the exact steps to take payments with Stripe (products, prices, checkout or payment links, webhooks, tax, receipts). Prepare code or config where there's a repo. {{safety}}",
      },
      {
        id: "runsheet",
        name: "Launch-day run sheet",
        member: "operator",
        gate: "auto",
        deliverable: "Launch-day run sheet",
        prompt: "Write the launch-day run sheet for {{product}} on {{date}}: an hour-by-hour checklist, who to reply to and how fast, metrics to watch (visits, sign-ups, conversion, revenue) and what numbers mean it's working, and the follow-ups for the week after.",
      },
    ],
  },
  {
    id: "competitor-teardown",
    name: "Competitor teardown",
    emoji: "scan-search",
    description: "Take one competitor apart — product, pricing, positioning, reviews — and find the opening they leave.",
    inputs: [
      { key: "competitor", label: "Competitor", placeholder: "YNAB" },
      { key: "product", label: "Your product", placeholder: "Fern", optional: true },
    ],
    phases: [
      {
        id: "teardown",
        name: "Teardown",
        member: "researcher",
        gate: "auto",
        deliverable: "Teardown",
        prompt: "Tear down {{competitor}}: what they sell and to whom, pricing and packaging, onboarding, positioning and headline claims, traffic and growth channels you can see, and what their reviews (G2, App Store, Reddit) praise and hate — quoted, with links.",
      },
      {
        id: "opening",
        name: "The opening",
        member: "marketer",
        gate: "approve",
        deliverable: "Positioning against competitor",
        prompt: "From the teardown, find where {{product}} can win against {{competitor}}: underserved segment, hated flaw, price gap or channel they ignore. Write the positioning line, a comparison table, and 3 ad/post angles that use it — fair and factual.",
      },
    ],
  },
  {
    id: "growth-review",
    name: "Weekly growth review",
    emoji: "trending-up",
    description: "Paste this week's numbers; get what they mean and the three experiments worth running next.",
    inputs: [
      { key: "metrics", label: "This week's numbers", placeholder: "Visits 1,240 (+18%), sign-ups 61, paid 7, MRR $84, churned 1…", long: true },
      { key: "product", label: "Product", placeholder: "Fern", optional: true },
    ],
    phases: [
      {
        id: "analysis",
        name: "What the numbers say",
        member: "operator",
        gate: "auto",
        deliverable: "Growth review",
        prompt: "Analyse this week's numbers for {{product}}:\n{{metrics}}\n\nCompare with earlier growth reviews in the library if any. Funnel conversion at each step, what moved and the likely why, the one bottleneck that matters most now, and whether revenue is on track.",
      },
      {
        id: "experiments",
        name: "Next experiments",
        member: "marketer",
        gate: "approve",
        deliverable: "Growth experiments",
        prompt: "Propose the 3 highest-leverage experiments for next week against that bottleneck, each with hypothesis, exact change, effort, success metric and threshold. Draft whatever copy or assets each one needs. {{safety}}",
      },
    ],
  },
];

export class Plays {
  private state: CrewState = emptyState();
  private unsubscribe: () => void;
  private byRun = new Map<string, { play: string; index: number }>();

  constructor(
    private store: EventStore,
    private supervisor: Supervisor,
  ) {
    for (const e of store.read(0)) this.take(e, false);
    this.unsubscribe = store.subscribe((e) => this.take(e, true));
  }

  stop() {
    this.unsubscribe();
  }

  private take(e: AnyEvent, live: boolean) {
    if (!RELEVANT.test(e.kind)) return;
    apply(this.state, e);
    if (e.kind === "play.phase" && e.body.run) this.byRun.set(e.body.run, { play: e.body.play, index: e.body.index });
    if (live && e.kind === "run.status" && e.run && this.byRun.has(e.run)) {
      const run = e.run;
      // A finished turn with follow-ups waiting is re-queued right after; decide once that settles.
      setImmediate(() => this.settle(run));
    }
  }

  // ── the library ─────────────────────────────────────────────────────────────

  playbooks(): Array<PlaybookDef & { builtin: boolean }> {
    const mine = this.state.playbooks;
    const builtins = LIBRARY.filter((p) => !mine[p.id]).map((p) => ({ ...p, builtin: true }));
    return [...builtins, ...Object.values(mine).map((p) => ({ ...p, builtin: LIBRARY.some((b) => b.id === p.id) }))];
  }

  playbook(id: string): PlaybookDef | undefined {
    return this.state.playbooks[id] ?? LIBRARY.find((p) => p.id === id);
  }

  save(input: unknown): PlaybookDef {
    const raw = input as Partial<PlaybookDef>;
    const id = (raw.id || raw.name || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const phases = (raw.phases ?? []).map((p, i) => ({ ...p, id: p.id || `phase-${i + 1}`, gate: p.gate ?? "approve" }));
    const parsed = PlaybookDef.safeParse({ ...raw, id, phases });
    if (!id || !parsed.success) throw new Error(parsed.success ? "give the playbook a name" : `that playbook isn't complete: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    if (parsed.data.phases.some((p) => !p.prompt.trim())) throw new Error("every phase needs instructions");
    this.store.append("playbook.set", parsed.data);
    return parsed.data;
  }

  remove(id: string) {
    if (!this.state.playbooks[id]) throw new Error(LIBRARY.some((p) => p.id === id) ? "built-in playbooks can't be removed" : `no playbook ${id}`);
    this.store.append("playbook.removed", { id });
  }

  // ── plays ───────────────────────────────────────────────────────────────────

  list(): PlayView[] {
    return Object.values(this.state.plays).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): PlayView | undefined {
    return this.state.plays[id];
  }

  start(input: { playbook: string; inputs?: Record<string, string>; title?: string; repo?: string; venture?: string }): PlayView {
    const book = this.playbook(input.playbook);
    if (!book) throw new Error(`no playbook ${input.playbook}`);
    const inputs = Object.fromEntries(Object.entries(input.inputs ?? {}).map(([k, v]) => [k, String(v ?? "").trim()]));
    const missing = book.inputs.find((i) => !i.optional && !inputs[i.key]);
    if (missing) throw new Error(`${missing.label} is needed`);
    const id = `p_${randomUUID().slice(0, 8)}`;
    const first = book.inputs[0] ? inputs[book.inputs[0].key] : "";
    const title = (input.title?.trim() || `${book.name}${first ? ` — ${shorten(first, 60)}` : ""}`).slice(0, 140);
    this.store.append("play.started", { id, playbook: book.id, name: book.name, emoji: book.emoji, title, inputs, repo: input.repo?.trim() || undefined, venture: input.venture || undefined, phases: book.phases });
    this.advance(id);
    return this.get(id)!;
  }

  /** Approve a phase waiting for review, and move on. */
  approve(id: string, index: number) {
    const phase = this.phase(id, index);
    if (phase.status !== "review") throw new Error("that phase isn't waiting for review");
    this.store.append("play.phase", { play: id, index, status: "done" });
    this.advance(id);
  }

  /** Send the phase's member your feedback; the phase comes back for review when it's done. */
  revise(id: string, index: number, feedback: string) {
    const phase = this.phase(id, index);
    if (!feedback.trim()) throw new Error("say what to change");
    if (!phase.run || !["review", "done", "failed"].includes(phase.status)) throw new Error("that phase has nothing to revise yet");
    this.store.append("play.phase", { play: id, index, status: "running" });
    this.store.append("play.status", { play: id, status: "running" });
    this.supervisor.followUp(phase.run, `Feedback on this phase: ${feedback.trim()}\n\nRevise your work accordingly. If you saved an artifact, save the new version with the same id.`);
  }

  /** Run a phase again from scratch, and everything after it. */
  restart(id: string, from: number) {
    const play = this.play(id);
    this.phase(id, from);
    for (const p of play.phases) if (p.status === "running" && p.run) this.supervisor.cancel(p.run, "restarted from an earlier phase");
    for (let i = from; i < play.phases.length; i++) if (play.phases[i]!.status !== "pending") this.store.append("play.phase", { play: id, index: i, status: "pending" });
    this.store.append("play.status", { play: id, status: "running", reason: `restarted from ${play.phases[from]!.name}` });
    this.advance(id);
  }

  skip(id: string, index: number) {
    const phase = this.phase(id, index);
    if (phase.status === "running" && phase.run) this.supervisor.cancel(phase.run, "phase skipped");
    this.store.append("play.phase", { play: id, index, status: "skipped" });
    this.advance(id);
  }

  cancel(id: string) {
    const play = this.play(id);
    for (const p of play.phases) if (p.status === "running" && p.run) this.supervisor.cancel(p.run, "play cancelled");
    this.store.append("play.status", { play: id, status: "cancelled" });
  }

  /** After a restart: phases whose session already ended get decided; idle plays move on. */
  recover() {
    for (const play of this.list()) {
      if (play.status !== "running") continue;
      const running = play.phases.find((p) => p.status === "running");
      if (running?.run) this.settle(running.run);
      else if (!running) this.advance(play.id);
    }
  }

  private play(id: string): PlayView {
    const play = this.state.plays[id];
    if (!play) throw new Error(`no play ${id}`);
    return play;
  }

  private phase(id: string, index: number) {
    const phase = this.play(id).phases[index];
    if (!phase) throw new Error(`no phase ${index + 1}`);
    return phase;
  }

  /** Launch the next phase that needs doing, or finish. */
  private advance(id: string) {
    const play = this.play(id);
    if (play.status === "cancelled") return;
    const index = play.phases.findIndex((p) => p.status !== "done" && p.status !== "skipped");
    if (index === -1) {
      this.store.append("play.status", { play: id, status: "done", reason: `all ${play.phases.length} phases done` });
      return;
    }
    const phase = play.phases[index]!;
    if (phase.status === "running") return;
    if (phase.status === "review") {
      if (play.status !== "waiting") this.store.append("play.status", { play: id, status: "waiting", reason: `${phase.name} is ready for your review` });
      return;
    }
    const run = this.supervisor.launch({
      ask: this.brief(play, index),
      title: `${phase.name} · ${shorten(play.title, 60)}`,
      member: phase.member && this.state.members[phase.member] ? phase.member : undefined,
      repo: play.repo,
      venture: play.venture,
      labels: ["play", `play:${id}`],
    });
    this.store.append("play.phase", { play: id, index, status: "running", run });
    if (play.status !== "running") this.store.append("play.status", { play: id, status: "running" });
  }

  /** A phase's session changed state: decide what that means for the play. */
  private settle(run: string) {
    const where = this.byRun.get(run);
    if (!where) return;
    const play = this.state.plays[where.play];
    const phase = play?.phases[where.index];
    if (!play || !phase || phase.run !== run || play.status === "cancelled") return;
    const status = this.state.runs[run]?.status;
    if (!status) return;
    if (FINISHED.has(status) && phase.status === "running") {
      const output = this.finalAnswer(run);
      const artifacts = Object.values(this.state.artifacts).filter((a) => a.run === run).map((a) => a.id);
      if (phase.gate === "auto") {
        this.store.append("play.phase", { play: play.id, index: where.index, status: "done", output, artifacts });
        this.advance(play.id);
      } else {
        this.store.append("play.phase", { play: play.id, index: where.index, status: "review", output, artifacts });
        this.store.append("play.status", { play: play.id, status: "waiting", reason: `${phase.name} is ready for your review` });
      }
    } else if (status === "failed" && phase.status === "running" && phase.runs.length < 2) {
      // One more try, told what went wrong — most failures are a wrong turn, not a dead end.
      const reason = this.state.runs[run]?.statusReason ?? "it failed";
      this.store.append("play.phase", { play: play.id, index: where.index, status: "pending", note: `retry: ${reason}` });
      this.advance(play.id);
    } else if (STOPPED.has(status) && phase.status === "running") {
      const reason = this.state.runs[run]?.statusReason ?? status;
      this.store.append("play.phase", { play: play.id, index: where.index, status: "failed", note: reason });
      this.store.append("play.status", { play: play.id, status: "failed", reason: `${phase.name}: ${reason}` });
    } else if ((status === "running" || status === "queued") && (phase.status === "review" || phase.status === "done")) {
      // You chatted with the phase's member directly: it's working again.
      this.store.append("play.phase", { play: play.id, index: where.index, status: "running" });
      if (play.status !== "running") this.store.append("play.status", { play: play.id, status: "running" });
    }
  }

  private finalAnswer(run: string): string {
    const events = this.store.forRun(run);
    const last = [...events].reverse().find((e) => e.kind === "agent.message" && e.body.final) ?? [...events].reverse().find((e) => e.kind === "agent.message");
    return last?.kind === "agent.message" ? last.body.text.slice(0, 20_000) : "";
  }

  /** What a phase's member is told: the play, the inputs, what came before, and what to deliver. */
  private brief(play: PlayView, index: number): string {
    const phase = play.phases[index]!;
    const fill = (text: string) =>
      text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, key: string) => (key === "safety" ? SAFETY : key === "title" ? play.title : play.inputs[key] || "(not given)"));
    const before = play.phases.slice(0, index).filter((p) => p.status === "done");
    const context = before.map((p) => {
      const who = p.member ? this.state.members[p.member] : undefined;
      const made = p.artifacts.map((id) => this.state.artifacts[id]).filter(Boolean).map((a) => `- ${a!.title} (library id ${a!.id})`);
      return [`### ${p.name}${who ? ` — by ${who.name}, ${who.role}` : ""}`, shorten(p.output ?? "", 3000) || "(no summary)", made.length ? `Saved:\n${made.join("\n")}` : ""].filter(Boolean).join("\n\n");
    });
    const retry = phase.note?.startsWith("retry: ") ? phase.note.slice(7) : undefined;
    return [
      `You're on phase ${index + 1} of ${play.phases.length}, "${phase.name}", of the playbook "${play.name}": ${play.title}.`,
      retry ? `The previous attempt at this phase failed (${retry.slice(0, 300)}). Take a different approach this time.` : "",
      fill(phase.prompt),
      context.length ? `## What the earlier phases produced\n\n${context.join("\n\n")}\n\nRead the full artifacts with read_library when you need more than this summary.` : "",
      phase.deliverable ? `When you're done, save your deliverable to the Library with save_artifact, titled "${phase.deliverable} — ${shorten(play.title, 60)}". Then reply with a short summary of what you found or made and any decision you need from me.` : "When you're done, reply with a short summary of what you did and any decision you need from me.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}

function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
