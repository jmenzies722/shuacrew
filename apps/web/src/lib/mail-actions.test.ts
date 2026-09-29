import { expect, it } from "vitest";
import { describeAction, parseActions } from "./buddy";

const one = (json: string) => parseActions("```do [" + json + "]```");

it("reads and drafts mail, with only well-formed requests getting through", () => {
  expect(one('{"type":"mail","op":"unread"}')).toEqual([{ type: "mail", op: "unread" }]);
  expect(one('{"type":"mail","op":"search","query":"invoice","limit":5}')).toEqual([{ type: "mail", op: "search", query: "invoice", limit: 5 }]);
  expect(one('{"type":"mail","op":"read","id":4812}')).toEqual([{ type: "mail", op: "read", id: 4812 }]);
  expect(one('{"type":"mail","op":"draft","to":"sam@example.com","subject":"Hi","body":"Thanks!"}')).toEqual([{ type: "mail", op: "draft", to: "sam@example.com", subject: "Hi", body: "Thanks!" }]);
});

it("refuses anything that isn't reading or drafting", () => {
  expect(one('{"type":"mail","op":"send","to":"a@b.com","body":"x"}')).toEqual([]);
  expect(one('{"type":"mail","op":"delete","id":1}')).toEqual([]);
  expect(one('{"type":"mail","op":"search"}')).toEqual([]);
  expect(one('{"type":"mail","op":"read","id":"1; do shell script"}')).toEqual([]);
  expect(one('{"type":"mail","op":"draft","to":"not an address","body":"x"}')).toEqual([]);
  expect(one('{"type":"mail","op":"unread","limit":500}')).toEqual([{ type: "mail", op: "unread" }]);
});

it("says plainly what it's doing, and that drafts aren't sent", () => {
  expect(describeAction({ type: "mail", op: "draft", to: "sam@example.com", subject: "", body: "x" })).toMatch(/not sent/);
  expect(describeAction({ type: "mail", op: "search", query: "invoice" })).toBe("Search mail for “invoice”");
});
