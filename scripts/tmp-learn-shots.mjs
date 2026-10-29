// Temporary: screenshot every Learn tab on the sandbox. Delete after use.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await ctx.addInitScript(() => { try { localStorage.setItem("shuacrew.welcome", "3"); localStorage.setItem("shuacrew.setup.later", String(Date.now())); localStorage.removeItem("shuacrew.learn.tab"); } catch {} });
const p = await ctx.newPage(); p.on("pageerror", (e) => console.log("JS error:", e.message));
await p.goto("http://127.0.0.1:7434/learn"); await p.waitForTimeout(2500);
for (const tab of ["Today", "Journey", "Library"]) {
  const btn = p.locator(`.cr-seg button:has-text("${tab}")`).first();
  if (await btn.count()) { await btn.click().catch(() => {}); await p.waitForTimeout(1300); }
  await p.screenshot({ path: `${out}/${tab.toLowerCase()}.png`, fullPage: true });
}
await b.close(); console.log("done");
