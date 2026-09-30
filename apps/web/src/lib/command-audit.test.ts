/**
 * Every command Spark is taught must really exist end to end. It once told people "Music's closed" through a command
 * that didn't exist, and showed countdown cards the page silently dropped — this catches both kinds of gap.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { buddyPrompt, parseActions } from "./buddy";
import { parseVisual, VISUAL_GUIDE } from "./visual";

const prompt = buddyPrompt("audit", { width: 1000, height: 800 }, { name: "Spark", tone: "engineer", length: "brief" }, "CREW NOW — live");
const blocks = (kind: string, text: string) => [...text.matchAll(new RegExp("```" + kind + "\\s*([\\s\\S]*?)```", "g"))].map((m) => m[1]!.trim());

it("every do example Spark is taught parses into exactly the actions it shows", () => {
  const examples = blocks("do", prompt);
  expect(examples.length).toBeGreaterThan(20);
  const broken = examples.filter((json) => {
    let shown: unknown[]; try { const v = JSON.parse(json); shown = Array.isArray(v) ? v : [v]; } catch { return false; } // prose placeholders like {…}
    return parseActions("```do " + json + "```").length !== shown.length;
  });
  expect(broken).toEqual([]);
});

it("every card example Spark is taught draws", () => {
  const examples = blocks("visual", VISUAL_GUIDE.replace(/\\"/g, '"').replace(/\\\\n/g, "\\n"));
  expect(examples.length).toBeGreaterThan(15);
  const isJson = (t: string) => { try { JSON.parse(t); return true; } catch { return false; } }; // "{…}" is prose, not an example
  expect(examples.filter((json) => isJson(json) && parseVisual(json) === null)).toEqual([]);
});

it("every action that goes to the Mac has a handler in the Mac app", () => {
  const types = [...readFileSync(path.join(__dirname, "buddy.ts"), "utf8").matchAll(/^\s+\| \{ type: "([a-z_]+)"/gm)].map((m) => m[1]!);
  const actions = readFileSync(path.join(__dirname, "../screens/spark/actions.ts"), "utf8");
  const onPage = new Set([...actions.matchAll(/a\.type === "([a-z_]+)"\)? return|if \(a\.type === "([a-z_]+)"\) \{/g)].map((m) => m[1] ?? m[2]));
  const swift = readFileSync(path.join(__dirname, "../../../mac/Sources/ShuaCrew/Buddy.swift"), "utf8");
  // "done" ends a step-by-step task on the page (Buddy.tsx runBlocks); it is never sent to the Mac.
  const missing = [...new Set(types)].filter((t) => t !== "done" && !onPage.has(t) && !new RegExp(`case "${t}"|case [^\\n]*"${t}"`).test(swift));
  expect(missing).toEqual([]);
});
