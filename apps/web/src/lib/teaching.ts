import { useEffect, useSyncExternalStore } from "react";
import { TeachingObservationSchema, type TeachingDocument } from "@shuacrew/core/teaching";
import { api } from "./api";
import { teachingNative } from "./teaching-native";
import { isMac } from "./native";
export type TeachingState = {
  active: string | null;
  document: TeachingDocument | null;
  lessons: Array<{ id: string; title: string; revision: number }>;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
};
let state: TeachingState = {
  active: null,
  document: null,
  lessons: [],
  canUndo: false,
  canRedo: false,
  busy: false,
};
const listeners = new Set<() => void>();
let request = 0;
export async function teachingApi(path = "", body?: unknown) {
  const n = ++request;
  if (!path && body === undefined) {
    const check = await api<{ active: string | null; revision: number | null; busy: boolean }>(
      "/api/teaching/check",
    );
    if (
      check.active === state.active &&
      check.revision === (state.document?.revision ?? null) &&
      check.busy === state.busy
    )
      return state;
  }
  const value = await api<TeachingState>(`/api/teaching${path}`, body === undefined ? undefined : { body });
  if (n === request) {
    state = value;
    listeners.forEach((l) => l());
  }
  return value;
}
export function useTeaching() {
  useEffect(() => {
    monitorPractice();
    const refresh = () => void teachingApi().catch(() => {});
    refresh();
    const timer = setInterval(refresh, 1200);
    return () => clearInterval(timer);
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );
}
export const teachingChange = (doc: TeachingDocument, change: Record<string, unknown>) =>
  teachingApi(`/${doc.sessionId}/change`, { baseRevision: doc.revision, ...change });

let starting = false,
  observing = false,
  queued: unknown = null,
  monitoring = false,
  missingNativeChecks = 0;
export async function pausePractice(native = true) {
  queued = null;
  if (native && isMac()) await teachingNative({ type: "buddyTeachPracticePause" });
  const current = (await teachingApi()).document;
  if (current?.practice.active)
    await teachingApi(`/${current.sessionId}/practice`, { active: false, baseRevision: current.revision });
}
export async function startPractice(doc: TeachingDocument, displayId: number, model?: string, runtime: "codex" = "codex") {
  starting = true;
  try {
    await teachingApi(`/${doc.sessionId}/practice`, {
      active: true,
      baseRevision: doc.revision,
      displayId,
      model,
      runtime,
    });
    await teachingNative({ type: "buddyTeachPracticeStart", sessionId: doc.sessionId, displayId });
  } catch (error) {
    await pausePractice().catch(() => {});
    throw error;
  } finally {
    starting = false;
  }
}
export async function checkPractice() {
  if (!state.document?.practice.active) throw new Error("Start guided practice first");
  await teachingNative({ type: "buddyTeachPracticeCheck", sessionId: state.document.sessionId });
}
async function drainObservations() {
  if (observing || !queued) return;
  observing = true;
  try {
    while (queued) {
      const event = TeachingObservationSchema.parse(queued);
      queued = null;
      const current = (await teachingApi()).document;
      if (!current?.practice.active || current.sessionId !== event.sessionId) continue;
      if (state.busy) {
        queued = event;
        break;
      }
      try {
        const result = await teachingApi(`/${event.sessionId}/observe`, event);
        if (
          !queued &&
          result.document?.practice.active &&
          result.document.practice.eventId === event.eventId &&
          result.document.annotations.length
        )
          await teachingNative({ type: "buddyTeachOverlay", annotations: result.document.annotations }).catch(
            () => {},
          );
      } catch {
        await teachingApi().catch(() => {});
      }
    }
  } finally {
    observing = false;
  }
}
function monitorPractice() {
  if (monitoring || !isMac()) return;
  monitoring = true;
  window.addEventListener("shuacrew:teachingObservation", (e) => {
    const parsed = TeachingObservationSchema.safeParse((e as CustomEvent).detail);
    if (!parsed.success || parsed.data.sessionId !== state.active || !state.document?.practice.active) return;
    queued = parsed.data;
    if (observing) void teachingApi(`/${parsed.data.sessionId}/cancel`, {}).catch(() => {});
    else void drainObservations();
  });
  window.addEventListener("shuacrew:practicePaused", (e) => {
    if (!starting && (e as CustomEvent).detail?.sessionId === state.active)
      void pausePractice(false).catch(() => {});
  });
  setInterval(() => {
    if (starting) return;
    void (async () => {
      const current = (await teachingApi()).document;
      const native = await teachingNative({ type: "buddyTeachPracticeStatus" });
      if (
        native.active &&
        native.owner &&
        (!current?.practice.active || native.sessionId !== current.sessionId)
      )
        await teachingNative({ type: "buddyTeachPracticePause" });
      else if (!native.active && current?.practice.active) {
        if (++missingNativeChecks >= 2) await pausePractice(false);
      } else missingNativeChecks = 0;
      if (queued && !observing) await drainObservations();
    })().catch(() => {});
  }, 1500);
}
