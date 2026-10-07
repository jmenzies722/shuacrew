import { expect, it } from "vitest";
import { phoneAllowed } from "./phone-door.js";
import { toLook } from "./shua-look.js";

const svg = '<span class="spark-character ch-spark mood-idle"><svg viewBox="0 0 100 110"><defs><radialGradient id="shell-a"><stop stop-color="#ff7a59"/></radialGradient></defs><rect fill="url(#shell-a)"/></svg></span>';

it("keeps a character: markup, its animation CSS, a name and an accent", () => {
  expect(toLook({ markup: svg, css: ".spark-character{display:inline-block}", accent: "#FF7A59", name: " Shua " }, 1)).toEqual({ markup: svg, css: ".spark-character{display:inline-block}", accent: "#ff7a59", name: "Shua", at: 1 });
  expect(toLook({ markup: svg, css: "" })?.accent).toBe("#8e48ff");
});

it("refuses anything that could run or load", () => {
  for (const bad of ['<svg onload="x()"></svg>', "<svg><script>x()</script></svg>", '<svg><a href="https://x.dev"/></svg>', "<svg><foreignObject/></svg>", "not markup"]) expect(toLook({ markup: bad, css: "" })).toBeNull();
  for (const bad of ["@import 'x.css';", "a{background:url(https://x.dev/a.png)}", "</style><script>"]) expect(toLook({ markup: svg, css: bad })).toBeNull();
  expect(toLook({ markup: svg + "x".repeat(260_000), css: "" })).toBeNull();
});

it("lets the paired phone read the look and the brief, nothing more", () => {
  expect(phoneAllowed("GET", "/api/shua/look")).toBe(true);
  expect(phoneAllowed("GET", "/api/brief")).toBe(true);
  expect(phoneAllowed("POST", "/api/shua/look")).toBe(false);
});

it("carries Shua's voice, validated, so the phone speaks with the same one", () => {
  expect(toLook({ markup: svg, css: "", voiceId: "michael", voiceSpeed: 1.05 }, 1)).toMatchObject({ voiceId: "michael", voiceSpeed: 1.05 });
  const odd = toLook({ markup: svg, css: "", voiceId: "../etc", voiceSpeed: 9 }, 1)!;
  expect(odd.voiceId).toBeUndefined(); expect(odd.voiceSpeed).toBeUndefined();
});

it("knows the Mac owner's first name for the greeting", async () => {
  const { macFirstName } = await import("./shua-look.js");
  const name = macFirstName();
  expect(name === undefined || /^[\p{L}'-]+$/u.test(name)).toBe(true);
});
