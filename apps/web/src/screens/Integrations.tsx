import { Button, Eyebrow, Panel, StatusGlyph } from "@shuacrew/ui";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Card {
  id: string;
  title: string;
  description: string;
  kind: "command" | "remote";
  command?: string;
  args: string[];
  url?: string;
  auth: "none" | "oauth";
}
interface Installed {
  id: string;
  name: string;
  command?: string;
  url?: string;
  auth: string;
  signedIn: boolean;
}
interface Skill {
  name: string;
  path: string;
}

/**
 * The marketplace the Mac app opens from the rail. Servers come from the official
 * MCP registry. A remote one signs in through its own OAuth. Skills install from
 * the public skills repo. Nothing here asks you to paste a key.
 */
export function Integrations() {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const loadInstalled = () => api<Installed[]>("/api/mcp").then(setInstalled).catch(() => undefined);
  useEffect(() => {
    void loadInstalled();
    void api<Skill[]>("/api/skills/catalog").then(setSkills).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void api<Card[]>(`/api/mcp/catalog?q=${encodeURIComponent(query)}`)
        .then(setCards)
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const connect = async (card: Card) => {
    setBusy(card.id);
    setError("");
    try {
      const server = await api<Installed>("/api/mcp", {
        body: {
          name: card.title,
          ...(card.kind === "command" ? { command: card.command, args: card.args } : { url: card.url, auth: "oauth" }),
        },
      });
      if (card.auth === "oauth") await api(`/api/mcp/${server.id}/signin`, { body: {} });
      await loadInstalled();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const connected = new Set(installed.map((s) => s.name));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Integrations</h1>
        <p className="mt-1 text-[13px] text-fg-2">Connect an MCP server or install a skill. A remote server signs in through its own page. Installed servers go with the next session. A deny rule still applies after it's connected.</p>
        {error && <p className="mt-3 text-[12.5px] text-bad">{error}</p>}

        <section className="mt-6">
          <Eyebrow className="mb-2.5">Connected</Eyebrow>
          <Panel className="divide-y divide-line">
            {installed.length === 0 && <p className="px-4 py-4 text-[12.5px] text-fg-3">Nothing connected yet.</p>}
            {installed.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <StatusGlyph tone={s.auth === "oauth" && !s.signedIn ? "wait" : "ok"} size={7} />
                <span className="w-40 truncate font-medium">{s.name}</span>
                <span className="mono min-w-0 flex-1 truncate text-[12px] text-fg-3">{s.url ?? s.command}</span>
                <span className="text-[12px] text-fg-3">{s.auth === "oauth" ? (s.signedIn ? "signed in" : "needs sign-in") : "local"}</span>
                {s.auth === "oauth" && !s.signedIn && (
                  <Button size="s" onClick={() => void api(`/api/mcp/${s.id}/signin`, { body: {} }).then(loadInstalled).catch((e: Error) => setError(e.message))}>
                    Sign in
                  </Button>
                )}
                <button className="text-[11.5px] text-fg-3 hover:text-bad" onClick={() => void api(`/api/mcp/${s.id}`, { method: "DELETE" }).then(loadInstalled)}>
                  remove
                </button>
              </div>
            ))}
          </Panel>
        </section>

        <section className="mt-7">
          <div className="mb-2.5 flex items-center gap-3">
            <Eyebrow>MCP servers</Eyebrow>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the registry"
              className="ml-auto h-8 w-64 rounded-[var(--radius-m)] border border-line-strong bg-raised px-2.5 text-[12.5px] outline-none focus:border-amber"
              aria-label="Search MCP servers"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 max-[800px]:grid-cols-1">
            {cards.map((card) => (
              <Panel key={card.id} className="flex flex-col p-4">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{card.title}</span>
                  <span className="text-[11px] text-fg-3">{card.auth === "oauth" ? "sign in" : "local"}</span>
                </div>
                <p className="mt-1.5 line-clamp-3 flex-1 text-[12.5px] leading-relaxed text-fg-2">{card.description || card.id}</p>
                <div className="mt-3">
                  <Button size="s" variant="primary" disabled={busy === card.id || connected.has(card.title)} onClick={() => void connect(card)}>
                    {connected.has(card.title) ? "Connected" : card.auth === "oauth" ? "Sign in" : "Install"}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
          {cards.length === 0 && <p className="text-[12.5px] text-fg-3">No servers match. The list is the official registry, skipping anything that wants a pasted key.</p>}
        </section>

        <section className="mt-7">
          <Eyebrow className="mb-2.5">Skills</Eyebrow>
          <div className="grid grid-cols-3 gap-3 max-[800px]:grid-cols-1">
            {skills.map((skill) => (
              <button
                key={skill.name}
                disabled={busy === skill.name}
                onClick={() => {
                  setBusy(skill.name);
                  void api("/api/skills/install", { body: { name: skill.name } })
                    .then(() => setBusy(""))
                    .catch((e: Error) => {
                      setError(e.message);
                      setBusy("");
                    });
                }}
                className="rounded-[var(--radius-l)] border border-dashed border-line-strong bg-panel p-4 text-left transition hover:border-amber"
              >
                <div className="text-[13.5px] font-medium">{skill.name}</div>
                <div className="mt-1.5 text-[12.5px] text-fg-2">{busy === skill.name ? "Installing…" : "Install into Memory. It is accepted because you chose it."}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
