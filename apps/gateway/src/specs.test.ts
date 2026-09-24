import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventStore } from "./store.js";
import { Specs, draftDesign, draftRequirements, draftTasks, taskLines } from "./specs.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup() {
  const store = new EventStore(":memory:");
  const launched: Array<{ ask: string; inPlace?: boolean; approveAll?: boolean }> = [];
  const specs = new Specs(store, (spec) => {
    launched.push({ ask: spec.ask, inPlace: spec.inPlace, approveAll: spec.approveAll });
    return `r_${launched.length}`;
  });
  cleanups.push(() => store.close());
  return { specs, launched };
}

describe("spec drafts", () => {
  it("turns an ask into EARS, a design, and checkbox tasks", () => {
    const requirements = draftRequirements("Upload retry", "Retry an upload when the clock jumps.");
    expect(requirements).toContain("THE SYSTEM SHALL Retry an upload when the clock jumps");
    const design = draftDesign(requirements);
    expect(design).toContain("## 1.");
    const tasks = draftTasks(design);
    expect(taskLines(tasks).length).toBeGreaterThan(0);
  });
});

describe("spec phases", () => {
  it("approves requirements, then design, then fans tasks onto the board", () => {
    const { specs, launched } = setup();
    const repo = mkdtempSync(path.join(os.tmpdir(), "shua-spec-"));
    const opened = specs.open("Retry an upload when the clock jumps.", repo);
    expect(opened.phase).toBe("requirements");
    expect(opened.text).toContain("WHEN someone asks");
    expect(opened.planning).toBe("r_1");
    expect(launched[0]).toMatchObject({ ask: expect.stringContaining("requirements.md"), inPlace: true, approveAll: true });

    const designed = specs.approve(opened.id);
    expect(designed.phase).toBe("design");
    expect(designed.approved).toEqual(["requirements"]);

    const tasked = specs.approve(designed.id);
    expect(tasked.phase).toBe("tasks");
    const noted = specs.comment(tasked.id, 3, "Split the cache step.");
    expect(noted.comments).toEqual([{ phase: "tasks", line: 3, text: "Split the cache step." }]);

    const fanned = specs.approve(tasked.id);
    expect(fanned.runs.length).toBeGreaterThan(0);
    expect(launched.length).toBe(3 + fanned.runs.length);
    expect(fanned.approved).toContain("tasks");
  });

  it("refuses a repo that is not a directory", () => {
    const { specs } = setup();
    expect(() => specs.open("hello", path.join(os.tmpdir(), "shua-missing-repo"))).toThrow(/directory/);
  });
});
