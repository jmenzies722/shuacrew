import { companionName } from "../lib/companion";
import { useEffect, useState } from "react";
import { ArrowUpRight, AudioLines, BrainCircuit, Check, ChevronRight, Laptop, Palette, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { useCompanion } from "../lib/companion";
import { sparkVars } from "../lib/spark-color";
import { SparkCharacter } from "./SparkCharacter";
import { setSparkPanel } from "../lib/spark-panel";
import { useLive } from "../lib/live";
import "./connected-settings.css";

type Provider = { id: string; label: string; models: Array<{ id: string; unavailable?: string }>; status: { installed: boolean; signedIn: boolean | null }; limitedUntil: number | null };
export function ConnectedSettings({ go }: { go: (section: string) => void }) {
  const prefs = useCompanion(), connection = useLive(s => s.connection), limits = useLive(s => s.crew.limited);
  const [providers, setProviders] = useState<Provider[]>([]), [error, setError] = useState(""), [checking, setChecking] = useState(true);
  useEffect(() => {
    let live = true;
    const load = () => void api<Provider[]>("/api/runtimes").then(rows => { if (live) { setProviders(rows.filter(r => r.id !== "mock")); setError(""); } }).catch(() => { if (live) setError("Could not check providers. Your saved preferences are unchanged."); }).finally(() => { if (live) setChecking(false); });
    load(); const timer = setInterval(load, 30_000); window.addEventListener("focus", load);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", load); };
  }, []);
  const name = companionName(prefs);
  return <div className="connected-settings">
    <section className="connected-hero" style={sparkVars(prefs.color)}>
      <div className="connected-portrait"><SparkCharacter preferences={prefs} mood="idle" size={126} /></div>
      <div><span className="connected-eyebrow">YOUR COMPANION, EVERYWHERE</span><h2>A little {name}.<br />A lot more possible.</h2><p>One conversation for your work, your ideas, and what comes next.</p>
        <div className="connected-actions"><button type="button" className="connected-primary" onClick={() => setSparkPanel(true)}><Sparkles size={14} /> Open {name}</button><button type="button" onClick={() => go("play")}>Make it yours <ChevronRight size={14} /></button></div>
      </div>
    </section>
    <section className="connected-providers" aria-label="Connected intelligence">
      <div className="connected-section-title"><div><span className="connected-eyebrow">INTELLIGENCE</span><h3>One crew. Your connected models.</h3></div><button type="button" onClick={() => go("agents")}>Manage <ArrowUpRight size={14} /></button></div>
      <p>Auto follows your routing preferences. Each subscription keeps its own usage limits.</p>
      <div className="connected-provider-grid">{providers.map(provider => {
        const recorded = Object.entries(limits).filter(([key]) => key === provider.id || key.startsWith(`${provider.id} · `));
        const paused = (provider.limitedUntil ?? 0) > Date.now() || (provider.models.length > 0 && provider.models.every(m => m.unavailable));
        const label = connection !== "live" ? "Gateway disconnected" : !provider.status.installed ? "Not connected" : provider.status.signedIn === false ? "Sign in needed" : paused ? "Usage limited" : recorded.length ? "Ready to retry" : provider.status.signedIn === null ? "Sign-in unverified" : "Ready to try";
        return <button type="button" key={provider.id} onClick={() => go("agents")} className="connected-provider"><span className="connected-provider-icon">{provider.id === "local" ? <Laptop size={19} /> : <BrainCircuit size={19} />}</span><strong>{provider.label}</strong><span className="connected-provider-state"><i data-ready={label === "Ready to try" ? "true" : undefined} />{label}</span></button>;
      })}</div>
      {checking && <p role="status"><RefreshCw size={12} /> Checking your connections…</p>}{error && <p role="alert">{error}</p>}
      <small><Check size={12} /> Recovery is confirmed by a successful response, not a countdown.</small>
    </section>
    <div className="connected-shortcuts">{[
      { id: "appearance", icon: Palette, name: "Your workspace", description: "The color, the rhythm, the details." },
      { id: "play", icon: Sparkles, name: "Shua presence", description: prefs.desktopPlacement === "notch" ? "At home in your MacBook notch." : "On your desktop. Ready when you are." },
      { id: "voice", icon: AudioLines, name: "A familiar voice", description: "Local speech, at your pace." },
    ].map(item => <button type="button" key={item.id} onClick={() => go(item.id)}><item.icon size={19} /><strong>{item.name}</strong><span>{item.description}</span><ChevronRight size={15} /></button>)}</div>
    <section className="connected-loop"><div><span className="connected-eyebrow">MAKE IT COMPOUND</span><h3>Good work should carry forward.</h3><p>Choose today's priority. Build with your crew. Keep what you learn.</p></div><div><Link to="/activity">Plan today <ArrowUpRight size={14} /></Link><Link to="/learn">Keep learning <ArrowUpRight size={14} /></Link></div></section>
  </div>;
}
