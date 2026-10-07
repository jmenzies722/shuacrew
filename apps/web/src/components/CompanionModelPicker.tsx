import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Gauge, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useCompanion, saveCompanion } from "../lib/companion";
import { selectIntelligence } from "../lib/intelligence";
import "./model-pick.css";
export const modelPreference = (choice: string) => {
  const i = choice.indexOf(":");
  // "fastest": no pin, so the gateway picks whichever connected model is answering fastest right now (it measures).
  if (choice === "fastest") return { speed: "fastest" as const };
  return i > 0 && choice.slice(0,i) === "codex" ? { preferredRuntime: "codex", preferredModel: choice.slice(i + 1) } : { preferredRuntime: "codex" };
};
type Provider = {
  id: string;
  label: string;
  status?: { installed: boolean; signedIn: boolean | null };
  models: Array<{ id: string; label: string; unavailable?: string }>;
};
type Option = { value: string; title: string; sub: string; state: "ready" | "off" | "auto"; disabled?: boolean };
/**
 * Which brain answers: a short list you can read at a glance instead of a native menu. Each row says whether that
 * model can answer right now, Auto says what it would pick this minute, and the highlight glides to your choice.
 * Same stored values as before ("" = Auto, "fastest", "codex:<model>").
 */
export function CompanionModelPicker({ teaching = false }: { teaching?: boolean }) {
  const prefs = useCompanion(), reduceMotion = useReducedMotion(),
    [providers, setProviders] = useState<Provider[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [autoPicks, setAutoPicks] = useState<Array<{ model?: string; wait?: string }>>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void api<Provider[]>("/api/runtimes")
        .then((value) => {
          if (alive) {
            setProviders(value);
            setError("");
            setLoaded(true);
          }
        })
        .catch(() => {
          if (alive) { setError("Model availability could not be checked"); setLoaded(true); }
        });
    // What Auto would pick right now, so "Auto" never hides which model actually answers.
    const picks = () =>
      void Promise.all((["fast", "frontier"] as const).map((tier) => selectIntelligence({ ask: tier === "fast" ? "quick question" : "be precise", mode: "auto", purpose: "conversation", preferredRuntime: "codex", images: false, tier })))
        .then((choices) => alive && setAutoPicks(choices.map((c) => (c.runtime ? { model: c.model, wait: /~[\d.]+ s/.exec(c.reason)?.[0] } : {}))))
        .catch(() => alive && setAutoPicks([]));
    refresh();
    picks();
    const timer = setInterval(() => { refresh(); picks(); }, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const codex = providers.find((p) => p.id === "codex");
  const signedOut = codex?.status?.installed === false ? "Codex isn't installed" : codex?.status?.signedIn === false ? "Sign in to Codex to use it" : "";
  const modelName = (id?: string) => providers.flatMap((p) => p.models).find((m) => m.id === id)?.label ?? id;
  const autoLine = !teaching && autoPicks.length === 2
    ? (["Quick", "Precise"] as const).map((what, i) => `${what} → ${modelName(autoPicks[i]!.model) ?? "none free"}${autoPicks[i]!.wait ? ` ${autoPicks[i]!.wait}` : ""}`).join(" · ")
    : "";
  const options: Option[] = [
    { value: "", title: "Auto", sub: teaching ? "Codex visual teaching" : autoLine || "Best Codex model for each question", state: "auto" },
    ...(teaching ? [] : [{ value: "fastest", title: "Fastest available", sub: "Whichever connected model answers first · uses Claude too", state: "auto" as const }]),
    ...(codex?.models ?? []).map((m): Option => {
      const why = m.unavailable ?? signedOut;
      return { value: `codex:${m.id}`, title: m.label, sub: why || "Codex · ready", state: why ? "off" : "ready", disabled: !!why };
    }),
  ];
  const current = options.some((o) => o.value === prefs.modelChoice) ? prefs.modelChoice : "";
  const choose = (value: string) => { if (value !== prefs.modelChoice) saveCompanion({ ...prefs, modelChoice: value, brain: "auto" }); };
  return (
    <div className="model-pick" role="radiogroup" aria-label={teaching ? "Teaching model" : "Companion model"}
      onKeyDown={(e) => {
        // Arrow keys move through the choices that can answer, like any radio group.
        if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
        e.preventDefault();
        const group = e.currentTarget, live = options.filter((o) => !o.disabled), at = live.findIndex((o) => o.value === current);
        const next = live[(at + (e.key === "ArrowDown" ? 1 : live.length - 1)) % live.length];
        if (!next) return;
        choose(next.value);
        requestAnimationFrame(() => (group.querySelector(`[data-value="${CSS.escape(next.value)}"]`) as HTMLElement | null)?.focus());
      }}>
      <span className="model-pick-label">Model</span>
      {options.map((o) => {
        const on = o.value === current;
        return (
          <button key={o.value || "auto"} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-value={o.value}
            disabled={o.disabled} className={`model-pick-row is-${o.state}${on ? " is-on" : ""}`} onClick={() => choose(o.value)} title={o.sub}>
            {on && <motion.i className="model-pick-glow" layoutId={teaching ? "model-pick-teach" : "model-pick"} aria-hidden
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38, mass: 0.7 }} />}
            <span className="model-pick-mark" aria-hidden>{o.value === "" ? <Sparkles size={13} /> : o.value === "fastest" ? <Gauge size={13} /> : <i />}</span>
            <span className="model-pick-text"><b>{o.title}</b><small>{o.sub}</small></span>
            {on && <Check className="model-pick-check" size={14} strokeWidth={2.6} aria-hidden />}
          </button>
        );
      })}
      {!loaded && <span className="model-pick-loading" aria-hidden><i /><i /></span>}
      {error && <small className="model-pick-note">{error}</small>}
      {teaching && <small className="model-pick-note">Visual teaching and companion chat use your connected ChatGPT/Codex subscription.</small>}
    </div>
  );
}
