import { expect, it } from "vitest";
import { EventStore } from "../store.js";
import { projectMobileV2 } from "./projection-v2.js";
it("projects actual scoped identities and result checks without prompts or local paths", () => {
  const store = new EventStore(":memory:");
  try {
    const requestId = "11111111-1111-4111-8111-111111111111";
    store.append("room.created", { id: "room", title: "Project", coordinator: "shua", members: ["shua"] });
    store.append("room.turn", { room: "room", requestId, runId: "r_real", memberId: "shua" });
    store.append("run.created", { title: "Review", ask: "PRIVATE_PROMPT", runtime: "codex", member: "shua", labels: ["room:room"] }, { run: "r_real" });
    store.append("run.status", { status: "failed" }, { run: "r_real" });
    store.append("room.message", { room: "room", id: "result_r_real_1", author: "shua", sourceRun: "r_real", text: "Output /Users/private/file.txt /custom/data.txt https://example.com/result" });
    const result = projectMobileV2(store, { installationId: "mac", deviceId: "phone", roomIds: ["room"], offers: [], now: Date.now() });
    expect(result.work[0]).toMatchObject({ id: "r_real", memberId: "shua", requestId });
    expect(result.results[0]).toMatchObject({ state: "partial", verification: "not-recorded" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PROMPT");
    expect(JSON.stringify(result)).not.toContain("/Users/private");
    expect(JSON.stringify(result)).not.toContain("/custom/data.txt");
    expect(JSON.stringify(result)).toContain("https://example.com/result");
    store.append("run.archived", {}, { run: "r_real" });
    const archived = projectMobileV2(store, { installationId: "mac", deviceId: "phone", roomIds: ["room"], offers: [], now: Date.now() });
    expect(archived.work).toHaveLength(0); expect(archived.results).toHaveLength(0);
  } finally { store.close(); }
});
