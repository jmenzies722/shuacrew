import { expect, it } from "vitest";
import { appendLoadedEvents } from "./event-batch";

it("appends a whole batch once per loaded run, preserving order and old references", () => {
  const loaded = { one: [{ run: "one", seq: 1 }], two: [{ run: "two", seq: 2 }] };
  const batch = [{ run: "one", seq: 3 }, { run: "unloaded", seq: 4 }, { run: "one", seq: 5 }];
  const result = appendLoadedEvents(loaded, batch);
  expect(result.one!.map(event => event.seq)).toEqual([1, 3, 5]);
  expect(result.two).toBe(loaded.two);
  expect(result).not.toHaveProperty("unloaded");
  expect(loaded.one).toHaveLength(1);
  expect(appendLoadedEvents(loaded, [])).toBe(loaded);
});

it("drops an event the run already has, so an overlap between the history load and the socket never doubles text", () => {
  const loaded = { one: [{ run: "one", seq: 1 }, { run: "one", seq: 2 }] };
  const result = appendLoadedEvents(loaded, [{ run: "one", seq: 2 }, { run: "one", seq: 3 }, { run: "one", seq: 3 }]);
  expect(result.one!.map((event) => event.seq)).toEqual([1, 2, 3]);
  expect(appendLoadedEvents(loaded, [{ run: "one", seq: 1 }])).toBe(loaded);
});
