import { mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { describe, expect, it } from "vitest";
import { Library } from "./library.js";
import { Sites, type Runner } from "./sites.js";
import { EventStore } from "./store.js";

function world(run: Runner, http?: typeof fetch) {
  const store = new EventStore(":memory:");
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-sites-"));
  const library = new Library(store, path.join(home, "library"));
  const sites = new Sites(store, path.join(home, "sites"), library, () => fold(store.read(0)), run, http);
  return { store, library, sites, home };
}

describe("publishing a page", () => {
  it("deploys the page with a working waitlist and reads signups back with a key only ShuaCrew has", async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const run: Runner = async (args, cwd) => {
      calls.push({ args, cwd });
      return { code: 0, out: "Inspect: https://vercel.com/me/fern\nProduction: https://fern-landing-ab12-9xk2j3h4q-me.vercel.app [4s]\nAliased: https://fern-landing-ab12.vercel.app [4s]\n" };
    };
    let seenKey = "";
    const http = (async (_url: string | URL, init?: RequestInit) => {
      seenKey = (init?.headers as Record<string, string>)["x-shuacrew-key"] ?? "";
      return new Response(JSON.stringify({ count: 23, latest: [{ email: "ana@example.com", at: "2026-09-24T10:00:00Z" }] }));
    }) as typeof fetch;
    const { store, library, sites } = world(run, http);
    const page = library.save({ title: "Fern landing", filename: "landing.html", content: "<html><body><form><input type=email><button>Join</button></form></body></html>" });
    await expect(sites.publish({ artifact: library.save({ title: "Notes", content: "# x" }).id })).rejects.toThrow(/only pages/);

    const site = await sites.publish({ artifact: page.id, venture: "fern" });
    expect(site).toMatchObject({ url: "https://fern-landing-ab12.vercel.app", venture: "fern", version: 1 });
    expect(calls[0]!.args).toEqual(["deploy", "--prod", "--yes", "--name", site.project]);
    const dir = calls[0]!.cwd;
    const html = readFileSync(path.join(dir, "index.html"), "utf8");
    expect(html).toMatch(/<form>.*<\/form><script>/s);
    expect(html).toContain("fetch('/api/join'");
    expect(readFileSync(path.join(dir, "api/join.js"), "utf8")).toContain('from "@vercel/blob"');
    expect(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).dependencies["@vercel/blob"]).toBe("^2.8.0");
    // The key never ships: only its hash does, and the key file is private and not uploaded.
    const key = readFileSync(path.join(dir, ".shuacrew-key"), "utf8");
    expect(statSync(path.join(dir, ".shuacrew-key")).mode & 0o777).toBe(0o600);
    expect(readFileSync(path.join(dir, "api/signups.js"), "utf8")).not.toContain(key);
    expect(readFileSync(path.join(dir, ".vercelignore"), "utf8")).toContain(".shuacrew-key");

    const read = await sites.signups(site.id);
    expect(seenKey).toBe(key);
    expect(read.count).toBe(23);
    expect(fold(store.read(0)).sites[site.id]?.signups?.count).toBe(23);
    expect(JSON.stringify([...store.read(0)])).not.toContain("ana@example.com"); // emails are never logged

    // Publishing again redeploys the same project at the same address.
    await sites.publish({ artifact: page.id });
    expect(calls[1]!.args.at(-1)).toBe(site.project);
    expect(sites.list()).toHaveLength(1);
  });

  it("says exactly what to do when you're not logged in to Vercel", async () => {
    const { library, sites } = world(async () => ({ code: 1, out: "Error: No existing credentials found. Please run `vercel login` or pass \"--token\"" }));
    const page = library.save({ title: "Page", filename: "p.html", content: "<p>hi</p>" });
    await expect(sites.publish({ artifact: page.id })).rejects.toThrow("Log in to Vercel once: run `vercel login` in Terminal, then publish again.");
    expect((await sites.status()).hint).toMatch(/vercel login/);
  });
});
