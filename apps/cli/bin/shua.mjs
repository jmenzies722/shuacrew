#!/usr/bin/env node
// Runs the TypeScript CLI through tsx so `shua` works straight from the repo.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const tsx = createRequire(import.meta.url).resolve("tsx/cli");
const result = spawnSync(process.execPath, [tsx, path.join(here, "../src/main.ts"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
