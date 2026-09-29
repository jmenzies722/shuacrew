import { api } from "./api";
export function canRemoveSession(status: string) { return ["done", "failed", "cancelled", "reviewing", "merged"].includes(status); }
export async function removeSession(id: string, status: string, send: (path: string, options: { body: object }) => Promise<unknown> = api) {
  if (!canRemoveSession(status)) throw new Error("Stop this session before removing it.");
  await send(`/api/runs/${encodeURIComponent(id)}/archive`, { body: {} });
}
