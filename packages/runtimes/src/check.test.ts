import { expect, it } from "vitest";
import { isCheck } from "./shared.js";

it("counts a command as a check only where a command starts", () => {
  for (const c of ["npm test", "pnpm test", "/bin/zsh -lc 'npm test'", "/bin/zsh -lc 'npm test; git diff --check'", "cd app && pnpm run typecheck", "CI=1 npx vitest run", "python -m pytest -q", "git diff --stat | cat; cargo test", "uv run pytest"])
    expect(isCheck(c), c).toBe(true);
  for (const c of [
    `/bin/zsh -lc "node --input-type=module -e 'const r = { command: \\"npm test\\", passed: 38 }; console.log(JSON.stringify(r))'"`,
    "echo 'run npm test before pushing'",
    "git diff --check",
    "cat README.md",
    "grep -rn 'pytest' docs",
  ]) expect(isCheck(c), c).toBe(false);
});
