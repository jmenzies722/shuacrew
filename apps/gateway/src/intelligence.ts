import type { IntelligenceChoice, IntelligenceRequest } from "@shuacrew/core";
import type { Runtime, RuntimeStatus } from "@shuacrew/runtimes";
import { failoverCandidates, matchRoute, type GatewaySettingsValue } from "./settings.js";
export interface IntelligenceCandidate extends Pick<Runtime, "id" | "label" | "capabilities" | "models"> {
  status: RuntimeStatus;
  limits: Array<{ model?: string; until: number }>;
}
export type LatencyLookup = (runtime: string, model: string) => { ms: number; samples: number } | undefined;
/** Until this Mac has measured a model, assume the tier's typical first-word wait. */
const TIER_PRIOR_MS: Record<string, number> = { fast: 3000, balanced: 4000, frontier: 12000 };
/** Which model tiers can answer a request of each tier. Chat never waits on a frontier model unless precision was asked for. */
const ELIGIBLE: Record<IntelligenceRequest["tier"], string[]> = { fast: ["fast", "balanced"], balanced: ["balanced", "frontier"], frontier: ["frontier"] };

/**
 * Auto for Spark's conversation: across every connected provider, the model that starts talking soonest
 * among those strong enough for the ask. Measured on this Mac (first word), so a slow model loses even
 * when it's first in the provider order.
 */
function fastestCapable(request: IntelligenceRequest, allowed: IntelligenceCandidate[], latency: LatencyLookup, now: number) {
  const ranked: Array<{ candidate: IntelligenceCandidate; model: IntelligenceCandidate["models"][number]; ms: number; measured: boolean }> = [];
  for (const tiers of [ELIGIBLE[request.tier], ["fast", "balanced", "frontier"]]) {
    for (const candidate of allowed) {
      if (candidate.id === "local" || (request.images && !candidate.capabilities.images)) continue;
      for (const model of candidate.models) {
        if (!tiers.includes(model.tier)) continue;
        if (candidate.limits.some(l => (!l.model || l.model === model.id) && l.until > now)) continue;
        const seen = latency(candidate.id, model.id);
        ranked.push({ candidate, model, ms: seen?.ms ?? TIER_PRIOR_MS[model.tier] ?? 5000, measured: !!seen && seen.samples >= 3 });
      }
    }
    if (ranked.length) break; // nothing in the right tiers is free: any free model beats no answer
  }
  return ranked.sort((a, b) => a.ms - b.ms)[0];
}

/** A selection is permission to try, not proof of remaining subscription quota. */
export function selectIntelligence(request: IntelligenceRequest, candidates: IntelligenceCandidate[], settings: Pick<GatewaySettingsValue, "router" | "failoverOrder">, now = Date.now(), latency?: LatencyLookup): IntelligenceChoice {
  const allowed = candidates.filter(c => (!request.preferredRuntime || c.id === request.preferredRuntime) && c.id !== "mock" && c.status.installed && c.status.signedIn !== false &&
    (request.mode === "local" ? c.id === "local" && request.purpose === "conversation" : c.id !== "local" || request.purpose === "conversation"));
  const rule = request.mode === "auto" ? matchRoute(settings.router, request.ask) : undefined;
  if (latency && request.mode === "auto" && request.purpose === "conversation" && !rule && !request.preferredRuntime && !request.preferredModel) {
    const best = fastestCapable(request, allowed, latency, now);
    if (best) {
      const wait = best.measured ? ` · starts in ~${(best.ms / 1000).toFixed(1)} s here` : "";
      const why = request.tier === "frontier" ? "Auto · precise ask → strongest model" : request.tier === "balanced" ? "Auto · needs more thought → fastest strong model" : "Auto · quick ask → fastest model";
      return { runtime: best.candidate.id, model: best.model.id, acceptsImages: best.candidate.capabilities.images, checkedAt: now, verification: "unverified",
        reason: `${why}${wait}${best.candidate.status.signedIn === null ? " · sign-in unverified" : ""}` };
    }
  }
  const preferred = rule?.runtime || allowed.find(c => c.models.some(m => m.id === rule?.model))?.id;
  const cloud = allowed.filter(c => c.id !== "local").map(c => c.id);
  // Auto is cloud only: the on-Mac fallback answered in up to a minute and couldn't do real work. "local" stays explicit.
  const order = request.mode === "local" ? ["local"] : [...failoverCandidates([...(preferred ? [preferred] : []), ...settings.failoverOrder, "claude", "codex"], cloud, "")];
  const retries: number[] = [];
  const tiers = ["fast", "balanced", "frontier"];
  for (const id of [...new Set(order)]) {
    const candidate = allowed.find(c => c.id === id);
    if (!candidate || (request.images && !candidate.capabilities.images && id !== "local")) continue;
    const desired = id === "local" ? request.localModel : (!rule?.runtime || rule.runtime === id) ? rule?.model : undefined;
    const models = candidate.models.filter(m => !request.preferredModel || m.id === request.preferredModel).sort((a, b) => Number(b.id === desired) - Number(a.id === desired) ||
      Math.abs(tiers.indexOf(a.tier) - tiers.indexOf(request.tier)) - Math.abs(tiers.indexOf(b.tier) - tiers.indexOf(request.tier)));
    for (const model of models) {
      const until = Math.max(0, ...candidate.limits.filter(l => !l.model || l.model === model.id).map(l => l.until));
      if (until > now) { retries.push(until); continue; }
      const reason = id === "local" ? request.mode === "local" ? "Local-only mode" : "No eligible cloud model; using this Mac" :
        preferred === id ? `Your routing rule: ${rule!.name}` : `Connected provider order · ${candidate.label}`;
      return { runtime: id, model: model.id, acceptsImages: candidate.capabilities.images, checkedAt: now, verification: "unverified",
        reason: `${reason}${candidate.status.signedIn === null ? " · sign-in unverified" : ""} · availability confirmed by the next response` };
    }
  }
  return { runtime: null, reason: request.mode === "local" ? "No local model is available. Start Ollama and install a model." : request.preferredModel ? "The selected model is unavailable or usage limited. Choose another model or Auto." : "No eligible connected model is available.", retryAt: retries.length ? Math.min(...retries) : null, checkedAt: now };
}
