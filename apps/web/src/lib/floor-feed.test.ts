import { expect, it } from "vitest";
import { plainCommand } from "../screens/CrewFloor";
it("drops the shell wrapper the runtimes add", () => {
  expect(plainCommand("/bin/zsh -lc 'swift test --filter Cursor'")).toBe("swift test --filter Cursor");
  expect(plainCommand('bash -c "pnpm test"')).toBe("pnpm test");
  expect(plainCommand("git status")).toBe("git status");
});
