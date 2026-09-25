import type { ReactNode } from "react";
import "./setting-controls.css";

/** One setting: its name, what it does, whether it differs from the default, and its control. */
export function SettingRow({ name, detail, modified, children }: { name: string; detail?: ReactNode; modified?: boolean; children: ReactNode }) {
  return <div className="preference-row">
    <span><strong>{name}{modified && <i className="setting-modified" title="Changed from default" aria-label="Changed from default" />}</strong>{detail && <small>{detail}</small>}</span>
    <div className="setting-control">{children}</div>
  </div>;
}

/** Few options, all visible at once. Arrow keys move the choice (radiogroup semantics). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (next: T) => void }) {
  const move = (step: number) => {
    const i = options.findIndex(([id]) => id === value), next = options[(i + step + options.length) % options.length];
    if (next) onChange(next[0]);
  };
  return <div className="segmented" role="radiogroup" aria-label={label}
    onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); } if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); } }}>
    {options.map(([id, title]) => <button key={id} type="button" role="radio" aria-checked={value === id} tabIndex={value === id ? 0 : -1} className={value === id ? "is-on" : ""} onClick={() => onChange(id)}>{title}</button>)}
  </div>;
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (next: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}><span /></button>;
}
