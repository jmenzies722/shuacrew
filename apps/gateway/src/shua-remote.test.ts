import Fastify from "fastify";
import { expect, it } from "vitest";
import { phoneAllowed } from "./phone-door.js";
import { registerShuaRemote, remoteText, ShuaRemote } from "./shua-remote.js";

it("hands an ask to the Mac's Shua only when it's listening, and tracks who took it", () => {
  const remote = new ShuaRemote(() => 5);
  expect(remote.send("play some jazz")).toBeNull();
  const heard: string[] = []; const off = remote.subscribe((a) => heard.push(a.text));
  const ask = remote.send("play some jazz")!;
  expect(heard).toEqual(["play some jazz"]);
  expect(ask).toMatchObject({ text: "play some jazz", at: 5, status: "sent" });
  expect(remote.take(ask.id, "r_abc")).toBe(true);
  expect(remote.get(ask.id)).toMatchObject({ status: "taken", run: "r_abc" });
  expect(remote.take("ra_nope", "r_abc")).toBe(false);
  off(); expect(remote.listening).toBe(false);
});

it("says plainly when Shua isn't open on the Mac", async () => {
  const app = Fastify(); registerShuaRemote(app);
  const r = await app.inject({ method: "POST", url: "/api/shua/remote", payload: { text: "what's going on?" } });
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toContain("isn't open on your Mac");
  expect((await app.inject({ method: "POST", url: "/api/shua/remote", payload: { text: "  " } })).statusCode).toBe(400);
  await app.close();
});

it("cleans what the phone sends", () => {
  expect(remoteText("  open   Safari \n")).toBe("open Safari");
  expect(remoteText(42)).toBeNull();
  expect(remoteText("x".repeat(3000))!.length).toBe(2000);
});

it("lets the phone ask and follow, but never listen or take", () => {
  expect(phoneAllowed("POST", "/api/shua/remote")).toBe(true);
  expect(phoneAllowed("GET", "/api/shua/remote/ra_0123456789ab")).toBe(true);
  expect(phoneAllowed("GET", "/api/shua/remote/events")).toBe(false);
  expect(phoneAllowed("POST", "/api/shua/remote/ra_0123456789ab/answer")).toBe(false); // only the Mac answers
  expect(phoneAllowed("POST", "/api/shua/remote/ra_0123456789ab/take")).toBe(false);
});

it("finds the conversation from the record, over the notch's guess", () => {
  let t = 1000; const remote = new ShuaRemote(() => t);
  remote.subscribe(() => {});
  const ask = remote.send("What's going on?")!;
  remote.take(ask.id, "r_old"); // the notch read its old conversation too early
  remote.observe({ kind: "run.created", run: "r_new", body: { ask: "You are Shua… From my iPhone: What's going on?" } });
  expect(remote.get(ask.id)).toMatchObject({ status: "taken", run: "r_new" });
  // Unrelated turns, or ones from long ago, don't move it.
  remote.observe({ kind: "turn.started", run: "r_other", body: { text: "From my iPhone: play jazz" } });
  t += 200_000; remote.observe({ kind: "turn.started", run: "r_late", body: { text: "From my iPhone: What's going on?" } });
  expect(remote.get(ask.id)?.run).toBe("r_new");
});

it("never lets a late guess overwrite what the record showed", () => {
  const remote = new ShuaRemote(() => 1); remote.subscribe(() => {});
  const ask = remote.send("open Safari")!;
  remote.observe({ kind: "run.followup", run: "r_real", body: { text: "From my iPhone: open Safari" } });
  remote.take(ask.id, "r_stale");
  expect(remote.get(ask.id)?.run).toBe("r_real");
});

it("an ask the notch did itself carries its answer to the phone; a conversation turn, once taken, outranks it", () => {
  const remote = new ShuaRemote();
  remote.subscribe(() => {});
  const ask = remote.send("Pause music")!;
  expect(remote.answer(ask.id, "Paused.", true)).toBe(true);
  expect(remote.get(ask.id)).toMatchObject({ status: "answered", answer: "Paused.", ok: true });
  expect(remote.answer(ask.id, "again", true)).toBe(false); // answered once
  const other = remote.send("What's the score")!;
  remote.observe({ kind: "turn.started", run: "r_1", body: { text: "From my iPhone: What's the score" } });
  expect(remote.answer(other.id, "Mic error", false)).toBe(false); // a turn has it: the phone follows that
  expect(remote.answer("ra_unknown", "x", true)).toBe(false);
});
