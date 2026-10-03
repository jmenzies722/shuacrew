/** Speech only: exact tool inputs remain on the approval card. Never read command arguments aloud. */
export function approvalSummary(tool: string, input: unknown): string {
  const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const command = typeof data.command === "string" ? data.command.trim() : "";
  if (command) {
    // Deliberately conservative; this is a description, not a shell parser or a safety verdict.
    // Unknown syntax must not inherit a harmless description from an earlier command.
    const complex = "run a complex command; review the full details in chat";
    if (/^(?:python[\d.]*|node|ruby|perl)\s/.test(command)) return "run a custom command; review the full details in chat";
    if (/[\n\r;|<>`$(){}]/.test(command)) return complex;
    const parts = command.split("&&").map(p => p.trim());
    if (parts.some(p => !p || /[&"']/.test(p))) return parts.length > 1 ? complex : "run a custom command; review the full details in chat";
    const descriptions: string[] = [];
    for (const part of parts) {
      if (/^cd\s+\S+$/.test(part) && parts.length > 1) continue;
      let description: string;
      if (/^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|test:[\w-]+)|(?:swift|cargo|go)\s+test|pytest|vitest)\b/.test(part)) description = "run the tests";
      else if (/^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build|(?:swift|cargo|go)\s+build)\b/.test(part)) description = "build the project";
      else if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|lint)\b/.test(part)) description = "check the code for errors";
      else if (/^(?:npm|pnpm|yarn|bun)\s+(?:install|add|ci)\b/.test(part)) description = "install project dependencies, which may run setup scripts";
      else if (/^git\s+push\b/.test(part)) description = /(?:--force\b|\s-f\b|--delete\b)/.test(part) ? "force-update or delete remote history" : "push commits to the remote repository";
      else if (/^git\s+commit\b/.test(part)) description = "create a Git commit";
      else if (/^git\s+(?:reset|clean|checkout|restore)\b/.test(part)) description = "change the working files or Git history; local changes may be lost";
      else if (/^git\s+(?:status|diff|log|show)\b/.test(part)) description = "inspect the repository and its changes";
      else if (/^rm\s/.test(part)) description = "delete files or folders";
      else if (/^mkdir\s/.test(part)) description = "create folders";
      else if (/^(?:rg|ls|cat|head|tail)\s/.test(part)) description = "inspect files or their contents";
      else return parts.length > 1 ? complex : "run a custom command; review the full details in chat";
      descriptions.push(description);
    }
    return [...new Set(descriptions)].join(", then ") || "change the working directory";
  }
  const name = tool.replace(/^mcp__[^_]+__/, "").toLowerCase();
  if (/^(edit|write|apply_patch)$/.test(name)) return "change project files";
  if (/^(read|glob|grep)$/.test(name)) return "inspect project files";
  if (/create_?pr|pull_request/.test(name)) return "work with a pull request; review the details in chat";
  return "use a tool; review the full details in chat";
}
