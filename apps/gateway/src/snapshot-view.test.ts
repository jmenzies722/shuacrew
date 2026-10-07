import { expect, it } from "vitest";
import type { CrewState, RunView } from "@shuacrew/core/projections";
import { leanRun, snapshotView } from "./snapshot-view.js";

const run = (ask: string, labels: string[] = []) => ({ id: "r", ask, labels, title: "T" }) as unknown as RunView;

it("cuts a Shua prompt down to a preview, keeps what you typed, and never touches the state itself", () => {
  const prompt = "You are Shua, the user's desktop buddy… ".repeat(1600); // ~65 KB, like a real Spark turn
  expect(leanRun(run(prompt, ["buddy"])).ask.length).toBe(281);
  expect(leanRun(run("Fix the flaky upload retry test")).ask).toBe("Fix the flaky upload retry test");
  const long = "x".repeat(9000);
  expect(leanRun(run(long)).ask).toHaveLength(8001);
  const state = { runs: { a: run(prompt, ["buddy"]) } } as unknown as CrewState;
  const view = snapshotView(state);
  expect(view.runs.a!.ask.length).toBe(281);
  expect(state.runs.a!.ask.length).toBe(prompt.length); // the live state keeps the full ask
});

it("a Shua conversation's events keep exactly what every reader reads: your words, before [screen]", async () => {
  const { eventsView, leanText } = await import("./snapshot-view.js");
  // The notch's own parser, loaded by path: a contract test across the two packages, not a gateway dependency.
  const parser = new URL("../../web/src/lib/companion-history.ts", import.meta.url).href;
  const { firstUserAsk } = (await import(/* @vite-ignore */ parser)) as { firstUserAsk: (prompt: string) => string };
  const persona = "You are Shua, the user's desktop buddy on their Mac. " + "Rules and tone. ".repeat(3000);
  const screen = "\n\n[screen]\n" + "Window: Safari — a long OCR'd page. ".repeat(2000);
  const prompt = `${persona}\nThe user says: Pause the music${screen}`;
  const lean = leanText(prompt);
  expect(lean.length).toBeLessThan(200);
  expect(firstUserAsk(lean)).toBe(firstUserAsk(prompt)); // the notch reads the same words
  expect(firstUserAsk(lean)).toBe("Pause the music");
  const followup = `[mac] What's open:${screen}`;
  expect(leanText(followup).split("\n\n[screen]")[0]).toBe(followup.split("\n\n[screen]")[0]);
  expect(leanText("Fix the flaky upload retry test")).toBe("Fix the flaky upload retry test");
  const phone = "From my iPhone: When is the Knicks game\n\n[app]\n" + "SHUACREW — THE APP YOU LIVE IN. ".repeat(200);
  expect(leanText(phone)).toBe("From my iPhone: When is the Knicks game\n\n[app] …");
  const events = [{ kind: "run.followup", body: { text: followup } }, { kind: "agent.delta", body: { text: "ok" } }];
  expect(eventsView(events, false)).toBe(events); // work sessions: untouched
  const shua = eventsView(events, true);
  expect((shua[0]!.body as { text: string }).text.length).toBeLessThan(80);
  expect(shua[1]).toBe(events[1]);
});
