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
import { applyAppearance, loadAppearance, resolvePalette, saveAppearance, type Appearance } from "./appearance";

const SCOPE_KEY = "shuacrew.scope";

function loadScope(): string | null {
  try {
    return localStorage.getItem(SCOPE_KEY) || null;
  } catch {
    return null;
  }
}

export type Connection = "connecting" | "live" | "offline";
export type Theme = "system" | "dark" | "light";

interface Live {
  crew: CrewState;
  connection: Connection;
  runEvents: Record<string, AnyEvent[]>;
  /** The crew's recent activity across every session (no streamed tokens), newest last. */
  activity: AnyEvent[];
  theme: Theme;
  appearance: Appearance;
  setAppearance(change: Partial<Appearance>): void;
  launchOpen: boolean;
  launchDraft: string;
  paletteOpen: boolean;
  keymapOpen: boolean;
  /** Repo path narrowing the floor, board, sessions and activity. Null is every repo. */
  scope: string | null;
  setScope(scope: string | null): void;
  setTheme(theme: Theme): void;
  openLaunch(draft?: string): void;
  closeLaunch(): void;
  setPalette(open: boolean): void;
  setKeymap(open: boolean): void;
  loadRun(id: string): Promise<void>;
}

/** The old three-way setting, derived from the appearance (kept for existing callers). */
function themeOf(a: Appearance): Theme {
  return a.palette === "system" ? "system" : resolvePalette(a).mode;
}

export function applyTheme(_theme?: Theme): void {
  applyAppearance(useLive.getState().appearance);
}

export const useLive = create<Live>((set, get) => ({
  crew: emptyState(),
  connection: "connecting",
  runEvents: {},
  activity: [],
  theme: themeOf(loadAppearance()),
  appearance: loadAppearance(),
  launchOpen: false,
  launchDraft: "",
  paletteOpen: false,
  keymapOpen: false,
  scope: loadScope(),
  setScope(scope) {
    try {
      if (scope) localStorage.setItem(SCOPE_KEY, scope);
      else localStorage.removeItem(SCOPE_KEY);
    } catch {
      /* private mode */
    }
    set({ scope });
  },
  setTheme(theme) {
    const current = get().appearance;
    get().setAppearance({ palette: theme === "system" ? "system" : theme === "dark" ? current.dark : current.light });
  },
  setAppearance(change) {
    const next = { ...get().appearance, ...change };
    // Picking a palette also makes it the one "follow system" uses for its mode.
    if (change.palette && change.palette !== "system") next[resolvePalette(next).mode] = change.palette;
    saveAppearance(next);
    applyAppearance(next, true);
    set({ appearance: next, theme: themeOf(next) });
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
  const { crew, runEvents, activity } = useLive.getState();
  const acted: AnyEvent[] = [];
  const touched = new Set<string>();
  let approvalsChanged = false;
  let loadedChanged: Record<string, AnyEvent[]> | null = null;
  for (const event of batch) {
    if (event.seq <= crew.head) continue;
    apply(crew, event);
    if (ACTIVITY.has(event.kind)) acted.push(event);
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
      members: { ...crew.members },
      today: { ...crew.today },
    },
    ...(loadedChanged ? { runEvents: loadedChanged } : {}),
    ...(acted.length ? { activity: [...activity, ...acted].slice(-1500) } : {}),
  });
}

const ACTIVITY = new Set(["run.created", "run.status", "turn.started", "turn.completed", "tool.called", "tool.returned", "file.changed", "check.ran", "subagent.started", "subagent.finished", "approval.requested", "approval.decided", "merge.landed", "merge.failed", "pr.opened", "agent.thinking"]);

export async function connect(): Promise<void> {
  try {
    const [snapshot, activity] = await Promise.all([api<CrewState>("/api/snapshot"), api<AnyEvent[]>("/api/activity").catch(() => [])]);
    useLive.setState({ crew: snapshot, activity });
  } catch {
    useLive.setState({ connection: "offline" });
  }
  open();
  void checkBuild();
  setInterval(() => void checkBuild(), 30_000);
}

// ── staying current ────────────────────────────────────────────────────────────────────────

let loadedBuild: string | null = null;

/**
 * When the gateway is serving a newer build than this page, reload into it — but never out from
 * under a half-typed message: wait until the composer is empty.
 */
async function checkBuild(): Promise<void> {
  let build: string;
  try {
    build = (await api<{ build: string }>("/api/health")).build;
  } catch {
    return;
  }
  if (loadedBuild === null) {
    loadedBuild = build;
    return;
  }
  if (build === loadedBuild || build === "none") return;
  const typing = [...document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea, input[type=text], input:not([type])")].some((el) => el.value.trim());
  if (!typing) location.reload();
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
    setTimeout(() => void checkBuild(), 1500); // a gateway restart is the usual moment a new build lands
    const delay = Math.min(4000, 150 * 2 ** retry++);
    setTimeout(open, delay);
  };
}

export function selectLiveRuns(crew: CrewState) {
  return Object.values(crew.runs).filter((r) => ["running", "planning", "awaiting_approval", "paused"].includes(r.status));
}
