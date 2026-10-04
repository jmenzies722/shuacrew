import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../lib/workflow-memory", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/workflow-memory")>(),
  useWorkflows: () => ({ phase: "idle", library: [], appNames: {}, availableApps: [{ id: "dev.sable", name: "Sable" }, { id: "com.apple.TextEdit", name: "TextEdit" }] }),
  workflowBusy: () => false,
}));
import { WorkflowLibrary } from "./WorkflowLibrary";
it("offers a direct demonstration without an app checklist or replay form", () => {
  const html = renderToStaticMarkup(<WorkflowLibrary onClose={() => {}} onAdapt={() => {}} />);
  expect(html).toContain("Watch me");
  expect(html).not.toContain("Apps to watch");
  expect(html).not.toContain('type="checkbox"');
  expect(html).not.toContain("Run workflow");
  expect(html).toContain("foreground app");
});
