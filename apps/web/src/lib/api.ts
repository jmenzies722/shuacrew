import { getMix, routeLaunch } from "./studio";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}
/** Every request carries the CSRF header the gateway requires for anything that changes state. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "X-ShuaCrew": "1", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    // (DELETE with no body is fine: the header is what the gateway checks.)
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? `HTTP ${response.status}`, response.status);
  return data;
}

export const launchTask = (body: { markdown: string; repo?: string; runtime?: string; model?: string }) => api<{ id: string }>("/api/tasks", { body });

export const launchRun = (body: { ask: string; repo?: string; runtime?: string; model?: string; effort?: string; approveAll?: boolean; member?: string; title?: string; labels?: string[]; reservedId?: string }) =>
  api<{ id: string }>("/api/runs", { body: { ...body, member: routeLaunch(body.member, getMix()) } });

/** Reserve a new session's id and start its agent while you type; launch with `reservedId` to use it. */
export const prepareRun = (body: { ask: string; runtime?: string; model?: string; effort?: string; member?: string }) =>
  api<{ id: string | null }>("/api/runs/prepare", { body: { ...body, member: routeLaunch(body.member, getMix()) } }).then((r) => r.id).catch(() => null);

export const decideApproval = (id: string, allow: boolean, extra: { always?: boolean; comment?: string } = {}) =>
  api<{ ok: boolean }>(`/api/approvals/${id}`, { body: { allow, ...extra } });

export const followUp = (run: string, text: string) => api<{ ok: boolean }>(`/api/runs/${run}/followup`, { body: { text } });
export const cancelRun = (run: string) => api<{ ok: boolean }>(`/api/runs/${run}/cancel`, { body: {} });
