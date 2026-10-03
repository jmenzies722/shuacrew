import { BookOpen, Check, Layers, Users } from "lucide-react";
import "./workspace-illustration.css";

export function WorkspaceIllustration({ kind }: { kind: "rooms" | "learning" }) {
  const Icon = kind === "rooms" ? Users : BookOpen;
  return <div className={`workspace-illustration is-${kind}`} aria-hidden="true">
    <span className="wi-back"><Layers size={17} /></span>
    <span className="wi-middle"><i /><i /><i /></span>
    <span className="wi-front"><Icon size={27} strokeWidth={1.5} /><span><i /><i /></span><b><Check size={10} /></b></span>
  </div>;
}
