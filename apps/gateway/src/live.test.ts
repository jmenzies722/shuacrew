import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE_CHANNELS, liveBackendInstructions, livePrompt, permissionArgs, touchesProtected } from "./live.js";

describe("live voice", () => {
  const sealed = [path.join(os.homedir(), "Nectar-Work"), "~/Developer/work"];
  it("denies protected folders in the sandbox itself, and writes only in the live workspace", () => {
    const args = permissionArgs("/tmp/live", sealed);
    expect(args.slice(0, 2)).toEqual(["-c", 'default_permissions="shua_live"']);
    expect(args[3]).toContain('":root" = "read"');
    expect(args[3]).toContain('"/tmp/live" = "write"');
    expect(args[3]).toContain(`"${path.join(os.homedir(), "Nectar-Work")}" = "deny"`);
    expect(args[3]).toContain(`"${path.join(os.homedir(), "Developer/work")}" = "deny"`);
  });
  it("refuses escalations that touch a protected folder however it's spelled", () => {
    expect(touchesProtected("cat ~/Nectar-Work/notes.md", sealed)).toBe(true);
    expect(touchesProtected("ls $HOME/Developer/work", sealed)).toBe(true);
    expect(touchesProtected(`open ${os.homedir()}/Developer/projects/app`, sealed)).toBe(false);
  });
  it("tags backend messages so only results are spoken, and keeps the voice honest", () => {
    expect(LIVE_CHANNELS.final).toEqual(["[COMPLETE]"]);
    expect(liveBackendInstructions(sealed)).toMatch(/\[STATUS\].*\[COMPLETE\]/s);
    expect(liveBackendInstructions(sealed)).toContain("Nectar-Work");
    expect(livePrompt("Shua")).toMatch(/Never say something is done or found before the backend says so/);
  });
});

describe("live truth guard", async () => {
  const { unsupportedClaims } = await import("./live.js");
  it("catches specifics the result never said", () => {
    expect(unsupportedClaims("You’ve got Lunch at noon.", "Your connected Google Calendar shows no events today, October 2. What's on my calendar today")).toEqual(expect.arrayContaining(["Lunch", "noon"]));
    expect(unsupportedClaims("The secret word is moonlight.", "The secret word is pineapple.")).toEqual([]); // lower-case new words aren't specific enough to flag
    expect(unsupportedClaims("Your dentist is at 3 PM.", "Today: 3:00 PM Dentist (Dr. Lee)")).toEqual([]);
    expect(unsupportedClaims("You have 4 events.", "Today: 3:00 PM Dentist, 6:30 PM Dinner with Sam")).toEqual(["4"]);
  });
  it("lets paraphrase through", () => {
    expect(unsupportedClaims("Nothing on your calendar today.", "Your connected Google Calendar shows no events today, October 2.")).toEqual([]);
    expect(unsupportedClaims("It's in your Downloads folder, Josh.", "Found lease.pdf in ~/Downloads. user Josh")).toEqual([]);
  });
});

describe("live transcript", async () => {
  const { transcriptMarkdown } = await import("./live.js");
  it("keeps who said what and the results", () => {
    const md = transcriptMarkdown([{ role: "user", text: "What's on today?", at: 0 }, { role: "assistant", text: "A dentist at 3.", at: 1000 }], ["Today: 3 PM Dentist"]);
    expect(md).toContain("**You**");
    expect(md).toContain("**Shua**");
    expect(md).toContain("## Results");
    expect(md).toContain("- Today: 3 PM Dentist");
  });
});
