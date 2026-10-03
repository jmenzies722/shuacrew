import type { Decision } from "@shuacrew/core";

/**
 * The assistant (Spark, Live) acts on your behalf, in front of you, by voice: it should just do things. Should this
 * policy decision stop it to ask you anyway? A deny never reaches here (it doesn't run at all). Asking too often
 * makes it a form to fill in; asking too rarely lets it push, send or delete without you.
 *
 * Lives in the gateway, not core: it's the gateway that answers both Live (live.ts) and Spark (/api/policy/explain).
 */
export function assistantMustAsk(decision: Pick<Decision, "verdict" | "risk" | "rule">): boolean {
  // TODO(human): decide when an "ask" is worth interrupting you for. Today: only when a rule asked on purpose.
  return decision.verdict === "ask" && decision.rule !== "default.ask";
}
