import { expect, it } from "vitest";
import { plain, prose, skillDescription } from "./plain";
it("turns an agent's markdown line into plain words", () => {
  expect(plain("**Scope:** Spark and study chats excluded")).toBe("Scope: Spark and study chats excluded");
  expect(plain("- Ran `pnpm test` and see [the log](http://x)")).toBe("Ran pnpm test and see the log");
  expect(plain("## Done 🚀")).toBe("Done");
  expect(plain(undefined)).toBe("");
});

it("turns a markdown reply into flowing prose for the notch", () => {
  expect(prose("**Three moves** this week:\n\n- Ship the *pricing* page\n- Email `5` leads\n1. Review cards")).toBe("Three moves this week: Ship the pricing page. Email 5 leads. Review cards.");
  expect(prose("## Your day\nMostly clear, one meeting at **3 PM**.")).toBe("Your day: Mostly clear, one meeting at 3 PM.");
  expect(prose("| Plan | Price |\n|---|---|\n| Pro | $20 |")).toBe("Plan · Price Pro · $20");
  expect(prose("See [the docs](https://x.dev) and __this__.")).toBe("See the docs and this.");
});
it("never shows half-typed marks while a reply streams in", () => {
  expect(prose("It's **bol")).toBe("It's bol");
  expect(prose("Here's the code:\n```ts\nconst a = 1")).toBe("Here's the code:");
  expect(prose("snake_case_name stays")).toBe("snake_case_name stays");
});


it("reads a skill's description from any YAML form", () => {
  expect(skillDescription(`---\nname: a\ndescription: "Fill PDF forms."\n---\nbody`)).toBe("Fill PDF forms.");
  expect(skillDescription(`---\nname: a\ndescription: >\n  Stop and check this\n  before finishing \\u{2014} it helps.\nlicense: MIT\n---\n`)).toBe("Stop and check this before finishing — it helps.");
  expect(skillDescription(`---\ndescription: |-\n  Build apps with the Claude API.\n---`)).toBe("Build apps with the Claude API.");
  expect(skillDescription("no frontmatter")).toBeUndefined();
});
