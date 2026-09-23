import type { Decision } from "@shuacrew/core/policy-types";
import { Button, Eyebrow, Panel, StatusGlyph } from "@shuacrew/ui";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useLive, type Theme } from "../lib/live";

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

export function Specs() {
  const openLaunch = useLive((s) => s.openLaunch);
  return (
    <Page title="Specs" subtitle="Requirements → design → tasks, each phase approved here, then fanned out as runs on the board.">
      <Starter
        items={[
          { title: "Start a spec", detail: "Describe a feature; the planner drafts EARS requirements for you to approve.", onClick: () => openLaunch("Draft a spec for: ") },
          { title: "Spec from an issue", detail: "Paste an issue URL and turn it into requirements and tasks." },
          { title: "Where specs live", detail: "In your repo under .shuacrew/specs/ — reviewed like code." },
        ]}
      />
    </Page>
  );
}

export function Schedules() {
  return (
    <Page title="Schedules & Triggers" subtitle="Cron jobs, webhooks and heartbeats — work that runs while you don't.">
      <Starter
        items={[
          { title: "Weekdays 9am: triage issues", detail: "A schedule in plain words, with the next five runs previewed before you save." },
          { title: "Nightly dependency check", detail: "A script-only job: no model call, no usage — it only wakes an agent if something changed." },
          { title: "Webhook: CI failed", detail: "An authenticated endpoint that starts a run with the failure attached." },
        ]}
      />
    </Page>
  );
}

export function Memory() {
  return (
    <Page title="Memory" subtitle="Lessons with provenance and confidence, skills you approve, preferences — all inspectable, all deletable.">
      <Starter
        items={[
          { title: "Lessons come from you", detail: "Correct a run or reject a review and ShuaCrew asks what it should learn." },
          { title: "Skills are proposed, never assumed", detail: "Repeated patterns become skill drafts that wait for your approval." },
          { title: "Proven, not hoped", detail: "An eval suite shows whether a lesson actually changed the next run." },
        ]}
      />
    </Page>
  );
}

export function Integrations() {
  return (
    <Page title="Integrations & Apps" subtitle="MCP servers, Slack and Telegram, and installable Apps — each behind its own policy.">
      <Starter
        items={[
          { title: "Connect Slack", detail: "Threads become sessions; approve runs with buttons. Outbound-only — no public port." },
          { title: "Add an MCP server", detail: "GitLab, Jira, Confluence — with a health check and per-server policy." },
          { title: "Install an App", detail: "GitLab MR tracker, Terraform plan reviewer with an apply gate." },
        ]}
      />
    </Page>
  );
}

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
  const theme = useLive((s) => s.theme);
  const setTheme = useLive((s) => s.setTheme);
  const [runtimes, setRuntimes] = useState<RuntimeRow[]>([]);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      setRuntimes(await api<RuntimeRow[]>("/api/runtimes"));
    } finally {
      setTesting(false);
    }
  };
  useEffect(() => {
    void test();
  }, []);
  return (
    <Page title="Settings" subtitle="Runtimes, appearance and data. Nothing leaves this machine unless you turn it on.">
      <Panel className="p-5">
        <Eyebrow className="mb-3">Appearance</Eyebrow>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {(["system", "dark", "light"] as Theme[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`h-8 rounded-[var(--radius-m)] border px-3 text-[12.5px] ${theme === t ? "border-amber text-amber" : "border-line-strong text-fg-2"}`}>
              {t === "dark" ? "Night" : t === "light" ? "Day" : "Follow system"}
            </button>
          ))}
        </div>
      </Panel>
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
