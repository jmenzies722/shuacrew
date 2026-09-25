import { expect, it } from "vitest";
import { EventStore } from "../store.js";
import { projectMobile } from "./projection.js";

it("exports only selected non-private work, redacts secrets and excludes demo consumption", () => {
  const store = new EventStore(":memory:");
  try {
    for (const id of ["selected", "private"]) store.append("room.created", { id, title: id, coordinator: "shua", members: ["shua"] });
    for (const [id, room, incognito, runtime] of [["real", "selected", false, "codex"], ["hidden", "selected", true, "codex"], ["other", "private", false, "codex"], ["demo", "selected", false, "mock"]] as const) {
      store.append("run.created", { title: id, ask: "Do not export raw prompts", labels: [`room:${room}`], runtime, incognito }, { run: id });
      store.append("usage.recorded", { runtime, inputTokens: 10, outputTokens: 2 }, { run: id });
      store.append("room.message", { room, id: `msg_${id}`, author: "shua", sourceRun: id, text: id === "real" ? "Result sk-proj-123456789012345678901234567890" : `HIDDEN_${id}` });
      store.append("agent.thinking", { turn: 1, text: "PRIVATE_REASONING" }, { run: id });
    }
    const snapshot = projectMobile(store, { installationId: "mac_1", deviceId: "phone_1", roomIds: ["selected"], offers: [], now: 1000 });
    expect(snapshot.rooms.map(r => r.id)).toEqual(["selected"]);
    expect(snapshot.runs.map(r => r.id)).toEqual(["real"]);
    expect(snapshot.usage).toMatchObject({ inputTokens: 10, outputTokens: 2, records: 1, costUsd: null });
    const json = JSON.stringify(snapshot);
    for (const secret of ["123456789012345678901234567890", "HIDDEN_", "PRIVATE_REASONING", "Do not export raw prompts"]) expect(json).not.toContain(secret);
    expect(json).toContain("redacted");
    store.append("run.archived", {}, { run: "real" });
    const archived = projectMobile(store, { installationId: "mac_1", deviceId: "phone_1", roomIds: ["selected"], offers: [], now: 1000 });
    expect(archived.runs).toHaveLength(0);
    expect(archived.rooms[0]!.messages).toHaveLength(0);
  } finally { store.close(); }
});
it("caps large room histories with explicit truncation and a bounded encoded snapshot", () => {
  const store = new EventStore(":memory:");
  try {
    const roomIds: string[] = [];
    for (let r = 0; r < 4; r++) {
      const room = `room_${r}`; roomIds.push(room);
      store.append("room.created", { id: room, title: room, coordinator: "shua", members: ["shua"] });
      for (let m = 0; m < 55; m++) store.append("room.message", { room, id: `msg_${r}_${m}`, author: "you", text: "é".repeat(7000) });
    }
    const result = projectMobile(store, { installationId: "mac", deviceId: "phone", roomIds, offers: [], now: 1000 });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(524288);
    expect(result.truncated).toBe(true);
    expect(result.rooms.every(r => r.messages.length <= 50)).toBe(true);
  } finally { store.close(); }
});
