import { expect, it } from "vitest";
import { plain } from "./plain";
it("turns an agent's markdown line into plain words", () => {
  expect(plain("**Scope:** Spark and study chats excluded")).toBe("Scope: Spark and study chats excluded");
  expect(plain("- Ran `pnpm test` and see [the log](http://x)")).toBe("Ran pnpm test and see the log");
  expect(plain("## Done 🚀")).toBe("Done");
  expect(plain(undefined)).toBe("");
});
