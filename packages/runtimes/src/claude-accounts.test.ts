import { mkdtempSync, mkdirSync, readlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeAccounts, type ReadStatus } from "./claude-accounts.js";

function pool(logins: Record<string, { email?: string; plan?: string; loggedIn?: boolean }>, extras: string[] = []) {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-acct-"));
  const root = path.join(home, ".shuacrew", "claude-accounts");
  for (const name of extras) mkdirSync(path.join(root, name), { recursive: true });
  let now = 1_000_000;
  const who = { ...logins };
  const readStatus: ReadStatus = async (dir) => {
    const l = who[dir ? path.basename(dir) : "default"];
    return l ? { loggedIn: l.loggedIn ?? true, email: l.email, subscriptionType: l.plan } : {};
  };
  const accounts = new ClaudeAccounts({ home, root, readStatus, ttlMs: 60_000, now: () => now });
  return { accounts, who, home, root, tick: (ms: number) => (now += ms), now: () => now };
}

describe("Claude account pool", () => {
  it("finds the default login and every extra folder", async () => {
    const { accounts } = pool({ default: { email: "a@x.com", plan: "pro" }, "2": { email: "b@x.com", plan: "pro" } }, ["2"]);
    const list = await accounts.refresh();
    expect(list.map((a) => [a.dir === "" ? "default" : path.basename(a.dir), a.email, a.plan])).toEqual([["default", "a@x.com", "pro"], ["2", "b@x.com", "pro"]]);
  });

  it("counts the same person signed in twice once: one subscription, one window", async () => {
    const { accounts } = pool({ default: { email: "a@x.com" }, "2": { email: "a@x.com" } }, ["2"]);
    expect(await accounts.refresh()).toHaveLength(1);
  });

  it("moves on from a limited account and says when the first frees up", async () => {
    const { accounts, now } = pool({ default: { email: "a@x.com" }, "2": { email: "b@x.com" } }, ["2"]);
    const [a, b] = await accounts.refresh();
    accounts.markLimited(a!.dir, now() + 3_600_000);
    expect(accounts.pick()?.email).toBe("b@x.com");
    accounts.markLimited(b!.dir, now() + 60_000);
    expect(accounts.pick()).toBeUndefined();
    expect(accounts.nextFree()).toBe(now() + 60_000);
  });

  it("keeps a per-model cap to that model", async () => {
    const { accounts, now } = pool({ default: { email: "a@x.com" } });
    await accounts.refresh();
    accounts.markLimited("", now() + 60_000, "claude-opus-5-5");
    expect(accounts.pick("claude-opus-5-5")).toBeUndefined();
    expect(accounts.pick("claude-sonnet-5")?.email).toBe("a@x.com");
  });

  it("lifts limits once their window passes, and on Try now", async () => {
    const { accounts, now, tick } = pool({ default: { email: "a@x.com" } });
    await accounts.refresh();
    accounts.markLimited("", now() + 60_000);
    expect(accounts.pick()).toBeUndefined();
    tick(60_001);
    expect(accounts.pick()?.email).toBe("a@x.com");
    accounts.markLimited("", now() + 60_000);
    accounts.clearLimits();
    expect(accounts.pick()?.email).toBe("a@x.com");
  });

  it("notices a /login as someone else after the TTL, with a clean slate", async () => {
    const { accounts, who, now, tick } = pool({ default: { email: "a@x.com" } });
    await accounts.refresh();
    accounts.markLimited("", now() + 3_600_000);
    who.default = { email: "c@x.com", plan: "pro" };
    expect((await accounts.refresh())[0]?.email).toBe("a@x.com"); // still trusted
    tick(60_001);
    const [c] = await accounts.refresh();
    expect(c?.email).toBe("c@x.com");
    expect(accounts.pick()?.email).toBe("c@x.com");
  });

  it("never picks a folder nobody signed in to", async () => {
    const { accounts } = pool({ default: { email: "a@x.com" }, "2": { loggedIn: false } }, ["2"]);
    await accounts.refresh();
    expect(accounts.pick(undefined, [""])).toBeUndefined();
  });

  it("runs the default account without CLAUDE_CONFIG_DIR (its keychain login is keyed on that)", () => {
    const base = { PATH: "/bin", CLAUDE_CONFIG_DIR: "/stray" };
    expect(ClaudeAccounts.env({ dir: "", signedIn: true, limits: {}, lastUsed: 0 }, base)).not.toHaveProperty("CLAUDE_CONFIG_DIR");
    expect(ClaudeAccounts.env({ dir: "/acct/2", signedIn: true, limits: {}, lastUsed: 0 }, base).CLAUDE_CONFIG_DIR).toBe("/acct/2");
  });

  it("creates the next account folder sharing the default account's conversations", async () => {
    const { accounts, home, root } = pool({});
    const dir = accounts.create();
    expect(dir).toBe(path.join(root, "2"));
    expect(readlinkSync(path.join(dir, "projects"))).toBe(path.join(home, ".claude", "projects"));
    expect(accounts.create()).toBe(path.join(root, "3"));
  });
});
