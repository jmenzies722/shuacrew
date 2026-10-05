/**
 * Atmosphere: how the workspace feels around your work — each section's light, how round everything is, and the slow
 * aurora behind it all. Every choice shows itself in a small preview before you pick it.
 */
import { saveLook, useLook, type LookPrefs } from "../lib/look";

const AMBIENT: Array<[LookPrefs["ambient"], string, string]> = [["off", "Off", "Pure black, nothing behind"], ["subtle", "Subtle", "A soft light per section"], ["vivid", "Vivid", "Each section glows"]];
const CORNERS: Array<[LookPrefs["corners"], string, string, number]> = [["crisp", "Crisp", "Precise, editor-like", 6], ["soft", "Soft", "Balanced (default)", 12], ["round", "Round", "Friendly and plush", 20]];

export function AtmosphereSettings() {
  const look = useLook();
  return <div className="atmo">
    <div className="type-pick atmo-row" role="radiogroup" aria-label="Ambient light"><span className="type-pick-label">Light</span>
      {AMBIENT.map(([id, name, note]) => <button key={id} type="button" role="radio" aria-checked={look.ambient === id} className={look.ambient === id ? "is-on" : ""} onClick={() => saveLook({ ambient: id })}>
        <i className={`atmo-glow is-${id}`} aria-hidden="true" /><span>{name}</span><small>{note}</small></button>)}
      <button type="button" role="switch" aria-checked={look.livingBackground} className={look.livingBackground ? "is-on" : ""} onClick={() => saveLook({ livingBackground: !look.livingBackground })}>
        <i className="atmo-aurora" aria-hidden="true" /><span>Aurora</span><small>{look.livingBackground ? "A slow aurora behind everything" : "Off · tap for a slow aurora"}</small></button>
    </div>
    <div className="type-pick atmo-row" role="radiogroup" aria-label="Corners"><span className="type-pick-label">Corners</span>
      {CORNERS.map(([id, name, note, r]) => <button key={id} type="button" role="radio" aria-checked={look.corners === id} className={look.corners === id ? "is-on" : ""} onClick={() => saveLook({ corners: id })}>
        <i className="atmo-corner" style={{ borderRadius: r }} aria-hidden="true" /><span>{name}</span><small>{note}</small></button>)}
    </div>
  </div>;
}
