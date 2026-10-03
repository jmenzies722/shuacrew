import { describe, expect, it } from "vitest";
import { decide, defaultContext, defaultRules, normalise } from "@shuacrew/core";
import { assistantMustAsk } from "./assistant-policy.js";

const judge = (command: string) => decide(normalise("Bash", { command }), defaultContext("/tmp/ws"), [{ name: "global", rules: defaultRules() }]);

describe("assistantMustAsk", () => {
  it("lets the assistant just do what no rule worries about", () => {
    expect(judge("open -a Calendar").rule).toBe("default.ask");
    expect(assistantMustAsk(judge("open -a Calendar"))).toBe(false);
    expect(assistantMustAsk(judge("ls ~/Desktop"))).toBe(false);
  });
  it("still stops for what a rule asks about on purpose", () => {
    expect(assistantMustAsk(judge("git push origin main"))).toBe(true);
  });
});
