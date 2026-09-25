import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { readNativeBridge } from "./native-config.js";

it("reads only a private regular native bridge file and never follows symlinks", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-native-bridge-")), file = path.join(dir, "bridge.json");
  const config = { version: 1, installationId: "c6cd5fb6-8d45-4910-99b9-8839cd366568", credential: "a".repeat(64) };
  try {
    expect(readNativeBridge(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
    expect(readNativeBridge(file)).toEqual(config);
    chmodSync(file, 0o644);
    expect(() => readNativeBridge(file)).toThrow();
    chmodSync(file, 0o600);
    const link = path.join(dir, "link.json"); symlinkSync(file, link);
    expect(() => readNativeBridge(link)).toThrow();
    writeFileSync(file, JSON.stringify({ ...config, enabled: true }));
    expect(() => readNativeBridge(file)).toThrow();
    writeFileSync(file, "x".repeat(4096));
    expect(() => readNativeBridge(file)).toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
