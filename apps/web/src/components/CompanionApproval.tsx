import { useState } from "react";
import { decideApproval } from "../lib/api";

export function CompanionApproval({ approval }: { approval: { id: string; tool: string; input: unknown; reason?: string } }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const input = approval.input && typeof approval.input === "object" ? approval.input as Record<string, unknown> : {};
  const label = typeof input.message === "string" ? input.message : typeof input.command === "string" ? input.command : approval.tool;
  async function decide(allow: boolean) {
    if (sending) return;
    setSending(true); setError("");
    try { await decideApproval(approval.id, allow); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not send your decision"); }
    finally { setSending(false); }
  }
  return <section className="notch-permission" aria-label="Permission required">
    <strong>Permission needed</strong><p>{label}</p>
    <details><summary>Review request</summary><small>{approval.tool}{approval.reason ? ` · ${approval.reason}` : ""}</small><pre>{JSON.stringify(approval.input, null, 2)}</pre></details>
    <div><button disabled={sending} onClick={() => void decide(true)}>Allow once</button><button disabled={sending} onClick={() => void decide(false)}>Deny</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
