/** Small helpers every runtime adapter shares. */
import type { AuthMode } from "./runtime.js";

export { limitFrom } from "./runtime.js";

/** Shell commands that are a verdict on the code: a failing one later passing is a recovery. */
const CHECKS =
  /\b(pytest|vitest|jest|mocha|swift (?:test|build)|(?:npm|pnpm|yarn|bun) (?:run )?(?:test|lint|build|typecheck|check)|cargo (?:test|build|check|clippy)|go (?:test|vet|build)|ruff\b|mypy|pyright|tsc\b|eslint|make (?:test|check)|xcodebuild\b.*\btest|terraform (?:validate|plan)|uv run (?:pytest|ruff))/;

export function isCheck(command: string): boolean {
  return CHECKS.test(command);
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
