import type { IntelligenceChoice, IntelligenceRequest } from "@shuacrew/core";
import type { Runtime, RuntimeStatus } from "@shuacrew/runtimes";
import { failoverCandidates, matchRoute, type GatewaySettingsValue } from "./settings.js";
export interface IntelligenceCandidate extends Pick<Runtime, "id" | "label" | "capabilities" | "models"> {
  status: RuntimeStatus;
  limits: Array<{ model?: string; until: number }>;
}
/** A selection is permission to try, not proof of remaining subscription quota. */
export function selectIntelligence(request: IntelligenceRequest, candidates: IntelligenceCandidate[], settings: Pick<GatewaySettingsValue, "router" | "failoverOrder">, now = Date.now()): IntelligenceChoice {
  const allowed = candidates.filter(c => (!request.preferredRuntime || c.id === request.preferredRuntime) && c.id !== "mock" && c.status.installed && c.status.signedIn !== false &&
    (request.mode === "local" ? c.id === "local" && request.purpose === "conversation" : c.id !== "local" || request.purpose === "conversation"));
  const rule = request.mode === "auto" ? matchRoute(settings.router, request.ask) : undefined;
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
