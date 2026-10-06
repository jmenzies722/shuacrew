/**
 * Every step Shua takes on screen goes to the gateway's journal (see apps/gateway/src/shua-journal.ts), so its accuracy
 * — and which way of finding a target works best — is measured from what really happened.
 */
import type { Act } from "./buddy";
import { api } from "./api";

/** How the step found its target: an exact numbered control, by name, or by position. */
export function howFound(a: Act): "target" | "name" | "position" | "none" {
  if ("target" in a && a.target) return "target";
  if (a.type === "press" || (a.type === "type" && a.label)) return "name";
  if (a.type === "click" || (a.type === "scroll" && a.x !== undefined)) return "position";
  return "none";
}

/** Fire and forget: a journal that can't be written never slows or fails the step itself. */
export function journalStep(a: Act, r: { ok: boolean; message: string }, app: string | undefined, ms: number) {
  if (a.type === "done") return;
  void api("/api/shua/journal", { body: { kind: a.type, how: howFound(a), label: "label" in a ? a.label : "", ok: r.ok, message: r.message, app, ms } }).catch(() => {});
}
