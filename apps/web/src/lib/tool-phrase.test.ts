import { expect, it } from "vitest";
import { toolPhrase } from "../screens/Pages";
it("says tools the way a person would", () => {
  expect(toolPhrase("commandExecution")).toBe("a command");
  expect(toolPhrase("fileChange")).toBe("a file edit");
  expect(toolPhrase("mcp__notion__notion-search")).toBe("notion: notion search");
  expect(toolPhrase(undefined)).toBe("a tool call");
});
