import fs from "node:fs"; import crypto from "node:crypto"; import path from "node:path";
const [pkgDir, outDir] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json")));
const data = JSON.parse(fs.readFileSync(path.join(pkgDir, "data/simple-icons.json")));
const list = Array.isArray(data) ? data : data.icons;
const want = { googlechrome: "chrome-devtools", supabase: "supabase", neon: "neon", vercel: "vercel", cloudflare: "cloudflare", sentry: "sentry", posthog: "posthog", stripe: "stripe", paypal: "paypal", figma: "figma", linear: "linear", notion: "notion", atlassian: "atlassian" };
const slug = t => t.toLowerCase().replace(/\+/g, "plus").replace(/\./g, "dot").replace(/&/g, "and").normalize("NFD").replace(/[^a-z0-9]/g, "");
const lum = hex => { const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json")));
manifest.assets = manifest.assets.filter(a => a.id === "github");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
for (const [si, id] of Object.entries(want)) {
  const icon = list.find(i => (i.slug ?? slug(i.title)) === si); if (!icon) throw new Error("missing " + si);
  const src = fs.readFileSync(path.join(pkgDir, "icons", si + ".svg"), "utf8");
  const d = src.match(/<path d="([^"]+)"/)[1];
  // Light theme (white-ish background): brand colour unless it is too pale to read.
  const onLight = contrast(lum(icon.hex), lum("ffffff")) >= 1.8 ? icon.hex : "111111";
  // Dark theme (near-black background): brand colour unless it disappears, then white.
  const onDark = contrast(lum(icon.hex), lum("0b0b0c")) >= 1.8 ? icon.hex : "ffffff";
  const svg = fill => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img"><title>${icon.title}</title><path fill="#${fill}" d="${d}"/></svg>\n`;
  const light = svg(onLight), dark = svg(onDark);
  fs.writeFileSync(path.join(outDir, `${id}-light.svg`), light); fs.writeFileSync(path.join(outDir, `${id}-dark.svg`), dark);
  manifest.assets.push({ id, name: icon.title, source: icon.source, usage: icon.guidelines ?? "https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md",
    license: `simple-icons ${pkg.version} (CC0-1.0 path data; marks remain their owners' trademarks)`,
    purpose: "Secondary integration identification only; no endorsement or affiliation implied. Single-colour mark in the brand colour (white/near-black where the colour fails 1.8:1 contrast (logotypes are exempt from WCAG text contrast)).",
    retrievedAt: "2026-09-25", light: { file: `${id}-light.svg`, sha256: sha(light) }, dark: { file: `${id}-dark.svg`, sha256: sha(dark) } });
  console.log(id.padEnd(16), icon.hex, "light→", onLight, "dark→", onDark);
}
manifest.coverageGaps = ["Playwright", "Context7", "Canva"];
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
