import { expect, it } from "vitest";
import { codexThreadOverrides } from "./codex.js";

it("isolates assistant conversation from coding and duplicate desktop tools while retaining connected MCP", () => {
  const overrides = codexThreadOverrides({id:"r",ask:"Explain my current lesson",cwd:"/tmp/shua",lean:true,mcpServers:{notes:{command:"notes-mcp"}}});
  expect(overrides.baseInstructions).toContain("conversational assistant");
  expect(overrides.developerInstructions).toContain("Answer questions from the supplied workspace context first");
  expect(overrides.config.features).toMatchObject({shell_tool:false,multi_agent:false,multi_agent_v2:false});
  expect(overrides.config.plugins["unified-computer-use@openai-bundled"].enabled).toBe(false);
  expect(overrides.config.mcp_servers).toEqual({notes:{command:"notes-mcp"}});
  expect(overrides.config.tools).toBeUndefined(); // Shua's quick turns don't plan
});

it("preserves full crew work tools and instructions", () => {
  const overrides = codexThreadOverrides({id:"r",ask:"Build the app",cwd:"/tmp/shua",system:"Project instructions",mcpServers:{notes:{command:"notes-mcp"}}});
  expect(overrides.baseInstructions).toBeUndefined();
  expect(overrides.developerInstructions).toBe("Project instructions");
  expect(overrides.config.plugins).toBeUndefined();
  expect(overrides.config.features).toBeUndefined();
  expect(overrides.config.tools).toEqual({ update_plan: { enabled: true } }); // work sessions can keep a plan
});
