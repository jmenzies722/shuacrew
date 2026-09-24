import type { Decision } from "@shuacrew/core/policy-types";
import { Button, Eyebrow, Panel, StatusGlyph } from "@shuacrew/ui";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { ACCENTS, PALETTES, resolvePalette, type Palette } from "../lib/appearance";
import { useLive } from "../lib/live";

export { Specs } from "./Specs";

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 text-[13px] text-fg-2">{subtitle}</p>
        <div className="mt-6 flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

/** Empty states teach: what this screen is for, and two or three ways to start. */
function Starter({ items }: { items: Array<{ title: string; detail: string; onClick?: () => void }> }) {
  return (
    <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
      {items.map((s) => (
        <button key={s.title} onClick={s.onClick} className="rounded-[var(--radius-l)] border border-dashed border-line-strong bg-panel p-4 text-left transition hover:border-amber">
          <div className="text-[13.5px] font-medium">{s.title}</div>
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-fg-2">{s.detail}</div>
        </button>
      ))}
    </div>
  );
}

export { Integrations } from "./Integrations";

export function Policy() {
  const [verify, setVerify] = useState<{ ok: boolean; count: number; brokenAt?: number; why?: string } | null>(null);
  const [command, setCommand] = useState("git push --force origin main");
  const [explained, setExplained] = useState<Decision | null>(null);
  const explain = async () => setExplained(await api<Decision>("/api/policy/explain", { body: { tool: "Bash", input: { command } } }));
  useEffect(() => {
    void explain();
  }, []);
  return (
    <Page title="Policy & Audit" subtitle="One policy for every runtime, tightest rule wins. Every decision says which rule made it.">
      <Panel className="p-5">
        <Eyebrow className="mb-3">Why would this be allowed?</Eyebrow>
        <div className="flex gap-2">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void explain()}
            className="mono h-9 flex-1 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[12.5px] outline-none focus:border-amber"
            aria-label="Command to explain"
          />
          <Button onClick={() => void explain()}>Explain</Button>
        </div>
        {explained && (
          <div className="mt-4 text-[13px]">
            <div className="flex items-center gap-2">
              <StatusGlyph tone={explained.verdict === "allow" ? "ok" : explained.verdict === "deny" ? "bad" : "wait"} />
              <span className="font-medium capitalize">{explained.verdict}</span>
              <span className="text-fg-2">— {explained.reason}</span>
            </div>
            <div className="mt-2 text-[12px] text-fg-3">
              Rule <span className="mono text-fg-2">{explained.rule}</span> in the <span className="mono text-fg-2">{explained.layer}</span> layer · risk {explained.risk}
            </div>
          </div>
        )}
      </Panel>
      <Panel className="p-5">
        <Eyebrow className="mb-3">Audit log</Eyebrow>
        <p className="text-[13px] text-fg-2">Every event is chained to the one before it with SHA-256. Changing, deleting or reordering any of them breaks the chain.</p>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={async () => setVerify(await api("/api/audit/verify"))}>Verify the chain</Button>
          {verify && (
            <span className={`flex items-center gap-2 text-[13px] ${verify.ok ? "text-ok" : "text-bad"}`}>
              <StatusGlyph tone={verify.ok ? "ok" : "bad"} />
              {verify.ok ? `Intact — ${verify.count.toLocaleString()} events verified` : `Broken at event #${verify.brokenAt}: ${verify.why}`}
            </span>
          )}
        </div>
      </Panel>
    </Page>
  );
}

interface RuntimeRow {
  id: string;
  label: string;
  authMode: string;
  status: { installed: boolean; signedIn: boolean | null; account?: string; version?: string; detail: string; overridingKeys: string[] };
  limitedUntil: number | null;
}

export function Settings() {
  const [runtimes, setRuntimes] = useState<RuntimeRow[]>([]);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      setRuntimes(await api<RuntimeRow[]>("/api/runtimes?fresh=1"));
    } finally {
      setTesting(false);
    }
  };
  useEffect(() => {
    void test();
  }, []);
  return (
    <Page title="Settings" subtitle="Runtimes, appearance and data. Nothing leaves this machine unless you turn it on.">
      <Appearance />
      <Panel className="p-5">
        <div className="mb-3 flex items-center">
          <Eyebrow>Runtimes</Eyebrow>
          <Button size="s" className="ml-auto" onClick={() => void test()} disabled={testing}>
            {testing ? "Testing…" : "Test connections"}
          </Button>
        </div>
        <div className="divide-y divide-line">
          {runtimes.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <StatusGlyph tone={!r.status.installed ? "bad" : r.limitedUntil ? "live" : r.status.signedIn === false ? "bad" : "ok"} />
              <span className="w-40 font-medium">{r.label}</span>
              <span className="mono w-28 text-[12px] text-fg-2">{r.authMode}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg-2">
                {r.status.account ? `${r.status.account} · ` : ""}
                {r.status.detail}
              </span>
              {r.status.overridingKeys.length > 0 && <span className="text-[12px] text-bad">{r.status.overridingKeys.join(", ")} would override your plan</span>}
            </div>
          ))}
        </div>
      </Panel>
    </Page>
  );
}

/** Pick a look: each card is a small, true-to-palette picture of the app. */
function Appearance() {
  const appearance = useLive((s) => s.appearance);
  const set = useLive((s) => s.setAppearance);
  const active = resolvePalette(appearance);
  const follow = appearance.palette === "system";
  return (
    <Panel className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Eyebrow>Appearance</Eyebrow>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] text-fg-2">
          <input type="checkbox" checked={follow} onChange={(e) => set({ palette: e.target.checked ? "system" : active.id })} className="accent-[var(--amber)]" />
          Follow system — {PALETTES.find((p) => p.id === appearance.dark)?.name} at night, {PALETTES.find((p) => p.id === appearance.light)?.name} by day
        </label>
      </div>
      {(["dark", "light"] as const).map((mode) => (
        <div key={mode} className="mb-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{mode === "dark" ? "Dark" : "Light"}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3" role="radiogroup" aria-label={`${mode} themes`}>
            {PALETTES.filter((p) => p.mode === mode).map((p) => {
              const selected = follow ? appearance[mode] === p.id : active.id === p.id;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set(follow ? { [mode]: p.id } : { palette: p.id })}
                  className={`theme-card ${selected ? "is-selected" : ""}`}
                >
                  <ThemePreview palette={p} accent={ACCENTS.find((a) => a.id === appearance.accent)![p.mode]} />
                  <span className="mt-2 flex items-center justify-between px-0.5">
                    <span className="text-[12.5px] font-medium text-fg">{p.name}</span>
                    {selected && <span className="h-2 w-2 rounded-full bg-amber" />}
                  </span>
                  <span className="block px-0.5 text-left text-[11.5px] text-fg-3">{p.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Accent</div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((a) => (
          <button key={a.id} role="radio" aria-checked={appearance.accent === a.id} onClick={() => set({ accent: a.id })} className={`accent-pill ${appearance.accent === a.id ? "is-selected" : ""}`}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: a[active.mode], boxShadow: "inset 0 0 0 1px rgba(128,128,128,.35)" }} />
            {a.name}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** A miniature of the app in a palette: rail, sessions, a thread, the composer. */
function ThemePreview({ palette, accent }: { palette: Palette; accent: string }) {
  const [win, panel, raised, text] = palette.swatch;
  const faint = palette.mode === "dark" ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.12)";
  return (
    <svg viewBox="0 0 168 100" className="block w-full rounded-[8px]" aria-hidden>
      <rect width="168" height="100" fill={win} />
      <rect x="4" y="4" width="10" height="92" rx="3" fill={panel} />
      <circle cx="9" cy="11" r="2.2" fill={accent} />
      <rect x="18" y="4" width="42" height="92" rx="4" fill={panel} />
      <rect x="22" y="9" width="20" height="3" rx="1.5" fill={text} opacity=".8" />
      <rect x="21" y="16" width="36" height="14" rx="3" fill={raised} />
      <rect x="24" y="19" width="26" height="2.5" rx="1.2" fill={text} opacity=".7" />
      <rect x="24" y="24" width="18" height="2.5" rx="1.2" fill={accent} opacity=".9" />
      <rect x="21" y="33" width="36" height="12" rx="3" fill={faint} opacity=".35" />
      <rect x="64" y="4" width="100" height="92" rx="4" fill={panel} />
      <rect x="120" y="11" width="38" height="9" rx="4.5" fill={raised} />
      <rect x="70" y="25" width="70" height="3" rx="1.5" fill={text} opacity=".75" />
      <rect x="70" y="31" width="56" height="3" rx="1.5" fill={text} opacity=".45" />
      <rect x="70" y="39" width="88" height="14" rx="4" fill={raised} stroke={faint} strokeWidth=".6" />
      <circle cx="76" cy="46" r="2" fill={accent} />
      <rect x="81" y="44.8" width="40" height="2.5" rx="1.2" fill={text} opacity=".6" />
      <rect x="70" y="76" width="88" height="14" rx="5" fill={win} stroke={faint} strokeWidth=".6" />
      <circle cx="151" cy="83" r="4" fill={accent} />
    </svg>
  );
}
