import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedCwd, allowedProjectFolder, applyPolish, cardFor, classifyCommand, extractSteps, findCandidates,
  listSessions, parseTranscript, pickExplainStep, transcriptPath, weighStep, type Candidate,
} from "./explain-back.js";

const HOME = "/Users/me", CWD = "/Users/me/Developer/projects/budget";

/** A Claude Code transcript, line by line, the way the CLI writes it. */
function transcript(cwd = CWD) {
  const lines: object[] = [];
  let n = 0;
  const user = (text: string, extra: object = {}) => lines.push({ type: "user", cwd, sessionId: "s1", message: { role: "user", content: text }, ...extra });
  const say = (text: string) => lines.push({ type: "assistant", cwd, sessionId: "s1", message: { id: `m${n}`, content: [{ type: "text", text }] } });
  const call = (name: string, input: object, result: string, error = false, extra: object = {}) => {
    const id = `t${++n}`;
    lines.push({ type: "assistant", cwd, sessionId: "s1", message: { id: `m${n}`, content: [{ type: "tool_use", id, name, input }] }, ...extra });
    lines.push({ type: "user", cwd, sessionId: "s1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: result, is_error: error }] }, ...extra });
  };
  user("Build a budget dashboard");
  user("<command-name>/model</command-name>"); // the CLI's own text, not the person
  say("Let me look at what's here first.");
  call("Bash", { command: "ls -la" }, "total 0");
  say("The folder is empty, so I'll create the project structure.");
  call("Bash", { command: "mkdir -p src/styles" }, "");
  say("Now the page itself.");
  call("Edit", { file_path: `${CWD}/src/index.html`, old_string: "", new_string: "<html>" }, "<tool_use_error>File does not exist. Note: your current working directory is x.</tool_use_error>", true);
  say("Let me create the file first.");
  call("Bash", { command: "touch src/index.html" }, "");
  call("Edit", { file_path: `${CWD}/src/index.html`, old_string: "<!-- x -->", new_string: "<html>" }, "<tool_use_error>String to replace not found in file.</tool_use_error>", true);
  say("Let me check what's in the file, then write to it properly.");
  call("Read", { file_path: `${CWD}/src/index.html` }, "");
  call("Edit", { file_path: `${CWD}/src/index.html`, old_string: "", new_string: "<html>" }, "ok");
  say("Styles and the app script.");
  call("Edit", { file_path: `${CWD}/src/styles/main.css`, old_string: "", new_string: "body{}" }, "ok");
  call("Write", { file_path: `${CWD}/src/app.js`, content: "init()" }, "ok");
  call("Task", { prompt: "side quest" }, "done", false, { isSidechain: true }); // a subagent's own line
  say("Install the dependencies so the build can find them.");
  call("Bash", { command: "npm install" }, "added 12 packages");
  user("Actually make it a native Mac app, not a web page");
  say("I understand now - you want a native Mac application. Let me remove the web version and restructure.");
  call("Bash", { command: "rm -rf src/" }, "");
  call("Edit", { file_path: `${CWD}/app/main.js`, old_string: "", new_string: "electron" }, "ok");
  call("Bash", { command: "npm run lint" }, "eslint: 2 problems", true);
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n{torn line";
}

describe("which transcripts may be read", () => {
  it("allows only ~/Developer/projects/* and ~/Developer/learn/* project folders", () => {
    expect(allowedProjectFolder("-Users-me-Developer-projects-budget", HOME)).toBe(true);
    expect(allowedProjectFolder("-Users-me-Developer-learn-rust-book", HOME)).toBe(true);
    expect(allowedProjectFolder("-Users-me-Developer-work-payments", HOME)).toBe(false);
    expect(allowedProjectFolder("-Users-me-Developer-work", HOME)).toBe(false);
    expect(allowedProjectFolder("-Users-me-Nectar-Work-infra", HOME)).toBe(false);
    expect(allowedProjectFolder("-Users-me-Developer-projects-", HOME)).toBe(false);
    expect(allowedProjectFolder("-Users-me-Documents", HOME)).toBe(false);
    expect(allowedProjectFolder("-Users-other-Developer-projects-x", HOME)).toBe(false);
    expect(allowedProjectFolder("../-Users-me-Developer-projects-x", HOME)).toBe(false);
  });
  it("checks the transcript's own cwd too", () => {
    expect(allowedCwd(CWD, HOME)).toBe(true);
    expect(allowedCwd("/Users/me/Developer/projects/budget/../../work/x", HOME)).toBe(false);
    expect(allowedCwd("/Users/me/Developer/work/payments", HOME)).toBe(false);
    expect(allowedCwd("/Users/me/Nectar-Work/infra", HOME)).toBe(false);
    expect(allowedCwd("/Users/me/Developer/projects", HOME)).toBe(false);
    expect(allowedCwd("/Users/me/Developer/projects-x/y", HOME)).toBe(false);
  });
  it("resolves only allowlisted transcript ids, with no way out of the folder", () => {
    expect(transcriptPath("/r", "-Users-me-Developer-projects-budget/0ad84378-986b.jsonl", HOME)).toBe("/r/-Users-me-Developer-projects-budget/0ad84378-986b.jsonl");
    for (const bad of ["-Users-me-Developer-work-x/0ad84378.jsonl", "-Users-me-Developer-projects-x/../../etc.jsonl", "-Users-me-Developer-projects-x/notes.txt", "-Users-me-Developer-projects-x", "..//0ad84378.jsonl"])
      expect(() => transcriptPath("/r", bad, HOME)).toThrow(/may read/);
  });
  it("lists finished personal sessions only: never sealed folders, never one still being written", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "xb-")), old = Date.now() / 1000 - 3600;
    const put = (folder: string, file: string, text: string, mtime = old) => {
      mkdirSync(path.join(root, folder), { recursive: true });
      writeFileSync(path.join(root, folder, file), text);
      utimesSync(path.join(root, folder, file), mtime, mtime);
    };
    put("-Users-me-Developer-projects-budget", "aaaaaaaa-1111.jsonl", transcript());
    put("-Users-me-Developer-projects-live", "bbbbbbbb-2222.jsonl", transcript(), Date.now() / 1000); // still being written
    put("-Users-me-Developer-work-payments", "cccccccc-3333.jsonl", transcript("/Users/me/Developer/work/payments"));
    put("-Users-me-Nectar-Work", "dddddddd-4444.jsonl", transcript("/Users/me/Nectar-Work"));
    put("-Users-me-Developer-projects-sneaky", "eeeeeeee-5555.jsonl", transcript("/Users/me/Developer/work/payments")); // folder name lies
    const listed = listSessions(root, HOME);
    expect(listed.map((s) => s.id)).toEqual(["-Users-me-Developer-projects-budget/aaaaaaaa-1111.jsonl"]);
    expect(listed[0]).toMatchObject({ project: "budget", title: "Build a budget dashboard" });
  });
});

describe("parsing a transcript", () => {
  const parsed = parseTranscript(transcript());
  it("pairs each call with its result and keeps failures' first line", () => {
    expect(parsed.cwd).toBe(CWD);
    expect(parsed.title).toBe("Build a budget dashboard");
    const firstEdit = parsed.actions.find((a) => a.tool === "Edit")!;
    expect(firstEdit).toMatchObject({ kind: "edit", target: "src/index.html", ok: false, reason: "Now the page itself." });
    expect(firstEdit.error).toBe("File does not exist. Note: your current working directory is x.");
    expect(parsed.actions.filter((a) => !a.ok)).toHaveLength(3);
  });
  it("skips the CLI's own text and subagent lines, and notices a new request", () => {
    expect(parsed.actions.some((a) => a.tool === "Task")).toBe(false);
    const rm = parsed.actions.find((a) => a.target === "rm -rf src/")!;
    expect(rm.newAsk).toBe(true);
    expect(rm.ask).toBe("Actually make it a native Mac app, not a web page");
    expect(parsed.actions[0]!.ask).toBe("Build a budget dashboard");
  });
});

describe("finding the key steps", () => {
  const parsed = parseTranscript(transcript());
  const candidates = findCandidates(parsed.actions);
  it("classifies commands", () => {
    expect(classifyCommand("npm install")).toBe("install");
    expect(classifyCommand("pnpm add zod")).toBe("install");
    expect(classifyCommand("pnpm vitest run")).toBe("test");
    expect(classifyCommand("npm run build")).toBe("build");
    expect(classifyCommand("git commit -m x")).toBe("git");
    expect(classifyCommand("rm -rf src/")).toBe("destructive");
    expect(classifyCommand("git reset --hard HEAD")).toBe("destructive");
    expect(classifyCommand("mkdir -p src")).toBe("scaffold");
    expect(classifyCommand("ls -la")).toBe("inspect");
    expect(classifyCommand("node app.js")).toBe("run");
  });
  it("turns a failure and its fix into one retry moment", () => {
    const retry = candidates.find((c) => c.kind === "retry")!;
    expect(retry.actions.map((a) => `${a.tool} ${a.ok ? "ok" : "fail"}`)).toEqual(["Edit fail", "Bash ok", "Edit fail", "Read ok", "Edit ok"]);
    expect(retry.failures).toBe(2);
    const card = cardFor(retry, 1);
    expect(card.what).toContain("failed 2 times: File does not exist");
    expect(card.what).toContain("`Edit src/index.html` worked");
    expect(card.anchors).toEqual(expect.arrayContaining(["index.html", "does not exist", "not found"]));
    expect(card.why).toContain("Now the page itself.");
  });
  it("keeps an unfixed failure, edit bursts split by a new request, and changing commands", () => {
    expect(candidates.find((c) => c.kind === "failure")?.actions[0]!.target).toBe("npm run lint");
    const bursts = candidates.filter((c) => c.kind === "edits");
    expect(bursts.map((b) => b.actions.map((a) => a.target))).toEqual([["src/styles/main.css", "src/app.js"], ["app/main.js"]]);
    expect(bursts[1]!.actions[0]!.ask).toBe("Actually make it a native Mac app, not a web page");
    expect(candidates.find((c) => c.commandClass === "destructive")!.afterNewAsk).toBe(true);
    expect(candidates.filter((c) => c.kind === "command").map((c) => c.commandClass)).toEqual(["inspect", "scaffold", "install", "destructive"]);
  });
  it("picks 3–5 cards in session order, and a fixed failure always makes it", () => {
    const cards = extractSteps(parsed);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(cards.some((c) => c.kind === "retry")).toBe(true);
    const order = cards.map((c) => parsed.actions.findIndex((a) => a.target === c.evidence[0]!.target && a.tool === c.evidence[0]!.tool));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(cards.map((c) => c.id)).toEqual(cards.map((_, i) => `step-${i + 1}`));
  });
  it("weighs what you'd want to explain above routine looking around", () => {
    const base: Candidate = { kind: "command", actions: [], failures: 0, files: 0, afterNewAsk: false, hasReason: true };
    const look = weighStep({ ...base, commandClass: "inspect" });
    expect(weighStep({ ...base, kind: "retry", failures: 1 })).toBeGreaterThan(look);
    expect(weighStep({ ...base, kind: "edits", files: 3 })).toBeGreaterThan(look);
    expect(weighStep({ ...base, commandClass: "destructive" })).toBeGreaterThan(look);
  });
  it("chooses the fixed failure to explain back", () => {
    expect(pickExplainStep([{ kind: "command" }, { kind: "edits" }, { kind: "retry" }] as never)).toBe(2);
    expect(pickExplainStep([{ kind: "command" }, { kind: "edits" }] as never)).toBe(1);
    expect(pickExplainStep([{ kind: "command" }] as never)).toBe(0);
  });
  it("tops a short session up to three cards", () => {
    const short = parseTranscript(transcript().split("\n").slice(0, 11).join("\n"));
    expect(short.actions).toHaveLength(3);
    expect(extractSteps(short)).toHaveLength(3);
  });
});

describe("the model's concepts", () => {
  const cards = extractSteps(parseTranscript(transcript()));
  it("are applied when there's one per card", () => {
    const steps = cards.map((_, i) => ({ concept: `Concept ${i}`, conceptDetail: "Why it mattered here." }));
    const out = applyPolish(cards, { steps });
    expect(out.polished).toBe(true);
    expect(out.cards[0]).toMatchObject({ concept: "Concept 0", what: cards[0]!.what });
  });
  it("are ignored when malformed, so the transcript's cards still show", () => {
    expect(applyPolish(cards, { steps: [{ concept: "x" }] }).polished).toBe(false);
    expect(applyPolish(cards, null)).toEqual({ cards, polished: false });
    expect(applyPolish(cards, { steps: cards.map(() => ({ concept: "", conceptDetail: "d" })) }).polished).toBe(false);
  });
});
