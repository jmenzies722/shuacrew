import { describe, expect, it } from "vitest";
it("preserves a generated session title in a crew handoff", () => {
  expect(parseActions('```do [{"type":"crew","ask":"Audit Frame rendering","title":"Frame performance audit"}]```')).toEqual([{ type: "crew", ask: "Audit Frame rendering", title: "Frame performance audit" }]);
});
import { actFollowUp, buddyPrompt, pointingText, parseActs, parseZoom, elementsText, followThroughAsk, needsFollowThrough, needsScreen, restingReply, engineLine, looksForAnswer, turnTier, guideFollowUp, parseAct, isDesign, nextSentences, parseActions, parseDraw, parseGuide, parsePoint, screenText, speakable, splitDiagrams, spoken } from "./buddy";

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
  expect(buddyPrompt("design a url shortener", { width: 10, height: 10 })).toContain("CONCEPT STUDIO architecture visual");
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
  expect(actFollowUp("Click “Send”", true, { width: 10, height: 10 }, 3, 25)).toContain("Next step as one act block containing exactly one action");
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
  expect(turnTier("double-check this math for me", { screen: false, design: false })).toBe("frontier");
  expect(turnTier("think hard about which offer is better", { screen: true, design: false })).toBe("frontier");
  expect(turnTier("what exactly is a mutex", { screen: false, design: false })).toBe("fast");
  expect(turnTier("what's this?", { screen: true, design: false })).toBe("balanced");
});
import { completedBlocks, deleteQuestion, isDestructive, localSystem, parseNext, pixelsToFractions, progressLine, searchTopic } from "./buddy";
it("reads next moves (2–3 short suggestions) and keeps them out of speech", () => {
  const reply = 'Done: Night Shift is on.\n```next ["Schedule it for sunset", "Make it warmer", "Quiz me on this", "extra"]```';
  expect(parseNext(reply)).toEqual(["Schedule it for sunset", "Make it warmer", "Quiz me on this"]);
  expect(speakable(reply)).toBe("Done: Night Shift is on.");
  expect(parseNext("no block")).toEqual([]);
});
import { withoutPositions } from "./buddy";
it("never says the ids or coordinates it points with", () => {
  expect(withoutPositions("Click the Share button (#12), top right.")).toBe("Click the Share button, top right.");
  expect(withoutPositions("Tap Wi-Fi at @0.912,0.012 in the menu bar")).toBe("Tap Wi-Fi in the menu bar");
  expect(withoutPositions("Open item T40 then press Save at (0.82, 0.07).")).toBe("Open then press Save.");
  expect(withoutPositions("It's the #1 priority and takes 2 minutes.")).toContain("2 minutes");
});
import { claimsWithoutAction } from "./buddy";
it("catches 'switched it' with nothing actually done", () => {
  expect(claimsWithoutAction("Switched to dark mode.")).toBe(true);
  expect(claimsWithoutAction("Sure, opening Safari for you.")).toBe(true);
  expect(claimsWithoutAction("Done, I've turned on voice mode.")).toBe(true);
  expect(claimsWithoutAction('Opening Safari.\n```do [{"type":"open_app","name":"Safari"}]```')).toBe(false);
  expect(claimsWithoutAction("I can't change that setting from here, but I can open it for you.")).toBe(false);
  expect(claimsWithoutAction("Kubernetes opened a new era of deployment tooling.")).toBe(false);
  expect(claimsWithoutAction("The weather in Austin is 78 and sunny.")).toBe(false);
});
it("reads Mac lookups: files, calendar, reminders, notes, contacts, status", () => {
  expect(parseActions('```do [{"type":"mac","op":"find","query":"lease","kind":"pdf"}]```')).toEqual([{ type: "mac", op: "find", query: "lease", kind: "pdf" }]);
  expect(parseActions('```do [{"type":"mac","op":"calendar","days":2},{"type":"mac","op":"status"}]```')).toEqual([{ type: "mac", op: "calendar", days: 2 }, { type: "mac", op: "status" }]);
  expect(parseActions('```do [{"type":"mac","op":"add_reminder","title":"Call the dentist","due":"2026-10-01T09:00"}]```')).toEqual([{ type: "mac", op: "add_reminder", title: "Call the dentist", due: "2026-10-01T09:00" }]);
  expect(parseActions('```do [{"type":"mac","op":"delete_everything"},{"type":"mac","op":"find"}]```')).toEqual([]);
});

import { liveLookup } from "./buddy";
it("shows what Spark is looking up only while it's looking", () => {
  const search = { kind: "tool.called", body: { tool: "WebSearch", input: { query: "best lofi for focus" } } };
  expect(liveLookup([{ kind: "turn.started" }, search])).toBe("Searching: best lofi for focus");
  expect(liveLookup([search, { kind: "tool.called", body: { tool: "WebFetch", input: { url: "https://www.theverge.com/x" } } }])).toBe("Reading theverge.com");
  expect(liveLookup([search, { kind: "agent.delta" }])).toBeNull(); // writing the answer now
  expect(liveLookup(undefined)).toBeNull();
});

describe("Spark answers at once, without filler", () => {
  it("leaves the opener to the model: specific first sentence, no canned 'On it', a proactive next step", () => {
    for (const prompt of [buddyPrompt("add lunch with Sam on Friday", null), localSystem({ name: "Spark", tone: "cheerful", length: "brief" })]) {
      expect(prompt).toMatch(/never (open with|filler)/i);
      expect(prompt).toContain("On it");
    }
    expect(buddyPrompt("x", null)).toMatch(/proactive/i);
  });
});

describe("progress you'd actually want to hear", () => {
  const turn = (...calls: Array<[string, Record<string, string>]>) => [{ kind: "turn.started" }, ...calls.map(([tool, input]) => ({ kind: "tool.called", body: { tool, input } }))];
  it("says what it's really doing, from this turn's tools", () => {
    expect(progressLine(turn(["WebSearch", { query: "next spacex launch" }]), 0)).toBe("Looking up the next spacex launch.");
    expect(progressLine(turn(["WebSearch", { query: "x" }], ["WebFetch", { url: "https://www.space.com/launches" }]), 0)).toBe("Pulling up space.com.");
    expect(progressLine(turn(["WebFetch", { url: "https://www.space.com/a" }], ["WebFetch", { url: "https://forecast.weather.gov/b" }]), 1)).toBe("Checking weather.gov too.");
  });
  it("stays quiet with nothing specific to say (no 'still on it')", () => {
    expect(progressLine(turn(), 0)).toBeNull();
    expect(progressLine(turn(["WebSearch", { query: "x" }]), 1)).toBeNull();
    expect(progressLine([{ kind: "tool.called", body: { tool: "WebSearch" } }, { kind: "turn.started" }], 0)).toBeNull(); // last turn's tools don't count
  });
});

describe("deleting many things takes one yes", () => {
  it("asks one question for every delete in a reply", () => {
    const many = ["Organize GitHub", "Plan out Finances", "Clean Room", "GYM"].map((title) => ({ type: "mac" as const, op: "delete_reminder" as const, title }));
    expect(deleteQuestion(many)).toBe("Delete 4 reminders (Organize GitHub, Plan out Finances, Clean Room and 1 more)");
    expect(deleteQuestion([{ type: "mac", op: "delete_reminders", all: true, list: "Desk Work" }])).toBe("Delete every reminder in Desk Work");
    expect(deleteQuestion([{ type: "mac", op: "delete_reminder", title: "dentist" }])).toBe("Delete the reminder “dentist”");
  });
  it("reads the bulk action Spark sends", () => {
    expect(parseActions('```do [{"type":"mac","op":"delete_reminders","titles":["Clean Room","GYM"]}]```')).toEqual([{ type: "mac", op: "delete_reminders", titles: ["Clean Room", "GYM"] }]);
    expect(parseActions('```do [{"type":"mac","op":"delete_reminders","all":true}]```')).toEqual([{ type: "mac", op: "delete_reminders", all: true }]);
    expect(parseActions('```do [{"type":"mac","op":"delete_reminders"}]```')).toEqual([]); // nothing named, not "all": nothing
  });
});

describe("Siri-style actions ask first when they reach someone or can't be undone", () => {
  it("reads messages, calls and directions", () => {
    expect(parseActions('```do [{"type":"mac","op":"send_message","to":"Mom","text":"Running late"}]```')).toEqual([{ type: "mac", op: "send_message", to: "Mom", text: "Running late" }]);
    expect(parseActions('```do [{"type":"mac","op":"directions","to":"JFK","mode":"transit"}]```')).toEqual([{ type: "mac", op: "directions", to: "JFK", mode: "transit" }]);
    expect(parseActions('```do [{"type":"system","what":"volume","level":140}]```')).toEqual([]);
  });
  it("asks before sending, calling or emptying the Trash — not before directions", () => {
    expect(isDestructive({ type: "mac", op: "send_message", to: "Mom", text: "hi" })).toBe(true);
    expect(isDestructive({ type: "mac", op: "facetime", to: "Sam" })).toBe(true);
    expect(isDestructive({ type: "system", what: "empty_trash" })).toBe(true);
    expect(isDestructive({ type: "mac", op: "directions", to: "JFK" })).toBe(false);
    expect(deleteQuestion([{ type: "mac", op: "send_message", to: "Mom", text: "Running late" }, { type: "mac", op: "delete_reminder", title: "dentist" }]))
      .toBe("Delete the reminder “dentist” and send “Running late” to Mom");
  });
});

describe("Spark points in screenshot pixels, precisely", () => {
  const size = { width: 1330, height: 864 };
  it("turns a pixel block into fractions of the screen before anything reads it", () => {
    const out = pixelsToFractions('```point {"x": 665, "y": 432, "label": "Save"}```', "point", size);
    expect(JSON.parse(out.replace(/```point\s*|```/g, ""))).toEqual({ x: 0.5, y: 0.5, label: "Save" });
  });
  it("converts every coordinate a mark can carry: boxes, radii, arrows and routes", () => {
    const raw = '```draw [{"shape":"spotlight","x":133,"y":86.4,"w":266,"h":172.8},{"shape":"circle","x":1330,"y":0,"r":13.3},{"shape":"arrow","from":[0,864],"to":[665,432]},{"shape":"path","points":[[0,0],[1330,864]]}]```';
    const shapes = JSON.parse(pixelsToFractions(raw, "draw", size).replace(/```draw\s*|```/g, ""));
    expect(shapes[0]).toMatchObject({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    expect(shapes[1]).toMatchObject({ x: 1, y: 0, r: 0.01 });
    expect(shapes[2]).toMatchObject({ from: [0, 1], to: [0.5, 0.5] });
    expect(shapes[3].points).toEqual([[0, 0], [1, 1]]);
  });
  it("leaves blocks already in fractions (or with only targets) alone, and never touches do blocks", () => {
    for (const raw of ['```point {"x": 0.4, "y": 0.2}```', '```guide {"target": "#12", "label": "Share"}```']) expect(pixelsToFractions(raw, "point", size)).toBe(raw);
    const [b] = completedBlocks('```do [{"type":"media","command":"volume","level":40}]```', size);
    expect(b!.raw).toContain('"level":40');
  });
  it("applies it in completedBlocks when the screenshot size is known", () => {
    const [b] = completedBlocks('Here. ```act {"type":"click","x":1330,"y":432,"label":"Send"}```', size);
    expect(JSON.parse(b!.raw.replace(/```act\s*|```/g, ""))).toMatchObject({ x: 1, y: 0.5 });
  });
});

describe("Spark's visual language", () => {
  it("reads spotlight, highlight, underline, numbered steps, routes, cards and ticks, with how long to stay", () => {
    const shapes = parseDraw('```draw [{"shape":"spotlight","target":"#3","label":"here","stay":60},{"shape":"highlight","x":0.2,"y":0.3,"w":0.1,"h":0.02},{"shape":"underline","target":"T4"},{"shape":"step","n":2,"x":0.5,"y":0.5,"label":"Pick a size"},{"shape":"path","points":[[0.1,0.1],[0.4,0.2],[0.9,0.9]],"label":"flow"},{"shape":"card","x":0.6,"y":0.4,"title":"Why","body":"Because.","items":["a","b"]},{"shape":"check","x":0.1,"y":0.9},{"shape":"cross","target":"#9"}]```');
    expect(shapes.map((s) => s.shape)).toEqual(["spotlight", "highlight", "underline", "step", "path", "card", "check", "cross"]);
    expect(shapes[0]).toMatchObject({ target: "#3", stay: 60 });
    expect(shapes[3]).toMatchObject({ n: 2, label: "Pick a size" });
  });
  it("drops malformed marks instead of drawing garbage", () => {
    expect(parseDraw('```draw [{"shape":"path","points":[[0.1,0.1]]},{"shape":"card","x":0.5,"y":0.5},{"shape":"laser"}]```')).toEqual([]);
  });
});

it("a compound ask carries on after the first step opens something (real asks from the event log)", () => {
  expect(needsFollowThrough("Can you open a long web article, underline the sentence that answers the headline?", "Opening Safari to a news article — I'll underline the answer once it loads.")).toBe(true);
  expect(needsFollowThrough("Can you open Finder and highlight the file I changed most recently?", "Opening Finder now, sorted by date.")).toBe(true);
  expect(needsFollowThrough("Can you open any settings page and walk me through everything on this screen?", "Opening System Settings to the general page now.")).toBe(true);
  expect(needsFollowThrough("what's the weather in Austin", "Opening the forecast.")).toBe(true);
  // Just opening is the whole job.
  expect(needsFollowThrough("open Notes", "Opening Notes.")).toBe(false);
  expect(needsFollowThrough("Can you open Finder?", "Opening Finder.")).toBe(false);
  expect(needsFollowThrough("launch Visual Studio Code", "Launching it.")).toBe(false);
  // The carry-on turn itself never triggers another one.
  expect(needsFollowThrough(followThroughAsk("https://www.bbc.com/news", "open an article").split("\n\n[screen]")[0]!, "Underlining it.")).toBe(false);
  expect(followThroughAsk("https://www.bbc.com/news", "underline the answer")).toContain("do the REST");
});

it("the notch keeps the whole answer (not two sentences), minus blocks and markdown", () => {
  const reply = "People usually watch a few things. **Price** crossing a moving average. RSI out of oversold. A volume spike. Still not advice, see [Investopedia](https://x.y).\n\n```next [\"More\"]```";
  expect(restingReply(reply)).toBe("People usually watch a few things. Price crossing a moving average. RSI out of oversold. A volume spike. Still not advice, see Investopedia.");
});
it("screen work turns Spark's eyes on by itself", () => {
  for (const q of ["Point at the Wi-Fi icon in my menu bar", "Show me an example of you filling in a web form.", "Can you open Finder and highlight the file I changed most recently?", "click the blue button"]) expect(needsScreen(q)).toBe(true);
  for (const q of ["What about XRP?", "set a timer for 10 minutes", "play something chill"]) expect(needsScreen(q)).toBe(false);
});

it("does not require screen access for general explanations or explicit screen opt-outs", () => {
  for (const question of [
    "Reply with one short sentence: what is 15 percent of 80? Do not use tools or screen access.",
    "Explain why the sky is blue",
    "Explain how a screen works",
    "What is a code review?",
    "Without looking at my screen, explain this algorithm: binary search",
    "Don't look at my screen. What is 15 percent of 80?",
  ]) expect(needsScreen(question), question).toBe(false);
  for (const question of ["Explain this error", "What is on my screen?", "Can you see my screen?", "Tell me what's on it right now", "Look at my screen", "Read my screen", "Capture the screen", "Do not click anything; highlight the export button"])
    expect(needsScreen(question), question).toBe(true);
});

it("does not infer a disabled eye from a turn without a screenshot", () => {
  const prompt = buddyPrompt("What do you see in Chrome?", null, { name: "Shua", tone: "direct", length: "brief", control: "auto" });
  expect(prompt).not.toContain("ask them to turn it on");
  expect(prompt).not.toContain("ask them to turn on the eye");
  expect(prompt).toContain("does not mean screen access is off");
});

it("a batch of steps runs back to back, ending at done", () => {
  const acts = parseActs('```act [{"type":"press","label":"Search"},{"type":"type","label":"Search","text":"shuacrew\\n"},{"type":"done","summary":"searched"},{"type":"press","label":"never"}]```');
  expect(acts.map((a) => a.type)).toEqual(["press", "type", "done"]);
  expect(parseActs('```act {"type":"key","keys":"cmd+l","label":"Address bar"}```')).toHaveLength(1);
  expect(parseActs("```act not json```")).toEqual([]);
});
it("zoom regions come in screenshot pixels and are converted like every other block", () => {
  const [b] = completedBlocks('Looking closer. ```zoom {"x":1000,"y":0,"w":333,"h":43}```', { width: 1333, height: 861 });
  expect(b!.kind).toBe("zoom");
  const r = parseZoom(b!.raw)!;
  expect(r.x).toBeCloseTo(0.7502, 3); expect(r.w).toBeCloseTo(0.2498, 3); expect(r.h).toBeCloseTo(0.0499, 3);
  expect(parseZoom('```zoom {"x":0.1,"y":0.1,"w":0,"h":0.2}```')).toBeNull();
});
it("a web page's own controls are labelled as such, and letting Shua into pages asks first", () => {
  const t = elementsText({ app: "Google Chrome", page: { url: "https://github.com/jmenzies722", title: "jmenzies722" }, elements: [{ name: "Repositories 62", role: "web link", x: 0.1, y: 0.2 }] });
  expect(t).toContain("PAGE: “jmenzies722” https://github.com/jmenzies722");
  expect(t).toContain("#1 Repositories 62 [web link]");
  expect(isDestructive({ type: "system", what: "browser_js" })).toBe(true);
});

it("says what it's looking up in a few plain words", () => {
  expect(searchTopic("Philadelphia 76ers schedule 2026")).toBe("the Philadelphia 76ers schedule");
  expect(searchTopic("XRP price today site:coinmarketcap.com")).toBe("the XRP price");
  expect(searchTopic("what sports games are on today")).toBe("what sports games are on");
  expect(searchTopic("latest news")).toBe("that");
});

it("connects or disconnects a paired Bluetooth device by the words they used", () => {
  expect(parseActions('```do [{"type":"system","what":"bluetooth_device","device":"AirPods"}]```')).toEqual([{ type: "system", what: "bluetooth_device", device: "AirPods" }]);
  expect(parseActions('```do [{"type":"system","what":"bluetooth_device","device":"headset","on":false}]```')).toEqual([{ type: "system", what: "bluetooth_device", device: "headset", on: false }]);
  expect(parseActions('```do [{"type":"system","what":"bluetooth_device"}]```')).toEqual([]); // no device: nothing to do
});

it("keeps going after opening a page when there's more to do there (real ask from the log)", () => {
  expect(needsFollowThrough("You bring up chess.com and start a game against a computer?", "Opening chess.com now.")).toBe(true);
  expect(needsFollowThrough("open Gmail and draft a reply to Sam", "Opening Gmail.")).toBe(true);
  expect(needsFollowThrough("open YouTube and play lofi", "Opening YouTube.")).toBe(true);
  expect(needsFollowThrough("open Notes", "Opening Notes.")).toBe(false);
});

describe("what they show you with their own cursor", () => {
  const ctx = { elements: [{ name: "Share", role: "button", x: 0.9, y: 0.1, w: 0.04, h: 0.03 }, { name: "Repositories 62", role: "web link", x: 0.3, y: 0.5, w: 0.1, h: 0.03 }] };
  const lines = [{ t: "Total due: $1,240", x: 0.5, y: 0.8, w: 0.2, h: 0.02 }]; // OCR: centre + size
  const size = { width: 1000, height: 600 };
  it("names what's under the pointer — macOS's name first, else the control or text around it", () => {
    expect(pointingText({ ...ctx, pointer: { x: 0.9, y: 0.1, name: "Share", role: "button" } }, lines, size)).toContain("over “Share” [button]");
    expect(pointingText({ ...ctx, pointer: { x: 0.31, y: 0.505 } }, lines, size)).toContain("over “Repositories 62” [web link] (#2)");
    expect(pointingText({ ...ctx, pointer: { x: 0.55, y: 0.805 } }, lines, size)).toContain("the text “Total due: $1,240” (T0)");
    expect(pointingText({ ...ctx, pointer: { x: 0.05, y: 0.95 } }, lines, size)).toContain("THEIR POINTER is at 50,570.");
  });
  it("reads a circle as the area they mean, with what's inside it", () => {
    const t = pointingText({ ...ctx, gesture: { kind: "circle", x: 0.2, y: 0.4, w: 0.4, h: 0.5 } }, lines, size);
    expect(t).toContain("THEY JUST CIRCLED");
    expect(t).toContain("“Repositories 62” (#2)");
    expect(t).toContain("“Total due: $1,240” (T0)");
    expect(t).not.toContain("Share");
  });
  it("says nothing when there's nothing to show", () => { expect(pointingText({ elements: [] }, [], size)).toBe(""); });
});

describe("what they circled, snapped to the real thing", () => {
  it("names exactly what the circle covers when the Mac snapped it, ahead of the rough area", () => {
    const text = pointingText({ gesture: { kind: "circle", x: 0.1, y: 0.3, w: 0.4, h: 0.1, picked: [{ name: "Revenue grew 12% in Q3", x: 0.3, y: 0.35, w: 0.38, h: 0.05 }] } }, [], { width: 1000, height: 1000 });
    expect(text).toContain("EXACTLY: “Revenue grew 12% in Q3” (centre 300,350, 380×50)");
    expect(text).not.toContain("inside it:");
  });
  it("falls back to what lies inside the rough area when nothing was snapped", () => {
    const text = pointingText({ gesture: { kind: "circle", x: 0, y: 0, w: 1, h: 1 }, elements: [{ name: "Save", role: "button", x: 0.5, y: 0.5, w: 0.1, h: 0.05 }] }, [], { width: 1000, height: 1000 });
    expect(text).toContain("inside it: “Save” (#1)");
  });
});

it("captures the screen for plain show-me requests, including follow-ups", () => {
  for (const q of ["Show me Settings", "Show me the export option", "Can you show me?", "Show me again"]) {
    expect(needsScreen(q), q).toBe(true);
  }
});

it("distinguishes native Mac actions from the model shell instead of declaring screenshot-only access", () => {
  const prompt = buddyPrompt("Open TextEdit and type a test", { width: 100, height: 100 }, { name: "Shua", tone: "direct", length: "brief", control: "ask" });
  expect(prompt).not.toContain("Use tools only to read an attached screenshot");
  expect(prompt).toContain("native action bridge");
  expect(prompt).toContain("do not invoke computer-use MCP or shell automation for the same action");
  expect(prompt).toContain("one act block");
});

it("continues the TextEdit workflow after opening the app", () => {
  expect(needsFollowThrough("Open a blank TextEdit document, click the document and type testing Shua cursor control", "Opening TextEdit.")).toBe(true);
});
