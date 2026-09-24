import type { SiteView } from "@shuacrew/core/projections";
import { Button } from "@shuacrew/ui";
import { Check, Copy, ExternalLink, Globe, Loader2, Rocket, Terminal, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { CountUp } from "../lib/motion";

/** The site a page is live at, if it's been published. */
export function useSiteFor(artifact?: string): SiteView | undefined {
  return useLive((s) => (artifact ? Object.values(s.crew.sites).find((x) => x.artifact === artifact) : undefined));
}

/** "Publish" in the page viewer: a button, or where it's live and how many joined. */
export function PublishButton({ artifact, version }: { artifact: string; version: number }) {
  const site = useSiteFor(artifact);
  const [open, setOpen] = useState(false);
  return (
    <>
      {site ? (
        <button className="pub-live" onClick={() => setOpen(true)} title="Live on the web">
          <span className="pub-dot" /> Live{site.signups ? ` · ${site.signups.count} joined` : ""}
          {site.version < version && <span className="text-amber"> · update</span>}
        </button>
      ) : (
        <Button size="s" onClick={() => setOpen(true)}>
          <Rocket size={12} /> Publish
        </Button>
      )}
      {open && <PublishSheet artifact={artifact} version={version} onClose={() => setOpen(false)} />}
    </>
  );
}

export function PublishSheet({ artifact, version, onClose }: { artifact: string; version: number; onClose: () => void }) {
  const site = useSiteFor(artifact);
  const [status, setStatus] = useState<{ cli: boolean; user?: string; hint?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [latest, setLatest] = useState<Array<{ email: string; at: string }> | null>(null);
  useEffect(() => {
    void api<{ cli: boolean; user?: string; hint?: string }>("/api/sites/status").then(setStatus).catch(() => setStatus({ cli: false, hint: "couldn't check the Vercel CLI" }));
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (site) void api<{ latest: Array<{ email: string; at: string }> }>(`/api/sites/${site.id}/signups`).then((r) => setLatest(r.latest)).catch(() => setLatest([]));
  }, [site?.id]);
  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/sites", { body: { artifact } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = status?.cli && status.user;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4 backdrop-blur-[3px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Publish">
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-[560px] max-w-full rounded-[18px] border border-line-strong bg-panel p-6 shadow-[0_30px_90px_rgba(0,0,0,.5)]">
        <div className="flex items-center gap-3">
          <span className="pub-orb">
            <Globe size={18} />
          </span>
          <div>
            <div className="text-[17px] font-semibold">{site ? "Live on the web" : "Publish to the web"}</div>
            <div className="text-[12.5px] text-fg-3">{site ? "Every email that joins is counted in the venture and the morning briefing." : "A real address, with a waitlist that collects emails."}</div>
          </div>
        </div>

        {site && (
          <div className="pub-url">
            <a href={site.url} target="_blank" rel="noreferrer" className="mono min-w-0 flex-1 truncate text-[13px] text-fg hover:underline">
              {site.url.replace(/^https:\/\//, "")}
            </a>
            <button className="member-icon" onClick={() => void navigator.clipboard.writeText(site.url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))} aria-label="Copy the address">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <a className="member-icon" href={site.url} target="_blank" rel="noreferrer" aria-label="Open the site">
              <ExternalLink size={13} />
            </a>
          </div>
        )}

        {site && (
          <div className="mt-4 grid grid-cols-[auto_1fr] items-start gap-4">
            <div className="pub-count">
              <span><CountUp value={site.signups?.count ?? 0} /></span>
              <em>joined</em>
            </div>
            <div className="min-w-0">
              {site.signupsError ? (
                <p className="text-[12.5px] leading-relaxed text-fg-3">
                  {/Blob/i.test(site.signupsError) ? (
                    <>
                      Signups aren't being stored yet: in Vercel, open the <b className="text-fg">{site.project}</b> project → <b className="text-fg">Storage</b> → <b className="text-fg">Create → Blob</b> and connect it (free on Hobby), then republish.
                    </>
                  ) : (
                    site.signupsError
                  )}
                </p>
              ) : latest === null ? (
                <Loader2 size={13} className="animate-spin text-fg-3" />
              ) : latest.length ? (
                <div className="grid gap-1">
                  {latest.slice(0, 5).map((s) => (
                    <div key={s.email + s.at} className="flex items-center gap-2 text-[12.5px]">
                      <Users size={11} className="text-fg-3" />
                      <span className="min-w-0 flex-1 truncate text-fg-2">{s.email}</span>
                      <span className="text-[11px] text-fg-3">{new Date(s.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-fg-3">No one yet — share the link.</p>
              )}
            </div>
          </div>
        )}

        {!site && (
          <ul className="pub-points">
            <li>The page goes live at a <span className="mono">vercel.app</span> address you can put a domain on later.</li>
            <li>Any email form on it becomes a working waitlist; signups are stored in your Vercel project.</li>
            <li>It's deployed with your own Vercel login — ShuaCrew never sees your token.</li>
          </ul>
        )}

        {status && !ready && (
          <div className="pub-hint">
            <Terminal size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">{status.cli ? "Log in to Vercel once, then publish:" : status.hint}</span>
            {status.cli && <code className="mono">vercel login</code>}
          </div>
        )}
        {error && <div className="mt-3 text-[12.5px] text-bad">{error}</div>}

        <div className="mt-6 flex items-center gap-2">
          {status?.user && <span className="text-[11.5px] text-fg-3">as {status.user}</span>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            {site ? "Done" : "Cancel"}
          </Button>
          <Button variant="primary" disabled={!ready || busy} onClick={() => void publish()}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />} {busy ? "Publishing…" : site ? (site.version < version ? `Publish v${version}` : "Republish") : "Publish"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
