import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1480, height: 900 }, colorScheme: "dark" });
await p.goto("http://127.0.0.1:7420/floor"); await p.waitForTimeout(Number(process.argv[3] ?? 1800));
await p.screenshot({ path: process.argv[2] }); await b.close();
