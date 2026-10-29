// Studio look: every main screen of the window, dark and light, at the Mac window's size (1440×900 @2x). Headless,
// never takes focus. Point it at a scratch gateway (a copy of the data, SHUACREW_DEMO=1), never the live one.
// Usage: node scripts/studio-shots.mjs <outDir> <prefix> [base=http://127.0.0.1:7431] [routes=a,b,c]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [out = "shots", prefix = "shot", base = "http://127.0.0.1:7431", only] = process.argv.slice(2);
const ROUTES = only ? only.split(",") : ["/", "@thread", "/activity", "/floor", "/crew", "/ventures", "/board", "/library", "/studio", "/integrations", "/usage", "/settings"];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  page.on("pageerror", (e) => console.log(`[${theme}] page error: ${e.message.slice(0, 160)}`));
  // As a set-up window is: first-run setup done (components/Welcome.tsx), so screens aren't behind it.
  await page.addInitScript(() => { try { localStorage.setItem("shuacrew.welcome", "3"); } catch {} });
  await page.goto(base + "/");
  await page.waitForTimeout(1500);
  for (const route of ROUTES) {
    if (route === "@thread") {
      // The newest thread the window lists (it may sit in a folded group, so go to it rather than click it).
      const href = await page.locator('a[href^="/sessions/"], a[href^="/runs/"]').first().getAttribute("href", { timeout: 3000 }).catch(() => null);
      if (!href) { console.log(`[${theme}] no thread link`); continue; }
      await page.evaluate((r) => { history.pushState({}, "", r); dispatchEvent(new PopStateEvent("popstate")); }, href);
    } else {
      await page.evaluate((r) => { history.pushState({}, "", r); dispatchEvent(new PopStateEvent("popstate")); }, route);
    }
    await page.waitForTimeout(1200);
    const name = route === "/" ? "home" : route.replace(/^[/@]/, "").replace(/\//g, "-");
    await page.screenshot({ path: `${out}/${prefix}-${theme}-${name}.png` });
  }
  await page.close();
}
await browser.close();
console.log("done");
