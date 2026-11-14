export type PaneStateKind = "loading" | "empty" | "error" | "offline";
const roots = new Set(["/", "/inbox", "/activity", "/terminal", "/floor", "/crew", "/observability", "/usage", "/developer", "/library", "/board", "/specs", "/schedules", "/memory", "/profile", "/integrations", "/policy", "/settings"]);
/** Shape validation only. Callers must also establish source existence and scope. */
export function appRoute(path: string): string | null {
  return roots.has(path) || /^\/(sessions|runs|review)\/[A-Za-z0-9_-]+$/.test(path) ? path : null;
}
export function paneAnnouncement(kind: PaneStateKind): "alert" | "status" | undefined {
  return kind === "error" ? "alert" : kind === "empty" ? undefined : "status";
}
