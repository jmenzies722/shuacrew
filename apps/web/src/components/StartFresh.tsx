import { Button, Panel } from "@shuacrew/ui";
import { useState } from "react";
import { api } from "../lib/api";

/** What a fresh start erases and what it keeps: the gateway's fresh-start.ts is the source of truth. */
export const ERASES = ["Sessions and chat history", "Shua's conversations", "Memory and lessons", "Library", "Learn (path, certs, jobs, cards)", "Ventures and income", "Uploads and screen memory", "Logs"];
export const KEEPS = ["Crew members", "Integrations, skills and schedules", "Settings and look", "Shua's character, voice and sounds", "Accounts, keys and pairing", "Voice models and backups"];
const CONFIRM = "start fresh";

type Phase = "idle" | "backup" | "erasing" | "restarting" | "failed";

/**
 * Settings → System → Start fresh: erase what you made, keep how you set things up. An encrypted backup runs first,
 * then the gateway moves everything it erases into ~/.shuacrew/backups/fresh-start-<time>/ (with a README on how to
 * put it back) and restarts; every window reloads clean when the new content epoch arrives.
 */
export function StartFresh() {
  const [typed, setTyped] = useState(""), [phase, setPhase] = useState<Phase>("idle"), [error, setError] = useState("");
  const ready = typed.trim().toLowerCase() === CONFIRM && (phase === "idle" || phase === "failed");
  const go = async () => {
    setError("");
    try {
      setPhase("backup");
      await api("/api/backups", { body: {} });
      setPhase("erasing");
      const before = await api<{ epoch: string }>("/api/content-epoch").catch(() => ({ epoch: "" }));
      await api("/api/fresh-start", { body: { confirm: CONFIRM } });
      setPhase("restarting");
      // The gateway restarts and comes back with a new content epoch: then this window reloads clean.
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const now = await api<{ epoch: string }>("/api/content-epoch").catch(() => null);
        if (now && now.epoch !== before.epoch) { location.reload(); return; }
      }
      throw new Error("The gateway hasn't come back yet. Your data is safe in the backup; reopen ShuaCrew in a minute.");
    } catch (e) { setError((e as Error).message); setPhase("failed"); }
  };
  const label = phase === "backup" ? "Backing up…" : phase === "erasing" ? "Erasing…" : phase === "restarting" ? "Starting fresh…" : "Start fresh";
  return (
    <Panel className="p-5">
      <p className="max-w-[760px] text-[12.5px] leading-relaxed text-fg-3">
        Start over with zero data, keeping everything you set up. An encrypted backup runs first, and everything erased is moved — not deleted — into <span className="text-fg-2">~/.shuacrew/backups/fresh-start-…</span> with a note on how to put it back.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-fg-3">Erases</p><ul className="space-y-1 text-[12.5px] text-fg-2">{ERASES.map((x) => <li key={x}>– {x}</li>)}</ul></div>
        <div><p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-fg-3">Keeps</p><ul className="space-y-1 text-[12.5px] text-fg-2">{KEEPS.map((x) => <li key={x}>✓ {x}</li>)}</ul></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type “${CONFIRM}” to confirm`} aria-label={`Type ${CONFIRM} to confirm`}
          disabled={phase !== "idle" && phase !== "failed"} className="h-8 w-[240px] rounded-md border border-line bg-transparent px-2.5 text-[12.5px] text-fg outline-none focus:border-fg-3" />
        <Button size="s" variant="danger" onClick={() => void go()} disabled={!ready}>{label}</Button>
      </div>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-bad">{error}</p>}
    </Panel>
  );
}
