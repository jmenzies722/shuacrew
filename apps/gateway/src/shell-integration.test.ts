import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BlockTracker, zshIntegration } from "./shell-integration.js";
import { commandFrom, failure, suggest } from "./terminal-ai.js";
import { Terminals } from "./terminals.js";

const b64 = (s: string) => Buffer.from(s).toString("base64");
const mark = (s: string) => `\x1b]6973;${s}\x07`;

describe("terminal blocks", () => {
  it("turns marks into blocks with output, even when a mark is split across chunks", () => {
    const seen: string[] = [];
    const t = new BlockTracker("/tmp", (b) => b && seen.push(`${b.command}:${b.exit ?? "…"}`));
    const stream = `${mark(`P;${b64("/Users/me/app")};main`)}$ ${mark(`C;${b64("npm test")}`)}\r\n\x1b[32mok\x1b[0m 3 passing\r\n${mark("D;0")}${mark(`P;${b64("/Users/me/app")};main`)}$ ${mark(`C;${b64("false")}`)}${mark("D;1")}`;
    // Feed it in awkward pieces, cutting marks in half.
    for (let i = 0; i < stream.length; i += 7) t.feed(stream.slice(i, i + 7));
    expect(t.list().map((b) => [b.command, b.exit, b.cwd, b.branch])).toEqual([
      ["npm test", 0, "/Users/me/app", "main"],
      ["false", 1, "/Users/me/app", "main"],
    ]);
    expect(t.output(1)).toContain("ok 3 passing");
    expect(t.output(1)).not.toContain("\x1b");
    expect(seen).toEqual(["npm test:…", "npm test:0", "false:…", "false:1"]);
  });

  it("works in a real zsh, loading your own zsh files first", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "shua-zsh-"));
    const user = path.join(home, "user");
    mkdirSync(user);
    writeFileSync(path.join(user, ".zshrc"), "export SHUA_TEST_FROM_USER=yes\nPROMPT='%# '\n");
    process.env.ZDOTDIR = user;
    const terminals = new Terminals(zshIntegration(home));
    const info = terminals.create({ cwd: home });
    const sent: string[] = [];
    const socket = { send: (d: string) => sent.push(d), on: (_e: string, _l: unknown) => undefined, close: () => undefined };
    terminals.attach(info.id, socket as never);
    const type = (s: string) => (terminals as unknown as { open: Map<string, { pty: { write(d: string): void } }> }).open.get(info.id)!.pty.write(s);
    await new Promise((r) => setTimeout(r, 900));
    type('echo "user=$SHUA_TEST_FROM_USER"\r');
    await new Promise((r) => setTimeout(r, 500));
    type("ls /definitely-not-here\r");
    const deadline = Date.now() + 8000;
    while (terminals.blocks(info.id).filter((b) => b.exit !== undefined).length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    const blocks = terminals.blocks(info.id);
    expect(blocks.map((b) => [b.command, b.exit === 0 ? "ok" : "failed"])).toEqual([
      ['echo "user=$SHUA_TEST_FROM_USER"', "ok"],
      ["ls /definitely-not-here", "failed"],
    ]);
    expect(terminals.output(info.id, blocks[0]!.id)?.output).toContain("user=yes"); // your .zshrc really loaded
    expect(sent.some((m) => m.includes('"type":"block"'))).toBe(true);
    terminals.closeAll();
    delete process.env.ZDOTDIR;
  }, 20_000);
});

describe("english to command", () => {
  it("keeps only the command", () => {
    expect(commandFrom("```bash\nfind . -size +100M\n```")).toBe("find . -size +100M");
    expect(commandFrom("$ du -sh * | sort -h\nThis lists sizes.")).toBe("du -sh * | sort -h");
    expect(commandFrom("docker run \\\n  -p 80:80 nginx\n\nexplanation")).toBe("docker run \\\n  -p 80:80 nginx");
  });

  it("grounds the request in where you are, with no tools", async () => {
    let args: string[] = [];
    const cmd = await suggest({ prompt: "# biggest folders here", cwd: os.tmpdir(), branch: "main", last: { command: "npm test", exit: 1 } }, async (a) => ((args = a), "du -sh */ | sort -h | tail\n"));
    expect(cmd).toBe("du -sh */ | sort -h | tail");
    expect(args[1]).toMatch(/Folder: .*\nGit branch: main\n.*Last command: npm test \(exit 1\)\nRequest: biggest folders here$/s);
    expect(args).toEqual(expect.arrayContaining(["--model", "claude-haiku-4-5", "--tools", ""]));
  });

  it("explains a failed claude call without dumping the command line", () => {
    const argv = Object.assign(new Error("Command failed: claude -p ... --system-prompt You turn a request\nIf it truly needs several steps"), { code: 1 });
    expect(failure("Claude AI usage limit reached|1758740400\n", "", argv)).toMatch(/^Claude is at its usage limit/);
    expect(failure("", "Invalid model name\n", argv)).toBe("Invalid model name");
    expect(failure("", "", argv)).not.toMatch(/system-prompt|several steps/);
    expect(failure("", "", Object.assign(new Error("x"), { killed: true }))).toMatch(/too long/);
  });
});
