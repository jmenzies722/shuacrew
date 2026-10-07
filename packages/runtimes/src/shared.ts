/** Small helpers every runtime adapter shares. */
import type { AuthMode } from "./runtime.js";

export { limitFrom } from "./runtime.js";

/** Shell commands that are a verdict on the code: a failing one later passing is a recovery. */
const CHECKS =
  /^(?:npx\s+|bunx\s+|pnpm\s+(?:exec|dlx)\s+|python3?\s+-m\s+|(?:\.\/)?node_modules\/\.bin\/)?(pytest|vitest|jest|mocha|swift (?:test|build)|(?:npm|pnpm|yarn|bun) (?:run )?(?:test|lint|build|typecheck|check)|cargo (?:test|build|check|clippy)|go (?:test|vet|build)|ruff\b|mypy|pyright|tsc\b|eslint|make (?:test|check)|xcodebuild\b.*\btest|terraform (?:validate|plan)|uv run (?:pytest|ruff))/;

/**
 * Whether a shell command runs the project's checks. Only where a command starts counts (the start, or after
 * `&&`, `||`, `;`, `|`, a newline or `cd …`): a script that merely mentions "npm test" in a string is not a check.
 */
export function isCheck(command: string): boolean {
  const wrapped = /^\s*(?:\/bin\/|\/usr\/bin\/)?(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec(command);
  const plain = wrapped ? wrapped[2]! : command;
  return plain.split(/&&|\|\||;|\n|\|/).some((part) => CHECKS.test(part.trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/, "")));
}

/** The text inside a tool result, however the runtime shapes it. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
      .join("");
  }
  if (content && typeof content === "object") return JSON.stringify(content);
  return String(content ?? "");
}

/** API-key variables set in the gateway's environment that would override a subscription. */
export function overridingKeys(env: NodeJS.ProcessEnv, mode: AuthMode, keys: string[]): string[] {
  if (mode !== "subscription") return [];
  return keys.filter((key) => Boolean(env[key]));
}
