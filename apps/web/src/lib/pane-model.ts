export type PaneStateKind = "loading" | "empty" | "error" | "offline";
const roots = new Set(["/", "/activity", "/terminal", "/floor", "/studio", "/ventures", "/crew", "/rooms", "/observability", "/usage", "/developer", "/library", "/playbooks", "/board", "/specs", "/schedules", "/memory", "/integrations", "/policy", "/settings", "/guide"]);
/** Shape validation only. Callers must also establish source existence and scope. */
export function appRoute(path: string): string | null {
  return roots.has(path) || /^\/(sessions|ventures|rooms|plays|runs|review)\/[A-Za-z0-9_-]+$/.test(path) ? path : null;
}
export function paneAnnouncement(kind: PaneStateKind): "alert" | "status" | undefined {
  return kind === "error" ? "alert" : kind === "empty" ? undefined : "status";
}
