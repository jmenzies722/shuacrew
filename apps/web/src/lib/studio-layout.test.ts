import { expect, it } from "vitest";
import { clampCamera, deskLayout, HUB, spotFor, WORLD } from "./studio-layout";

it("lays desks out in centred rows behind your platform", () => {
  expect(deskLayout(0)).toEqual([]);
  expect(deskLayout(1)).toEqual([{ x: 500, y: 330 }]);
  expect(deskLayout(3).map((d) => d.x)).toEqual([280, 500, 720]);
  const five = deskLayout(5);
  expect(five.map((d) => d.y)).toEqual([140, 140, 140, 470, 470]);
  expect(five.slice(3).map((d) => d.x)).toEqual([390, 610]); // the short back row is centred too
  for (const d of deskLayout(12)) { expect(d.x).toBeGreaterThan(0); expect(d.x).toBeLessThan(WORLD.w); expect(d.y).toBeLessThan(HUB.y - 100); }
});

it("walks an agent to you when it needs you or brings work back, else keeps it at its desk", () => {
  const desk = { x: 280, y: 300 };
  expect(spotFor("working", desk, 0, 0)).toEqual({ x: 280, y: 248, at: "desk" });
  expect(spotFor("idle", desk, 0, 0).at).toBe("desk");
  expect(spotFor("waiting", desk, 0, 1)).toEqual({ x: 500, y: 630, at: "you" });
  // Three visitors: an arc behind your platform, the middle one farthest back, none on top of another.
  const three = [0, 1, 2].map((i) => spotFor("recent", desk, i, 3));
  expect(three[1]).toEqual({ x: 500, y: 630, at: "you" });
  expect(three[0]!.x).toBeLessThan(400); expect(three[2]!.x).toBeGreaterThan(600);
  expect(three[0]!.y).toBeGreaterThan(three[1]!.y);
  // Front-row desks stay clear of where visitors stand.
  for (const d of deskLayout(8)) expect(d.y + 32).toBeLessThan(Math.min(...three.map((p) => p.y)) - 60);
});

it("keeps the camera where the room still reads", () => {
  expect(clampCamera({ spin: 190, tilt: 90, zoom: 3 })).toEqual({ spin: -170, tilt: 74, zoom: 1.6 });
  expect(clampCamera({ spin: -200, tilt: 0, zoom: 0.1 })).toEqual({ spin: 160, tilt: 10, zoom: 0.6 });
  expect(clampCamera({ spin: -14, tilt: 56, zoom: 1 })).toEqual({ spin: -14, tilt: 56, zoom: 1 });
});
