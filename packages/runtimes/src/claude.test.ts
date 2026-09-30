import { describe, expect, it } from "vitest";


import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withImages } from "./claude.js";
describe("screenshots go to Claude as images, not files to open", () => {
  const dir = mkdtempSync(join(tmpdir(), "uploads-")), shot = join(dir, "u_1", "screen.jpg");
  mkdirSync(join(dir, "u_1")); writeFileSync(shot, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
  it("turns an attached screenshot into an image block after the text", () => {
    const out = withImages(`What's this?\n\nAttached files:\n- ${shot} (image/jpeg, 259 KB) · u_1`, dir) as Array<Record<string, any>>;
    expect(out[0]!.type).toBe("text");
    expect(out[0]!.text).toContain("screen.jpg (attached below as an image");
    expect(out[1]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
  });
  it("leaves anything outside ShuaCrew's uploads, or with no images, as plain text", () => {
    expect(withImages("hello", dir)).toBe("hello");
    expect(withImages("- /etc/passwd.png (image/png, 1 KB)", dir)).toBe("- /etc/passwd.png (image/png, 1 KB)");
  });
});
