import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, Copy, Wrench } from "lucide-react";
import { toolCard, toolText } from "../lib/tool-card";
import { useToolPreferences } from "../lib/tool-preferences";
import { SourceLink } from "./Pane";
import "./tool-activity.css";

/** Reviewed bundled marks only (apps/web/public/brands/manifest.json); ids never become arbitrary paths. */
const BRANDS: Record<string, string> = { github: "GitHub", "chrome-devtools": "Chrome DevTools", supabase: "Supabase", neon: "Neon", vercel: "Vercel", cloudflare: "Cloudflare", sentry: "Sentry", posthog: "PostHog", stripe: "Stripe", paypal: "PayPal", figma: "Figma", linear: "Linear", notion: "Notion", atlassian: "Atlassian" };
export function hasBrand(assetId?: string | null): assetId is string { return !!assetId && Object.hasOwn(BRANDS, assetId); }
export function BrandIcon({ assetId, fallback }: { assetId?: string | null; fallback?: ReactNode }) {
  const preferences = useToolPreferences();
  if (!preferences.showIcons) return fallback ?? null;
  return hasBrand(assetId) ? <span className="tool-brand" aria-label={BRANDS[assetId]}><img className="brand-light" src={`/brands/${assetId}-light.svg`} alt="" /><img className="brand-dark" src={`/brands/${assetId}-dark.svg`} alt="" /></span> : fallback ?? <Wrench className="tool-neutral" size={17} aria-hidden="true" />;
}
export function ToolActivityCard({ name, status, input, output, startedAt, endedAt, runId, brand, origin }: {
  name: string; status: string; input?: unknown; output?: unknown; startedAt?: number; endedAt?: number; runId?: string;
  brand?: { assetId: string | null; publisher: "official" | "community" | "unknown" }; origin?: string;
}) {
  const preferences = useToolPreferences(), card = toolCard({ name, status, output, startedAt, endedAt });
  const [open, setOpen] = useState(preferences.expandErrors && card.status === "failed");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (preferences.expandErrors && card.status === "failed") setOpen(true); }, [card.status, preferences.expandErrors]);
  const copy = async () => { try { await navigator.clipboard.writeText(card.text); setNotice("Copied redacted output"); } catch { setNotice("Copy unavailable. Select the output below."); } };
  return <article className={`tool-activity density-${preferences.density} status-${card.status}`}>
    <button className="tool-activity-heading" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <BrandIcon assetId={brand?.assetId} /><span className="tool-activity-name">{card.title.replace(/^mcp__/, "").replaceAll("__", " · ").replaceAll("_", " ")}</span>
      <span className="tool-activity-status">{card.status === "succeeded" && <Check size={12} />}{card.status}</span>
      {card.durationMs !== null && <time>{card.durationMs < 1000 ? `${card.durationMs} ms` : `${(card.durationMs / 1000).toFixed(1)} s`}</time>}
      <ChevronRight size={14} className={open ? "is-open" : ""} />
    </button>
    {open && <div className="tool-activity-detail">
      <p className="tool-provenance">{brand?.publisher === "community" ? "Community connector" : brand?.publisher === "official" ? "Recognized publisher endpoint" : "Publisher unverified"}{origin ? ` · ${origin}` : ""}. Branding does not grant permissions.</p>
      {input !== undefined && <details><summary>Inspect inputs</summary><pre>{toolText(input)}</pre></details>}
      <div className="tool-output"><span>RECORDED OUTPUT</span><pre>{card.text}</pre></div>
      <footer><button onClick={() => void copy()}><Copy size={13} />Copy output</button>{runId && <SourceLink to={`/sessions/${runId}`} label="Inspect source" />}<SourceLink to="/integrations" label="Connector settings" /></footer>
      {notice && <p role="status">{notice}</p>}
    </div>}
  </article>;
}
