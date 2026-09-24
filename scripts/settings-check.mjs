// Verify the production UI with isolated browser storage and mocked gateway responses.
// Usage: node scripts/settings-check.mjs http://127.0.0.1:7432 /tmp/shuacrew-settings
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:7432";
const output = process.argv[3] ?? "/tmp/shuacrew-settings";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
  const errors = [];
  let savedMember;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/crew" && route.request().method() === "POST") {
      savedMember = route.request().postDataJSON();
      return route.fulfill({ json: savedMember });
    }
    if (pathname === "/api/snapshot") return route.fulfill({ status: 503, json: { error: "Isolated UI verification" } });
    const data = pathname === "/api/health" ? { service: false, uptimeS: 120 } : pathname === "/api/backups" ? { destination: "/tmp/test-backups", last: null, files: [] } : [];
    return route.fulfill({ json: data });
  });
  await page.goto(`${base}/settings`);
  await expect(page.getByRole("heading", { name: "Make room for your best work." })).toBeVisible();
  await expect(page.locator("#main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `${output}/settings-dark.png`, fullPage: true });
  await page.getByLabel("Search settings").fill("motion");
  await page.getByLabel("Motion", { exact: true }).selectOption("reduced");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.getByLabel("Reading size").selectOption("large");
  await expect(page.locator(".reading-preview .prose-agent")).toHaveCSS("font-size", "16px");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByLabel("Density", { exact: true }).selectOption("compact");
  await page.getByLabel("Navigation", { exact: true }).selectOption("labels");
  await page.getByLabel("Start screen").selectOption("/floor");
  await expect(page.locator(".workspace-frame")).toHaveCSS("grid-template-columns", "220px 1220px");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-navigation", "labels");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.goto(`${base}/`);
  await expect(page).toHaveURL(`${base}/floor`);
  await expect(page.getByRole("heading", { name: "Crew floor", exact: true })).toBeVisible();
  await page.goto(`${base}/settings`);
  await expect(page.getByRole("heading", { name: "Make room for your best work." })).toBeVisible();
  await page.getByRole("checkbox", { name: /Follow system/ }).uncheck();
  await page.getByRole("radio", { name: /Paper Clean/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "paper");
  await page.screenshot({ path: `${output}/settings-light.png`, fullPage: true });
  await page.setViewportSize({ width: 650, height: 900 });
  await page.screenshot({ path: `${output}/settings-narrow.png`, fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Horizontal page overflow");
  await page.getByLabel("Search settings").fill("no-such-setting");
  await expect(page.getByRole("heading", { name: "No settings found" })).toBeVisible();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Reset section" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "frost");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.getByLabel("Motion", { exact: true }).selectOption("full");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.getByText("No runtimes available.")).toBeVisible();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Data & service", exact: true }).click();
  await expect(page.getByRole("button", { name: "Back up now" })).toBeVisible();
  await page.goto(`${base}/crew`);
  await page.getByRole("button", { name: "New member", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Nova");
  await page.getByRole("checkbox", { name: /Available for delegation/ }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Crew member" })).toHaveCount(0);
  expect(savedMember).toMatchObject({ name: "Nova", runtime: "claude", delegatable: true });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS: search, controls, persistence, landing route, direct links, light/dark, narrow layout, section reset, system/full motion, runtime and backup panels, crew delegation toggle; no page errors.");
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
