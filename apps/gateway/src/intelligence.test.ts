import { describe, expect, it } from "vitest";
import { selectIntelligence, type IntelligenceCandidate } from "./intelligence.js";
import { GatewaySettingsSchema } from "./settings.js";
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
  it("checks images and falls back to explicitly text-only local conversation", () => {
    const c = candidate("claude"); c.capabilities.images = false;
    expect(selectIntelligence({ ...request, images: true }, [c, candidate("codex")], settings, now)).toMatchObject({ runtime: "codex", acceptsImages: true });
    expect(selectIntelligence({ ...request, images: true }, [candidate("local")], settings, now)).toMatchObject({ runtime: "local", acceptsImages: false });
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

});
