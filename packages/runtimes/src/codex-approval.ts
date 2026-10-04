/** Only simple consent can be represented by Shua's approve/deny card. Never invent a form or device proof. */
export async function codexMcpApproval(params: { serverName?: string; mode?: string; message?: string; url?: string; requestedSchema?: { type?: string; required?: unknown[]; properties?: Record<string, unknown> } }, approve: (tool: string, input: unknown) => Promise<{ allow: boolean }>) {
  if (!params.serverName || !["form", "url"].includes(params.mode ?? "") || (params.mode === "form" && (params.requestedSchema?.required?.length || Object.keys(params.requestedSchema?.properties ?? {}).length))) return { action: "decline" };
  const answer = await approve(`mcp__${params.serverName}__permission`, { message: params.message ?? "Connector requests permission", ...(params.url ? { url: params.url } : {}) });
  return answer.allow ? { action: "accept", content: {} } : { action: "decline" };
}
