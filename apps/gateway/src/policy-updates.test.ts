import { expect, it } from "vitest";
import { parseGitLog, policyRules } from "./policy-updates.js";

it("lists every policy rule in words, with its verdict and risk", () => {
  const rules = policyRules();
  expect(rules.length).toBeGreaterThan(5);
  expect(rules.find((r) => r.id === "deny.force-push-protected")).toMatchObject({ verdict: "deny", risk: "critical" });
  for (const r of rules) { expect(r.description).toBeTruthy(); expect(["allow", "ask", "deny"]).toContain(r.verdict); }
});

it("reads git log lines and skips anything malformed", () => {
  const out = ["9954909\x1fNotch, expanded: live\x1f1786000000", "garbage line", "zzz\x1fnot a hash\x1f1", "95d7a96\x1fToday rests\x1f1785990000"].join("\n");
  expect(parseGitLog(out)).toEqual([{ hash: "9954909", subject: "Notch, expanded: live", at: 1786000000000 }, { hash: "95d7a96", subject: "Today rests", at: 1785990000000 }]);
  expect(parseGitLog("")).toEqual([]);
});
