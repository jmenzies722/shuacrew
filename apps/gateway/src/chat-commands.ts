/**
 * `/skill` and `/mcp` in a message. The thread keeps what the person typed; the
 * runtime gets the skill body or a named server so the turn actually uses it.
 */

export interface Named {
  name: string;
}

export interface ChatSkill extends Named {
  body: string;
  status?: string;
}

export function expandAsk(ask: string, skills: ChatSkill[], servers: Named[]): string {
  const trimmed = ask.trim();
  const skill = /^\/skill\s+(\S+)(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (skill) {
    const found = skills.find((s) => s.status !== "rejected" && s.name.toLowerCase() === skill[1]!.toLowerCase());
    if (!found) throw new Error(`no skill ${skill[1]} — install it from Integrations or type /skill`);
    const rest = skill[2]?.trim() || `Use the ${found.name} skill.`;
    return `${rest}\n\nSkill: ${found.name}\n${found.body}`;
  }
  const mcp = /^\/mcp\s+(\S+)(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (mcp) {
    const found = servers.find((s) => s.name.toLowerCase() === mcp[1]!.toLowerCase());
    if (!found) throw new Error(`no MCP server ${mcp[1]} — connect it from Integrations or type /mcp`);
    const rest = mcp[2]?.trim() || `Use the ${found.name} server.`;
    return `Use the MCP server "${found.name}".\n\n${rest}`;
  }
  return ask;
}
