import { describe, expect, it } from "vitest";
import { expandAsk } from "./chat-commands.js";

describe("chat commands", () => {
  it("puts the skill on the ask the runtime sees", () => {
    expect(expandAsk("/skill pdf summarise this", [{ name: "pdf", body: "Extract tables." }], [])).toBe("summarise this\n\nSkill: pdf\nExtract tables.");
  });

  it("names the MCP server the turn should use", () => {
    expect(expandAsk("/mcp github open my PRs", [], [{ name: "github" }])).toBe('Use the MCP server "github".\n\nopen my PRs');
  });

  it("leaves a normal message alone", () => {
    expect(expandAsk("just fix the test", [], [])).toBe("just fix the test");
  });

  it("refuses a name that isn't installed", () => {
    expect(() => expandAsk("/skill missing hello", [], [])).toThrow(/no skill missing/);
    expect(() => expandAsk("/mcp missing hello", [], [])).toThrow(/no MCP server missing/);
  });
});
