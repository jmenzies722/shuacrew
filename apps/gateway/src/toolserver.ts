/**
 * ShuaCrew's own MCP server, served by the gateway at /mcp, so every agent — Claude, Codex, ACP —
 * can use the library: save what it made, search what you gave it, read either back. Each run gets
 * its own bearer token (in memory only, never logged), which is how a saved artifact knows the run
 * and crew member it came from. Stateless streamable HTTP: one JSON-RPC request, one JSON reply.
 */
import { randomBytes } from "node:crypto";
import type { CrewState } from "@shuacrew/core";
import type { Library } from "./library.js";
import type { RoomCoordinator } from "./rooms.js";
import { ROOM_TOOLS, callRoomTool } from "./room-tools.js";
import { createCrewMember } from "./crew-create.js";
import type { Crew } from "./crew.js";

export const TOOL_SERVER = "shuacrew";

/** What a fresh conversation is told, so the agent actually reaches for the library. */
export const LIBRARY_HINT = [
  "ShuaCrew library tools (the `shuacrew` MCP server):",
  "- search_library / read_library: the user's own documents and everything the crew made before. Check it before researching from scratch or asking the user something they may have written down.",
  "- list_crew / add_crew_member: see the user's crew, and add a new member when they ask for one (it needs their approval; new members can't be delegated to until the user opts them in).",
  "- save_artifact: save each real deliverable (a report, spec, plan, landing page, copy, dataset) as an artifact with a clear title, so it lands in the user's Library. To revise one, pass its id to save a new version rather than a duplicate.",
].join("\n");

const CREW_TOOLS = new Set(["list_crew", "add_crew_member"]);
const TOOLS = [
  {
    name: "list_crew",
    description: "List the user's crew members: id, name, role, agent, and whether they can take delegated work.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "add_crew_member",
    description: "Add a NEW crew member when the user asks for one. The user approves this. Never changes an existing member. New members can't take delegated work until the user opts them in.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Short first name, e.g. Nova" }, role: { type: "string", description: "e.g. Security reviewer" }, persona: { type: "string", description: "How they work, in second person: 'You check every diff for…'" }, runtime: { type: "string", description: "Optional agent id, e.g. claude or codex" } }, required: ["name", "role", "persona"], additionalProperties: false },
  },
  {
    name: "save_artifact",
    description:
      "Save a deliverable to the user's ShuaCrew Library — research reports, specs, plans, copy, landing pages (HTML), datasets (CSV/JSON). Use the filename extension to say what it is (.md for documents, .html for pages). Pass `id` to save a new version of an existing artifact.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short human title, e.g. 'Habit tracker — competitor pricing'" },
        content: { type: "string", description: "The full content" },
        filename: { type: "string", description: "e.g. report.md, landing.html, pricing.csv (default: <title>.md)" },
        summary: { type: "string", description: "One or two sentences on what it is and what it concludes" },
        id: { type: "string", description: "An existing artifact id to save a new version of" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "search_library",
    description: "Full-text search over the user's knowledge (their docs, notes and folders) and past crew artifacts. Returns the best matching passages with ids to read.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", description: "max results, default 8" },
        type: { type: "string", enum: ["artifact", "knowledge"], description: "limit to one half of the library" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_library",
    description: "Read the full text of a library item by id (from search_library or list_artifacts). For a folder source, pass `file` to read one file.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, file: { type: "string" } }, required: ["id"] },
  },
  {
    name: "list_artifacts",
    description: "List recent artifacts in the library (id, title, kind, who made it).",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
];

interface Rpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export class ToolServer {
  private tokens = new Map<string, string>(); // token → run
  private byRun = new Map<string, string>();

  constructor(
    private library: Library,
    private state: () => CrewState,
    public rooms?: RoomCoordinator,
    /** For list_crew / add_crew_member, and the agents a new member may use. */
    public crew?: Crew,
    public runtimeIds: () => string[] = () => [],
  ) {}

  /** One stable token per run for this gateway's life. */
  tokenFor(run: string): string {
    let token = this.byRun.get(run);
    if (!token) {
      token = randomBytes(24).toString("base64url");
      this.tokens.set(token, run);
      this.byRun.set(run, token);
    }
    return token;
  }

  runFor(authorization: string | undefined): string | undefined {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1];
    return token ? this.tokens.get(token) : undefined;
  }

  /** Handle one JSON-RPC message (or a batch). Undefined means "notification, reply 202". */
  async handle(message: Rpc | Rpc[], run: string): Promise<unknown> {
    if (Array.isArray(message)) {
      const out = (await Promise.all(message.map((m) => this.one(m, run)))).filter((r) => r !== undefined);
      return out.length ? out : undefined;
    }
    return this.one(message, run);
  }

  private async one(m: Rpc, run: string): Promise<unknown> {
    if (m.id === undefined || m.id === null) return undefined; // notifications (initialized, cancelled…)
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id, error: { code, message } });
    switch (m.method) {
      case "initialize":
        return ok({
          protocolVersion: typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: TOOL_SERVER, title: "ShuaCrew Library", version: "0.1.0" },
          instructions: [LIBRARY_HINT, this.rooms?.hint(run)].filter(Boolean).join("\n\n"),
        });
      case "ping":
        return ok({});
      case "tools/list":
        // Crew tools only when a crew is attached; room tools only inside a room.
        return ok({ tools: [...TOOLS.filter((t) => this.crew || !CREW_TOOLS.has(t.name)), ...(this.rooms?.roomFor(run) ? ROOM_TOOLS : [])] });
      case "tools/call": {
        const name = String(m.params?.name ?? "");
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          return ok({ content: [{ type: "text", text: this.call(name, args, run) }] });
        } catch (error) {
          return ok({ content: [{ type: "text", text: (error as Error).message }], isError: true });
        }
      }
      default:
        return fail(-32601, `unknown method ${m.method}`);
    }
  }

  private call(name: string, args: Record<string, unknown>, run: string): string {
    if (name.startsWith("crew_")) {
      if (!this.rooms) throw new Error("Crew rooms unavailable");
      return callRoomTool(this.rooms, name, args, run);
    }
    const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);
    switch (name) {
      case "list_crew": {
        if (!this.crew) throw new Error("Crew unavailable");
        return JSON.stringify(this.crew.list().map((m) => ({ id: m.id, name: m.name, role: m.role, runtime: m.runtime ?? "auto", delegatable: m.delegatable })));
      }
      case "add_crew_member": {
        if (!this.crew) throw new Error("Crew unavailable");
        const m = createCrewMember(this.crew, { name: str("name") ?? "", role: str("role"), persona: str("persona"), runtime: str("runtime") }, this.runtimeIds());
        return `Added ${m.name} (${m.role}) to the crew as "${m.id}". The user can talk to them with @${m.id}; to let rooms delegate to ${m.name}, they turn on "Available for delegation" in Crew.`;
      }
      case "save_artifact": {
        const view = this.state().runs[run];
        const saved = this.library.save({
          title: str("title") ?? "",
          content: str("content") ?? "",
          filename: str("filename"),
          summary: str("summary"),
          id: str("id"),
          run: view?.labels.includes("crew-room") ? run : view?.parent ?? run,
          member: view?.member,
        });
        return `Saved "${saved.title}" to the Library as ${saved.id} (version ${saved.version}, ${saved.kind}). The user can open it from the Library.`;
      }
      case "search_library": {
        const hits = this.library.search(str("query") ?? "", { limit: Number(args.limit) || 8, type: args.type === "artifact" || args.type === "knowledge" ? args.type : undefined });
        if (!hits.length) return "Nothing in the library matches that.";
        return hits.map((h, i) => `${i + 1}. [${h.type}] ${h.title}${h.where && h.where !== "note" ? ` — ${h.where}` : ""}  (id: ${h.id}${h.type === "knowledge" && h.where !== "note" ? `, file: ${h.where}` : ""})\n   ${h.snippet}`).join("\n");
      }
      case "read_library": {
        const { title, text, truncated } = this.library.read(str("id") ?? "", str("file"));
        return `# ${title}\n\n${text}${truncated ? "\n\n[truncated — read one file at a time with `file`]" : ""}`;
      }
      case "list_artifacts": {
        const list = this.library.artifacts().slice(0, Math.min(Number(args.limit) || 20, 60));
        if (!list.length) return "The library has no artifacts yet.";
        const members = this.state().members;
        return list.map((a) => `- ${a.id}  ${a.title}  (${a.kind}, v${a.version}${a.member ? `, by ${members[a.member]?.name ?? a.member}` : ""})${a.summary ? ` — ${a.summary}` : ""}`).join("\n");
      }
      default:
        throw new Error(`no tool ${name}`);
    }
  }
}
