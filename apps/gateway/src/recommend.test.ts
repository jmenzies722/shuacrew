import { describe, expect, it } from "vitest";
import { FEATURED } from "./catalog.js";
import { recommend } from "./recommend.js";

const base = { featured: FEATURED, added: [] as string[], skills: [{ name: "pptx", description: "Create and edit PowerPoint slide decks and presentations with layouts." }, { name: "pdf-forms", description: "Fill PDF forms." }], installed: [] as string[] };

describe("recommendations in the chat", () => {
  it("suggests the connection for the kind of work, and the one you named first", () => {
    expect(recommend("deploy my next.js app so I can share a preview url", base).mcp.map((r) => r.id)).toContain("vercel");
    expect(recommend("why is production crashing with these exceptions", base).mcp[0]).toMatchObject({ id: "sentry", oauth: true });
    expect(recommend("add payments and subscriptions to my app, maybe in Notion track it", base).mcp.map((r) => r.id)).toEqual(["notion", "stripe"]);
  });
  it("skips what's already connected, and stays quiet on small talk", () => {
    expect(recommend("deploy my next.js app to production", { ...base, added: ["vercel"] }).mcp.map((r) => r.id)).not.toContain("vercel");
    expect(recommend("hi there!", base)).toEqual({ mcp: [], skills: [] });
    expect(recommend("what's a good name for my dog", base).mcp).toEqual([]);
  });
  it("suggests a skill that matches, unless it's installed", () => {
    expect(recommend("make a slide deck presentation about our launch", base).skills[0]?.name).toBe("pptx");
    expect(recommend("make a slide deck presentation about our launch", { ...base, installed: ["pptx"] }).skills).toEqual([]);
  });
});
