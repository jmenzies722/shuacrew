/**
 * Shell integration for zsh: the shell tells the terminal when a command starts and ends, with
 * its exit code, folder and git branch — how blocks, badges and history work (the same idea as
 * VS Code's and Warp's). ShuaCrew points ZDOTDIR at a small folder of its own whose files load
 * YOUR zsh files first, then add two hooks. Your ~/.zshrc is never edited, and child shells see
 * your normal ZDOTDIR.
 *
 * The marks are private OSC sequences (ESC ] 6973 ; … BEL), which other terminals ignore:
 *   C;<base64 command>        a command is about to run
 *   D;<exit code>             it finished
 *   P;<base64 cwd>;<branch>   where you are now (after every command)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const FILES: Record<string, string> = {
  ".zshenv": `[[ -f "$SHUACREW_USER_ZDOTDIR/.zshenv" ]] && source "$SHUACREW_USER_ZDOTDIR/.zshenv"\n`,
  ".zprofile": `[[ -f "$SHUACREW_USER_ZDOTDIR/.zprofile" ]] && source "$SHUACREW_USER_ZDOTDIR/.zprofile"\n`,
  ".zshrc": `# ShuaCrew terminal: your own .zshrc first, then the command marks.
__shua_zdotdir="$ZDOTDIR"
ZDOTDIR="$SHUACREW_USER_ZDOTDIR"
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"

__shua_b64() { print -rn -- "$1" | base64 | tr -d '\\n' }
__shua_mark() { printf '\\e]6973;%s\\a' "$1" }
__shua_preexec() { __shua_mark "C;$(__shua_b64 "$1")" }
__shua_precmd() {
  local code=$?
  if [[ -n "$__shua_started" ]]; then __shua_mark "D;$code"; fi
  __shua_started=1
  __shua_mark "P;$(__shua_b64 "$PWD");$(git branch --show-current 2>/dev/null)"
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec __shua_preexec
add-zsh-hook precmd __shua_precmd
unset __shua_zdotdir
`,
};

/** Write the wrapper folder (idempotent). Returns the directory to use as ZDOTDIR. */
export function zshIntegration(home: string): string {
  const dir = path.join(home, "shell", "zsh");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [name, body] of Object.entries(FILES)) writeFileSync(path.join(dir, name), body, { mode: 0o600 });
  return dir;
}

export interface Block {
  id: number;
  command: string;
  cwd: string;
  branch?: string;
  startedAt: number;
  endedAt?: number;
  exit?: number;
}

const MARK = /\x1b\]6973;([CDP]);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>]|\r/g;
const MAX_OUTPUT = 64 * 1024;
const decode = (b64: string) => {
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
};

/** Terminal output as plain text: colours, cursor moves and carriage returns removed. */
export const clean = (raw: string) => raw.replace(ANSI, "");

/** Follows a terminal's output and turns the marks into blocks, keeping each command's output. */
export class BlockTracker {
  blocks: Array<Block & { output: string }> = [];
  cwd: string;
  branch?: string;
  private current?: Block & { output: string };
  private seq = 0;
  private held = ""; // the start of a mark that the next chunk finishes

  constructor(
    cwd: string,
    private onChange: (block: Block | undefined, where: { cwd: string; branch?: string }) => void = () => undefined,
  ) {
    this.cwd = cwd;
  }

  feed(chunk: string) {
    let data = this.held + chunk;
    this.held = "";
    // A mark cut in two by the pty (even mid-prefix): keep its start for the next chunk.
    const esc = data.lastIndexOf("\x1b");
    if (esc !== -1) {
      const tail = data.slice(esc);
      const prefix = "\x1b]6973;";
      const partialPrefix = prefix.startsWith(tail);
      const unterminated = tail.startsWith(prefix) && !/\x07|\x1b\\/.test(tail.slice(1));
      if (partialPrefix || unterminated) {
        this.held = tail;
        data = data.slice(0, esc);
      }
    }
    let last = 0;
    for (const m of data.matchAll(MARK)) {
      this.text(data.slice(last, m.index));
      last = (m.index ?? 0) + m[0].length;
      const [kind, payload] = [m[1]!, m[2]!];
      if (kind === "C") {
        this.current = { id: ++this.seq, command: decode(payload).trim(), cwd: this.cwd, branch: this.branch, startedAt: Date.now(), output: "" };
        this.blocks.push(this.current);
        if (this.blocks.length > 300) this.blocks.shift();
        this.onChange(this.summary(this.current), this.where());
      } else if (kind === "D" && this.current) {
        this.current.exit = Number(payload) || 0;
        this.current.endedAt = Date.now();
        const done = this.current;
        this.current = undefined;
        this.onChange(this.summary(done), this.where());
      } else if (kind === "P") {
        const [cwd, branch] = payload.split(";");
        this.cwd = decode(cwd ?? "") || this.cwd;
        this.branch = branch || undefined;
        this.onChange(undefined, this.where());
      }
    }
    this.text(data.slice(last));
  }

  private text(chunk: string) {
    if (!this.current || !chunk) return;
    // Kept raw: a colour code can be cut between chunks, so it's cleaned when read.
    this.current.output = (this.current.output + chunk).slice(-MAX_OUTPUT);
  }

  summary(b: Block): Block {
    return { id: b.id, command: b.command, cwd: b.cwd, branch: b.branch, startedAt: b.startedAt, endedAt: b.endedAt, exit: b.exit };
  }

  list(): Block[] {
    return this.blocks.map((b) => this.summary(b));
  }

  output(id: number): string | undefined {
    const raw = this.blocks.find((b) => b.id === id)?.output;
    return raw === undefined ? undefined : clean(raw);
  }

  where() {
    return { cwd: this.cwd, branch: this.branch };
  }
}
