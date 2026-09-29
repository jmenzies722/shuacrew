import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useCompanion, saveCompanion } from "../lib/companion";
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
    [error, setError] = useState("");
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
    refresh();
    const timer = setInterval(refresh, 30000);
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
        <option value="">{teaching ? "Auto · Claude visual teaching" : "Auto · connected models"}</option>
        {providers
          .filter((p) => p.id !== "mock" && p.id !== "local")
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
      {error && <small>{error}</small>}
      {teaching && (
        <small>
          Visual teaching currently uses Claude’s tool-free structured output. Codex and local remain
          available for companion chat.
        </small>
      )}
    </label>
  );
}
