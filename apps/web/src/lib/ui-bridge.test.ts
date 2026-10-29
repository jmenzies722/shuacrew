import { expect, it } from "vitest";
import { pickPressable, risky } from "./ui-bridge";

const page = [
  { name: "Studio", role: "button" }, { name: "Above", role: "button" }, { name: "Close", role: "button" },
  { name: "Reset the view", role: "button" }, { name: "Delete agent", role: "button" }, { name: "Agents", role: "a" }, { name: "Agents", role: "a" },
];

it("presses the one control a name means: exact, then starts-with, then contains", () => {
  expect(pickPressable(page, "Above")).toEqual({ index: 1 });
  expect(pickPressable(page, "  studio ")).toEqual({ index: 0 });
  expect(pickPressable(page, "Reset")).toEqual({ index: 3 });
  expect(pickPressable(page, "the view")).toEqual({ index: 3 });
  expect(pickPressable(page, "Agents")).toEqual({ index: 5 }); // the same link twice is one choice
});

it("refuses what's missing, ambiguous, or risky", () => {
  expect(pickPressable(page, "Below")).toEqual({ error: "There's no “Below” on this ShuaCrew page." });
  expect("error" in pickPressable([{ name: "Open session", role: "button" }, { name: "Open settings", role: "button" }], "Open")).toBe(true);
  expect(pickPressable(page, "Delete agent")).toMatchObject({ error: expect.stringContaining("isn't something I press") });
  for (const n of ["Approve", "Always allow", "Merge", "Push to GitHub", "Sign out", "Send", "Reset all settings", "Factory reset"]) expect(risky(n)).toBe(true);
  for (const n of ["Studio", "Above", "Open session", "Insights", "Reset the view"]) expect(risky(n)).toBe(false);
  expect(pickPressable(page, "")).toEqual({ error: "Say which control to press." });
});

it("describes ShuaCrew's window for Shua: the page and what it can press", async () => {
  const { shuacrewPageText } = await import("./ui-bridge");
  expect(shuacrewPageText({ title: "Studio floor", path: "/floor", controls: ["Studio", "Above", "Close"] })).toBe("SHUACREW WINDOW NOW: “Studio floor” (/floor). Press its controls with ui by these exact names: Studio · Above · Close.");
  expect(shuacrewPageText({ title: "", path: "/x", controls: [] })).toContain("“/x” (/x)");
});

it("matches names as Shua copies them off the screen: quotes, full stops and ellipses aren't part of the name", async () => {
  const { FIELD } = await import("./ui-bridge");
  const tools = [{ name: "Find a tool", role: FIELD }, { name: "Add", role: "button" },
    { name: "North Fork / Greenport romantic fall getaway - Oct 25-27, 2026", role: "a" }];
  // Both failed in the action log on 2026-10-07 ("There's no “Find a tool.” on this ShuaCrew page").
  expect(pickPressable(tools, "Find a tool.")).toEqual({ index: 0 });
  expect(pickPressable(tools, "“Find a tool…”")).toEqual({ index: 0 });
  expect(pickPressable(tools, "North Fork / Greenport romantic fall getaway - Oct 25-27, 20")).toEqual({ index: 2 });
});

it("types into a field even when its name sounds risky; still never presses a risky button", async () => {
  const { FIELD } = await import("./ui-bridge");
  expect(pickPressable([{ name: "Send a message", role: FIELD }], "Send a message")).toEqual({ index: 0 });
  expect(pickPressable([{ name: "Send", role: "button" }], "Send")).toMatchObject({ error: expect.stringContaining("isn't something I press") });
});

it("tells Shua which fields it can type into", async () => {
  const { shuacrewPageText } = await import("./ui-bridge");
  expect(shuacrewPageText({ title: "Tools", path: "/integrations", controls: ["Add"], fields: ["Find a tool"] }))
    .toContain(`Type into its fields with ui {"press": field name, "text": what to type}: Find a tool.`);
});
