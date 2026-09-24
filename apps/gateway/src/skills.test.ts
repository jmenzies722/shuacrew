import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Memory } from "./memory.js";
import { frontmatter, Skills, withFrontmatter } from "./skills.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

/** A tiny anthropics/skills: one skill with a script, one evil path that must never be written. */
function fakeGitHub(calls: string[]) {
  const files: Record<string, string> = {
    "skills/pdf/SKILL.md": "---\nname: pdf\ndescription: Fill, merge and extract text from PDF files. Use when working with PDFs.\n---\n\n# PDF\n\nRun scripts/extract.py.",
    "skills/pdf/scripts/extract.py": "print('hello')",
    "skills/pdf/../../escape.txt": "nope",
    "skills/brand/SKILL.md": "---\nname: brand\ndescription: >\n  Apply the brand's colours\n  and type.\n---\n# Brand",
  };
  return (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/git/trees/")) return new Response(JSON.stringify({ tree: Object.keys(files).map((p) => ({ path: p, type: "blob", size: files[p]!.length })) }));
    const key = decodeURIComponent(u.replace("https://raw.githubusercontent.com/anthropics/skills/main/", ""));
    return files[key] !== undefined ? new Response(files[key]) : new Response("", { status: 404 });
  }) as typeof fetch;
}

function world() {
  const store = new EventStore(":memory:");
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), "shua-skills-")), "plugin");
  const calls: string[] = [];
  const skills = new Skills(store, root, fakeGitHub(calls));
  const memory = new Memory(store);
  cleanups.push(() => (skills.stop(), memory.stop(), store.close()));
  return { store, root, skills, memory, calls };
}

describe("skills", () => {
  it("lists Anthropic's skills and installs a whole skill folder into ShuaCrew's own plugin", async () => {
    const { skills, root, memory } = world();
    expect(skills.plugins()).toEqual([]); // nothing to load yet
    const catalog = await skills.catalog();
    expect(catalog).toEqual([
      { name: "pdf", description: "Fill, merge and extract text from PDF files. Use when working with PDFs.", files: 3, installed: false },
      { name: "brand", description: "Apply the brand's colours and type.", files: 1, installed: false },
    ]);

    const pdf = await skills.install("pdf");
    expect(pdf).toMatchObject({ name: "pdf", files: 2, source: "catalog" });
    expect(readFileSync(path.join(root, "skills/pdf/scripts/extract.py"), "utf8")).toBe("print('hello')");
    expect(existsSync(path.join(root, "escape.txt"))).toBe(false);
    expect(existsSync(path.join(path.dirname(root), "escape.txt"))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(root, ".claude-plugin/plugin.json"), "utf8")).name).toBe("shuacrew");
    expect(skills.plugins()).toEqual([{ type: "local", path: root, skipMcpDiscovery: true }]);
    expect((await skills.catalog()).find((c) => c.name === "pdf")?.installed).toBe(true);
    // Memory knows it too (so Codex, which has no plugins, gets it in its prompt).
    expect(memory.skills().find((s) => s.name === "pdf")?.status).toBe("accepted");
    await expect(skills.install("../etc")).rejects.toThrow(/unknown skill/);
  });

  it("writes your own skills, turns accepted learned ones into folders, and removes cleanly", () => {
    const { skills, root, store, memory } = world();
    expect(() => skills.create({ name: "Release notes", description: "", instructions: "x" })).toThrow(/say when/);
    const mine = skills.create({ name: "Release notes", description: "Use when writing release notes for a version.", instructions: "Group by Added / Fixed. Link PRs." });
    expect(mine).toMatchObject({ name: "release-notes", source: "yours", description: "Use when writing release notes for a version." });

    // Memory proposes a skill from repeated work; accepting it makes it a real skill.
    store.append("skill.proposed", { id: "s_1", name: "Deploy checklist", body: "Before deploying: run tests, bump version, tag.", from: [] });
    memory.decideSkill("s_1", true);
    const learned = skills.list().find((s) => s.name === "deploy-checklist")!;
    expect(learned.source).toBe("learned");
    expect(frontmatter(readFileSync(path.join(root, "skills/deploy-checklist/SKILL.md"), "utf8")).name).toBe("deploy-checklist");

    skills.remove("release-notes");
    expect(skills.list().map((s) => s.name)).toEqual(["deploy-checklist"]);
    expect(memory.skills().find((s) => s.name === "release-notes")?.status).toBe("rejected");
  });

  it("gives any SKILL.md the frontmatter Claude needs", () => {
    const md = withFrontmatter("Ship It", "", "# Ship it\n\nRun the checks, then tag.\n\nMore.");
    expect(frontmatter(md)).toEqual({ name: "ship-it", description: "Run the checks, then tag." });
  });
});
