/** Explicit integration check: spends subscription usage; never part of pnpm test. */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentEnv } from "../packages/core/src/redact.js";
import { teachingCompletion } from "../packages/runtimes/src/teaching.js";
import { TeachingStore, TeachingEngine } from "../apps/gateway/src/teaching.js";
async function main() {
  const root = mkdtempSync(path.join(os.tmpdir(), "shua-teaching-live-")),
    store = new TeachingStore(path.join(root, "lessons.json"));
  store.create();
  const engine = new TeachingEngine(store, (input) =>
    teachingCompletion({ ...input, cwd: root, env: agentEnv(process.env, "subscription") }),
  );
  const id = store.snapshot().active!;
  await engine.explain(id, {
    baseRevision: 0,
    question:
      "Explain recursion to a beginner using factorial(3). Use a small progressive call-stack diagram with 3 or 4 objects, and mark the base case. This is an illustrative example, no source document. Keep the explanation short.",
    sources: [],
    model: process.env.SHUA_TEACHING_TEST_MODEL ?? "claude-haiku-4-5",
  });
  const first = store.get(id);
  if (!first.objects.length || !first.answer) throw new Error("No diagram or answer from live model");
  await engine.explain(id, {
    baseRevision: first.revision,
    question:
      "Add one short callout explaining why a base case prevents infinite recursion. Preserve all existing object IDs. Keep the explanation short.",
    sources: [],
    model: process.env.SHUA_TEACHING_TEST_MODEL ?? "claude-haiku-4-5",
  });
  const second = store.get(id);
  if (!first.objects.every((o) => second.objects.some((n) => n.id === o.id)))
    throw new Error("Follow-up lost diagram identity");
  writeFileSync(path.join(root, "verified.json"), JSON.stringify(second, null, 2));
  console.log(
    JSON.stringify(
      {
        provider: "Claude Agent SDK / existing subscription",
        firstRevision: first.revision,
        followupRevision: second.revision,
        originalObjects: first.objects.length,
        finalObjects: second.objects.length,
        preservedIds: true,
        artifact: path.join(root, "verified.json"),
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
