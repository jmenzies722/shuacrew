import { expect, it } from "vitest";
import { commandArguments } from "./integration-setup";

it("preserves spaces and literal shell characters in structured arguments", () => {
  expect(commandArguments('["/Users/me/My Project", "$(touch file)", ""]')).toEqual(["/Users/me/My Project", "$(touch file)", ""]);
  expect(commandArguments("")).toEqual([]);
});

it("rejects malformed or non-string argument lists", () => {
  for (const input of ['"arg"', '{}', '[1]', '[null]', '["unfinished"']) {
    expect(() => commandArguments(input)).toThrow("Arguments must be a JSON array of strings");
  }
});
