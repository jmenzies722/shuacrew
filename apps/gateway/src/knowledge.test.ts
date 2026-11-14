import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { KNOWLEDGE_FILES, KNOWLEDGE_MAX_CHARS, Knowledge, meaningful } from "./knowledge.js";

const fresh = (seed = {}) => new Knowledge(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-know-")), "knowledge"), () => seed);

it("starts as five plain files, seeded with what is already known, and never overwrites one that exists", () => {
  const k = fresh({ firstName: "Sam", goal: "Ship the app", weeklyHours: 10, incomePath: "products" });
  k.ensure();
  expect(readdirSync(k.dir).sort()).toEqual(KNOWLEDGE_FILES.map((n) => `${n}.md`).sort());
  const me = k.read("me");
  expect(me).toContain("- Name: Sam");
  expect(me).toContain("- Main goal: Ship the app");
  expect(me).toContain("- Time for side projects: 10 hours a week");
  expect(me).toContain("- How I want to earn from them: products I build");
  expect(statSync(path.join(k.dir, "me.md")).mode & 0o777).toBe(0o600); // yours alone

  writeFileSync(path.join(k.dir, "me.md"), "# About me\n- Name: Edited by hand\n");
  k.ensure();
  expect(k.read("me")).toContain("Edited by hand");
});

it("adds nothing to a prompt until something is filled in", () => {
  const k = fresh();
  k.ensure();
  expect(k.profile()).toBeUndefined(); // templates only: comments and empty labels
  expect(k.list().every((f) => !f.filled)).toBe(true);
  expect(meaningful("# Projects\n<!-- a hint -->\n")).toBe("");
  expect(meaningful("# About me\n- Name: \n- Main goal:\n")).toBe("");
});

it("hands prompts what you wrote, without the template's hints or empty labels", () => {
  const k = fresh({ firstName: "Sam" });
  k.ensure();
  k.write("projects", "# Projects\n<!-- hint -->\n- Harbor: a tide app. Done means the widget ships.\n");
  const profile = k.profile()!;
  expect(profile).toMatch(/^What you know about the person you work for/);
  expect(profile).toContain("- Name: Sam");
  expect(profile).toContain("Harbor: a tide app");
  expect(profile).not.toContain("<!--");
  expect(profile).not.toContain("Main goal"); // an unfilled label is not a fact
  expect(profile.indexOf("About me")).toBeLessThan(profile.indexOf("Projects")); // you first
  expect(k.list().filter((f) => f.filled).map((f) => f.name)).toEqual(["me", "projects"]);
});

it("keeps the context short: a cap in total, and no one file crowds out the rest", () => {
  const k = fresh({ firstName: "Sam" });
  k.ensure();
  k.write("projects", `# Projects\n${"- a long project note that goes on. ".repeat(400)}`);
  k.write("commitments", "# Commitments\n- Demo on Friday.\n");
  const profile = k.profile(1200)!;
  expect(profile.length).toBeLessThanOrEqual(1200 + 200); // the lead-in sentence rides on top of the budget
  expect(profile).toContain("…"); // the long file was cut
  expect(profile).toContain("Demo on Friday"); // and the file after it still fits
});

it("writes whole files safely and refuses what it shouldn't take", () => {
  const k = fresh();
  const saved = k.write("style", "# How I write\nShort. Direct.");
  expect(saved.name).toBe("style");
  expect(readFileSync(path.join(k.dir, "style.md"), "utf8")).toBe("# How I write\nShort. Direct.\n");
  expect(readdirSync(k.dir).filter((f) => f.endsWith(".tmp"))).toEqual([]); // nothing left behind
  expect(() => k.write("../settings", "x")).toThrow(/No such knowledge file/);
  expect(() => k.write("secrets", "x")).toThrow(/No such knowledge file/);
  expect(() => k.write("me", "x".repeat(KNOWLEDGE_MAX_CHARS + 1))).toThrow(/Too long/);
  expect(() => k.write("me", undefined as unknown as string)).toThrow(/Text is required/);
});

// ── What sessions and Shua are actually told ─────────────────────────────────────────────────
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach } from "vitest";
import { Supervisor } from "./runs.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });

function told(profile: (lean: boolean) => string | undefined) {
  const store = new EventStore(":memory:");
  const seen: RunSpec[] = [];
  const agent: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "mock",
    prepare: undefined, // so recalled notes and instructions travel in `system`, as on a runtime without warm threads
    async *start(run: RunSpec) {
      seen.push(run);
      yield { type: "session", id: `conv-${run.id}` } as const;
      yield { type: "done", text: "Ok." } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["mock", agent]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [], profile });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const turns = async (run: string, n: number) => {
    const deadline = Date.now() + 10_000;
    while (store.forRun(run).filter((e) => e.kind === "turn.completed").length < n || fold(store.read(0)).runs[run]?.status !== "done") {
      if (Date.now() > deadline) throw new Error("timed out");
      await new Promise((r) => setTimeout(r, 15));
    }
  };
  return { store, supervisor, seen, turns };
}
const ABOUT = "What you know about the person you work for: Sam ships on Fridays.";

it("a session that is starting is told what is known about you, in its instructions", async () => {
  const { supervisor, seen, turns } = told((lean) => (lean ? "short form" : ABOUT));
  const run = supervisor.launch({ ask: "Plan the release", runtime: "mock" });
  await turns(run, 1);
  expect(seen[0]!.system).toContain(ABOUT);
  expect(seen[0]!.ask).toBe("Plan the release"); // the ask itself is untouched
});

it("Shua gets the short form with a conversation's first ask, once, and the transcript shows only what you said", async () => {
  const { store, supervisor, seen, turns } = told((lean) => (lean ? ABOUT : "long form"));
  const run = supervisor.launch({ ask: "What's on today?", runtime: "mock", labels: ["buddy"] });
  await turns(run, 1);
  expect(seen[0]!.lean).toBe(true);
  expect(seen[0]!.ask.startsWith(ABOUT)).toBe(true);
  expect(seen[0]!.ask.endsWith("What's on today?")).toBe(true);
  expect(seen[0]!.system).toBeUndefined();
  supervisor.followUp(run, "And tomorrow?");
  await turns(run, 2);
  expect(seen[1]!.resume).toBe(`conv-${run}`);
  expect(seen[1]!.ask).toBe("And tomorrow?"); // the conversation already knows; not said twice
  expect(store.forRun(run).flatMap((e) => (e.kind === "turn.started" ? [e.body.text] : []))).toEqual(["What's on today?", "And tomorrow?"]);
});

it("says nothing extra when nothing has been filled in", async () => {
  const { supervisor, seen, turns } = told(() => undefined);
  const work = supervisor.launch({ ask: "Plan the release", runtime: "mock" });
  const shua = supervisor.launch({ ask: "Hi", runtime: "mock", labels: ["buddy"] });
  await turns(work, 1); await turns(shua, 1);
  expect(seen.find((s) => s.id === work)!.system ?? "").not.toContain("person you work for");
  expect(seen.find((s) => s.id === shua)!.ask).toBe("Hi");
});
