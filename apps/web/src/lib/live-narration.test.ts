import { expect, it, vi } from "vitest";
import { LiveNarration } from "./live-narration";

it("starts on a natural opening clause before the sentence finishes", () => {
  const spoken: string[] = [];
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop: vi.fn(), beginTurn: vi.fn() });
  narrator.update("For your video streaming app,", false);
  expect(spoken).toEqual(["For your video streaming app,"]);
  narrator.update("For your video streaming app, the CDN handles playback.", true);
  expect(spoken).toEqual(["For your video streaming app,", "the CDN handles playback."]);
});

it("queues separate sentences so the next can synthesize ahead of playback", () => {
  const spoken: string[] = [];
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop: vi.fn(), beginTurn: vi.fn() });
  narrator.update("First sentence. Second sentence. Still arriving", false);
  expect(spoken).toEqual(["First sentence.", "Second sentence."]);
});

it("does not split decimal numbers or short introductory fragments", () => {
  const spoken: string[] = [];
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop: vi.fn(), beginTurn: vi.fn() });
  narrator.update("Yes, the total is 1,000.50 dollars", false);
  expect(spoken).toEqual([]);
});

it("does not replay the opening clause when later transcript deltas arrive", () => {
  const spoken: string[] = [];
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop: vi.fn(), beginTurn: vi.fn() });
  narrator.update("For your video streaming app,", false);
  narrator.update("For your video streaming app, the CDN", false);
  narrator.update("For your video streaming app, the CDN handles playback.", false);
  narrator.update("For your video streaming app, the CDN handles playback.", true);
  expect(spoken).toEqual(["For your video streaming app,", "the CDN handles playback."]);
});

it("discards late continuations after interrupting an opening clause", () => {
  const spoken: string[] = [];
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop: vi.fn(), beginTurn: vi.fn() });
  narrator.update("For your video streaming app,", false);
  narrator.interrupt();
  narrator.update("For your video streaming app, the CDN handles playback.", true);
  narrator.update("New answer.", true);
  expect(spoken).toEqual(["For your video streaming app,", "New answer."]);
});

it("streams complete sentences once and flushes the remaining final text", () => {
  const spoken: string[] = [];
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop: vi.fn(), beginTurn: vi.fn() });
  narrator.update("The answer is twelve. Here", false);
  narrator.update("The answer is twelve. Here is why", false);
  narrator.update("The answer is twelve. Here is why.", true);
  expect(spoken).toEqual(["The answer is twelve.", "Here is why."]);
});

it("interrupts local audio and discards the unfinished old response", () => {
  const spoken: string[] = [], stop = vi.fn();
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop, beginTurn: vi.fn() });
  narrator.update("An unfinished answer", false);
  narrator.interrupt();
  narrator.interrupt();
  narrator.update("An unfinished answer with a late ending.", true);
  expect(spoken).toEqual([]);
  narrator.update("A new reply.", false);
  narrator.update("A new reply.", true);
  expect(spoken).toEqual(["A new reply."]);
  expect(stop).toHaveBeenCalledTimes(2);
});

it("starts a fresh response after a final transcript adds no new characters", () => {
  const spoken: string[] = [];
  const narrator = new LiveNarration({ say: text => spoken.push(text), stop: vi.fn(), beginTurn: vi.fn() });
  narrator.update("First answer.", false);
  narrator.update("First answer.", true);
  narrator.update("Next answer.", false);
  narrator.update("Next answer.", true);
  expect(spoken).toEqual(["First answer.", "Next answer."]);
});
