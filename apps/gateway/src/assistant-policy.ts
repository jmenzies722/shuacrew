import type { Decision } from "@shuacrew/core";

/**
 * The assistant (Spark, Live) acts on your behalf, in front of you, by voice: it should just do things. Should this
 * policy decision stop it to ask you anyway? A deny never reaches here (it doesn't run at all). Asking too often
 * makes it a form to fill in; asking too rarely lets it push, send or delete without you.
 *
 * Lives in the gateway, not core: it's the gateway that answers both Live (live.ts) and Spark (/api/policy/explain).
 */
export function assistantMustAsk(decision: Pick<Decision, "verdict" | "risk" | "rule">): boolean {
  if (decision.verdict !== "ask") return false;
  // A rule asked on purpose (push, send, delete, infra changes): worth a spoken "yes or no".
  if (decision.rule !== "default.ask") return true;
  // "No rule covers this" alone isn't a reason to interrupt, unless it's still judged high-stakes.
  return decision.risk === "high" || decision.risk === "critical";
}
