import { expect, it } from "vitest";
import { HUBS } from "./hubs";
import { SHUACREW_PAGES, parseActions, shuacrewNow } from "./buddy";

it("Spark's map of ShuaCrew covers every page in the navigation (add a page, and Spark must learn it)", () => {
  const known = new Set(SHUACREW_PAGES.map((p) => p.path));
  for (const hub of HUBS) for (const tab of hub.tabs) expect(known, `${hub.label} → ${tab.label} (${tab.to})`).toContain(tab.to);
  expect(known).toContain("/settings");
});

it("go only opens real ShuaCrew pages; radio only takes real commands", () => {
  expect(parseActions('```do [{"type":"go","path":"/studio"}]```')).toEqual([{ type: "go", path: "/studio" }]);
  expect(parseActions('```do [{"type":"go","path":"/settings#voice"}]```')).toEqual([{ type: "go", path: "/settings#voice" }]);
  expect(parseActions('```do [{"type":"go","path":"https://evil.example"}]```')).toEqual([]);
  expect(parseActions('```do [{"type":"radio","cmd":"play","station":"lofi jazz"}]```')).toEqual([{ type: "radio", cmd: "play", station: "lofi jazz" }]);
  expect(parseActions('```do [{"type":"radio","cmd":"format disk"}]```')).toEqual([]);
});

it("tells Spark what's really there — members, ventures, the radio — and nothing invented", () => {
  const text = shuacrewNow({ members: [{ name: "Rhea", role: "Researcher" }], ventures: ["Leash"], radio: { on: "Chillhop Radio", stations: ["Chillhop Radio"] } });
  expect(text).toContain("Rhea (Researcher)"); expect(text).toContain("Leash"); expect(text).toContain("playing Chillhop Radio");
  expect(shuacrewNow({ members: [], ventures: [], radio: { on: null, stations: [] } })).toContain("No crew members yet.");
});

import { localAsk, localSystem } from "./buddy";
it("keeps Spark's local prompt compact and identical from call to call (so it caches)", () => {
  const persona = { name: "Shua", tone: "chill" as const, length: "brief" as const, goal: "AI Platform Engineer", memory: ["Deploys on Fridays"] };
  const a = localSystem(persona), b = localSystem({ ...persona });
  expect(a).toBe(b);
  expect(a.length).toBeLessThan(5600); // ~1,300 tokens, read once and cached, versus ~3,300 re-read for the full prompt
  expect(a).toMatch(/radio/i);
  expect(a).toMatch(/```do/); expect(a).toMatch(/Studio/); expect(a).toMatch(/AI Platform Engineer/);
  const ask = localAsk("what time is it?", { now: new Date(2026, 8, 26, 9, 5) });
  expect(ask.split("\n\n[screen]")[0]).toBe("what time is it?"); // the chat shows only the question
  expect(ask).toMatch(/Saturday/);
});
