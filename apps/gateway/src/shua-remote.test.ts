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
  expect(phoneAllowed("POST", "/api/shua/remote/ra_0123456789ab/take")).toBe(false);
});
