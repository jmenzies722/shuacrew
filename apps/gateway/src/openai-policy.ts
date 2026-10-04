/**
 * ShuaCrew's models are Claude and Codex, both on your own subscriptions. Either can be switched off; legacy config
 * cannot add another provider (local Ollama, ACP agents). Voice is separate: it is Codex Live only.
 */
export function subscriptionRuntimeIds(config: { codex?: { enabled?: boolean }; claude?: { enabled?: boolean }; local?: unknown; acp?: unknown }, demo = false): string[] {
  return [...(config.claude?.enabled === false ? [] : ["claude"]), ...(config.codex?.enabled === false ? [] : ["codex"]), ...(demo ? ["mock"] : [])];
}
export function codexTeachingModel(requested: string, models: Array<{ id: string; tier: string }>): string {
  const model = models.find(m => m.id === requested) ?? models.find(m => m.tier === "fast") ?? models.find(m => m.tier === "balanced") ?? models[0];
  if (!model) throw new Error("No connected Codex teaching model is available.");
  return model.id;
}
