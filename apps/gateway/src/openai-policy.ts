/** Crew supports Claude and Codex. Personal assistant routing is pinned separately to Codex. */
export function subscriptionRuntimeIds(config: { codex?: { enabled?: boolean }; claude?: { enabled?: boolean }; local?: unknown; acp?: unknown }, demo = false): string[] {
  return [...(config.codex?.enabled === false ? [] : ["codex"]), ...(config.claude?.enabled === false ? [] : ["claude"]), ...(demo ? ["mock"] : [])];
}
export function codexTeachingModel(requested: string, models: Array<{ id: string; tier: string }>): string {
  const model = models.find(m => m.id === requested) ?? models.find(m => m.tier === "fast") ?? models.find(m => m.tier === "balanced") ?? models[0];
  if (!model) throw new Error("No connected Codex teaching model is available.");
  return model.id;
}
