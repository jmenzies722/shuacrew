import { beforeEach, expect, it, vi } from "vitest";

const perform = vi.fn(async () => ({ ok: true, message: "ok" }));
// Like the real player: a command changes what it reports as playing (unless a test says the player is stuck).
let stuck = false;
const radioCommand = vi.fn(async (c: { cmd: string }) => { if (!stuck) radio = { ...radio, playing: c.cmd === "play" || c.cmd === "resume" ? true : c.cmd === "pause" || c.cmd === "stop" ? false : radio.playing }; return { ok: true }; });
let radio = { playing: false } as { playing: boolean; title?: string };
let media: { app: string; playing: boolean; title: string; artist?: string } | null = null;
vi.mock("./actions", () => ({ perform: (...a: unknown[]) => perform(...(a as [])) }));
vi.mock("./bridge", () => ({ nowPlayingOnce: async () => media }));
vi.mock("../../lib/radio", () => ({ radioNow: async () => radio, radioCommand: (c: { cmd: string }) => radioCommand(c), getRadio: () => ({ station: null }) }));
vi.mock("../../lib/soundscape", () => ({ playScape: vi.fn(), stopScape: vi.fn() }));
vi.mock("../../lib/focus-timer", () => ({ setFocus: vi.fn(), startFocus: vi.fn() }));
const { isInstant, runInstant } = await import("./commands");
const deps = { setRadio: vi.fn(), soundsVolume: 0.5 };
const say = async (move: Parameters<typeof runInstant>[0]) => { let said = ""; await runInstant(move, (a) => { said = a; }, deps); return said; };

beforeEach(() => { perform.mockClear(); radioCommand.mockClear(); radio = { playing: false }; media = null; stuck = false; });

it("knows which asks are instant (and leaves the rest to Spark)", () => {
  expect(isInstant({ kind: "player", cmd: "pause" })).toBe(true);
  expect(isInstant({ kind: "settings", pane: "wifi" })).toBe(true);
  expect(isInstant({ kind: "brief" })).toBe(false);
  expect(isInstant(null)).toBe(false);
});
it("pauses whatever is actually playing: the radio first, else Music/Spotify, else says so", async () => {
  radio = { playing: true };
  expect(await say({ kind: "player", cmd: "pause" })).toBe("Paused.");
  expect(radioCommand).toHaveBeenCalledWith({ cmd: "pause" }); expect(perform).not.toHaveBeenCalled();
  radio = { playing: false }; media = { app: "Spotify", playing: true, title: "Midnight City" };
  expect(await say({ kind: "player", cmd: "pause" })).toBe("Paused.");
  expect(perform).toHaveBeenCalledWith({ type: "media", command: "pause", app: "Spotify" });
  media = null;
  expect(await say({ kind: "player", cmd: "pause" })).toBe("Nothing's playing.");
});
it("answers what's playing, and plays or opens in the app that's in use", async () => {
  media = { app: "Music", playing: true, title: "Knife Talk", artist: "Drake" };
  expect(await say({ kind: "whatsong" })).toBe("That's Knife Talk by Drake.");
  await say({ kind: "play", query: "Miguel" });
  expect(perform).toHaveBeenLastCalledWith({ type: "media", command: "play_query", query: "Miguel", app: "Music" });
  await say({ kind: "browse", query: "Drake", app: "Spotify" });
  expect(perform).toHaveBeenLastCalledWith({ type: "media", command: "open_query", query: "Drake", app: "Spotify" });
});

it("only says the radio is off once it really is, and says so honestly when it isn't", async () => {
  radio = { playing: true };
  expect(await say({ kind: "stop-radio" })).toBe("Radio off.");
  expect(radioCommand).toHaveBeenCalledWith({ cmd: "stop" });
  expect(await say({ kind: "stop-radio" })).toBe("The radio's already off.");
  radio = { playing: true }; stuck = true; vi.useFakeTimers();
  const said = say({ kind: "stop-radio" }); await vi.advanceTimersByTimeAsync(8000);
  expect(await said).toMatch(/still playing/); expect(radioCommand).toHaveBeenCalledTimes(3); // the first stop, then one retry
  vi.useRealTimers();
});
