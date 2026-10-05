// The notch island in each state, on a stand-in desktop: rest, open (quiet), open with the crew busy, typing, More.
// Needs a demo gateway (SHUACREW_DEMO=1). Usage: node scripts/notch-shots.mjs <outDir> [page=http://127.0.0.1:5199] [gateway=same]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://127.0.0.1:5199";
const gateway = process.argv[4] ?? base;
const post = (path, body) =>
  fetch(gateway + path, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew": "1" }, body: JSON.stringify(body) }).then((r) => r.json());

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 900, height: 520 }, deviceScaleFactor: 2, colorScheme: "dark" });
await ctx.addInitScript(() => {
  try {
    const c = JSON.parse(localStorage.getItem("shuacrew.companion") ?? "{}");
    localStorage.setItem("shuacrew.companion", JSON.stringify({ ...c, desktopPlacement: "notch", enabled: true }));
    localStorage.setItem("shuacrew.welcome", "2");
  } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const desk = () => page.addStyleTag({ content: "html,body{background:linear-gradient(135deg,#2b3a67,#6b4c8a 50%,#c47a5a)!important}" });
const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${name}.png` }); };

await page.goto(base + "/buddy");
await desk();
await page.evaluate(() => window.buddy?.notch?.({ w: 200, h: 32, real: true }));
await shot("1-rest");
await page.mouse.move(450, 14);
await page.evaluate(() => window.buddy?.nook?.(true));
await shot("2-open-quiet");

for (const ask of ["Fix the flaky upload retry test and ship it", "Audit the sync path for other real timers"]) await post("/api/runs", { ask, runtime: "mock" });
await page.waitForTimeout(1500);
await shot("3-open-busy");

await page.getByRole("button", { name: "Type" }).click();
await page.keyboard.type("What changed in my repos today?");
await shot("4-typing");
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "More" }).click();
await shot("5-more");
console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
console.log("shots in", out);
