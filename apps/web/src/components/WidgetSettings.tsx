import { ChevronDown, ChevronUp, Monitor, Sparkles } from "lucide-react";
import { moveWidget, saveWidgets, toggleWidget, useWidgets, WIDGET_INFO, DEFAULT_WIDGETS, type WidgetId } from "../lib/widgets";
import { WidgetTile } from "./TopBarWidgets";
import { Switch } from "./SettingControls";
import { useNavigate } from "@tanstack/react-router";
import "./widget-settings.css";

/** Every widget: where it shows (top bar, Spark, both), its order, and a live preview of it. */
export function WidgetSettings() {
  const prefs = useWidgets(), navigate = useNavigate();
  const ctx = { go: (path: string) => void navigate({ to: path }) };
  return <div className="settings-card wgs">
    <p className="power-hint" style={{ padding: "0 0 8px" }}>All widgets use real data from this Mac and your crew. Changes reach the top bar and Shua instantly.</p>
    <ol className="wgs-list">{prefs.order.map((id: WidgetId, i) => {
      const top = prefs.topbar.includes(id), spark = prefs.spark.includes(id);
      return <li key={id} className={top || spark ? "is-on" : ""}>
        <div className="wgs-order">
          <button type="button" aria-label={`Move ${WIDGET_INFO[id].name} up`} disabled={i === 0} onClick={() => saveWidgets({ order: moveWidget(prefs.order, id, -1) })}><ChevronUp size={13} /></button>
          <button type="button" aria-label={`Move ${WIDGET_INFO[id].name} down`} disabled={i === prefs.order.length - 1} onClick={() => saveWidgets({ order: moveWidget(prefs.order, id, 1) })}><ChevronDown size={13} /></button>
        </div>
        <div className="wgs-text"><strong>{WIDGET_INFO[id].name}</strong><small>{WIDGET_INFO[id].blurb}</small></div>
        <label className="wgs-place" title="Show in the top bar"><Monitor size={12} /><span>Top bar</span><Switch label={`${WIDGET_INFO[id].name} in the top bar`} on={top} onChange={(on) => toggleWidget(id, "topbar", on)} /></label>
        <label className="wgs-place" title="Show in Shua's Widgets tab"><Sparkles size={12} /><span>Shua</span><Switch label={`${WIDGET_INFO[id].name} in Shua`} on={spark} onChange={(on) => toggleWidget(id, "spark", on)} /></label>
        {(top || spark) && <details className="wgs-preview"><summary>Preview &amp; options</summary><div className="wg-tile"><WidgetTile id={id} ctx={ctx} /></div></details>}
      </li>;
    })}</ol>
    <div className="wgs-foot"><button type="button" className="tb-btn" onClick={() => saveWidgets({ ...DEFAULT_WIDGETS, zones: prefs.zones, countdown: prefs.countdown })}>Reset layout</button></div>
  </div>;
}
