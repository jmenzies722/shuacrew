/**
 * Redaction: secrets never reach the UI, logs, Slack or traces.
 *
 * Applied to every string that leaves the gateway, not at a few chosen places — a secret an agent
 * printed by accident is still a secret. Patterns cover the credential shapes a platform engineer
 * handles daily; the replacement keeps a short prefix so a person can tell *which* key leaked.
 */

const PATTERNS: Array<[string, RegExp]> = [
  ["aws-access-key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["aws-secret", /(?<=aws_secret_access_key\s*[=:]\s*)[A-Za-z0-9/+=]{40}/gi],
  ["github-token", /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ["gitlab-token", /\bglpat-[A-Za-z0-9_-]{20,}\b/g],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ["openai-key", /\bsk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g],
  ["google-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["stripe-key", /\b(sk|rk)_(live|test)_[0-9A-Za-z]{16,}\b/g],
  ["telegram-token", /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ["bearer", /(?<=\b[Bb]earer\s+)[A-Za-z0-9._~+/-]{16,}=*/g],
  ["password-assignment", /(?<=\b(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*["']?)[^\s"']{8,}/gi],
  ["url-credentials", /(?<=:\/\/[^\s:/@]+:)[^\s@/]+(?=@)/g],
];

export function redact(text: string): string {
  let out = text;
  for (const [name, pattern] of PATTERNS) {
    out = out.replace(pattern, (match) => `${match.slice(0, Math.min(4, Math.floor(match.length / 4)))}…[redacted:${name}]`);
  }
  return out;
}

/** Redact every string inside a JSON-like value, keeping its shape. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v)])) as T;
  }
  return value;
}

/** Variables a runtime must never inherit in subscription mode: a stray key would silently
 * switch the CLI from the person's plan to pay-per-token billing. */
export const SUBSCRIPTION_STRIPPED = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY"];

/** Variables no agent subprocess inherits, whatever the auth mode. */
const ALWAYS_STRIPPED = [
  /^AWS_(SECRET_ACCESS_KEY|SESSION_TOKEN)$/,
  /^GITHUB_TOKEN$/,
  /^GH_TOKEN$/,
  /^GITLAB_TOKEN$/,
  /^NPM_TOKEN$/,
  /^SLACK_(BOT_)?TOKEN$/,
  /^TELEGRAM_(BOT_)?TOKEN$/,
  /^SHUACREW_TOKEN$/,
  /_(PASSWORD|SECRET)$/,
];

export function agentEnv(
  base: NodeJS.ProcessEnv,
  mode: "subscription" | "api-key" | "bedrock",
  keep: string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (mode === "subscription" && SUBSCRIPTION_STRIPPED.includes(key)) continue;
    if (!keep.includes(key) && ALWAYS_STRIPPED.some((pattern) => pattern.test(key))) continue;
    out[key] = value;
  }
  return out;
}
