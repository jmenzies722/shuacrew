import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MacTaskStatus } from "./MacTaskStatus";
import type { MacTaskProgress } from "../lib/mac-task-contract";

const render = (phase: MacTaskProgress["phase"], canResume = false) => renderToStaticMarkup(<MacTaskStatus progress={{ taskId: "task", generation: 1, phase, label: "Checking Calculator", reason: "No matching read-back" }} canResume={canResume} onResume={() => {}} onCancel={() => {}} />);

it("distinguishes verification in progress from a verified result", () => {
  expect(render("verifying")).toContain("<strong>Verifying</strong>");
  expect(render("verifying")).toContain(">Cancel</button>");
  expect(render("verified")).toContain("<strong>Verified</strong>");
  expect(render("verified")).toContain(">Dismiss</button>");
});

it("only offers Resume for a paused task with a safe checkpoint", () => {
  expect(render("paused", true)).toContain(">Resume</button>");
  expect(render("paused")).not.toContain(">Resume</button>");
  expect(render("verifying", true)).not.toContain(">Resume</button>");
  expect(render("blocked", true)).not.toContain(">Resume</button>");
});

it("labels cancelled and approval states honestly and exposes the reason", () => {
  expect(render("cancelled")).toContain("<strong>Stopped</strong>");
  expect(render("needs-approval")).toContain("<strong>Needs approval</strong>");
  expect(render("blocked")).toContain("No matching read-back");
});
