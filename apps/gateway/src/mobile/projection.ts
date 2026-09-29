import { fold, redact } from "@shuacrew/core";
import { MobileSnapshotSchema, type ApprovalOffer, type MobileSnapshot } from "@shuacrew/core/mobile";
import type { EventStore } from "../store.js";

const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
function clipped(text: string, max: number): string {
  let result = "", used = 0;
  for (const point of redact(text)) { const bytes = Buffer.byteLength(point); if (used + bytes > max) break; result += point; used += bytes; }
  return result;
}
/** Explicit allowlist projection: never spread a run, message or event body onto the wire. */
export function projectMobile(store: EventStore, options: { installationId: string; deviceId: string; roomIds: string[]; offers: ApprovalOffer[]; now: number }): MobileSnapshot {
  const state = fold(store.read(0)), selected = new Set(options.roomIds);
  const visible = Object.values(state.runs).filter(r => !r.incognito && r.runtime !== "mock" && r.labels.some(l => l.startsWith("room:") && selected.has(l.slice(5))));
  const ids = new Set(visible.map(r => r.id));
  const runs = visible.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100).map(r => ({ id: r.id, roomId: r.labels.find(l => l.startsWith("room:") && selected.has(l.slice(5)))!.slice(5), title: clipped(r.title, 256) || "Untitled", status: r.status, summary: clipped(r.ticker, 2048) }));
  const usage: MobileSnapshot["usage"] = { inputTokens: 0, outputTokens: 0, cacheTokens: 0, records: 0, costUsd: null };
  let cost = 0, costRecords = 0;
  for (const event of store.ofKinds("usage.recorded")) {
    if (event.kind !== "usage.recorded" || !event.run || !ids.has(event.run) || event.body.runtime === "mock") continue;
    const b = event.body;
    if ((b.contextUsed !== undefined || b.contextLimit !== undefined) && !b.inputTokens && !b.outputTokens && !b.cacheTokens && b.costUsd === undefined) continue;
    usage.inputTokens += b.inputTokens; usage.outputTokens += b.outputTokens; usage.cacheTokens += b.cacheTokens; usage.records++;
    if (b.costUsd !== undefined) { cost += b.costUsd; costRecords++; }
  }
  if (usage.records > 0 && costRecords === usage.records) usage.costUsd = cost;
  const allRooms = Object.values(state.rooms).filter(r => selected.has(r.id) && !r.archived);
  const rooms: MobileSnapshot["rooms"] = allRooms.slice(0, 50).map(r => ({ id: r.id, title: clipped(r.title, 256) || "Untitled", paused: r.paused, messages: [], truncated: false }));
  const offers = options.offers.filter(o => ids.has(o.runId)).slice(0, 50);
  const snapshot: MobileSnapshot = { version: 1, installationId: options.installationId, deviceId: options.deviceId, sequence: store.head, observedAt: options.now, rooms, runs, offers, usage, truncated: visible.length > 100 || allRooms.length > 50 || offers.length !== options.offers.length };
  let remaining = 524288 - size(snapshot) - 1024; // reserve punctuation/truncation changes
  for (const projected of rooms) {
    const room = state.rooms[projected.id]!;
    const messages = room.messages.filter(m => {
      const source = m.sourceRun ?? (m.requestId ? room.turns.find(t => t.requestId === m.requestId)?.runId : undefined);
      return source ? ids.has(source) : m.author === "you";
    });
    projected.truncated = messages.length > 50;
    for (const message of messages.slice(-50).reverse()) {
      const text = clipped(message.text, 8000);
      const value = { id: message.id, author: clipped(message.author, 128), text, at: message.at };
      const bytes = size(value) + 1;
      if (bytes > remaining) { projected.truncated = true; continue; }
      if (text !== redact(message.text)) projected.truncated = true;
      if (!text) continue;
      remaining -= bytes; projected.messages.unshift(value);
    }
    snapshot.truncated ||= projected.truncated;
  }
  return MobileSnapshotSchema.parse(snapshot);
}
