// Review cockpit screenshots: two parallel repo runs → review → merge. Headless.
import { chromium } from "@playwright/test";
const [out, base, repo] = process.argv.slice(2);
const post = (p, b) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew": "1" }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p) => fetch(base + p).then((r) => r.json());
const a = (await post("/api/runs", { ask: "Add the injected clock to retry", runtime: "mock", repo })).id;
const b = (await post("/api/runs", { ask: "Add the injected clock to sync", runtime: "mock", repo })).id;
for (let i = 0; i < 100; i++) {
  const s = await get("/api/snapshot");
  if ([a, b].every((id) => s.runs[id]?.status === "reviewing")) break;
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
await page.goto(`${base}/review/${a}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/review.png` });
await page.locator(".cm-mergeView .cm-editor").nth(1).locator(".cm-lineNumbers .cm-gutterElement").nth(3).dispatchEvent("mousedown");
await page.waitForTimeout(300);
await page.keyboard.type("Pass the clock in from the uploader instead of calling Date.now() here");
await page.screenshot({ path: `${out}/review-comment.png` });
await page.keyboard.press("Meta+Enter");
await page.goto(`${base}/runs/${a}`);
await page.waitForTimeout(900);
await page.getByRole("tab", { name: "Terminal" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/terminal.png` });
for (const id of [a, b]) await post(`/api/runs/${id}/review`, { approve: true });
await new Promise((r) => setTimeout(r, 2500));
await page.goto(`${base}/board`);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/board-merged.png` });
const s = await get("/api/snapshot");
console.log("statuses:", [a, b].map((id) => s.runs[id].status + " " + (s.runs[id].review?.landed ?? s.runs[id].review?.failed ?? "")));
await browser.close();
