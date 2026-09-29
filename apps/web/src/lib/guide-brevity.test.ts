import { expect, it } from "vitest";
import { actFollowUp, guideFollowUp, screenText } from "./buddy";

const screen = { width: 1856, height: 1083, text: [{ t: "fema.org", x: 0.2, y: 0.3, w: 0.05, h: 0.01 }, { t: "Press Start application", x: 0.9, y: 0.7, w: 0.1, h: 0.01 }] };

it("keeps screen text behind the [screen] marker, so the chat never shows it as something you said", () => {
  for (const msg of [guideFollowUp("Click Share", screen), actFollowUp("Click “Send”", true, screen, 2, 25)]) {
    const [shown, hidden] = msg.split("\n\n[screen]");
    expect(shown).not.toContain("fema.org");
    expect(hidden).toContain("fema.org");
  }
});

it("asks for a one-line reply on every guided step and marks screen text as OCR, not the user", () => {
  expect(guideFollowUp("Click Share", screen)).toMatch(/ONE short sentence/);
  expect(actFollowUp("Click “Send”", true, screen, 2, 25)).toMatch(/ONE short sentence/);
  expect(screenText(screen.text)).toMatch(/not typed by the user/);
});
