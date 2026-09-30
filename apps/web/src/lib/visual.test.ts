import { describe, expect, it } from "vitest";
import { countdownParts, flowLayout, parseVisual } from "./visual";

describe("visual cards", () => {
  it("reads each card Spark sends", () => {
    expect(parseVisual('```visual {"type":"stat","title":"Bitcoin","value":83979,"prefix":"$","delta":-1.8,"deltaLabel":"today"}```')).toEqual({ type: "stat", title: "Bitcoin", value: 83979, prefix: "$", delta: -1.8, deltaLabel: "today" });
    expect(parseVisual('{"type":"compare","title":"Battery","items":[{"label":"iPhone","value":31},{"label":"Pixel","value":"28"}],"better":"high"}'))
      .toEqual({ type: "compare", title: "Battery", items: [{ label: "iPhone", value: 31 }, { label: "Pixel", value: 28 }], better: "high" });
    expect(parseVisual('{"type":"forecast","title":"Tomorrow","items":[{"label":"9a","temp":64,"icon":"sun"},{"label":"3p","temp":73.4,"icon":"hail","rain":60}]}'))
      .toEqual({ type: "forecast", title: "Tomorrow", items: [{ label: "9a", temp: 64, icon: "sun" }, { label: "3p", temp: 73.4, icon: "cloud", rain: 60 }] });
    expect(parseVisual('{"type":"steps","title":"Eggs","steps":["Boil","6 min","Ice"]}')?.type).toBe("steps");
  });
  it("drops what it can't draw right (no data, bad JSON, one bar)", () => {
    expect(parseVisual('{"type":"stat","title":"x"}')).toBeNull();
    expect(parseVisual("{not json")).toBeNull();
    expect(parseVisual('{"type":"compare","items":[{"label":"a","value":1}]}')).toBeNull();
    expect(parseVisual('{"type":"pie"}')).toBeNull();
  });
});

describe("teaching cards", () => {
  it("reads a system-design flow and lays it out left to right along the request", () => {
    const v = parseVisual('{"type":"flow","title":"URL shortener","nodes":[{"id":"u","label":"User","kind":"user"},{"id":"lb","label":"LB","kind":"lb"},{"id":"api","label":"API","kind":"api"},{"id":"c","label":"Redis","kind":"cache"},{"id":"db","label":"Postgres","kind":"db"},{"id":"x","label":"Ghost","kind":"nope"}],"edges":[{"from":"u","to":"lb"},{"from":"lb","to":"api"},{"from":"api","to":"c"},{"from":"api","to":"db"},{"from":"api","to":"missing"}]}');
    expect(v?.type).toBe("flow");
    if (v?.type !== "flow") return;
    expect(v.edges).toHaveLength(4); // the edge to a node that doesn't exist is dropped
    expect(v.nodes.find((x) => x.id === "x")?.kind).toBe("service"); // unknown kind → a plain service box
    const pos = flowLayout(v.nodes, v.edges);
    expect([pos.get("u")!.col, pos.get("lb")!.col, pos.get("api")!.col, pos.get("c")!.col, pos.get("db")!.col]).toEqual([0, 1, 2, 3, 3]);
    expect(pos.get("c")!.rows).toBe(2); // cache and db side by side in the last column
  });
  it("lays out a loop without hanging", () => {
    const pos = flowLayout([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }, { from: "b", to: "a" }]);
    expect(pos.size).toBe(2);
  });
  it("reads sequences, layers, cycles and concepts; drops broken ones", () => {
    expect(parseVisual('{"type":"sequence","actors":["Client","Server"],"messages":[{"from":0,"to":1,"label":"SYN"},{"from":1,"to":5,"label":"bad"}]}')).toMatchObject({ messages: [{ label: "SYN" }] });
    expect(parseVisual('{"type":"cycle","steps":["a","b"]}')).toBeNull(); // a loop needs 3
    expect(parseVisual('{"type":"concept","term":"Idempotency","definition":"Twice = once.","points":["Safe retries"]}')).toMatchObject({ term: "Idempotency" });
    expect(parseVisual('{"type":"gauge","value":140,"max":100}')).toMatchObject({ value: 100 });
  });
});

it("reads a countdown to a real moment, and drops one without a usable time", () => {
  expect(parseVisual('```visual {"type":"countdown","title":"Crew-13","target":"2026-10-01T11:10:00","sub":"KSC"}```')).toEqual({ type: "countdown", title: "Crew-13", target: "2026-10-01T11:10:00", sub: "KSC" });
  expect(parseVisual('{"type":"countdown","title":"Kickoff","at":"2026-10-04T13:00:00-04:00"}')).toMatchObject({ target: "2026-10-04T13:00:00-04:00" });
  expect(parseVisual('{"type":"countdown","title":"Soon","target":"tomorrow-ish"}')).toBeNull();
  expect(parseVisual('{"type":"countdown","title":"No time"}')).toBeNull();
});
it("counts down in days, hours, minutes when it's far off, and to the second under a day", () => {
  const t = (d: number, h: number, m: number, s: number) => (((d * 24 + h) * 60 + m) * 60 + s) * 1000 + 400;
  expect(countdownParts(t(1, 0, 5, 9))).toEqual([{ value: 1, unit: "d" }, { value: 0, unit: "h" }, { value: 5, unit: "m" }]);
  expect(countdownParts(t(0, 20, 47, 3))).toEqual([{ value: 20, unit: "h" }, { value: 47, unit: "m" }, { value: 3, unit: "s" }]);
  expect(countdownParts(t(0, 0, 12, 4))).toEqual([{ value: 12, unit: "m" }, { value: 4, unit: "s" }]);
  expect(countdownParts(t(0, 0, 0, 7))).toEqual([{ value: 7, unit: "s" }]);
  expect(countdownParts(900)).toEqual([{ value: 0, unit: "s" }]);
  expect(countdownParts(0)).toEqual([]); expect(countdownParts(-5000)).toEqual([]);
});
