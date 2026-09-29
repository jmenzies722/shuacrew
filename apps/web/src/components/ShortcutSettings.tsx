import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { NAV } from "../shell/Shell";
import { keyOwner, navKey, resetNavKeys, setNavKey, useNavKeys, validKey } from "../lib/keys";

/** Rebind "g then key" navigation. Press the new key; clashes are explained, never silently taken. */
export function ShortcutSettings() {
  useNavKeys();
  const [listening, setListening] = useState<string | null>(null), [notice, setNotice] = useState("");
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setListening(null); return; }
      const k = e.key.toLowerCase();
      if (!validKey(k)) { setNotice(k === "g" ? "g starts every shortcut — pick another key." : "Use a letter, number or , . ; / [ ] -"); return; }
      const clash = keyOwner(NAV as never, k, listening);
      if (clash) { setNotice(`${k} already opens ${clash.label}. Change that one first.`); return; }
      setNavKey(listening, k, NAV as never); setNotice(""); setListening(null);
    };
    window.addEventListener("keydown", onKey, true); return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]);
  return <div className="settings-card">
    <p className="power-hint" style={{ paddingTop: 14 }}>Press <kbd>g</kbd> then a key to jump anywhere. Click a key to change it, then press the new one (<kbd>Esc</kbd> cancels).</p>
    <ul className="shortcut-grid">{NAV.map((n) => { const k = navKey(n), changed = k !== n.key; return <li key={n.to}>
      <span><n.icon size={14} />{n.label}</span>
      <button type="button" className={`shortcut-key ${listening === n.to ? "is-listening" : ""} ${changed ? "is-changed" : ""}`} onClick={() => { setListening(listening === n.to ? null : n.to); setNotice(""); }} aria-label={`Change shortcut for ${n.label} (now g ${k})`}>
        <kbd>g</kbd><kbd>{listening === n.to ? "…" : k}</kbd></button>
      {changed && <button type="button" className="shortcut-reset" aria-label={`Reset ${n.label}`} onClick={() => setNavKey(n.to, null, NAV as never)}><RotateCcw size={11} /></button>}
    </li>; })}</ul>
    {notice && <p role="alert" className="power-hint" style={{ color: "var(--wait)" }}>{notice}</p>}
    <div style={{ padding: "0 16px 14px" }}><button type="button" className="settings-reset" onClick={() => { resetNavKeys(); setNotice("All shortcuts back to their defaults."); }}><RotateCcw size={12} /> Reset all</button></div>
  </div>;
}
