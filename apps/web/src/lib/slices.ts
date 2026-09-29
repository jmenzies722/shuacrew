/** Which CrewState slices an event can change (from the projection's own cases). Everything else keeps its reference. */
const RULES: Array<[RegExp, string[]]> = [
  [/^run\.created$/, ["members", "today"]],
  [/^crew\.member\./, ["members"]],
  [/^artifact\./, ["artifacts"]],
  [/^knowledge\./, ["knowledge"]],
  [/^venture\./, ["ventures"]],
  [/^site\./, ["sites"]],
  [/^playbook\./, ["playbooks"]],
  [/^play\./, ["plays"]],
  [/^approval\./, ["approvals"]],
  [/^usage\.recorded$/, ["today"]],
  [/^runtime\./, ["limited"]],
  [/^room\./, ["rooms"]],
];
export function slicesFor(kinds: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const kind of kinds) for (const [re, slices] of RULES) if (re.test(kind)) for (const s of slices) out.add(s);
  return out;
}
