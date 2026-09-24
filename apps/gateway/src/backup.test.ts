import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Backups } from "./backup.js";
import { EventStore } from "./store.js";

describe("backups", () => {
  it("makes an encrypted archive that decrypts with plain openssl and restores the whole log", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
    const dest = mkdtempSync(path.join(os.tmpdir(), "shua-backups-"));
    const store = new EventStore(path.join(home, "shuacrew.db"));
    store.append("crew.member.set", { id: "rhea", name: "Rhea", role: "Researcher", persona: "p", color: "#fff", emoji: "🔎", triggers: [] });
    mkdirSync(path.join(home, "library", "artifacts"), { recursive: true });
    writeFileSync(path.join(home, "library", "artifacts", "note.md"), "# kept");
    writeFileSync(path.join(home, "venture-keys.json"), '{"fern":"rk_test_x"}');
    mkdirSync(path.join(home, "uploads"), { recursive: true });
    writeFileSync(path.join(home, "uploads", "huge.mov"), "not backed up");

    const backups = new Backups(store, home, dest, async () => "correct horse battery staple");
    const { file, bytes } = await backups.run(new Date(2026, 8, 24, 2, 30));
    expect(path.basename(file)).toBe("shuacrew-2026-09-24-0230.tar.gz.enc");
    expect(bytes).toBeGreaterThan(100);
    // Encrypted: the archive's contents don't show through.
    expect(readFileSync(file).includes(Buffer.from("rk_test_x"))).toBe(false);

    // Restore exactly as the docs say (passphrase on stdin).
    const out = mkdtempSync(path.join(os.tmpdir(), "shua-restore-"));
    const tar = execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", "stdin", "-in", file], { input: "correct horse battery staple\n" });
    execFileSync("tar", ["xz", "-C", out], { input: tar });
    expect(readFileSync(path.join(out, "library", "artifacts", "note.md"), "utf8")).toBe("# kept");
    expect(existsSync(path.join(out, "uploads"))).toBe(false);
    const db = new DatabaseSync(path.join(out, "shuacrew.db"));
    const kinds = (db.prepare("select kind from events order by seq").all() as Array<{ kind: string }>).map((r) => r.kind);
    expect(kinds).toContain("crew.member.set");
    db.close();

    // The log remembers it (for Settings), and only the latest 14 are kept.
    for (let d = 1; d <= 15; d++) await backups.run(new Date(2026, 9, d, 2, 30));
    expect(backups.list()).toHaveLength(14);
    store.close();
  }, 60_000);
});
