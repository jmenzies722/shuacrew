import { expect, it } from "vitest";
import { actFollowUp, buddyPrompt, guideFollowUp, parseAct, isDesign, nextSentences, parseActions, parseDraw, parseGuide, parsePoint, screenText, speakable, splitDiagrams, spoken } from "./buddy";

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
  expect(ocr).toContain("Revenue @0.200,0.300\nTotal $1,204.50 @0.600,0.300");
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
  expect(buddyPrompt("play music", null)).toContain("never click a play button");
});
