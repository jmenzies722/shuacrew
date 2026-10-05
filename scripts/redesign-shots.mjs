// Screenshots for a look pass: the main screens, the palette, and the notch island in each state.
// Needs a gateway started with SHUACREW_DEMO=1. Usage: node scripts/redesign-shots.mjs <outDir> [base=http://127.0.0.1:7421]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://127.0.0.1:7421";
const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew": "1" }, body: JSON.stringify(body) }).then((r) => r.json());

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
await ctx.addInitScript(() => { try { localStorage.setItem("shuacrew.welcome", "2"); } catch {} });
const page = await ctx.newPage();
await page.goto(base + "/");
await page.waitForTimeout(800);
for (const ask of ["Investigate the upload timeout in parallel with subagents", "Fix the flaky upload retry test and ship it", "Audit the sync path for other real timers"])
  await post("/api/runs", { ask, runtime: "mock" });
await page.waitForTimeout(2500);
// Dismiss a first-run tour if one is up.
for (let i = 0; i < 6; i++) { const skip = page.getByRole("button", { name: /skip|done|get started|close/i }).first(); if (await skip.count() && await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); await page.waitForTimeout(200); } else break; }
for (const [name, path] of [["sessions", "/"], ["floor", "/floor"], ["board", "/board"], ["today", "/activity"], ["settings", "/settings"], ["library", "/library"]]) {
  await page.goto(base + path);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${out}/${name}.png` });
}
const first = page.locator('a[href^="/sessions/"]').first();
if (await first.count()) { await first.click(); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/session.png` }); }
await page.keyboard.press("Control+k");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/palette.png` });
await page.keyboard.press("Escape");

// The notch island: rest, live, open — on a stand-in "desktop".
const notch = await browser.newContext({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 2, colorScheme: "dark" });
await notch.addInitScript(() => {
  try {
    const c = JSON.parse(localStorage.getItem("shuacrew.companion") ?? "{}");
    localStorage.setItem("shuacrew.companion", JSON.stringify({ ...c, desktopPlacement: "notch", enabled: true }));
  } catch {}
});
const np = await notch.newPage();
await np.goto(base + "/buddy");
await np.addStyleTag({ content: "html,body{background:linear-gradient(135deg,#2b3a67,#6b4c8a 50%,#c47a5a)!important}" });
await np.evaluate(() => window.buddy?.notch?.({ w: 200, h: 32, real: true }));
await np.waitForTimeout(900);
await np.screenshot({ path: `${out}/notch-rest.png` });
await np.mouse.move(450, 14);
await np.evaluate(() => window.buddy?.nook?.(true));
await np.waitForTimeout(1200);
await np.screenshot({ path: `${out}/notch-open.png` });
await browser.close();
console.log("shots in", out);
