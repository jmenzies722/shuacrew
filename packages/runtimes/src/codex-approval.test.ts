import { expect, it, vi } from "vitest";
import { codexMcpApproval } from "./codex-approval.js";
it("routes simple MCP consent through Shua policy and returns protocol-correct decisions", async () => {
  const approve = vi.fn(async () => ({ allow: true, reason: "user approved" }));
  expect(await codexMcpApproval({ serverName: "music", mode: "form", message: "Play song?", requestedSchema: { type: "object", properties: {} } }, approve)).toEqual({ action: "accept", content: {} });
  expect(approve).toHaveBeenCalledWith("mcp__music__permission", expect.objectContaining({ message: "Play song?" }));
  expect(await codexMcpApproval({ serverName: "music", mode: "url", url: "https://example.test", message: "Sign in" }, async () => ({ allow: false }))).toEqual({ action: "decline" });
});
it("asks about the tool Codex wants to run by its real name, so Shua's rules for it apply", async () => {
  const approve = vi.fn(async () => ({ allow: true }));
  await codexMcpApproval({ serverName: "shuacrew", mode: "form", message: 'Allow the shuacrew MCP server to run tool "search_library"?', requestedSchema: { type: "object", properties: {} } }, approve);
  expect(approve).toHaveBeenCalledWith("mcp__shuacrew__search_library", expect.anything());
  await codexMcpApproval({ serverName: "shuacrew", mode: "url", url: "https://x.test", message: 'run tool "search_library"' }, approve);
  expect(approve).toHaveBeenLastCalledWith("mcp__shuacrew__permission", expect.anything()); // a sign-in link is still consent, not a tool call
});
it("does not fabricate form answers or device verification proofs", async () => {
  const approve = vi.fn();
  expect(await codexMcpApproval({ serverName: "x", mode: "form", requestedSchema: { required: ["secret"] } }, approve)).toEqual({ action: "decline" });
  expect(await codexMcpApproval({ serverName: "x", mode: "openai/userVerification" }, approve)).toEqual({ action: "decline" });
  expect(approve).not.toHaveBeenCalled();
});
