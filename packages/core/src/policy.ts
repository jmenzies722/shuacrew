/**
 * One policy engine for every runtime.
 *
 * Claude's hooks, Codex's approval requests and ACP permission requests all arrive here as the same
 * normalised `ToolCall`, so a rule means the same thing whichever agent is working.
 *
 * Policy is layered — global → project → app → run — and the tightest answer wins: deny beats ask
 * beats allow, across layers. That is what makes deny patterns absolute: a run started with
 * "approve everything" adds an allow-all rule at the run layer, and a global deny still wins.
 *
 * Every decision says which rule, in which layer, decided it — the "why was this allowed?" answer.
 */
import os from "node:os";
import path from "node:path";

export type Verdict = "allow" | "ask" | "deny";
export type Risk = "low" | "medium" | "high" | "critical";
export type LayerName = "global" | "project" | "app" | "run";

/** A tool call, in terms every runtime can be mapped onto. */
export interface ToolCall {
  tool: string; // original name: "Bash", "Edit", "commandExecution", "mcp__gitlab__merge"…
  kind: "shell" | "read" | "write" | "fetch" | "mcp" | "other";
  command?: string;
  paths: string[];
  raw: unknown;
}

export interface PolicyContext {
  workspace: string; // the run's worktree (or its scratch workspace)
  roots: string[]; // other places agents may change without asking
  protected: string[]; // never touched, by anyone
  sensitive: string[]; // secrets: blocked for reads unless allowlisted
  allowSensitive: string[]; // per-project exceptions to `sensitive`
  protectedBranches: string[];
}

export interface Rule {
  id: string;
  description: string;
  verdict: Verdict;
  risk: Risk;
  matches: (call: ToolCall, ctx: PolicyContext) => boolean;
}

export interface Layer {
  name: LayerName;
  rules: Rule[];
}

export interface Decision {
  verdict: Verdict;
  risk: Risk;
  rule: string;
  layer: LayerName | "default";
  reason: string;
  /** What each layer said, for the explainer. */
  trail: Array<{ layer: LayerName; rule: string; verdict: Verdict; reason: string }>;
}

const WEIGHT: Record<Verdict, number> = { allow: 0, ask: 1, deny: 2 };
const RISK_WEIGHT: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function decide(call: ToolCall, ctx: PolicyContext, layers: Layer[]): Decision {
  const trail: Decision["trail"] = [];
  let best: Decision | null = null;
  for (const layer of layers) {
    const rule = layer.rules.find((candidate) => safeMatch(candidate, call, ctx));
    if (!rule) continue;
    trail.push({ layer: layer.name, rule: rule.id, verdict: rule.verdict, reason: rule.description });
    const decision: Decision = {
      verdict: rule.verdict,
      risk: rule.risk,
      rule: rule.id,
      layer: layer.name,
      reason: rule.description,
      trail,
    };
    if (
      !best ||
      WEIGHT[decision.verdict] > WEIGHT[best.verdict] ||
      (decision.verdict === best.verdict && RISK_WEIGHT[decision.risk] > RISK_WEIGHT[best.risk])
    ) {
      best = decision;
    }
  }
  if (best) return { ...best, trail };
  return {
    verdict: "ask",
    risk: "medium",
    rule: "default.ask",
    layer: "default",
    reason: "no rule covers this call, so a person decides",
    trail,
  };
}

function safeMatch(rule: Rule, call: ToolCall, ctx: PolicyContext): boolean {
  try {
    return rule.matches(call, ctx);
  } catch {
    return false; // a rule that cannot evaluate says nothing, rather than crashing the gate
  }
}

// ── normalising ────────────────────────────────────────────────────────────────────────────

const READ_TOOLS = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead", "TodoWrite", "TaskList", "TaskGet", "ToolSearch"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "fileChange", "apply_patch"]);
const FETCH_TOOLS = new Set(["WebFetch", "WebSearch", "web_search"]);
const SHELL_TOOLS = new Set(["Bash", "shell", "commandExecution", "exec_command", "terminal"]);

export function normalise(tool: string, input: unknown): ToolCall {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const paths = collectPaths(args);
  if (SHELL_TOOLS.has(tool)) {
    const command = Array.isArray(args.command) ? args.command.join(" ") : String(args.command ?? args.cmd ?? "");
    return { tool, kind: "shell", command, paths: [...paths, ...pathsInCommand(command)], raw: input };
  }
  if (READ_TOOLS.has(tool)) return { tool, kind: "read", paths, raw: input };
  if (WRITE_TOOLS.has(tool)) return { tool, kind: "write", paths, raw: input };
  if (FETCH_TOOLS.has(tool)) return { tool, kind: "fetch", paths: [], raw: input };
  if (tool.startsWith("mcp__")) return { tool, kind: "mcp", paths, raw: input };
  return { tool, kind: "other", paths, raw: input };
}

function collectPaths(args: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const key of ["file_path", "notebook_path", "path", "cwd", "directory"]) {
    const value = args[key];
    if (typeof value === "string" && value) found.push(value);
  }
  const changes = args.changes;
  if (Array.isArray(changes)) {
    for (const change of changes) {
      if (change && typeof change === "object" && typeof (change as { path?: unknown }).path === "string") {
        found.push((change as { path: string }).path);
      }
    }
  }
  return found;
}

function pathsInCommand(command: string): string[] {
  return command
    .split(/\s+|[;&|<>()"'=]/)
    .filter((word) => word.includes("/") || word.startsWith("~") || word.startsWith(".env"));
}

export function resolvePath(p: string, base?: string): string {
  let expanded = p.trim();
  if (expanded === "~" || expanded.startsWith("~/")) expanded = path.join(os.homedir(), expanded.slice(1));
  expanded = expanded.replace(/\$HOME|\$\{HOME\}/g, os.homedir());
  return path.normalize(base && !path.isAbsolute(expanded) ? path.join(base, expanded) : expanded);
}

export function within(p: string, folder: string): boolean {
  const f = path.normalize(folder).replace(/\/+$/, "");
  return p === f || p.startsWith(`${f}/`);
}

function anyWithin(call: ToolCall, ctx: PolicyContext, folders: string[]): string | undefined {
  for (const raw of call.paths) {
    const p = resolvePath(raw, ctx.workspace);
    const hit = folders.find((folder) => within(p, resolvePath(folder)));
    if (hit) return hit;
  }
  return undefined;
}

// ── the default rule set ───────────────────────────────────────────────────────────────────

/** Split a shell command into the commands it runs, so `pytest && rm -rf /` is judged whole. */
export function segments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const shell = (call: ToolCall) => (call.kind === "shell" ? (call.command ?? "") : "");
const anySegment = (call: ToolCall, pattern: RegExp) => segments(shell(call)).some((s) => pattern.test(s));

/** Destructive or exfiltrating commands. Deny beats any approval. */
export const DENY_PATTERNS: Array<{ id: string; description: string; pattern: RegExp }> = [
  { id: "deny.rm-root", description: "deletes the root, home or every file", pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|\/\*|~\/\*)(\s|$)/ },
  { id: "deny.disk-wipe", description: "formats or overwrites a disk", pattern: /\b(mkfs(\.\w+)?|diskutil\s+(erase\w*|zeroDisk|secureErase)|dd\s+.*of=\/dev\/)/ },
  { id: "deny.fork-bomb", description: "fork bomb", pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/ },
  { id: "deny.pipe-to-shell", description: "runs a script straight from the internet", pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/ },
  { id: "deny.sudo", description: "runs as root", pattern: /(^|\s)sudo\s/ },
  { id: "deny.credential-read", description: "reads credentials or keys", pattern: /(\.aws\/credentials|\.ssh\/id_|\.netrc|\.docker\/config\.json|\.kube\/config|\.config\/gh\/hosts|\.codex\/auth\.json|\.claude[^\s]*\/\.credentials)/ },
  { id: "deny.keychain-dump", description: "dumps the keychain", pattern: /\bsecurity\s+(dump-keychain|find-(generic|internet)-password\b.*-w)/ },
  { id: "deny.history-dump", description: "reads shell history", pattern: /(\.(zsh|bash)_history|\bhistory\s+-[0-9]*\s*$)/ },
  { id: "deny.chmod-world", description: "makes everything world-writable", pattern: /\bchmod\s+-R\s+0?777\b/ },
  { id: "deny.exfil-env", description: "sends environment or secrets to the network", pattern: /\b(env|printenv|cat\s+\.env\S*)\b.*\|\s*(curl|nc|wget)\b/ },
];

const force = /\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b|--mirror\b|\s\+\S+)/;

/**
 * A force-push is refused when it names a protected branch, or names no branch at all (it would
 * push whatever is checked out, which may be one). Force-pushing a run's own branch is only asked.
 */
function forcePushToProtected(call: ToolCall, ctx: PolicyContext): boolean {
  return segments(shell(call)).some((s) => {
    if (!force.test(s)) return false;
    const refs = s
      .replace(/^.*?git\s+push/, "")
      .split(/\s+/)
      .filter((word) => word && !word.startsWith("-"));
    const branches = refs.slice(1).map((ref) => ref.replace(/^\+/, "").split(":").pop() ?? "");
    return branches.length === 0 || branches.some((branch) => ctx.protectedBranches.includes(branch));
  });
}

const SAFE = /^(ls|pwd|cat|head|tail|wc|file|stat|which|echo|printf|date|tree|du|df|grep|rg|ag|fd|find|sort|uniq|cut|diff|jq|yq|sed\s+-n|awk|git\s+(status|diff|log|show|branch|rev-parse|remote\s+-v|blame|ls-files|stash\s+list|add|commit|switch|checkout\s+-b|fetch|worktree\s+list)|pytest|python3?\s+-m\s+(pytest|compileall)|uv\s+(run|sync|lock|add|tree)|ruff|mypy|pyright|swift\s+(build|test|package\s+resolve)|xcodebuild|cargo\s+(build|test|check|clippy|fmt)|go\s+(build|test|vet|fmt)|(npm|pnpm|yarn|bun)\s+(run|test|install|ci|i|exec|dlx\s+tsc)\b|npx\s+(tsc|vitest|eslint|prettier)|tsc|vitest|eslint|prettier|make|mkdir|touch|terraform\s+(fmt|validate|plan|init|show|output)|terragrunt\s+(plan|validate|init)|kubectl\s+(get|describe|logs|top|explain|version|api-resources|config\s+(view|get-contexts|current-context))|oc\s+(get|describe|logs|status|whoami))\b/;

/**
 * The command a segment runs, as written by an agent that dodges aliases (`\grep`) or spells out
 * system paths (`/bin/ls`). Only system bin directories are unwrapped: `./ls` or `~/bin/ls` could be
 * anything, and a `PATH=` prefix changes what runs, so those stay unrecognised and are asked about.
 */
export function bareCommand(segment: string): string {
  return segment
    .replace(/^\\(?=\w)/, "")
    .replace(/^(?:\/usr)?(?:\/local)?\/s?bin\/(?=\w)/, "")
    .replace(/^\/opt\/homebrew\/bin\/(?=\w)/, "");
}

/** Writes to a file through the shell (`> file`, `>> file`, `tee file`) — never "just looking". */
export function redirectsToFile(segment: string): boolean {
  const cleaned = segment.replace(/\d?>&\d/g, "").replace(/\d?>{1,2}\s*\/dev\/null\b/g, "").replace(/'[^']*'|"[^"]*"/g, "''");
  return />/.test(cleaned) || /^tee\b/.test(cleaned);
}

const ASK_ALWAYS = /^(git\s+(push|reset\s+--hard|clean\s+-[a-z]*f|rebase|branch\s+-D|tag\s+-d)|gh\s+(pr\s+(create|merge|close)|release|repo\s+(create|delete))|glab\s+(mr\s+(create|merge)|release)|npm\s+publish|pnpm\s+publish|cargo\s+publish|uv\s+publish|twine\s+upload|docker\s+(push|rm|rmi|system\s+prune)|aws\s|gcloud\s|az\s|vercel\s|fly\s+deploy|rm\s|mv\s|cp\s)/;

export function defaultRules(): Rule[] {
  return [
    ...DENY_PATTERNS.map(
      ({ id, description, pattern }): Rule => ({
        id,
        description,
        verdict: "deny",
        risk: "critical",
        matches: (call) => anySegment(call, pattern) || pattern.test(shell(call)),
      }),
    ),
    {
      id: "deny.force-push-protected",
      description: "force-pushes to a protected branch",
      verdict: "deny",
      risk: "critical",
      matches: forcePushToProtected,
    },
    {
      id: "deny.protected-folder",
      description: "touches a protected folder",
      verdict: "deny",
      risk: "critical",
      matches: (call, ctx) => Boolean(anyWithin(call, ctx, ctx.protected)),
    },
    {
      id: "deny.sensitive-path",
      description: "touches secrets (~/.ssh, ~/.aws, ~/.kube, .env, keychains) without a project allowlist",
      verdict: "deny",
      risk: "critical",
      matches: (call, ctx) => {
        const envFile = call.paths.some((p) => /(^|\/)\.env(\.[\w.-]+)?$/.test(p) && !/\.env\.(example|sample|template)$/.test(p));
        const hit = anyWithin(call, ctx, ctx.sensitive);
        if (!hit && !envFile) return false;
        return !anyWithin(call, ctx, ctx.allowSensitive);
      },
    },
    {
      id: "platform.terraform-apply",
      description: "terraform/terragrunt apply or destroy — show the plan and ask",
      verdict: "ask",
      risk: "critical",
      matches: (call) => anySegment(call, /^(terraform|terragrunt|tofu)\s+(apply|destroy|import|state\s+(rm|mv|push)|taint)\b/),
    },
    {
      id: "platform.kubectl-prod",
      description: "changes a cluster whose context looks like production — needs a second confirmation",
      verdict: "ask",
      risk: "critical",
      matches: (call) =>
        anySegment(call, /^(kubectl|oc)\s+(?!get|describe|logs|top|explain|version)\S+/) &&
        /(--context[= ]\S*prod|prod\S*\s|--context[= ]\S*prd)/i.test(shell(call)),
    },
    {
      id: "platform.kubectl-mutate",
      description: "changes a Kubernetes/OpenShift cluster",
      verdict: "ask",
      risk: "high",
      matches: (call) => anySegment(call, /^(kubectl|oc)\s+(apply|create|delete|patch|replace|scale|rollout|edit|annotate|label|set|drain|cordon|exec|cp|port-forward)\b/),
    },
    {
      id: "ask.outward",
      description: "outward-facing or hard to undo (push, publish, deploy, delete, move)",
      verdict: "ask",
      risk: "high",
      matches: (call) => segments(shell(call)).some((s) => ASK_ALWAYS.test(bareCommand(s))),
    },
    {
      id: "allow.skill",
      description: "loading an installed skill's instructions",
      verdict: "allow",
      risk: "low",
      matches: (call) => call.tool === "Skill",
    },
    {
      id: "allow.library",
      description: "ShuaCrew's own library tools (save and search artifacts and knowledge)",
      verdict: "allow",
      risk: "low",
      matches: (call) => /^mcp__shuacrew__(save_artifact|search_library|read_library|list_artifacts|crew_delegate|crew_message|crew_status)$/.test(call.tool),
    },
    {
      id: "allow.read",
      description: "reading",
      verdict: "allow",
      risk: "low",
      matches: (call) => call.kind === "read" || call.kind === "fetch",
    },
    {
      id: "allow.write-workspace",
      description: "editing inside the run's workspace or a work root",
      verdict: "allow",
      risk: "low",
      matches: (call, ctx) =>
        call.kind === "write" &&
        call.paths.length > 0 &&
        call.paths.every((p) => {
          const resolved = resolvePath(p, ctx.workspace);
          return within(resolved, ctx.workspace) || ctx.roots.some((root) => within(resolved, resolvePath(root)));
        }),
    },
    {
      id: "allow.safe-shell",
      description: "looking, building or testing",
      verdict: "allow",
      risk: "low",
      matches: (call, ctx) => {
        const parts = segments(shell(call));
        return (
          call.kind === "shell" &&
          parts.length > 0 &&
          parts.every((s) => (SAFE.test(bareCommand(s)) && !redirectsToFile(s)) || isCdInto(s, ctx))
        );
      },
    },
  ];
}

function isCdInto(segment: string, ctx: PolicyContext): boolean {
  const match = /^cd(?:\s+(.+))?$/.exec(segment);
  if (!match) return false;
  const target = resolvePath(match[1] ?? "~", ctx.workspace);
  return within(target, ctx.workspace) || ctx.roots.some((root) => within(target, resolvePath(root)));
}

/** "Approve everything" for one run: an allow-all at the run layer. Global denies still win. */
export function allowAll(): Rule {
  return { id: "run.approve-all", description: "this run was started with approve-all", verdict: "allow", risk: "low", matches: () => true };
}

/** A person's "always allow": this tool, narrowed to the command's first two words for shells. */
export function standingRule(tool: string, input: unknown): Rule & { prefix: string } {
  const call = normalise(tool, input);
  const prefix = call.kind === "shell" ? (call.command ?? "").trim().split(/\s+/).slice(0, 2).join(" ") : "";
  return {
    id: `always.${tool}${prefix ? `.${prefix}` : ""}`,
    description: `you always allow ${prefix || tool}`,
    verdict: "allow",
    risk: "low",
    prefix,
    matches: (c) => c.tool === tool && (!prefix || segments(c.command ?? "").every((s) => s.startsWith(prefix))),
  };
}

export function defaultContext(workspace: string, extra: Partial<PolicyContext> = {}): PolicyContext {
  return {
    workspace,
    roots: ["~/Developer"],
    protected: [],
    sensitive: ["~/.ssh", "~/.aws", "~/.kube", "~/.gnupg", "~/Library/Keychains", "~/.config/gcloud", "~/.azure", "~/.docker"],
    allowSensitive: [],
    protectedBranches: ["main", "master", "release", "production"],
    ...extra,
  };
}
