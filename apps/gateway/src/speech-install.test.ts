import { expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { SpeechInstaller } from "./speech-install.js";

it("never publishes cancelled or failed setup and allows a clean retry", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-install-"));
  let fail = true;
  const installer = new SpeechInstaller(home, async (_file, args, signal) => {
    signal.throwIfAborted();
    if (fail) throw new Error("Download failed");
    if (args[0] === "venv") { const env = args.at(-1)!; mkdirSync(path.join(env, "bin"), { recursive: true }); writeFileSync(path.join(env, "bin/python"), "fixture"); }
  });
  await expect(installer.install()).rejects.toThrow("Download failed");
  expect(installer.status().state).toBe("failed");
  expect(existsSync(path.join(home, "installed", ".ready"))).toBe(false);
  fail = false; await installer.install();
  expect(existsSync(path.join(home, "installed", ".ready"))).toBe(true);
  expect(installer.status().state).toBe("ready");
});
it("cancels setup without publishing and rejects simultaneous installers", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-install-"));
  const installer = new SpeechInstaller(home, async (_file, _args, signal) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); }));
  const installing = installer.install();
  await expect(installer.install()).rejects.toThrow(/already/);
  installer.cancel(); await expect(installing).rejects.toThrow();
  expect(existsSync(path.join(home, "installed", ".ready"))).toBe(false);
});
