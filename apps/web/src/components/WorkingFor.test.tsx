import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatElapsed, WorkingFor, workingLabel } from "./WorkingFor";

describe("WorkingFor (a wait that never looks stuck)", () => {
  it("says what's happening and reserves the timer slot without a zero-second counter", () => {
    const markup = renderToStaticMarkup(<WorkingFor />);
    expect(markup).toContain("Thinking…");
    expect(markup).toContain('<time class="working-for"');
    expect(markup).toContain("visibility:hidden");
  });
  it("keeps a specific label and moves plain thinking on after 20 s", () => {
    expect(workingLabel("Thinking…", 5)).toBe("Thinking…");
    expect(workingLabel("Thinking…", 20)).toBe("Still working…");
    expect(workingLabel("Reading your screen…", 45)).toBe("Reading your screen…");
  });
  it("counts seconds, then minutes", () => {
    expect(formatElapsed(9)).toBe("9s");
    expect(formatElapsed(75)).toBe("1:15");
  });
});
