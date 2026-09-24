// Schedules & Triggers and a task run, both themes plus narrow. Headless — never takes focus.
// Usage: node scripts/autonomy-shots.mjs <outDir> [base]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://127.0.0.1:7421";
const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew": "1" }, body: JSON.stringify(body) }).then((r) => r.json());

await post("/api/schedules", { when: "weekdays 9am America/New_York", ask: "Triage new issues and draft replies", runtime: "mock" });
await post("/api/schedules", { when: "every 6 hours", script: "echo fine", ask: "Update stale dependencies", runtime: "mock" });
await post("/api/webhooks", { name: "CI failed", ask: "Find why CI failed and fix it", runtime: "mock" });
await post("/api/heartbeats", { name: "Staging API up", command: "true", everyMinutes: 5, ask: "Find out why staging is down" });
const task = await post("/api/tasks", { markdown: "# Inject the clock\nTests use real timers.\n\n## Steps\n1. Add a Clock interface\n2. Thread it through the sync path\n3. Replace real timers in tests", runtime: "mock" });

const browser = await chromium.launch();
for (const [theme, width] of [["dark", 1480], ["light", 1480], ["dark", 420]]) {
  const page = await browser.newPage({ viewport: { width, height: 920 }, deviceScaleFactor: 2, colorScheme: theme });
  const tag = `${theme}${width < 600 ? "-narrow" : ""}`;
  await page.goto(base + "/schedules");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/schedules-${tag}.png`, fullPage: true });
  await page.goto(base + `/runs/${task.id}`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/task-${tag}.png` });
  await page.close();
}
await browser.close();
