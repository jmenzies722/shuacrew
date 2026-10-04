import { api } from "./api";
export const sessionRemovalCopy = { title: "Delete session?", description: "This removes the session from your chat list. Its audit history and project files are retained; this does not permanently erase them." };
export function canRemoveSession(status: string) { return ["done", "failed", "cancelled", "reviewing", "merged"].includes(status); }
export async function removeSession(id: string, status: string, send: (path: string, options: { body: object }) => Promise<unknown> = api) {
  if (!canRemoveSession(status)) throw new Error("Stop this session before removing it.");
  await send(`/api/runs/${encodeURIComponent(id)}/archive`, { body: {} });
}
