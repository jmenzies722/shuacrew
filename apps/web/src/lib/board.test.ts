import { describe, expect, it } from "vitest";
import { boardFromFlow, boardFromLesson, boardFromVisual, kindOf, layoutBoard, readingMs, stageIndex, stages, wrapLabel } from "./board";
import type { ArchitectureLesson } from "./notch-lesson";

const lesson: ArchitectureLesson = {
  type: "architecture", version: 2, id: "url-shortener", revision: 2,
  title: "URL shortener", summary: "Short links are written once and read a lot, so reads go through a cache.",
  scope: "Proposed teaching example",
  nodes: [
    { id: "user", label: "User", role: "Clicks a short link" },
    { id: "lb", label: "Load balancer", role: "Spreads traffic", group: "Edge" },
    { id: "api", label: "API service", role: "Creates and resolves links", group: "App" },
    { id: "cache", label: "Redis cache", role: "Hot links", group: "Data" },
    { id: "db", label: "Postgres", role: "Every link", group: "Data" },
    { id: "metrics", label: "Click analytics", role: "Counts clicks", group: "App" },
  ],
  edges: [
    { id: "visit", from: "user", to: "lb", label: "GET /abc" },
    { id: "route", from: "lb", to: "api", label: "routes" },
    { id: "lookup", from: "api", to: "cache", label: "lookup" },
    { id: "miss", from: "api", to: "db", label: "on a miss" },
    { id: "count", from: "api", to: "metrics", label: "" },
  ],
  steps: [
    { id: "s1", title: "A click arrives", body: "Your click hits the load balancer, which hands it to an API server.", focus: ["user", "lb", "api"], edgeFocus: ["visit", "route"] },
    { id: "s2", title: "Cache first", body: "The API checks Redis first; most links are found there.", focus: ["cache"], edgeFocus: ["lookup"] },
    { id: "s3", title: "Database on a miss", body: "On a miss it reads Postgres and fills the cache.", focus: ["db"], edgeFocus: ["miss"] },
  ],
  example: "bit.ly", followups: ["How do you generate the short code?"],
};

describe("what each part is", () => {
  it("names parts by what they are, most specific first", () => {
    expect(["User", "Load balancer", "API gateway", "Redis cache", "Postgres", "Kafka topic", "S3 bucket", "Auth service", "Background worker", "Stripe", "Mobile app", "Feature flags"].map((l) => kindOf(l)))
      .toEqual(["user", "lb", "api", "cache", "db", "queue", "storage", "auth", "worker", "external", "client", "generic"]);
    expect(kindOf("Orders", "Stores every order")).toBe("generic");
    expect(kindOf("Orders", "Postgres table of orders")).toBe("db");
  });
});

describe("a lesson as a board", () => {
  const board = boardFromLesson(lesson);
  it("keeps the narration's key and the steps' ids, so the voice drives it", () => {
    expect(board.key).toBe("url-shortener:2");
    expect(board.steps.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(board.paced).toBe("voice");
  });
  it("draws one idea per step: the overview has the context, each step its own parts", () => {
    const s = stages(board);
    expect(s[0]).toEqual({ step: null, nodes: ["metrics"], edges: [] });
    expect(s[1]).toEqual({ step: "s1", nodes: ["user", "lb", "api"], edges: ["visit", "route", "count"] });
    expect(s[2]).toEqual({ step: "s2", nodes: ["cache"], edges: ["lookup"] });
    expect(s[3]).toEqual({ step: "s3", nodes: ["db"], edges: ["miss"] });
    // Everything is drawn exactly once.
    expect(s.flatMap((x) => x.nodes).sort()).toEqual(board.nodes.map((n) => n.id).sort());
    expect(s.flatMap((x) => x.edges).sort()).toEqual(board.edges.map((e) => e.id).sort());
  });
  it("follows the voice to a step, and starts at the overview", () => {
    expect(stageIndex(board, null)).toBe(0);
    expect(stageIndex(board, "s2")).toBe(2);
    expect(stageIndex(board, "nope")).toBe(0);
  });
  it("lays every part out without overlaps, inside its group", () => {
    const l = layoutBoard(board);
    const boxes = [...l.nodes.values()];
    for (const b of boxes) for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(v)).toBe(true);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
    const data = l.groups.find((g) => g.name === "Data")!, cache = l.nodes.get("cache")!;
    expect(cache.x >= data.x && cache.y >= data.y && cache.x + cache.w <= data.x + data.w && cache.y + cache.h <= data.y + data.h).toBe(true);
    expect(l.edges.get("lookup")!.length).toBeGreaterThanOrEqual(2);
    expect(["LR", "TB"]).toContain(l.direction);
  });
});

describe("a quick flow as a board", () => {
  it("draws one connection per step at reading pace", () => {
    const board = boardFromFlow({ type: "flow", title: "Upload path", nodes: [{ id: "c", label: "Client", kind: "client" }, { id: "s", label: "S3", kind: "storage" }, { id: "w", label: "Thumbnailer", kind: "worker" }], edges: [{ from: "c", to: "s", label: "uploads to" }, { from: "s", to: "w" }] });
    expect(board.paced).toBe("self");
    expect(stages(board).map((s) => s.nodes)).toEqual([[], ["c", "s"], ["w"]]);
    expect(board.steps[0]!.body).toBe("Client uploads to S3.");
  });
  it("only makes boards from graph-shaped visuals", () => {
    expect(boardFromVisual({ type: "steps", title: "x", steps: ["a"] })).toBeNull();
  });
});

describe("text on the board", () => {
  it("wraps a label into two lines at words", () => {
    expect(wrapLabel("Production promotion gate")).toEqual(["Production", "promotion gate"]);
    expect(wrapLabel("A very long component name that keeps going on and on")).toHaveLength(2);
  });
  it("holds a self-paced step for about as long as it takes to read", () => {
    expect(readingMs("one two")).toBe(2600);
    expect(readingMs("word ".repeat(100))).toBe(9000);
  });
});

describe("fitting the board", () => {
  it("picks the direction that fills a short, wide canvas (not a thin strip of tiny boxes)", async () => {
    const { DEMO_BOARD } = await import("../board/demo");
    const canvas = { width: 1256, height: 565 }; // the board window's canvas on a 1512×982 display
    const l = layoutBoard(DEMO_BOARD, canvas);
    const scale = Math.min(canvas.width / l.width, canvas.height / l.height);
    // Measured before: 2170×497 laid out → 0.45 scale at 978×529. Each part must stay readable.
    expect(scale).toBeGreaterThan(0.75);
    // And the groups it draws never overlap each other or another group's parts.
    for (let i = 0; i < l.groups.length; i++) for (let j = i + 1; j < l.groups.length; j++) {
      const a = l.groups[i]!, b = l.groups[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  });
});
