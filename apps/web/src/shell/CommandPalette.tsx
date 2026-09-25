import { Kbd, StatusPill } from "@shuacrew/ui";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api, decideApproval } from "../lib/api";
import { ACCENTS, PALETTES } from "../lib/appearance";
import { useLive } from "../lib/live";
import { NAV } from "./Shell";
import { Glyph } from "../lib/glyphs";
import { savePower, usePower } from "../lib/power";
import { getWorkspace, saveWorkspace } from "../lib/workspace-prefs";
import { isTopLevelWork } from "../lib/crew";

/**
 * ⌘K does everything: launch, jump anywhere, answer approvals, switch theme. Fuzzy, instant,
 * keyboard-first. Typing a sentence that matches nothing offers to launch it as a run.
 */
export function CommandPalette() {
  const open = useLive((s) => s.paletteOpen);
  const setOpen = useLive((s) => s.setPalette);
  const runs = useLive((s) => s.crew.runs);
  const approvals = useLive((s) => s.crew.approvals);
  const ventures = useLive((s) => s.crew.ventures);
  const plays = useLive((s) => s.crew.plays);
  const openLaunch = useLive((s) => s.openLaunch);
  const setAppearance = useLive((s) => s.setAppearance);
  const navigate = useNavigate();
  const power = usePower();
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<Array<{ name: string; status: string }>>([]);
  const [servers, setServers] = useState<Array<{ name: string }>>([]);
  useEffect(() => {
    if (!open) return;
    void api<{ skills: Array<{ name: string; status: string }> }>("/api/memory").then((m) => setSkills(m.skills.filter((s) => s.status === "accepted"))).catch(() => undefined);
    void api<Array<{ name: string }>>("/api/mcp").then(setServers).catch(() => undefined);
  }, [open]);

  const recent = useMemo(() => Object.values(runs).filter((r) => isTopLevelWork(r, runs)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30), [runs]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const go = (to: string) => {
    navigate({ to });
    close();
  };
  const intoChat = (draft: string) => {
    close();
    const here = window.location.pathname;
    if (here === "/" || here.startsWith("/sessions/")) window.dispatchEvent(new CustomEvent("shuacrew:compose", { detail: draft }));
    else void navigate({ to: "/" }).then(() => window.dispatchEvent(new CustomEvent("shuacrew:compose", { detail: draft })));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="w-[640px] max-w-[92vw] overflow-hidden rounded-[var(--radius-l)] border border-line-strong backdrop-blur-xl"
            style={{ background: "var(--glass)", boxShadow: "0 24px 80px rgba(0,0,0,.45)" }}
          >
            <Command label="Command palette" loop onKeyDown={(e) => e.key === "Escape" && close()}>
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search runs, jump anywhere, or describe new work…"
                className="h-13 w-full border-b border-line bg-transparent px-4 text-[15px] text-fg outline-none placeholder:text-fg-3"
              />
              <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
                <Command.Empty>
                  <button onClick={() => (openLaunch(query), setQuery(""))} className="flex w-full items-center gap-2 rounded-[var(--radius-m)] px-3 py-2.5 text-left text-[13px] hover:bg-raised">
                    <span className="text-amber">Launch</span> “{query}” <span className="ml-auto"><Kbd>↵</Kbd></span>
                  </button>
                </Command.Empty>
                {Object.values(approvals).length > 0 && (
                  <Group heading="Awaiting you">
                    {Object.values(approvals).map((a) => (
                      <Item key={a.id} value={`approve ${a.tool} ${JSON.stringify(a.input)}`} onSelect={() => (void decideApproval(a.id, true), close())}>
                        <span className="text-wait">Approve</span>
                        <span className="mono truncate text-fg-2">{describe(a.input) || a.tool}</span>
                        <span className="ml-auto text-[11px] text-fg-3">{a.risk} risk</span>
                      </Item>
                    ))}
                  </Group>
                )}
                {(skills.length > 0 || servers.length > 0) && (
                  <Group heading="Use in chat">
                    {skills.map((s) => (
                      <Item
                        key={`skill-${s.name}`}
                        value={`skill ${s.name}`}
                        onSelect={() => intoChat(`/skill ${s.name} `)}
                      >
                        /skill {s.name}
                        <span className="ml-auto text-[11px] text-fg-3">skill</span>
                      </Item>
                    ))}
                    {servers.map((s) => (
                      <Item
                        key={`mcp-${s.name}`}
                        value={`mcp ${s.name}`}
                        onSelect={() => intoChat(`/mcp ${s.name} `)}
                      >
                        /mcp {s.name}
                        <span className="ml-auto text-[11px] text-fg-3">mcp</span>
                      </Item>
                    ))}
                  </Group>
                )}
                {Object.values(plays).some((p) => p.status === "waiting") && (
                  <Group heading="Waiting for your review">
                    {Object.values(plays)
                      .filter((p) => p.status === "waiting")
                      .map((p) => {
                        const phase = p.phases.find((x) => x.status === "review");
                        return (
                          <Item key={p.id} value={`review ${p.title} ${phase?.name ?? ""}`} onSelect={() => go(`/plays/${p.id}`)}>
                            <Glyph name={p.emoji} fallback={p.playbook} label={p.name} size={14} className="shrink-0 text-fg-3" />
                            <span className="truncate">{phase?.name ?? "Review"} · {p.title}</span>
                            <span className="ml-auto text-[11px] text-amber">review</span>
                          </Item>
                        );
                      })}
                  </Group>
                )}
                {Object.keys(ventures).length > 0 && (
                  <Group heading="Ventures">
                    {Object.values(ventures).map((v) => (
                      <Item key={v.id} value={`venture ${v.name} ${v.pitch}`} onSelect={() => go(`/ventures/${v.id}`)}>
                        <Glyph name={v.emoji} fallback="sprout" label={v.name} size={14} className="shrink-0 text-fg-3" /> {v.name}
                        <span className="ml-auto text-[11px] text-fg-3">{v.stage}</span>
                      </Item>
                    ))}
                  </Group>
                )}
                <Group heading="Actions">
                  <Item value="launch new run" onSelect={() => openLaunch(query)}>
                    Launch a run <span className="ml-auto"><Kbd>⌘N</Kbd></span>
                  </Item>
                  <Item value="flow mode focus zen toggle" onSelect={() => (savePower({ flow: !power.flow }), close())}>
                    {power.flow ? "Leave" : "Enter"} Flow mode <span className="ml-auto"><Kbd>⌘⇧F</Kbd></span>
                  </Item>
                  <Item value="hud developer live overlay toggle" onSelect={() => (saveWorkspace({ hud: !getWorkspace().hud }), close())}>
                    {getWorkspace().hud ? "Hide" : "Show"} live HUD <span className="ml-auto"><Kbd>⌥⇧H</Kbd></span>
                  </Item>
                  <Item value="new crew room" onSelect={() => go("/rooms")}>New crew room</Item>
                  {([["events", "Open event inspector"], ["gateway-log", "Open gateway log"], ["storage", "Show storage use"], ["snippets", "Edit snippets"], ["presets", "Edit launch presets"], ["budget", "Set daily token budget"], ["session-defaults", "Set new session defaults"], ["transfer", "Export or import settings"]] as const).map(([hash, label]) => (
                    <Item key={hash} value={`settings ${label} ${hash}`} onSelect={() => (void navigate({ to: "/settings", hash }), close())}>{label}</Item>
                  ))}
                  {power.snippets.map((sn) => (
                    <Item key={sn.name} value={`snippet /${sn.name} ${sn.text}`} onSelect={() => intoChat(sn.text)}>
                      <span className="mono text-amber">/{sn.name}</span><span className="ml-2 truncate text-fg-3">{sn.text}</span>
                    </Item>
                  ))}
                  {PALETTES.map((p) => (
                    <Item key={p.id} value={`theme ${p.name} ${p.mode}`} onSelect={() => (setAppearance({ palette: p.id }), close())}>
                      Theme: {p.name}
                    </Item>
                  ))}
                  <Item value="theme follow system auto" onSelect={() => (setAppearance({ palette: "system" }), close())}>Theme: follow system</Item>
                  {ACCENTS.map((a) => (
                    <Item key={a.id} value={`accent ${a.name}`} onSelect={() => (setAppearance({ accent: a.id }), close())}>
                      Accent: {a.name}
                    </Item>
                  ))}
                </Group>
                <Group heading="Go to">
                  {NAV.map((n) => (
                    <Item key={n.to} value={`go ${n.label}`} onSelect={() => go(n.to)}>
                      <n.icon size={14} strokeWidth={1.75} className="text-fg-3" /> {n.label}
                      <span className="ml-auto"><Kbd>g</Kbd> <Kbd>{n.key}</Kbd></span>
                    </Item>
                  ))}
                </Group>
                {recent.length > 0 && (
                  <Group heading="Runs">
                    {recent.map((r) => (
                      <Item key={r.id} value={`run ${r.title} ${r.ask} ${r.id}`} onSelect={() => go(`/sessions/${r.id}`)}>
                        <span className="truncate">{r.title}</span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className="mono text-[11px] text-fg-3">{r.runtime}</span>
                          <StatusPill status={r.status} />
                        </span>
                      </Item>
                    ))}
                  </Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group heading={heading} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-fg-3">
      {children}
    </Command.Group>
  );
}

function Item({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-m)] px-3 py-2 text-[13px] text-fg data-[selected=true]:bg-raised data-[selected=true]:shadow-[inset_2px_0_0_var(--amber)]"
    >
      {children}
    </Command.Item>
  );
}

export function describe(input: unknown): string {
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    const v = o.command ?? o.file_path ?? o.path ?? o.url ?? o.pattern;
    if (Array.isArray(v)) return v.join(" ");
    if (typeof v === "string") return shortPath(v);
  }
  return "";
}

/** Paths as a person reads them: relative inside a run's workspace, ~ for home. */
export function shortPath(text: string): string {
  return text
    .replace(/\/[^\s]*?\/(?:workspace|worktrees\/[^/\s]+\/r_[0-9a-f]+)\//g, "")
    .replace(/\/Users\/[^/\s]+/g, "~");
}
