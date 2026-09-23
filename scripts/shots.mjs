// Screenshots of the live dashboard, driven headless (never takes focus).
// Usage: node scripts/shots.mjs <outDir> [base=http://127.0.0.1:7421]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://127.0.0.1:7421";
const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew": "1" }, body: JSON.stringify(body) }).then((r) => r.json());

const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 1480, height: 920 }, deviceScaleFactor: 2, colorScheme: theme });
  await page.goto(base + "/");
  await page.waitForTimeout(600);
  if (theme === "dark") {
    await post("/api/runs", { ask: "Investigate the upload timeout in parallel with subagents", runtime: "mock" });
    await post("/api/runs", { ask: "Fix the flaky upload retry test and ship it", runtime: "mock" });
    await post("/api/runs", { ask: "Audit the sync path for other real timers", runtime: "mock" });
    await page.waitForTimeout(2600);
  }
  await page.screenshot({ path: `${out}/mission-${theme}.png` });
  const firstCard = page.locator('a[href^="/runs/"]').first();
  if (await firstCard.count()) {
    await firstCard.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/run-${theme}.png` });
  }
  await page.goto(base + "/board");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/board-${theme}.png` });
  if (theme === "dark") {
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/palette-${theme}.png` });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+n");
    await page.waitForTimeout(400);
    await page.keyboard.type("Find why the nightly deploy pipeline is slow and fix it");
    await page.screenshot({ path: `${out}/launch-${theme}.png` });
    await page.keyboard.press("Escape");
  }
  const narrow = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  await narrow.goto(base + "/");
  await narrow.waitForTimeout(800);
  await narrow.screenshot({ path: `${out}/mission-narrow-${theme}.png` });
}
await browser.close();
console.log("shots in", out);
