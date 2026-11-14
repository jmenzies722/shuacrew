/**
 * A race: one task given to two providers at once, each in its own branch. Proof decides, not taste:
 *
 *   a session that proved its change (verification.ts) beats one that did not;
 *   one that changed code beats one that changed nothing; one that finished beats one that did not.
 *
 * When both stand equal (both proved it, or neither did) there is no winner: the gateway says so and the choice is
 * yours. It never picks between two verified changes by speed or size, because neither says which one is right.
 */
export interface RaceStanding {
  run: string;
  /** "claude", "codex": who ran it. */
  runtime: string;
  /** The session's status at rest. */
  status: string;
  /** Its verdict, when it changed code. */
  verification?: "verified" | "failing" | "unverified";
  /** The check that decided the verdict. */
  command?: string;
  /** Code files it changed. */
  files: number;
}
export interface RaceResult { winner: string | null; reason: string }

const NAME: Record<string, string> = { claude: "Claude", codex: "Codex" };
const who = (s: RaceStanding) => NAME[s.runtime] ?? s.runtime;

/** How far a session got: 0 did not finish · 1 changed nothing · 2 checks failing · 3 unverified · 4 verified. */
function rank(s: RaceStanding): number {
  if (s.status === "failed" || s.status === "cancelled") return 0;
  if (!s.files || !s.verification) return 1;
  return s.verification === "verified" ? 4 : s.verification === "unverified" ? 3 : 2;
}
function describe(s: RaceStanding): string {
  switch (rank(s)) {
    case 0: return `${who(s)} did not finish`;
    case 1: return `${who(s)} changed no code`;
    case 2: return `${who(s)}'s checks are failing${s.command ? ` (${s.command})` : ""}`;
    case 3: return `${who(s)} did not check its change`;
    default: return `${who(s)} proved its change${s.command ? ` (${s.command})` : ""}`;
  }
}

/** What is said when both stand equal, by how far they got. */
const TIE: Record<number, (a: RaceStanding, b: RaceStanding) => string> = {
  4: () => "Both proved their change. Compare the two and keep the one you prefer.",
  3: (a, b) => `No winner: ${who(a)} did not check its change, and neither did ${who(b)}.`,
  2: (a, b) => `No winner: ${describe(a)}, and so are ${who(b)}'s.`,
  1: (a, b) => `No winner: ${who(a)} changed no code, and neither did ${who(b)}.`,
  0: () => "Neither finished.",
};

export function judgeRace(a: RaceStanding, b: RaceStanding): RaceResult {
  const ra = rank(a), rb = rank(b);
  if (ra === rb) return { winner: null, reason: TIE[ra]!(a, b) };
  const [best, other] = ra > rb ? [a, b] : [b, a];
  return { winner: best.run, reason: `${describe(best)}; ${describe(other)}.` };
}
