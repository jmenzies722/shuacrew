import { Link } from "@tanstack/react-router";
import { DeveloperSettings } from "../components/DeveloperSettings";
import "./observability.css";
export function Developer() {
  return <div className="obs-page developer-page"><header className="obs-hero"><div><h1>Developer</h1><p>Gateway diagnostics, local measurements and audit integrity.</p></div></header><nav className="obs-tabs" aria-label="Analytics panes"><Link to="/observability">Observability</Link><Link to="/usage">Usage</Link><Link to="/developer" aria-current="page">Developer</Link></nav><DeveloperSettings /></div>;
}
