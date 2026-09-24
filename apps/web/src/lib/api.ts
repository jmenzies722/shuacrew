/** Every request carries the CSRF header the gateway requires for anything that changes state. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "X-ShuaCrew": "1", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    // (DELETE with no body is fine: the header is what the gateway checks.)
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

export const launchTask = (body: { markdown: string; repo?: string; runtime?: string; model?: string }) => api<{ id: string }>("/api/tasks", { body });

export const launchRun = (body: { ask: string; repo?: string; runtime?: string; model?: string; effort?: string; approveAll?: boolean }) =>
  api<{ id: string }>("/api/runs", { body });

export const decideApproval = (id: string, allow: boolean, extra: { always?: boolean; comment?: string } = {}) =>
  api<{ ok: boolean }>(`/api/approvals/${id}`, { body: { allow, ...extra } });

export const followUp = (run: string, text: string) => api<{ ok: boolean }>(`/api/runs/${run}/followup`, { body: { text } });
export const cancelRun = (run: string) => api<{ ok: boolean }>(`/api/runs/${run}/cancel`, { body: {} });
