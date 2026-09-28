import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpenText } from "lucide-react";
import { PaneHeader, PaneLayout } from "../components/Pane";
import { toggleSparkPanel } from "../lib/spark-panel";
import { useCompanion } from "../lib/companion";
import "./guide.css";

/** The product guide: what ShuaCrew is and everything it can do, with a way into each page it describes. */

interface Feature { title: string; where: string; to?: string; body: ReactNode; points?: ReactNode[] }
interface HubSection { id: string; hub: string; title: string; intro?: string; features: Feature[] }

const HUBS: HubSection[] = [
  { id: "home", hub: "Hub 1 · ⌘1", title: "Home: talk to the crew, see your day", features: [
    { title: "Chat-first sessions", where: "Home › Sessions", to: "/", body: "Describe what you want and the crew does it. As they work, you see each file read, each command run and each diff, with the text streaming in as it's written.",
      points: ["Fork a conversation, queue follow-ups, search in a chat, jump around with the minimap", "Attach files, photos, voice and video", "Review and merge in the chat, push and open a PR", <><b>Race:</b> send the same task to Claude and Codex, each in its own branch, and keep the better result</>] },
    { title: "Your day, in one place", where: "Home › Today", to: "/activity", body: <>A morning brief with the weather, a plan and your meetings (if you connect your calendar). <b>Start my day</b> turns on Flow and the radio and shows the first thing that needs you.</>,
      points: ["Approve or deny crew requests right there", "From 6pm, an evening recap (“Your day, wrapped”) that becomes your journal", "Streaks and achievements, counted only from real work"] },
  ] },
  { id: "crew", hub: "Hub 2 · ⌘2", title: "Crew: your team, live", intro: "A crew is a set of standing team members, each with its own persona, specialty, ongoing conversation and lessons learned. ShuaCrew sends each request to the member best suited to it.", features: [
    { title: "Hire and review", where: "Crew › Team", to: "/crew", body: "Hire from templates (designer, data analyst, DevOps, writer, legal, tutor) or create your own. A performance review shows each member's completed and failed work, success rate, typical time, token use and lessons." },
    { title: "Rooms", where: "Crew › Rooms", to: "/rooms", body: "Shared spaces where several members work on the same thing, with one composer, searchable history and a live activity feed. Archiving a room hides it but keeps its history." },
    { title: "The Crew Floor", where: "Crew › Floor", to: "/floor", body: "Your whole crew as a live constellation, so you can see who's working, on what, right now." },
    { title: "Studio & Radio", where: "Crew › Studio", to: "/studio", body: "A focus room with a timer, Flow mode, rain sounds and ShuaCrew Radio: a lofi station with a spinning-record player, built from your own music folders or official YouTube live streams. Music quiets down while you talk to Spark. Spark can even DJ." },
  ] },
  { id: "build", hub: "Hub 3 · ⌘3", title: "Build: ventures, plans and the board", features: [
    { title: "Idea to revenue", where: "Build › Ventures", to: "/ventures", body: "Each startup idea moves through a five-stage pipeline, and ShuaCrew suggests the next move at each stage. You can publish a site with a real waitlist." },
    { title: "Multi-phase work", where: "Build › Playbooks", to: "/playbooks", body: "Longer projects run by the crew in phases. After each phase the crew pauses for your review, and you can approve from anywhere." },
    { title: "Specs", where: "Build › Specs", to: "/specs", body: "Write down what you want built before anyone starts, so the crew builds against your spec instead of guessing." },
    { title: "The Board", where: "Build › Board", to: "/board", body: "Five lanes covering all your runs. Each run has a detail page, a review cockpit with inline comments sent back to the agent, a merge queue and a replay of what the terminal did." },
    { title: "Schedules & routines", where: "Build › Schedules", to: "/schedules", body: "Recurring work you switch on once:",
      points: ["Weekday 8:30 crew standup", "Weekly growth review, competitor watch, personal wiki", "Nightly scoring of new ideas", "Webhooks, heartbeats and script-only jobs"] },
  ] },
  { id: "know", hub: "Hub 4 · ⌘4", title: "Know: library, memory, learning", features: [
    { title: "Library", where: "Know › Library", to: "/library", body: "Everything the crew makes, plus the knowledge you add, all searchable by you and by every agent. Documents preview their own pages. It's stored privately on your Mac." },
    { title: "Memory", where: "Know › Memory", to: "/memory", body: "Lessons stay only if they keep proving useful. The crew suggests new skills and you approve them. A recall check keeps memory accurate." },
    { title: "Learn from your own work", where: "Know › Learning", to: "/learn", body: "Lessons drawn from your real sessions, a daily drill and spaced-repetition review. It also includes a career coach: roadmaps, resume review and interview prep." },
    { title: "Visual teaching", where: "Know › Visual teaching", to: "/teach", body: "Give it a screenshot, PDF, image or code and it turns it into an editable diagram lesson. Guided practice watches the screen you're practicing on and tells you whether you got it right, with hints. It only watches after you press Start." },
  ] },
  { id: "system", hub: "Hub 5 · ⌘5", title: "System: tools, policy, insights", features: [
    { title: "Tools & skills", where: "System › Tools & Skills", to: "/integrations", body: "Real MCP servers and skills your crew can use, shown as cards. ShuaCrew also brings its own tools, such as radio control for agents." },
    { title: "Policy & audit", where: "System › Policy & Audit", to: "/policy", body: "Decide what agents may do on their own and what needs your OK, including protected folders and quiet hours. Every decision is recorded in a tamper-evident log you can verify." },
    { title: "Insights", where: "System › Insights", to: "/observability", body: "Live activity, usage and developer views: activity graphs, a tool leaderboard, run outcomes and an API explorer. Health alerts warn you when memory, disk, the voice engine or a runtime has a problem. Costs a provider doesn't report say “Not reported” rather than $0." },
    { title: "Terminal", where: "System › Terminal", to: "/terminal", body: "A real terminal with command blocks, history, search and split panes. Type what you want in plain English and it writes the command for you." },
  ] },
];

const TOC: Array<{ group: string; items: Array<[id: string, label: string]> }> = [
  { group: "Start", items: [["what", "What it is"], ["start", "Getting started"], ["spark", "Spark"]] },
  { group: "The five hubs", items: HUBS.map((h) => [h.id, h.title.split(":")[0]!] as [string, string]) },
  { group: "Reference", items: [["engines", "Engines"], ["privacy", "Privacy & safety"], ["keys", "Shortcuts & commands"], ["settings", "Make it yours"], ["status", "Where things stand"]] },
];

const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Which section is in view, for the contents list. */
function useInView(ids: string[]) {
  const [on, setOn] = useState(ids[0]!);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setOn(e.target.id.replace("guide-", ""));
    }, { rootMargin: "-15% 0px -70% 0px" });
    ids.forEach((id) => { const el = document.getElementById(`guide-${id}`); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [ids]);
  return on;
}

function Section({ id, hub, title, intro, children }: { id: string; hub: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return <section id={`guide-${id}`} className="guide-section">
    <div className="guide-sec-head"><span>{hub}</span><h2>{title}</h2>{intro && <p>{intro}</p>}</div>
    {children}
  </section>;
}

function Cards({ features }: { features: Feature[] }) {
  return <div className="guide-cards">
    {features.map((f) => <article key={f.title} className="guide-card">
      <span className="guide-where">{f.where}</span>
      <h3>{f.title}</h3>
      <p>{f.body}</p>
      {f.points && <ul>{f.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      {f.to && <Link to={f.to} className="guide-open">Open {f.where.split("› ")[1]} <ArrowUpRight size={13} /></Link>}
    </article>)}
  </div>;
}

export function Guide() {
  const name = useCompanion().nickname || "Spark";
  const ids = useRef(TOC.flatMap((g) => g.items.map(([id]) => id))).current;
  const on = useInView(ids);
  return <PaneLayout>
    <div className="guide">
      <nav className="guide-toc" aria-label="Guide contents">
        {TOC.map((g) => <div key={g.group}>
          <h4>{g.group}</h4>
          {g.items.map(([id, label]) => <button key={id} type="button" className={on === id ? "is-on" : ""} aria-current={on === id ? "true" : undefined} onClick={() => jump(id)}>{label}</button>)}
        </div>)}
      </nav>

      <div className="guide-main">
        <div id="guide-what" className="guide-hero">
          <PaneHeader icon={BookOpenText} eyebrow="The ShuaCrew guide" title={<>Talk to one assistant. <em>A whole crew</em> does the work.</>}
            description="ShuaCrew is a Mac app that turns the AI subscriptions you already pay for (Claude and Codex) into a standing team. You chat with it and it plans, codes, reviews and ships. Its companion sits on your desktop, talks with you out loud and runs your day. Everything runs locally on your Mac and asks before it does anything risky."
            actions={<button type="button" className="guide-ask" onClick={toggleSparkPanel}>Ask {name} about anything here <kbd>⌘J</kbd></button>} />
        </div>

        <Section id="start" hub="First run" title="Getting started" intro="The first time you open ShuaCrew, a short welcome tour walks you through these steps. Each one takes about a minute.">
          <ol className="guide-steps">
            <li><b>Meet your assistant</b><span>Name your companion (Spark by default), pick one of five characters and choose a voice. You can change all of it later.</span></li>
            <li><b>Tell it your goal</b><span>A career goal or a project you're working toward. Your companion keeps it in mind in every conversation.</span></li>
            <li><b>Connect your engines</b><span>ShuaCrew finds the Claude Code and Codex logins already on your Mac. There are no API keys to paste and no new accounts to create.</span></li>
            <li><b>Grant what you want to use</b><span>Microphone, screen, accessibility and calendar are each optional. The tour explains what each one unlocks before macOS asks you.</span></li>
            <li><b>Get a first win</b><span>Give the crew a small real task and watch it go from request to finished result.</span></li>
          </ol>
          <p className="guide-callout">ShuaCrew runs a small local service (the <b>gateway</b>) in the background, so schedules, routines and your crew keep working when the window is closed. It only listens on your Mac and is never exposed to the internet.</p>
        </Section>

        <Section id="spark" hub="Companion · ⌘J · ⌃⌥Space" title={`${name}, your companion`} intro={`${name} is how you talk to ShuaCrew. It lives on your desktop, in a side panel in the app and in the menu bar. All three are the same conversation.`}>
          <div className="guide-spark">
            <div className="guide-prose">
              <p><b>Talk to it out loud.</b> Hold <kbd>Space</kbd> or the mic button to talk, and let go to send. You can also switch to Auto for a hands-free conversation. Speech-to-text runs on your Mac with Whisper, and captions appear while you're still speaking. It answers in a natural local voice, and you can interrupt it mid-sentence. Speak any language and it answers in that language.</p>
              <p><b>“Hey {name}.”</b> An optional wake word, recognized entirely on your Mac. It opens, says “Yes?” and listens for one request.</p>
              <p><b>It does things, not just answers.</b> It can control your Mac through the accessibility system: pressing buttons by name, running Shortcuts, controlling music and adjusting system settings. It can also draw on your screen to point something out. A visible cursor glides to each target so you can see what it's doing. Terminal commands are checked against your policy and confirmed with you first.</p>
              <p><b>It never goes dark.</b> If Claude runs out of usage, it switches to a local model on your Mac (Ollama) and keeps working.</p>
            </div>
            <div className="guide-says" aria-label={`Things you can say to ${name}`}>
              {[["“What was that error I saw earlier?”", "Recalls it from screen memory, if you've turned it on."],
                ["“idea: a bot that summarizes city council meetings”", "Files it as a new venture. The crew scores it overnight."],
                ["“Explain this.”", "Reads the text you've selected, explains it and adds a quiz card."],
                ["“Put on some lofi and start my day.”", "Starts the radio and Flow, then shows the first thing that needs you."]].map(([said, does]) =>
                <div key={said}><small>You say</small><b>{said}</b><span>{does}</span></div>)}
            </div>
          </div>
          <Cards features={[
            { title: "It reacts to real events", where: "Moods", body: "Happy when work finishes, concerned when something fails, sleepy after 15 quiet minutes. Its mood always comes from something that actually happened." },
            { title: "It remembers you", where: "Memory", body: "Your goal, lessons from past sessions and what you did today carry into every conversation. You can see and delete that history in its privacy panel." },
            { title: "It walks you through things", where: "Guides", body: "Guided steps highlight exactly where to click. It walks beside each step and goes back to its corner when you're done." },
          ]} />
        </Section>

        {HUBS.map((h) => <Section key={h.id} id={h.id} hub={h.hub} title={h.title} intro={h.intro}><Cards features={h.features} /></Section>)}

        <Section id="engines" hub="Reference" title="Engines" intro="ShuaCrew doesn't have its own model. It runs on the subscriptions you already have, and you can set a fallback order and routing rules in Settings.">
          <div className="guide-engines">
            {[["Claude", "Through the Claude Agent SDK, using your Claude Code login. Also runs background subagents."],
              ["Codex", "Through Codex's own app server, using your Codex login."],
              ["Any ACP agent", "Works with any agent that speaks the Agent Client Protocol."],
              ["Local (Ollama)", "The companion's backup brain on your Mac when cloud usage runs out."]].map(([n, d]) => <div key={n}><b>{n}</b><span>{d}</span></div>)}
          </div>
        </Section>

        <Section id="privacy" hub="Reference" title="Privacy & safety" intro="Every feature that sees, hears or remembers is off until you turn it on, and each one tells you what it keeps.">
          <div className="guide-table"><table>
            <thead><tr><th>Feature</th><th>What it uses</th><th>Where it stays</th></tr></thead>
            <tbody>
              <tr><td>Voice</td><td>Microphone, only while you hold to talk or have Auto on</td><td>Transcribed on your Mac by Whisper</td></tr>
              <tr><td>Wake word</td><td>Apple on-device speech</td><td>Audio never leaves your Mac</td></tr>
              <tr><td>Screen memory</td><td>Text read from your screen about once a minute. Skips password managers, private windows and idle time.</td><td>Kept on your Mac for 3 days. You can view and delete it in <Link to="/policy">Policy & Audit</Link>.</td></tr>
              <tr><td>Live screen</td><td>One frame per second while your companion is looking</td><td>Held in memory only, never saved</td></tr>
              <tr><td>Calendar</td><td>Event titles and times only</td><td>Used for Today and your brief</td></tr>
              <tr><td>Agent actions</td><td>Files, terminal and git, as your policy allows</td><td>Every decision goes in a tamper-evident audit log</td></tr>
            </tbody>
          </table></div>
        </Section>

        <Section id="keys" hub="Reference" title="Shortcuts & commands">
          <div className="guide-table"><table>
            <thead><tr><th>Shortcut</th><th>What it does</th></tr></thead>
            <tbody>
              <tr><td><kbd>⌥</kbd> <kbd>Space</kbd></td><td>Brings up ShuaCrew for a quick question from anywhere</td></tr>
              <tr><td><kbd>⌃</kbd> <kbd>⌥</kbd> <kbd>Space</kbd></td><td>Shows or hides your companion on the desktop</td></tr>
              <tr><td><kbd>⌘</kbd> <kbd>J</kbd></td><td>Opens your companion in a side panel in the app</td></tr>
              <tr><td><kbd>⌘</kbd> <kbd>K</kbd></td><td>Search and jump anywhere</td></tr>
              <tr><td><kbd>⌘</kbd> <kbd>N</kbd></td><td>Starts a new session</td></tr>
              <tr><td><kbd>⌘</kbd> <kbd>1</kbd>–<kbd>5</kbd></td><td>Switches between the five hubs. Each one reopens where you left it.</td></tr>
              <tr><td><kbd>⌘</kbd> <kbd>\</kbd></td><td>Collapses the sidebar to a thin rail</td></tr>
              <tr><td><kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>F</kbd></td><td>Flow mode: hides everything but the work</td></tr>
              <tr><td>Hold <kbd>Space</kbd></td><td>Push-to-talk. The mic turns off as soon as your words are sent.</td></tr>
            </tbody>
          </table></div>
          <div className="guide-table"><table>
            <thead><tr><th>In chat</th><th>What it does</th></tr></thead>
            <tbody>
              <tr><td><code>/agent</code> · <code>/agents</code></td><td>Create a crew member or list them all</td></tr>
              <tr><td><code>/room</code></td><td>Open or create a room</td></tr>
              <tr><td><code>/effort</code> · <code>/budget</code></td><td>Set how hard the crew works and how much it can spend on this task</td></tr>
              <tr><td><code>/flow</code></td><td>Turn on Flow, a focused view that hides the sidebar</td></tr>
              <tr><td><code>shuacrew://</code></td><td>Links for Shortcuts, Siri and Raycast: <code>ask</code>, <code>idea</code>, <code>radio</code>, <code>open</code>, <code>start-day</code></td></tr>
            </tbody>
          </table></div>
        </Section>

        <Section id="settings" hub="Settings · ⌘," title="Make it yours">
          <ul className="guide-prose guide-list">
            <li><b>Look:</b> Pristine (default), Frost Black, Graphite, Carbon, Midnight, Paper and Sand palettes. Space Grotesk or SF Pro for the interface, and JetBrains Mono, SF Mono or Menlo for code. Share a theme as a code.</li>
            <li><b>Modes:</b> Deep work, Cost saver and Wind down, which can switch on automatically on a schedule. Also quiet hours and a daily budget.</li>
            <li><b>Crew behavior:</b> engine fallback order, routing rules, session limits, hooks, your own instructions and a prompt inspector.</li>
            <li><b>Always on:</b> the gateway runs as a background service, with backups, automatic retries and a menu bar item.</li>
            <li><b>Time machine & export:</b> roll back settings, or export and import your whole setup.</li>
          </ul>
          <Link to="/settings" className="guide-open">Open Settings <ArrowUpRight size={13} /></Link>
        </Section>

        <Section id="status" hub="Honest status · 27 Sep 2026" title="Where things stand" intro="ShuaCrew is under active development. Here's what you can rely on today and what isn't finished yet.">
          <div className="guide-status">
            <div><span className="is-ready">Ready</span><p>Mac app, gateway, crew, sessions, the Board, Library, memory, schedules, policy and audit, voice and actions, and radio. Covered by 556 automated tests.</p></div>
            <div><span className="is-partial">Partial</span><p>Visual teaching uses Claude only; Codex support for teaching isn't connected yet. Voice uses turn-taking with soft interruptions, not true full-duplex conversation.</p></div>
            <div><span className="is-partial">Partial</span><p>The iPhone and Apple Watch companions (Today, Crew, room chat, Face ID approvals) are built and tested in the simulator. Pairing with real devices over iCloud isn't verified yet.</p></div>
            <div><span className="is-open">Not yet</span><p>A signed, notarized download with automatic updates. For now, the app is built and installed from source.</p></div>
          </div>
        </Section>
      </div>
    </div>
  </PaneLayout>;
}
