import { expect, it } from "vitest";
import { fromPhone, yourWords } from "./shua-remote";

it("tells Shua the ask came from the iPhone", () => {
  expect(fromPhone("play some jazz")).toBe("From my iPhone: play some jazz");
});

it("shows your words, not the note for Shua", () => {
  expect(yourWords(fromPhone("Pause music"))).toEqual({ text: "Pause music", phone: true });
  expect(yourWords("Pause music")).toEqual({ text: "Pause music", phone: false });
  expect(yourWords("I said From my iPhone: hi")).toEqual({ text: "I said From my iPhone: hi", phone: false });
});
