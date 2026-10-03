import { expect, it } from "vitest";
import { layoutArchitecture } from "./architecture-layout";
import { normalizeArchitecture } from "./notch-lesson";

it("lays out cycles and disconnected Unicode nodes without losing edges or overlapping boxes", () => {
  const lesson = normalizeArchitecture({ title: "Video", summary: "A proposed system", example: "Watch a film", nodes: [{ id: "client", label: "視聴クライアント" }, { id: "api", label: "API" }, { id: "store", label: "Storage" }, { id: "offline", label: "Offline" }], edges: [{ from: "client", to: "api" }, { from: "api", to: "client" }, { from: "api", to: "store" }], steps: [{ title: "Watch", body: "Request a film", focus: ["client"] }] })!;
  const result = layoutArchitecture(lesson);
  expect(result).toEqual(layoutArchitecture(lesson));
  expect(result.nodes).toHaveLength(4);
  expect(result.edges).toHaveLength(3);
  expect(result.nodes[0]!.x).toBeLessThan(result.nodes[1]!.x);
  expect(result.nodes[1]!.x).toBeLessThan(result.nodes[2]!.x);
  for (const node of result.nodes) for (const other of result.nodes) {
    if (node.id !== other.id) expect(node.x + node.width <= other.x || other.x + other.width <= node.x || node.y + node.height <= other.y || other.y + other.height <= node.y).toBe(true);
  }
  for (const edge of result.edges) expect(edge.points.length).toBeGreaterThanOrEqual(4);
});
it("routes a skip-rank edge outside the intermediate component", () => {
  const lesson = normalizeArchitecture({ title: "Path", summary: "Example", example: "Request", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { id: "skip", from: "a", to: "c" }], steps: [{ title: "Step", body: "Explanation" }] })!;
  const layout = layoutArchitecture(lesson), middle = layout.nodes[1]!;
  const route = layout.edges.find(edge => edge.id === "skip")!;
  for (let index = 1; index < route.points.length; index++) {
    const start = route.points[index - 1]!, end = route.points[index]!;
    const crosses = start.y === end.y && start.y > middle.y && start.y < middle.y + middle.height && Math.min(start.x, end.x) < middle.x + middle.width && Math.max(start.x, end.x) > middle.x;
    expect(crosses).toBe(false);
  }
});
