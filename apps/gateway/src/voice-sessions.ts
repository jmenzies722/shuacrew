import { createHash } from "node:crypto";
import { fold } from "@shuacrew/core";
import { SHUA_PERSONA } from "@shuacrew/core/voice";
import type { Runtime } from "@shuacrew/runtimes";
import type { EventStore } from "./store.js";
import type { Supervisor } from "./runs.js";
import type { Crew } from "./crew.js";

export class VoiceSessions {
  constructor(private store: EventStore, private supervisor: Supervisor, private crew: Crew, private runtimes: Map<string, Runtime>) {}
  initialize(runtime: string) {
    if (this.runtimes.get(runtime)?.authMode !== "subscription" || this.runtimes.get(runtime)?.id === "mock") throw new Error("Choose a connected subscription runtime.");
    if (!this.crew.get("shua")) this.crew.set({ id: "shua", name: "Shua", role: "Personal assistant", persona: SHUA_PERSONA, runtime, color: "#56d4dd", emoji: "audio-lines", triggers: [], voice: { voiceId: "aiden", speed: 1, personality: "calm" } });
    return this.crew.get("shua")!;
  }
  submit(input: { requestId: string; runId?: string; memberId: string; runtime: string; text: string }) {
    if (!/^[0-9a-f-]{36}$/i.test(input.requestId) || !input.text?.trim() || input.text.length > 8000) throw new Error("Invalid voice utterance.");
    const { runId, memberId, runtime } = input;
    const text = input.text.trim();
    const digest = createHash("sha256").update(JSON.stringify([runId ?? null, memberId, runtime, text])).digest("hex");
    const prefix = `voice:${input.requestId}:`, token = prefix + digest;
    for (const e of this.store.read(0)) {
      const ids = e.kind === "run.created" ? e.body.labels : e.kind === "run.followup" ? [e.body.id] : [];
      const prior = ids.find(id => id?.startsWith(prefix));
      if (prior) {
        if (prior !== token) throw new Error("This utterance was already accepted with different content.");
        return { runId: e.run!, after: e.seq };
      }
    }
    if (!this.crew.get(memberId)) throw new Error("Choose a crew member first.");
    if (this.runtimes.get(runtime)?.authMode !== "subscription" || this.runtimes.get(runtime)?.id === "mock") throw new Error("Voice requires a subscription-backed runtime.");
    if (runId) {
      const run = fold(this.store.read(0)).runs[runId];
      if (!run || run.member !== memberId || run.runtime !== runtime) throw new Error("This session belongs to another member or provider. Start a new conversation.");
      if (run.permission !== "ask") throw new Error("Switch this session to supervised before using voice.");
      if (!["done", "failed", "cancelled", "reviewing"].includes(run.status) || run.pendingApprovals.length || this.supervisor.isActive(runId)) throw new Error("This session is busy. Interrupt or wait for it to finish.");
      this.supervisor.followUp(runId, text, "you", token);
      const accepted = this.store.forRun(runId).find(e => e.kind === "run.followup" && e.body.id === token)!;
      return { runId, after: accepted.seq };
    }
    const created = this.supervisor.launch({ ask: text, runtime, member: memberId, approveAll: false, labels: [token, "voice"] });
    return { runId: created, after: this.store.forRun(created).find(e => e.kind === "run.created")!.seq };
  }
}
