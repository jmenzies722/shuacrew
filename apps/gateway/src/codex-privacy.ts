/**
 * ShuaCrew's Codex conversations belong in ShuaCrew, not in the Codex app's own thread list. Codex records every
 * app-server thread as an interactive session (measured: ShuaCrew's show up as "vscode" threads from originator
 * "shuacrew" / "shuacrew-live"), so the runtime archives each one after its turn, and this tidies away the ones from
 * before that (or any a crash left behind), once a boot.
 *
 * Archiving is Codex's own, reversible: the thread stays on disk, and ShuaCrew unarchives it whenever it resumes it.
 * Only threads ShuaCrew created (by originator) and that nothing has touched for a while are moved, so a warm
 * connection or a live call holding one is never disturbed.
 */
import { spawn } from "node:child_process";
import { RpcPeer, findBinary } from "@shuacrew/runtimes";

type Json = Record<string, any>;
export const SHUACREW_ORIGINATOR = /^shuacrew(?:-|$)/;
const IDLE_MS = 30 * 60_000;

/** The threads to tidy from one page of `thread/list`: ShuaCrew's own, idle for a while. Pure, for tests. */
export function shuaThreadsToArchive(threads: Json[], now = Date.now(), idleMs = IDLE_MS): string[] {
  return threads
    .filter((t) => typeof t?.id === "string" && SHUACREW_ORIGINATOR.test(String(t.originator ?? "")))
    .filter((t) => {
      const raw = Number(t.updatedAt ?? t.recencyAt ?? 0);
      const updated = raw < 1e12 ? raw * 1000 : raw; // Codex reports seconds
      return updated > 0 && now - updated > idleMs;
    })
    .map((t) => String(t.id));
}

/** Archive ShuaCrew's idle threads out of the Codex app's list. Resolves to how many were moved; never throws. */
export async function tidyCodexThreads(options: { binary?: string; env: NodeJS.ProcessEnv; maxPages?: number }): Promise<number> {
  const binary = options.binary ?? findBinary("codex");
  if (!binary) return 0;
  const child = spawn(binary, ["app-server"], { env: options.env, stdio: ["pipe", "pipe", "ignore"] });
  const timer = setTimeout(() => child.kill("SIGTERM"), 60_000);
  timer.unref?.();
  let archived = 0;
  try {
    const peer = new RpcPeer(child, () => undefined, async () => ({ decision: "decline" }));
    await peer.request("initialize", { clientInfo: { name: "shuacrew-tidy", title: "ShuaCrew", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    peer.notify("initialized");
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < (options.maxPages ?? 40); page++) {
      const result = await peer.request("thread/list", { limit: 100, useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
      ids.push(...shuaThreadsToArchive(Array.isArray(result.data) ? result.data : []));
      cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
      if (!cursor) break;
    }
    for (const threadId of ids) {
      try { await peer.request("thread/archive", { threadId }); archived++; } catch { /* gone or already archived */ }
    }
  } catch {
    /* Codex not signed in or not answering: nothing is changed */
  } finally {
    clearTimeout(timer);
    child.kill("SIGTERM");
  }
  return archived;
}
