import { expect, it, vi } from "vitest";
import { codexMcpApproval } from "./codex-approval.js";
it("routes simple MCP consent through Shua policy and returns protocol-correct decisions", async () => {
  const approve = vi.fn(async () => ({ allow: true, reason: "user approved" }));
  expect(await codexMcpApproval({ serverName: "music", mode: "form", message: "Play song?", requestedSchema: { type: "object", properties: {} } }, approve)).toEqual({ action: "accept", content: {} });
  expect(approve).toHaveBeenCalledWith("mcp__music__permission", expect.objectContaining({ message: "Play song?" }));
  expect(await codexMcpApproval({ serverName: "music", mode: "url", url: "https://example.test", message: "Sign in" }, async () => ({ allow: false }))).toEqual({ action: "decline" });
});
it("does not fabricate form answers or device verification proofs", async () => {
  const approve = vi.fn();
  expect(await codexMcpApproval({ serverName: "x", mode: "form", requestedSchema: { required: ["secret"] } }, approve)).toEqual({ action: "decline" });
  expect(await codexMcpApproval({ serverName: "x", mode: "openai/userVerification" }, approve)).toEqual({ action: "decline" });
  expect(approve).not.toHaveBeenCalled();
});
