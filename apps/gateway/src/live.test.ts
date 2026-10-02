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
