import { expect, it } from "vitest";
import { actFollowUp, buddyPrompt, engineLine, looksForAnswer, turnTier, guideFollowUp, parseAct, isDesign, nextSentences, parseActions, parseDraw, parseGuide, parsePoint, screenText, speakable, splitDiagrams, spoken } from "./buddy";

it("reads a valid point, rejects out-of-range or junk, and hides it from the bubble", () => {
  const reply = 'Click Save.\n```point {"x": 0.82, "y": 0.07, "label": "Save button"}```';
  expect(parsePoint(reply)).toEqual({ x: 0.82, y: 0.07, label: "Save button" });
  expect(speakable(reply)).toBe("Click Save.");
  expect(parsePoint('```point {"x": 1.4, "y": 0.2}```')).toBeNull();
  expect(parsePoint("```point nope```")).toBeNull();
  expect(parsePoint("no point here")).toBeNull();
});
it("asks for grounding and pointing only when there is a screenshot", () => {
  expect(buddyPrompt("where is export?", { width: 1568, height: 980 })).toContain("1568×980");
  expect(buddyPrompt("hi", null)).toContain("No screenshot");
});
it("reads actions, drops unsafe ones, and keeps them out of the bubble and the voice", () => {
  const reply = 'Opening Safari for you.\n```do [{"type":"open_app","name":"Safari"},{"type":"open_url","url":"javascript:alert(1)"},{"type":"open_path","path":"~/a/../../etc"},{"type":"focus","minutes":25},{"type":"rm","path":"/"}]```';
  expect(parseActions(reply)).toEqual([{ type: "open_app", name: "Safari" }, { type: "focus", minutes: 25 }]);
  expect(parseActions('```do {"type":"open_url","url":"https://github.com"}```')).toEqual([{ type: "open_url", url: "https://github.com" }]);
  expect(parseActions("```do not json```")).toEqual([]);
  expect(speakable(reply)).toBe("Opening Safari for you.");
  expect(spoken("**Sure** — open `Notes`, then [this](https://x.y).\n- step one")).toBe("Sure — open Notes, then this. step one");
});
it("speaks whole sentences as they stream, never code", () => {
  const a = nextSentences("Opening Safari. Then I'll", 0);
  expect(a.chunks).toEqual(["Opening Safari."]);
  const b = nextSentences("Opening Safari. Then I'll search it.\n```do []```", a.upto);
  expect(b.chunks).toEqual(["Then I'll search it."]);
  expect(nextSentences("Done", 0, true).chunks).toEqual(["Done"]);
  expect(buddyPrompt("open safari", null)).toContain("open_app");
});
it("reads guide steps, clamps boxes, and knows when it's done", () => {
  const r = 'Click Share at the top right.\n```guide {"x":0.9,"y":0.05,"w":0.05,"h":0.03,"label":"Click Share","step":2}```';
  expect(parseGuide(r)).toEqual({ x: 0.9, y: 0.05, w: 0.05, h: 0.03, label: "Click Share", step: 2, done: false });
  expect(parseGuide('```guide {"done": true}```')).toEqual({ done: true });
  expect(parseGuide('```guide {"x":2,"y":0}```')).toBeNull();
  expect(parseGuide('```guide {"x":0.5,"y":0.5,"w":3}```')).toMatchObject({ w: 0.04, h: 0.04, step: 1 });
  expect(speakable(r)).toBe("Click Share at the top right.");
  expect(buddyPrompt("how do I share", { width: 100, height: 50 }, { name: "Kit", tone: "coach", length: "brief" })).toContain("You are Kit");
  expect(guideFollowUp("Click Share", { width: 10, height: 5 })).toContain("fresh screenshot");
});
it("reads sketches, diagrams, OCR and design questions", () => {
  const r = 'Look here.\n```draw [{"shape":"box","x":0.5,"y":0.4,"w":0.2,"h":0.1,"label":"wrong total"},{"shape":"arrow","from":[0.1,0.1],"to":[2,0]},{"shape":"text","x":0.5,"y":0.9,"text":"note"}]```';
  expect(parseDraw(r)).toEqual([{ shape: "box", x: 0.5, y: 0.4, w: 0.2, h: 0.1, label: "wrong total" }, { shape: "text", x: 0.5, y: 0.9, text: "note" }]);
  expect(speakable(r)).toBe("Look here.");
  const parts = splitDiagrams("Intro\n```mermaid\nflowchart LR\n  A-->B\n```\nAfter");
  expect(parts.map((p) => p.kind)).toEqual(["text", "diagram", "text"]);
  expect(parts[1]!.value).toBe("flowchart LR\n  A-->B");
  expect(isDesign("design a url shortener")).toBe(true);
  expect(isDesign("how would you scale a chat app")).toBe(true);
  expect(isDesign("open notes")).toBe(false);
  const ocr = screenText([{ t: "Total $1,204.50", x: 0.6, y: 0.3, w: 0.1, h: 0.02 }, { t: "Revenue", x: 0.2, y: 0.3, w: 0.1, h: 0.02 }]);
  expect(ocr).toContain("T1 Revenue @0.200,0.300\nT0 Total $1,204.50 @0.600,0.300"); // reading order, ids stay the OCR index
  expect(buddyPrompt("design a url shortener", { width: 10, height: 10 })).toContain("```mermaid");
  expect(buddyPrompt("what's going on", null, undefined, "CREW NOW — live")).toContain("CREW NOW");
  expect(nextSentences("Short summary here.\n---\n## Requirements\nlots", 0, true).chunks).toEqual(["Short summary here."]);
});
it("reads music/system/shortcut actions and act steps safely", () => {
  expect(parseActions('```do [{"type":"media","command":"play_query","query":"Daft Punk","app":"Spotify"},{"type":"media","command":"volume","level":140},{"type":"system","what":"dark_mode","on":true},{"type":"shortcut","name":"Morning"},{"type":"media","command":"rm"}]```'))
    .toEqual([{ type: "media", command: "play_query", query: "Daft Punk", app: "Spotify" }, { type: "media", command: "volume", level: 100 }, { type: "system", what: "dark_mode", on: true }, { type: "shortcut", name: "Morning" }]);
  expect(parseAct('Clicking send.\n```act {"type":"click","x":0.8,"y":0.9,"label":"Send"}```')).toEqual({ type: "click", x: 0.8, y: 0.9, label: "Send" });
  expect(parseAct('```act {"type":"click","x":1.5,"y":0.9}```')).toBeNull();
  expect(parseAct('```act {"type":"key","keys":"cmd+l"}```')).toMatchObject({ type: "key", keys: "cmd+l" });
  expect(parseAct('```act {"type":"key","keys":"cmd+l; rm -rf"}```')).toBeNull();
  expect(parseAct('```act {"type":"done","summary":"Sent it"}```')).toEqual({ type: "done", summary: "Sent it" });
  expect(speakable('Clicking.\n```act {"type":"click","x":0.1,"y":0.1}```')).toBe("Clicking.");
  expect(buddyPrompt("send the email", { width: 10, height: 10 }, { name: "Spark", tone: "direct", length: "brief", control: "auto" })).toContain("COMPUTER CONTROL");
  expect(buddyPrompt("send the email", null, { name: "Spark", tone: "direct", length: "brief", control: "off" })).not.toContain("COMPUTER CONTROL");
  expect(actFollowUp("Click “Send”", true, { width: 10, height: 10 }, 3, 25)).toContain("Next single step");
});
it("lets you customize Spark by chatting, safely", () => {
  expect(parseActions('```do {"type":"settings","changes":{"name":"Nova","character":"kit","color":"purple","speed":1.2,"tone":"direct","talks":true,"control":"auto","bogus":1}}```'))
    .toEqual([{ type: "settings", changes: { name: "Nova", character: "kit", color: "#a78bfa", speed: 1.15, tone: "direct", talks: true, control: "auto" } }]);
  expect(parseActions('```do {"type":"settings","changes":{"character":"dragon","color":"url(x)"}}```')).toEqual([]);
  expect(buddyPrompt("talk faster", null, { name: "Spark", tone: "chill", length: "brief", voices: ["aiden", "ryan"] })).toContain("aiden|ryan");
});
it("carries what it knows about you into every conversation", () => {
  const p = buddyPrompt("what should I do today", null, { name: "Spark", tone: "chill", length: "brief", memory: ["The user deploys on Fridays."], goal: "AI Platform Engineer" });
  expect(p).toContain("Career goal: AI Platform Engineer");
  expect(p).toContain("- The user deploys on Fridays.");
  expect(buddyPrompt("hi", null, { name: "Spark", tone: "chill", length: "brief" })).not.toContain("WHAT YOU KNOW ABOUT THEM");
});
it("knows the real controls on screen and runs blocks as soon as they close", async () => {
  const { elementsText, completedBlocks } = await import("./buddy");
  const t = elementsText({ app: "Mail", window: "New Message", elements: [{ name: "Send", role: "button", x: 0.66, y: 0.18 }] });
  expect(t).toContain("IN FRONT: Mail — “New Message”");
  expect(t).toContain("Send [button] @0.660,0.180");
  const streaming = 'Opening it.\n```do [{"type":"open_app","name":"Notes"}]```\nNow I will point ```point {"x":0.1';
  expect(completedBlocks(streaming).map((b) => b.kind)).toEqual(["do"]); // the unfinished point waits
  expect(buddyPrompt("send it", { width: 10, height: 10, context: { app: "Mail", elements: [{ name: "Send", role: "button", x: 0.5, y: 0.5 }] } })).toContain("Send [button]");
});
it("reads run commands and keeps music off the mouse", () => {
  expect(parseActions('```do [{"type":"run","command":"df -h ~"}]```')).toEqual([{ type: "run", command: "df -h ~" }]);
  expect(parseActions('```do [{"type":"run","command":""}]```')).toEqual([]);
  expect(buddyPrompt("play music", null)).toMatch(/never click a play button/i);
  expect(buddyPrompt("put on some lofi", null)).toMatch(/ShuaCrew Radio .* use radio/);
});

it("starts speaking at the first clause of a reply, but never chops a short opener", () => {
  expect(nextSentences("The Studio page in ShuaCrew is your radio, where you can", 0).chunks).toEqual(["The Studio page in ShuaCrew is your radio,"]);
  expect(nextSentences("Sure, I'll open", 0).chunks).toEqual([]);
  const t = "The Studio page in ShuaCrew is your radio, where you can play lofi.", first = nextSentences(t, 0);
  expect(nextSentences(t, first.upto, true).chunks).toEqual(["where you can play lofi."]); // the rest follows normally
});

it("does not present a guided click as verified success", () => {
  const prompt = guideFollowUp("Open settings", { width: 800, height: 600 });
  expect(prompt).toContain("success is not yet verified");
  expect(prompt).toContain("keep the same goal");
  expect(prompt).not.toContain("Done — I did");
});
it("tells Spark which model it is on, and owns a local fallback's limits", () => {
  expect(engineLine("claude", "claude-sonnet-5", false)).toContain("running on Claude (claude-sonnet-5)");
  expect(engineLine("claude", "claude-sonnet-5", false)).not.toContain("can't");
  const fallback = engineLine("local", "gpt-oss:20b", true);
  expect(fallback).toContain("a local model on this Mac (gpt-oss:20b)");
  expect(fallback).toContain("Claude and Codex are unavailable");
  expect(fallback).toContain("can't see images, run crew sessions");
  expect(engineLine("local", "gpt-oss:20b", false)).toContain("switch Spark's brain to Auto");
});
it("reads the screen after opening something only when the ask wants an answer", () => {
  expect(looksForAnswer("what's the weather in Austin")).toBe(true);
  expect(looksForAnswer("check the Lakers score")).toBe(true);
  expect(looksForAnswer("open Notes")).toBe(false);
  expect(looksForAnswer("launch Visual Studio Code")).toBe(false);
});
it("routes each turn to the model it needs", () => {
  expect(turnTier("pause the radio", { screen: false, design: false })).toBe("fast");
  expect(turnTier("hi!", { screen: false, design: false })).toBe("fast");
  expect(turnTier("help me debug this failing test", { screen: false, design: false })).toBe("balanced");
  expect(turnTier("write me a cover letter for this job", { screen: false, design: false })).toBe("balanced");
  expect(turnTier("what's this?", { screen: true, design: false })).toBe("balanced");
});
import { parseNext } from "./buddy";
it("reads next moves (2–3 short suggestions) and keeps them out of speech", () => {
  const reply = 'Done: Night Shift is on.\n```next ["Schedule it for sunset", "Make it warmer", "Quiz me on this", "extra"]```';
  expect(parseNext(reply)).toEqual(["Schedule it for sunset", "Make it warmer", "Quiz me on this"]);
  expect(speakable(reply)).toBe("Done: Night Shift is on.");
  expect(parseNext("no block")).toEqual([]);
});
