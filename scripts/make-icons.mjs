// Every ShuaCrew icon from one drawing (scripts/brand/mark.mjs): the Mac app icon (.icns on the macOS grid),
// the iPhone and Watch app icons (full-bleed 1024s the system masks), and the web favicon.
// Run: node scripts/make-icons.mjs   (needs Playwright's Chromium and macOS iconutil)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { mark } from "./brand/mark.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
/** One variant at `px` square. iOS/watchOS icons must be opaque; the Mac's keeps its transparent margin. */
async function png(variant, px, file, opaque = false) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:${opaque ? "#000" : "transparent"}}svg{display:block;width:${px}px;height:${px}px}</style>${mark(variant, "i")}`);
  await page.screenshot({ path: file, omitBackground: !opaque, clip: { x: 0, y: 0, width: px, height: px } });
}

// macOS: an .iconset at every size, then iconutil.
const tmp = mkdtempSync(path.join(os.tmpdir(), "shuacrew-icons-"));
const set = path.join(tmp, "AppIcon.iconset");
mkdirSync(set);
for (const s of [16, 32, 128, 256, 512]) {
  await png("mac", s, path.join(set, `icon_${s}x${s}.png`));
  await png("mac", s * 2, path.join(set, `icon_${s}x${s}@2x.png`));
}
execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(root, "apps/mac/Resources/AppIcon.icns")]);
rmSync(tmp, { recursive: true, force: true });

// iPhone and Watch: one 1024 each (Xcode derives the rest), in their asset catalogs.
for (const [dir, platform] of [["apps/ios/Resources/Assets.xcassets", "ios"], ["apps/watch/Resources/Assets.xcassets", "watchos"]]) {
  const icon = path.join(root, dir, "AppIcon.appiconset");
  mkdirSync(icon, { recursive: true });
  writeFileSync(path.join(root, dir, "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n");
  await png("ios", 1024, path.join(icon, "AppIcon.png"), true);
  writeFileSync(path.join(icon, "Contents.json"), JSON.stringify({ images: [{ filename: "AppIcon.png", idiom: "universal", platform, size: "1024x1024" }], info: { author: "xcode", version: 1 } }, null, 2) + "\n");
}

// Web: the tile, cropped to the squircle, as the favicon.
writeFileSync(path.join(root, "apps/web/public/icon.svg"), mark("mac", "f").replace('viewBox="0 0 1024 1024"', 'viewBox="90 90 844 844"') + "\n");
await browser.close();
console.log("icons written: AppIcon.icns, iOS + watchOS AppIcon.appiconset, web icon.svg");
