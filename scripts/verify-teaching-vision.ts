/** Live subscription vision check against a controlled fixture, not a live desktop. */
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentEnv } from "../packages/core/src/redact.js";
import { teachingCompletion } from "../packages/runtimes/src/teaching.js";
import { TeachingStore, TeachingEngine } from "../apps/gateway/src/teaching.js";
async function main() {
  const fixture = process.argv[2];
  if (!fixture) throw new Error("Pass a JPEG showing 'Upload complete' and a 100% progress bar");
  const root = mkdtempSync(path.join(os.tmpdir(), "shua-teaching-vision-"));
  const store = new TeachingStore(path.join(root, "lessons.json"));
  store.create();
  const id = store.snapshot().active!;
  store.commit(id, 0, (d) => ({
    ...d,
    title: "Upload a file",
    answer: "Wait until the upload completes.",
    stepId: "upload",
    steps: [
      {
        id: "upload",
        title: "Finish uploading",
        text: "The file upload must show 100% and Upload complete.",
        sources: [],
        objects: [],
      },
    ],
    practice: { ...d.practice, active: true, status: "waiting", stepId: "upload", displayId: 1 },
  }));
  const engine = new TeachingEngine(store, (input) =>
    teachingCompletion({ ...input, cwd: root, env: agentEnv(process.env, "subscription") }),
  );
  const now = Date.now();
  await engine.observe(id, {
    eventId: "fixture_click",
    sessionId: id,
    kind: "click",
    observedAt: now - 100,
    displayId: 1,
    x: 0.5,
    y: 0.5,
    source: {
      id: "fixture",
      title: "Controlled upload UI fixture",
      kind: "capture",
      text: "Synthetic screenshot for integration verification, not the user's desktop.",
      image: readFileSync(fixture).toString("base64"),
      mime: "image/jpeg",
      capture: {
        id: "fixture_capture",
        displayId: 1,
        capturedAt: now,
        sourceWidth: 800,
        sourceHeight: 480,
        width: 800,
        height: 480,
        display: { x: 0, y: 0, width: 800, height: 480 },
        crop: { x: 0, y: 0, width: 800, height: 480 },
        context: "controlled-fixture",
      },
    },
  });
  const doc = store.get(id);
  if (doc.practice.status !== "verified" || doc.stepId !== "upload" || !doc.practice.active)
    throw new Error(
      "Vision did not verify the visible result while preserving the goal: " + doc.practice.feedback,
    );
  console.log(
    JSON.stringify(
      {
        provider: "Claude Agent SDK / existing subscription",
        input: "JPEG test fixture (not live screen)",
        visionResult: doc.practice.status,
        sameStep: true,
        guidanceActive: true,
        feedback: doc.practice.feedback,
        artifact: root,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
