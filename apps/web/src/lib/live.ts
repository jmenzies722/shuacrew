/**
 * The live model of the crew, kept in step with the gateway.
 *
 * On load the page fetches a snapshot (fast first paint), then subscribes to the event stream from
 * the snapshot's sequence number. Events are applied with the *same* projection code the gateway
 * uses, batched to one state update per animation frame — ten agents streaming tokens still cost
 * one render per frame. A dropped socket reconnects and resumes from the last sequence it applied.
 */
import type { AnyEvent } from "@shuacrew/core/events";
import { apply, emptyState, type CrewState } from "@shuacrew/core/projections";
import { create } from "zustand";
import { api } from "./api";

export type Connection = "connecting" | "live" | "offline";
export type Theme = "system" | "dark" | "light";

interface Live {
  crew: CrewState;
  connection: Connection;
  runEvents: Record<string, AnyEvent[]>;
  theme: Theme;
  launchOpen: boolean;
  launchDraft: string;
  paletteOpen: boolean;
  keymapOpen: boolean;
  setTheme(theme: Theme): void;
  openLaunch(draft?: string): void;
  closeLaunch(): void;
  setPalette(open: boolean): void;
  setKeymap(open: boolean): void;
  loadRun(id: string): Promise<void>;
}

const THEME_KEY = "shuacrew.theme";

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export const useLive = create<Live>((set, get) => ({
  crew: emptyState(),
  connection: "connecting",
  runEvents: {},
  theme: storedTheme(),
  launchOpen: false,
  launchDraft: "",
  paletteOpen: false,
  keymapOpen: false,
  setTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private window: the choice lasts for this page */
    }
    applyTheme(theme);
    set({ theme });
  },
  openLaunch(draft = "") {
    set({ launchOpen: true, launchDraft: draft, paletteOpen: false });
  },
  closeLaunch() {
    set({ launchOpen: false });
  },
  setPalette(open) {
    set({ paletteOpen: open });
  },
  setKeymap(open) {
    set({ keymapOpen: open });
  },
  async loadRun(id) {
    if (get().runEvents[id]) return;
    const events = await api<AnyEvent[]>(`/api/runs/${id}/events`);
    // Events that streamed in while this loaded are already in the pending buffer or applied.
    set((s) => ({ runEvents: { ...s.runEvents, [id]: merge(s.runEvents[id] ?? [], events) } }));
  },
}));

function merge(a: AnyEvent[], b: AnyEvent[]): AnyEvent[] {
  const bySeq = new Map<number, AnyEvent>();
  for (const e of a) bySeq.set(e.seq, e);
  for (const e of b) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((x, y) => x.seq - y.seq);
}

// ── the stream ─────────────────────────────────────────────────────────────────────────────

let pending: AnyEvent[] = [];
let frame = 0;
let fallback: ReturnType<typeof setTimeout> | undefined;
let socket: WebSocket | null = null;
let retry = 0;

function schedule(): void {
  if (frame) return;
  frame = requestAnimationFrame(flush);
  // WebKit pauses animation frames in a hidden or covered window. Keep folding events anyway, so
  // state is current the moment you look and the queue can't grow while you're away.
  fallback = setTimeout(flush, 250);
}

function flush(): void {
  if (frame) cancelAnimationFrame(frame);
  clearTimeout(fallback);
  frame = 0;
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  const { crew, runEvents } = useLive.getState();
  const touched = new Set<string>();
  let approvalsChanged = false;
  let loadedChanged: Record<string, AnyEvent[]> | null = null;
  for (const event of batch) {
    if (event.seq <= crew.head) continue;
    apply(crew, event);
    if (event.run) touched.add(event.run);
    if (event.kind.startsWith("approval.")) approvalsChanged = true;
    if (event.run && runEvents[event.run]) {
      loadedChanged ??= { ...runEvents };
      loadedChanged[event.run] = [...(loadedChanged[event.run] ?? []), event];
    }
  }
  // New references only for what changed, so each component re-renders only for its own run.
  const runs = { ...crew.runs };
  for (const id of touched) if (runs[id]) runs[id] = { ...runs[id] };
  useLive.setState({
    crew: {
      ...crew,
      runs,
      approvals: approvalsChanged ? { ...crew.approvals } : crew.approvals,
      limited: { ...crew.limited },
      today: { ...crew.today },
    },
    ...(loadedChanged ? { runEvents: loadedChanged } : {}),
  });
}

export async function connect(): Promise<void> {
  try {
    const snapshot = await api<CrewState>("/api/snapshot");
    useLive.setState({ crew: snapshot });
  } catch {
    useLive.setState({ connection: "offline" });
  }
  open();
}

function open(): void {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onmessage = (message) => {
    const data = JSON.parse(String(message.data)) as { type: string; events?: AnyEvent[]; head?: number; caughtUp?: boolean };
    if (data.type === "hello") {
      socket?.send(JSON.stringify({ type: "subscribe", after: useLive.getState().crew.head }));
      return;
    }
    if (data.type === "events" && data.events) {
      pending.push(...data.events);
      schedule();
      if (data.caughtUp) {
        retry = 0;
        useLive.setState({ connection: "live" });
      }
    }
  };
  socket.onclose = () => {
    useLive.setState({ connection: "offline" });
    const delay = Math.min(4000, 150 * 2 ** retry++);
    setTimeout(open, delay);
  };
}

export function selectLiveRuns(crew: CrewState) {
  return Object.values(crew.runs).filter((r) => ["running", "planning", "awaiting_approval", "paused"].includes(r.status));
}
