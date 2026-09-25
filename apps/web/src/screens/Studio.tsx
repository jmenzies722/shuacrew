import { Disc3 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { MixDesk, PlayingHero, RadioStrip, Setlist } from "../components/StudioDesk";
import { PaneHeader, PaneLayout } from "../components/Pane";
import { useLive } from "../lib/live";
import { recentlyPlayed } from "../lib/studio";
import { KIND } from "../lib/kinds";
import "../components/studio-desk.css";
import "./studio.css";

/** The sit-down room: what's on, who is mixed, tonight's set, the crate. */
export function Studio() {
  const navigate = useNavigate();
  const ctx = { go: (path: string) => void navigate({ to: path }) };
  const artifacts = useLive((s) => s.crew.artifacts);
  const members = useLive((s) => s.crew.members);
  const crate = useMemo(() => recentlyPlayed(Object.values(artifacts), Date.now()), [artifacts]);
  return <PaneLayout wide>
    <PaneHeader eyebrow="Work" icon={Disc3} title="Studio" description="The desk. What's on, who is mixed, tonight's set. The big window when you sit down — Spark and the menubar stay the player when you walk away." />
    <div className="studio-desk">
      <section className="studio-now" aria-label="Now playing">
        <PlayingHero ctx={ctx} />
        <RadioStrip />
      </section>
      <div className="studio-cols">
        <section className="studio-panel" aria-label="Mix desk"><MixDesk ctx={ctx} /></section>
        <section className="studio-panel" aria-label="Tonight's set"><Setlist ctx={ctx} /></section>
      </div>
      <section className="studio-crate" aria-label="Recently played">
        <header className="wg-head"><strong>Recently played</strong><span>{crate.length ? "pulled from the library this week" : "nothing on the shelf yet"}</span></header>
        {crate.length ? <div className="sd-crate">
          {crate.map((a) => {
            const K = KIND[a.kind];
            const who = a.member ? members[a.member]?.name : a.by === "you" ? "You" : "the crew";
            return <button key={a.id} type="button" className="sd-sleeve-card" onClick={() => void navigate({ to: "/library", hash: a.id })}>
              <span className="sd-cover" style={{ "--c": K.tone } as React.CSSProperties}>{a.kind === "image" ? <img src={`/api/library/artifacts/${a.id}/raw`} alt="" /> : <K.icon size={28} strokeWidth={1.6} />}</span>
              <b>{a.title}</b>
              <small>{who}{a.run ? " · from a session" : ""}</small>
            </button>;
          })}
        </div> : <p className="tb-foot">When the crew writes a report, a page, or a spec, it lands here as a sleeve you can pull back onto a session.</p>}
      </section>
    </div>
  </PaneLayout>;
}
