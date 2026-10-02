import { describe, expect, it } from "vitest";
import { selectIntelligence, type IntelligenceCandidate } from "./intelligence.js";
import { GatewaySettingsSchema } from "./settings.js";
import { LatencyBook } from "./latency.js";
const now = 1000;
const request = { ask: "help me", mode: "auto" as const, purpose: "conversation" as const, images: false, tier: "fast" as const };
const settings = GatewaySettingsSchema.parse({ failoverOrder: ["claude", "codex"] });
function candidate(id: string): IntelligenceCandidate {
  return { id, label: id, capabilities: { images: id !== "local", cost: false, resume: true, checkpoints: false, subagents: false },
    models: [{ id: `${id}-fast`, label: "Fast", tier: "fast" }, { id: `${id}-smart`, label: "Smart", tier: "balanced" }],
    status: { installed: true, signedIn: true, detail: "ready", overridingKeys: [] }, limits: [] };
}
describe("connected intelligence", () => {
  it("uses the shared order and skips account-limited providers", () => {
    const c = candidate("claude"), x = candidate("codex");
    expect(selectIntelligence(request, [x, c], settings, now)).toMatchObject({ runtime: "claude", model: "claude-fast" });
    c.limits = [{ until: 9000 }];
    expect(selectIntelligence(request, [c, x], settings, now)).toMatchObject({ runtime: "codex" });
  });
  it("uses a free sibling without treating its other model's cap as an account cap", () => {
    const c = candidate("claude"); c.limits = [{ model: "claude-fast", until: 9000 }];
    expect(selectIntelligence(request, [c, candidate("codex")], settings, now)).toMatchObject({ runtime: "claude", model: "claude-smart" });
  });
  it("never leaves local-only and never uses local for crew work", () => {
    expect(selectIntelligence({ ...request, mode: "local" }, [candidate("claude")], settings, now)).toMatchObject({ runtime: null });
    expect(selectIntelligence({ ...request, mode: "local" }, [candidate("local"), candidate("claude")], settings, now)).toMatchObject({ runtime: "local" });
    expect(selectIntelligence({ ...request, purpose: "work" }, [candidate("local")], settings, now)).toMatchObject({ runtime: null });
  });
  it("skips missing or signed-out providers and labels unknown sign-in honestly", () => {
    const c = candidate("claude"); c.status.installed = false;
    expect(selectIntelligence(request, [c], settings, now).runtime).toBeNull();
    c.status.installed = true; c.status.signedIn = false;
    expect(selectIntelligence(request, [c], settings, now).runtime).toBeNull();
    c.status.signedIn = null;
    expect(selectIntelligence(request, [c], settings, now)).toMatchObject({ runtime: "claude", verification: "unverified" });
  });
  it("checks images; Auto never falls back to the local model, which stays explicit-only", () => {
    const c = candidate("claude"); c.capabilities.images = false;
    expect(selectIntelligence({ ...request, images: true }, [c, candidate("codex")], settings, now)).toMatchObject({ runtime: "codex", acceptsImages: true });
    expect(selectIntelligence({ ...request, images: true }, [candidate("local")], settings, now)).toMatchObject({ runtime: null });
    expect(selectIntelligence({ ...request, mode: "local" }, [candidate("local")], settings, now)).toMatchObject({ runtime: "local", acceptsImages: false });
  });
  it("honors compatible router rules, ignores unknown models, and exposes next retry", () => {
    const s = GatewaySettingsSchema.parse({ router: [{ name: "code", match: "help", runtime: "codex", model: "codex-smart" }] });
    expect(selectIntelligence(request, [candidate("claude"), candidate("codex")], s, now)).toMatchObject({ runtime: "codex", model: "codex-smart" });
    s.router[0]!.model = "not-a-model";
    expect(selectIntelligence(request, [candidate("codex")], s, now)).toMatchObject({ model: "codex-fast" });
    const c = candidate("claude"); c.limits = [{ until: 9000 }, { model: "claude-fast", until: 12000 }];
    expect(selectIntelligence(request, [c], settings, now)).toMatchObject({ runtime: null, retryAt: 9000 });
  });
  it("pins explicit companion models without silently falling back", () => {
    const c=candidate("claude"), x=candidate("codex");
    expect(selectIntelligence({...request,preferredRuntime:"codex",preferredModel:"codex-smart"},[c,x],settings,now)).toMatchObject({runtime:"codex",model:"codex-smart"});
    x.limits=[{model:"codex-smart",until:9000}];
    expect(selectIntelligence({...request,preferredRuntime:"codex",preferredModel:"codex-smart"},[c,x],settings,now).runtime).toBeNull();
  });

  it("Auto conversation picks the fastest capable model across providers, measured on this Mac", () => {
    const tiers = (id: string): IntelligenceCandidate => ({ ...candidate(id), models: [
      { id: `${id}-fast`, label: "Fast", tier: "fast" }, { id: `${id}-smart`, label: "Smart", tier: "balanced" }, { id: `${id}-max`, label: "Max", tier: "frontier" }] });
    const book = new LatencyBook();
    for (let i = 0; i < 5; i++) { book.record("claude", "claude-smart", 1400); book.record("codex", "codex-smart", 7200); book.record("codex", "codex-max", 19000); book.record("claude", "claude-max", 10800); }
    const order = GatewaySettingsSchema.parse({ failoverOrder: ["codex", "claude"] }); // the provider order alone would pick Codex
    const est = (r: string, m: string) => book.estimate(r, m);
    expect(selectIntelligence({ ...request, tier: "balanced" }, [tiers("codex"), tiers("claude")], order, now, est)).toMatchObject({ runtime: "claude", model: "claude-smart" });
    // quick asks may use a balanced model when it starts sooner than the unmeasured fast ones
    expect(selectIntelligence(request, [tiers("codex"), tiers("claude")], order, now, est)).toMatchObject({ runtime: "claude", model: "claude-smart" });
    expect(selectIntelligence({ ...request, tier: "frontier" }, [tiers("codex"), tiers("claude")], order, now, est)).toMatchObject({ runtime: "claude", model: "claude-max" });
    // a limited provider hands over to the other one's best match
    const c = tiers("claude"); c.limits = [{ until: 9000 }];
    expect(selectIntelligence({ ...request, tier: "balanced" }, [tiers("codex"), c], order, now, est)).toMatchObject({ runtime: "codex", model: "codex-smart" });
    // crew work and explicit picks keep the provider order
    expect(selectIntelligence({ ...request, purpose: "work", tier: "balanced" }, [tiers("codex"), tiers("claude")], order, now, est)).toMatchObject({ runtime: "codex" });
    expect(selectIntelligence({ ...request, preferredRuntime: "codex", preferredModel: "codex-smart" }, [tiers("codex"), tiers("claude")], order, now, est)).toMatchObject({ runtime: "codex", model: "codex-smart" });
  });
  it("learns first-word latency from Spark turns in the event log", () => {
    let seq = 0; const ev = (kind: string, run: string, at: number, body: object) => ({ seq: ++seq, at, kind, run, session: null, body, prev: "", hash: "" });
    const book = new LatencyBook().seed([
      ev("run.created", "r1", 0, { labels: ["buddy"] }), ev("turn.started", "r1", 1000, {}), ev("agent.delta", "r1", 2500, {}), ev("agent.delta", "r1", 2600, {}),
      ev("turn.completed", "r1", 4000, { route: { runtime: "claude", model: "s5" } }),
      ev("run.created", "r2", 0, { labels: [] }), ev("turn.started", "r2", 1000, {}), ev("agent.delta", "r2", 9000, {}), ev("turn.completed", "r2", 9500, { route: { runtime: "claude", model: "s5" } }),
    ] as never);
    expect(book.estimate("claude", "s5")).toEqual({ ms: 1500, samples: 1 });
  });
});
