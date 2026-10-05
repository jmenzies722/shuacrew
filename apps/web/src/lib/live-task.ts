export type LiveTaskRequest = { callId: string; taskId: string; text: string; signal: AbortSignal; progress?: () => void };
export type LiveTaskResult = { status: "completed" | "failed" | "cancelled" | "unavailable"; summary: string; outcomes: Array<{ description: string; ok: boolean; message: string }>; visualId?: string };
export type LiveTaskExecutor = (request: LiveTaskRequest) => Promise<LiveTaskResult>;
const cancelled = (): LiveTaskResult => ({ status: "cancelled", summary: "Stopped before completion. Earlier actions may already have taken effect.", outcomes: [] });

export class LiveTaskQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private controllers = new Map<string, AbortController>();
  private results = new Map<string, Promise<LiveTaskResult>>();
  private closed = false;
  private executing = false;
  constructor(readonly callId: string, private changed: () => void = () => {}) {}
  get size() { return this.controllers.size; }
  run(taskId: string, text: string, execute: LiveTaskExecutor): Promise<LiveTaskResult> {
    if (this.closed) return Promise.resolve(cancelled());
    const existing = this.results.get(taskId); if (existing) return existing;
    if (this.results.size >= 100) return Promise.resolve({ status: "unavailable", summary: "This call reached its task limit. Start a new call to continue.", outcomes: [] });
    const abort = new AbortController();
    this.controllers.set(taskId, abort); this.changed();
    const result = this.tail.then(async (): Promise<LiveTaskResult> => {
      if (abort.signal.aborted) return cancelled();
      if (this.executing) return { status: "unavailable", summary: "The previous task is still stopping. Wait before trying again.", outcomes: [] };
      let timer: ReturnType<typeof setTimeout> | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
      let timeoutReason = "", finished = false;
      const stoppedResult = (): LiveTaskResult => timeoutReason ? {status:"failed",summary:`${timeoutReason} Earlier actions may already have taken effect; inspect the result before continuing.`,outcomes:[]} : cancelled();
      const progress = () => {
        if(abort.signal.aborted || finished)return;
        clearTimeout(timer);
        timer=setTimeout(()=>{timeoutReason="No progress was received for two minutes.";abort.abort();},120_000);
      };
      let onAbort!: () => void;
      const stopped = new Promise<LiveTaskResult>(resolve => {
        onAbort = () => resolve(stoppedResult());
        abort.signal.addEventListener("abort", onAbort, { once: true });
        progress();
        deadline=setTimeout(()=>{timeoutReason="Reached the 20-minute live task limit.";abort.abort();},20*60_000);
      });
      try {
        this.executing = true;
        const execution = Promise.resolve().then(() => execute({ callId: this.callId, taskId, text, signal: abort.signal, progress })).finally(() => { this.executing = false; });
        const outcome = await Promise.race([stopped, execution]);
        if (abort.signal.aborted) return stoppedResult();
        return outcome?.summary.trim() ? outcome : { status: "failed", summary: "No verified result was returned.", outcomes: [] };
      } catch (error) { return { status: "failed", summary: error instanceof Error ? error.message : String(error), outcomes: [] }; }
      finally { finished = true; clearTimeout(timer); clearTimeout(deadline); abort.signal.removeEventListener("abort", onAbort); }
    }).finally(() => { this.controllers.delete(taskId); this.changed(); });
    this.tail = result; this.results.set(taskId, result); return result;
  }
  cancelTask(taskId: string) { this.controllers.get(taskId)?.abort(); }
  cancelAll() { for (const abort of this.controllers.values()) abort.abort(); }
  end() { this.closed = true; this.cancelAll(); this.controllers.clear(); this.results.clear(); this.changed(); }
}
