import { expect, it } from "vitest";
import { parseChatAction } from "./chat-actions";

it("parses the instant commands", () => {
  expect(parseChatAction("/agent Nova as Security reviewer: checks every diff for secrets")).toEqual({ kind: "agent", name: "Nova", role: "Security reviewer", persona: "checks every diff for secrets" });
  expect(parseChatAction("/agent Quill: writes release notes")).toEqual({ kind: "agent", name: "Quill", role: undefined, persona: "writes release notes" });
  expect(parseChatAction("/agent Rex")).toEqual({ kind: "agent", name: "Rex", role: undefined, persona: undefined });
  expect(parseChatAction("/room Launch week with @Rhea @eli @rhea")).toEqual({ kind: "room", title: "Launch week", members: ["rhea", "eli"] });
  expect(parseChatAction("/room no members")).toMatchObject({ kind: "error" });
  expect(parseChatAction("/effort med")).toEqual({ kind: "effort", value: "medium" });
  expect(parseChatAction("/budget 1.5m")).toEqual({ kind: "budget", tokens: 1_500_000 });
  expect(parseChatAction("/budget off")).toEqual({ kind: "budget", tokens: null });
  expect(parseChatAction("/budget 10")).toMatchObject({ kind: "error" });
  expect(parseChatAction("/flow")).toEqual({ kind: "flow" });
  expect(parseChatAction("fix the flaky test")).toBeNull();
  expect(parseChatAction("/learn something")).toBeNull();
});
