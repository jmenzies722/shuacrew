import { api } from "./api";
export const sessionRemovalCopy = { title: "Delete session for good?", description: "This deletes it everywhere: its messages, files and working copy, the flashcards and library items made from it, and the agent's own transcript. It can't be undone." };
export function canRemoveSession(status: string) { return ["done", "failed", "cancelled", "reviewing", "merged"].includes(status); }
export async function removeSession(id: string, status: string, send: (path: string, options: { method?: string; body?: object }) => Promise<unknown> = api) {
  if (!canRemoveSession(status)) throw new Error("Stop this session before removing it.");
  await send(`/api/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
}
