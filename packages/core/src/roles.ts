/**
 * Roles: who does what in a session, defined by the job and its limits rather than by a persona. A role is the same
 * on Claude and on Codex. Four cover the work:
 *
 *   builder     changes the code, in the session's own branch, and proves it (verification.ts)
 *   reviewer    reads a finished change and says what must be fixed before it merges; never changes files
 *   researcher  finds things out and cites where from; never changes files
 *   operator    runs what is scheduled and diagnoses what failed; changes nothing unless a person asks
 *
 * The reviewer is the first one the gateway uses on its own (review.ts). The crew's named members are still what
 * the composer offers; roles replace them as each one's workflow is built.
 */
import type { Rule } from "./policy.js";

export type RoleId = "builder" | "reviewer" | "researcher" | "operator";
export interface Role {
  id: RoleId;
  name: string;
  /** One line: what this role is for. */
  job: string;
  /** May it change files? When false, the gateway refuses its edits whatever it is told (`readOnlyRules`). */
  writes: boolean;
}

export const ROLES: Record<RoleId, Role> = {
  builder: { id: "builder", name: "Builder", job: "Makes the change in the session's own branch and proves it with a check.", writes: true },
  reviewer: { id: "reviewer", name: "Reviewer", job: "Reads a finished change and lists what must be fixed before it merges.", writes: false },
  researcher: { id: "researcher", name: "Researcher", job: "Finds things out and says where each fact came from.", writes: false },
  operator: { id: "operator", name: "Operator", job: "Runs what is scheduled and works out why something failed.", writes: false },
};

/** For a role that must not change files: every write is refused, in a layer the session cannot loosen. */
export function readOnlyRules(role: Role): Rule[] {
  return role.writes ? [] : [{ id: `role.${role.id}.read-only`, description: `the ${role.name.toLowerCase()} never changes files`, verdict: "deny", risk: "low", matches: (call) => call.kind === "write" }];
}
