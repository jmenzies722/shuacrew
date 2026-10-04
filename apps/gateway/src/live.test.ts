import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_CHANNELS, liveBackendInstructions, livePrompt, permissionArgs, touchesProtected } from "./live.js";
import { liveReadyFrom, pendingLiveRelay } from "./live.js";

afterEach(() => vi.useRealTimers());
it("cancels timed-out relays rather than promising future completion", async () => {
  vi.useFakeTimers(); const pending = new Map<string, (text: string) => void>(), send = vi.fn();
  const result = pendingLiveRelay(pending, "one", send, 120_000);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(await result).toMatch(/cancelled/i);
  expect(send).toHaveBeenCalledWith({ type: "cancel", id: "one" });
  expect(pending.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it("clears the relay timer after a result or call end", async () => {
  vi.useFakeTimers(); const pending = new Map<string, (text: string) => void>();
  const result = pendingLiveRelay(pending, "one", vi.fn(), 120_000);
  pending.get("one")!("Verified"); expect(await result).toBe("Verified");
  expect(pending.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});

describe("live voice", () => {
  const sealed = [path.join(os.homedir(), "Nectar-Work"), "~/Developer/work"];
  it("denies protected folders in the sandbox itself, and writes only in the live workspace", () => {
    const args = permissionArgs("/tmp/live", sealed);
    expect(args.slice(0, 2)).toEqual(["-c", 'default_permissions="shua_live"']);
    expect(args[3]).toContain('":root" = "read"');
    expect(args[3]).toContain('"/tmp/live" = "write"');
    expect(args[3]).toContain(`"${path.join(os.homedir(), "Nectar-Work")}" = "deny"`);
    expect(args[3]).toContain(`"${path.join(os.homedir(), "Developer/work")}" = "deny"`);
  });
  it("refuses escalations that touch a protected folder however it's spelled", () => {
    expect(touchesProtected("cat ~/Nectar-Work/notes.md", sealed)).toBe(true);
    expect(touchesProtected("ls $HOME/Developer/work", sealed)).toBe(true);
    expect(touchesProtected(`open ${os.homedir()}/Developer/projects/app`, sealed)).toBe(false);
  });
  it("tags backend messages so only results are spoken, and keeps the voice honest", () => {
    expect(LIVE_CHANNELS.final).toEqual(["[COMPLETE]"]);
    expect(liveBackendInstructions(sealed)).toMatch(/\[STATUS\].*\[COMPLETE\]/s);
    expect(liveBackendInstructions(sealed)).toContain("Nectar-Work");
    expect(livePrompt("Shua")).toMatch(/Never say something is done or found before the backend says so/);
    expect(livePrompt("Shua")).toMatch(/architecture.*delegate/i);
    expect(livePrompt("Shua")).toContain("delegate a fresh check");
    expect(livePrompt("Shua")).toContain("reuse an earlier permission failure without a current backend result");
    expect(liveBackendInstructions(sealed)).not.toContain("never say you can't see");
  });
});

describe("live truth guard", async () => {
  const { unsupportedClaims } = await import("./live.js");
  it("catches specifics the result never said", () => {
    expect(unsupportedClaims("You’ve got Lunch at noon.", "Your connected Google Calendar shows no events today, October 2. What's on my calendar today")).toEqual(expect.arrayContaining(["Lunch", "noon"]));
    expect(unsupportedClaims("The secret word is moonlight.", "The secret word is pineapple.")).toEqual([]); // lower-case new words aren't specific enough to flag
    expect(unsupportedClaims("Your dentist is at 3 PM.", "Today: 3:00 PM Dentist (Dr. Lee)")).toEqual([]);
    expect(unsupportedClaims("You have 4 events.", "Today: 3:00 PM Dentist, 6:30 PM Dinner with Sam")).toEqual(["4"]);
  });
  it("lets paraphrase through", () => {
    expect(unsupportedClaims("Nothing on your calendar today.", "Your connected Google Calendar shows no events today, October 2.")).toEqual([]);
    expect(unsupportedClaims("It's in your Downloads folder, Josh.", "Found lease.pdf in ~/Downloads. user Josh")).toEqual([]);
  });
});

describe("live transcript", async () => {
  const { transcriptMarkdown } = await import("./live.js");
  it("keeps who said what and the results", () => {
    const md = transcriptMarkdown([{ role: "user", text: "What's on today?", at: 0 }, { role: "assistant", text: "A dentist at 3.", at: 1000 }], ["Today: 3 PM Dentist"]);
    expect(md).toContain("**You**");
    expect(md).toContain("**Shua**");
    expect(md).toContain("## Results");
    expect(md).toContain("- Today: 3 PM Dentist");
  });
});

describe("liveReadyFrom", () => {
  // The shape `account/rateLimits/read` returned on 2026-10-03, right after the plan reset.
  const fresh = { ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1791664250 }, secondary: null, credits: { hasCredits: false, unlimited: false, balance: "0" }, spendControlReached: false, rateLimitReachedType: null } };
  it("is usable when Codex allows ordinary use", () => {
    expect(liveReadyFrom(fresh)).toEqual({ usable: true, usedPercent: 0, resetsAt: 1791664250_000 });
  });
  it("is not usable once the limit is reached, and says when it resets", () => {
    const spent = { ...fresh, ordinaryUsageAllowed: false, rateLimits: { ...fresh.rateLimits, primary: { ...fresh.rateLimits.primary, usedPercent: 100 }, rateLimitReachedType: "primary" } };
    expect(liveReadyFrom(spent)).toEqual({ usable: false, usedPercent: 100, resetsAt: 1791664250_000 });
  });
  it("is usable on bought credits even with the window used up", () => {
    const credits = { ...fresh, ordinaryUsageAllowed: false, rateLimits: { ...fresh.rateLimits, primary: { ...fresh.rateLimits.primary, usedPercent: 100 }, credits: { hasCredits: true, unlimited: false, balance: "20" } } };
    expect(liveReadyFrom(credits).usable).toBe(true);
  });
  it("is not usable when spend control stops it", () => {
    expect(liveReadyFrom({ ...fresh, rateLimits: { ...fresh.rateLimits, spendControlReached: true } }).usable).toBe(false);
  });
  it("trusts an answer it can't read as usable, so a format change never locks Live out", () => {
    expect(liveReadyFrom({}).usable).toBe(true);
  });
});

it("does not correct TextEdit versus transcribed text edit or keyboard punctuation", async () => {
  const { unsupportedClaims } = await import("./live.js");
  const spoken = 'Screen control is currently limited to reading screenshots, so I could not open TextEdit or type. Open TextEdit, press Command-N, then click the document and type testing shua cursor control.';
  const result = 'Screen control is currently limited to reading screenshots, so I could not open the document or type. Open TextEdit, press Command–N, then click the document and type testing shua cursor control.';
  expect(unsupportedClaims(spoken, result)).toEqual([]);
  expect(unsupportedClaims('I will open TextEdit.', 'Open a blank text edit document')).toEqual([]);
});
