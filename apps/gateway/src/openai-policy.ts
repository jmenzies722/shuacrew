/** Production inference is subscription-backed Codex only; legacy config cannot re-enable another provider. */
export function subscriptionRuntimeIds(config: { codex?: { enabled?: boolean }; claude?: unknown; local?: unknown; acp?: unknown }, demo = false): string[] {
  return [...(config.codex?.enabled === false ? [] : ["codex"]), ...(demo ? ["mock"] : [])];
}
export function codexTeachingModel(requested: string, models: Array<{ id: string; tier: string }>): string {
  const model = models.find(m => m.id === requested) ?? models.find(m => m.tier === "fast") ?? models.find(m => m.tier === "balanced") ?? models[0];
  if (!model) throw new Error("No connected Codex teaching model is available.");
  return model.id;
}
