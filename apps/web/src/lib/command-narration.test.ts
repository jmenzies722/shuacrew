import { expect, it } from "vitest";
import { commandAnnouncement } from "./command-narration";

it("identifies the member and command purpose without reading arguments", () => {
  const run = { id: "r1", title: "Frame audit", status: "running", member: "engineer" };
  expect(commandAnnouncement("commandExecution", { command: ["/bin/zsh", "-lc", "pnpm test --token secret"] }, run, { engineer: "Eli" })).toBe("Eli requested to run the tests for “Frame audit”.");
  expect(commandAnnouncement("Bash", { command: "find /tmp/project -name '*.swift'" }, run, {})).toContain("find files or folders");
});
it("does not invent a purpose for arbitrary scripts or announce unrelated tools", () => {
  const run = { id: "r1", title: "Frame audit", status: "running" };
  expect(commandAnnouncement("commandExecution", { command: "node -e 'secret()'" }, run, {})).toContain("custom command");
  expect(commandAnnouncement("Read", { path: "/tmp/project" }, run, {})).toBeNull();
  expect(commandAnnouncement("Bash", { command: "npm test; rm -rf /tmp/example" }, run, {})).toContain("complex command");
  expect(commandAnnouncement("Bash", { command: "npm test" }, { ...run, archived: true }, {})).toBeNull();
});
