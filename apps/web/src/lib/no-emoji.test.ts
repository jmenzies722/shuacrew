import { expect, it } from "vitest";
import { noEmoji } from "./no-emoji";
it("removes emoji and keeps text symbols and code", () => {
  expect(noEmoji("Shipped 🚀 it ✅")).toBe("Shipped it ");
  expect(noEmoji("👩‍💻 dev 👍🏽")).toBe(" dev ");
  expect(noEmoji("A → B © 2026 ✓ done")).toBe("A → B © 2026 ✓ done");
  expect(noEmoji("```js\nconst x = 1;\n```")).toBe("```js\nconst x = 1;\n```");
  expect(noEmoji("❤️ thanks")).toBe(" thanks");
});
