import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useCompanion, saveCompanion } from "../lib/companion";
import { selectIntelligence } from "../lib/intelligence";
export const modelPreference = (choice: string) => {
  const i = choice.indexOf(":");
  return i > 0 ? { preferredRuntime: choice.slice(0, i), preferredModel: choice.slice(i + 1) } : {};
};
type Provider = {
  id: string;
  label: string;
  status?: { installed: boolean; signedIn: boolean | null };
  models: Array<{ id: string; label: string; unavailable?: string }>;
};
export function CompanionModelPicker({ teaching = false }: { teaching?: boolean }) {
  const prefs = useCompanion(),
    [providers, setProviders] = useState<Provider[]>([]),
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
          }
        })
        .catch(() => {
          if (alive) setError("Model availability could not be checked");
        });
    // What Auto would pick right now, so "Auto" never hides which model actually answers.
    const picks = () =>
      void Promise.all((["fast", "frontier"] as const).map((tier) => selectIntelligence({ ask: tier === "fast" ? "quick question" : "be precise", mode: "auto", purpose: "conversation", images: false, tier })))
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
  return (
    <label className="companion-model-picker">
      <span>Model</span>
      <select
        aria-label={teaching ? "Teaching model" : "Companion model"}
        value={prefs.modelChoice}
        onChange={(e) =>
          saveCompanion({
            ...prefs,
            modelChoice: e.target.value,
            brain: "auto",
          })
        }
      >
        <option value="">{teaching ? "Auto · Codex visual teaching" : "Auto · best Codex model per question"}</option>
        {providers
          .filter((p) => p.id === "codex")
          .map((p) => (
            <optgroup key={p.id} label={p.label}>
              {p.models.map((m) => (
                <option
                  key={m.id}
                  value={`${p.id}:${m.id}`}
                  disabled={!!m.unavailable || p.status?.installed === false || p.status?.signedIn === false}
                >
                  {m.label}
                  {m.unavailable ? ` · ${m.unavailable}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
      {!prefs.modelChoice && !teaching && autoPicks.length === 2 && (
        <small>
          {(["Quick asks", "Precise asks"] as const).map((what, i) => {
            const pick = autoPicks[i]!, label = providers.flatMap((p) => p.models).find((m) => m.id === pick.model)?.label ?? pick.model;
            return `${i ? " · " : ""}${what} → ${label ?? "none free"}${pick.wait ? ` (${pick.wait})` : ""}`;
          })}
        </small>
      )}
      {error && <small>{error}</small>}
      {teaching && (
        <small>
          Visual teaching and companion chat use your connected ChatGPT/Codex subscription.
        </small>
      )}
    </label>
  );
}
