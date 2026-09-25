/**
 * Talk to an MCP server the way an agent will: connect, handshake, and list its tools. This is how
 * ShuaCrew shows what a server can actually do, and proves it works before an agent relies on it.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { boundedIcons, type McpIcon } from "./mcp-icons.js";

export interface ToolInfo {
  name: string;
  title?: string;
  description: string;
  readOnly?: boolean;
  destructive?: boolean;
  icons?: McpIcon[];
}

export interface Connection {
  ok: boolean;
  server?: { name: string; version: string; icons?: McpIcon[] };
  tools: ToolInfo[];
  error?: string;
  at: number;
}

export async function listTools(target: { command?: string; args?: string[]; url?: string; token?: string }, timeoutMs = 60_000): Promise<Connection> {
  const client = new Client({ name: "shuacrew", version: "0.1.0" });
  const headers: Record<string, string> = target.token ? { Authorization: `Bearer ${target.token}` } : {};
  const connect = async () => {
    if (target.command) {
      // The same PATH and environment the agents run with, so what works here works for them.
      await client.connect(new StdioClientTransport({ command: target.command, args: target.args ?? [], env: process.env as Record<string, string>, stderr: "ignore" }));
      return;
    }
    const url = new URL(target.url!);
    try {
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
    } catch (error) {
      // Older servers only speak SSE (their URL usually ends in /sse).
      if (/401|unauthori[sz]ed/i.test((error as Error).message)) throw error;
      await client.connect(new SSEClientTransport(url, { requestInit: { headers }, eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...(init?.headers as Record<string, string>), ...headers } }) } }));
    }
  };
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      (async () => {
        await connect();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(target.command ? "the server didn't start within a minute (first runs download it — try again)" : "the server didn't answer")), timeoutMs);
      }),
    ]);
    const tools: ToolInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      for (const t of page.tools) {
        tools.push({
          name: t.name,
          title: t.annotations?.title ?? t.title,
          description: (t.description ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
          readOnly: t.annotations?.readOnlyHint,
          destructive: t.annotations?.destructiveHint,
          icons: boundedIcons(t.icons),
        });
      }
      cursor = page.nextCursor;
    } while (cursor && tools.length < 500);
    const info = client.getServerVersion();
    return { ok: true, server: info ? { name: info.name, version: info.version, icons: boundedIcons(info.icons) } : undefined, tools, at: Date.now() };
  } catch (error) {
    const message = (error as Error).message.split("\n")[0] ?? "couldn't connect";
    return { ok: false, tools: [], error: /401|unauthori[sz]ed|invalid_token/i.test(message) ? "needs sign-in" : message, at: Date.now() };
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => undefined);
  }
}
