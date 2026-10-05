import { companionName } from "../lib/companion";
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
    { title: "Crew HQ", where: "Crew › Crew HQ", to: "/floor", body: "Your crew at their workstations. See who is working, follow live handoffs, and select an agent to explore their latest activity." },
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
    { title: "Terminal", where: "System › Terminal", to: "/terminal", body: "A real terminal that keeps running in the background, with command blocks (each marked green or red), history, search and split panes. Type what you want in plain English and it writes the command for you.",
      points: ["Save commands you use often as snippets, then run or insert them in one click", "Open a new terminal in Home, a project or a recent folder", "Filter your history; copy any command's output; hand a failure to the crew to fix", <><kbd>⌘T</kbd> new terminal, <kbd>⌘D</kbd> split, <kbd>⌘⇧H</kbd> history and snippets</>] },
  ] },
];

const TOC: Array<{ group: string; items: Array<[id: string, label: string]> }> = [
  { group: "Start", items: [["what", "What it is"], ["start", "Getting started"], ["spark", "Spark"], ["chrome", "Spark for Chrome"]] },
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
  const name = companionName(useCompanion());
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
              <p><b>It stays with you.</b> Collapsed, it rides just beside your pointer wherever you work (clicks pass straight through it), walks off to point at something, and comes back. Tap <kbd>fn</kbd> for a small card right there instead of the full chat; hold <kbd>fn</kbd> to talk and let go to send.</p>
              <p><b>It finishes jobs.</b> Say <b>“agent:”</b> and a task and it becomes a mission: the crew works on it end to end, and {name} stays with it. If the crew stops to ask something it could decide, or hits a failure, {name} tells it to keep going (up to three times), then tells you out loud when it's done. It never approves anything for you.</p>
              <p><b>It reaches your mail and Notion.</b> It checks, searches, reads and drafts email through the Mac's Mail app, so Gmail works with no Google setup, and it never sends. Anything about your Notion goes to the crew, which uses your Notion connection.</p>
              <p><b>A chat window that's alive.</b> A pill at the top says what {name} is doing (Ready, Listening, Thinking, Speaking, or the missions it's minding). Open it fresh and it greets you with what's actually going on right now (approvals waiting, missions in progress, crew at work) and suggestions that fit the moment, like “Start my day” in the morning; one tap sends. Under each answer: Tell me more, Make it shorter, Show me on screen, Do it for me. The box grows as you type, and a Latest button brings you back if you scroll up.</p>
              <p><b>Make the window yours.</b> It's a solid card floating over your work by default. In Settings → {name} → Presence & brain choose Solid or frosted Glass, the tone, the corners, the text size and a gradient header, with a live preview.</p>
              <p><b>It never goes dark.</b> If Claude runs out of usage, it switches to a local model on your Mac (Ollama) and keeps working.</p>
            </div>
            <div className="guide-says" aria-label={`Things you can say to ${name}`}>
              {[["“agent: build a landing page for my idea”", "Starts a mission and stays with it until it's done."],
                ["“Anything important in my unread email?”", "Checks Mail and gives you the gist in a sentence or two."],
                ["“What was that error I saw earlier?”", "Recalls it from screen memory, if you've turned it on."],
                ["“idea: a bot that summarizes city council meetings”", "Files it as a new venture. The crew scores it overnight."],
                ["“Explain this.”", "Reads the text you've selected, explains it and adds a quiz card."],
                ["“Put on some lofi and start my day.”", "Starts the radio and Flow, then shows the first thing that needs you."]].map(([said, does]) =>
                <div key={said}><small>You say</small><b>{said}</b><span>{does}</span></div>)}
            </div>
          </div>
          <Cards features={[
            { title: "It reacts to real events", where: "Moods", body: "Happy when work finishes, concerned when something fails, sleepy after 15 quiet minutes. Its mood always comes from something that actually happened." },
            { title: "It remembers you", where: "Memory", body: "Your goal, lessons from past sessions and what you did today carry into every conversation. You can see and delete that history in its privacy panel." },
            { title: "It walks you through things", where: "Guides", body: "Guided steps highlight exactly where to click, one short line at a time. It walks beside each step and comes back when you're done." },
            { title: "Missions", where: "“agent: …”", body: "Hand it a task and it stays with it: keeps the crew going when it stalls, brings approvals to you, and tells you when it's finished. A strip in its panel shows what it's minding." },
            { title: "Email & Notion", where: "Mail app · Tools & Skills", body: "Unread, search, read and draft (never send) through Mail. Notion through the crew once you connect it in Tools & Skills. Both show in Settings → Spark." },
            { title: "fn screen selection", where: "Hold fn, then drag a box", body: "Select an exact screen region and release the mouse to have Shua read it. Escape cancels. Tap Fn to toggle live voice, or use Talk in the notch. Needs the Globe key set to “Do Nothing”." },
            { title: "A live welcome", where: "Chat window", body: "A greeting for the time of day, a Right now strip from what's really happening, and suggestions that change with it. Tap to ask." },
            { title: "Quick replies", where: "Under each answer", body: "Tell me more, Make it shorter, Show me on screen, Do it for me: the next step in one tap, without typing." },
            { title: "Your chat, your look", where: "Settings → Presence & brain", body: "Solid or Glass, Theme / Deep / Accent tone, Round / Soft / Square corners, text size and a gradient header, previewed live." },
            { title: "The smart notch", where: "Settings → Desktop home → MacBook notch", body: "The camera housing becomes a Dynamic Island. Hover to open it: ask, mic and screen-watch toggles, what Music or Spotify is playing (artwork, progress, play/pause/skip), the radio, your working sessions and your focus timer. Open the chat and it grows out of the notch. Customize captions, now playing, controls, glow and size in Settings." },
            { title: "Live captions", where: "The notch, while it talks", body: "Every sentence appears the moment it's spoken and lights up word by word, so you can read along when it says a lot." },
            { title: "Notices when you're stuck", where: "Live watching on", body: "It glances at your screen's text (on this Mac, no images kept). An error that won't go away, the same error coming back, or searching again and again: it offers to walk you through it, once. Not now keeps it quiet for half an hour." },
            { title: "Reads what it opens", where: "“What's the weather?”", body: "When it opens a page or app to answer you, it looks at what opened and tells you the specifics: the numbers, names and times." },
            { title: "Knows its own model", where: "Status pill", body: "Each turn goes to the model it needs: quick chat stays fast; code, planning and writing get a stronger one. It always says which model it's on. Player commands (pause, skip, play something) never wait for a model: they happen instantly, on whatever's playing." },
            { title: "Health check", where: "Settings → Health check", body: "One button checks everything ShuaCrew needs, for real: the engine, Claude and Codex, a spoken test sentence, hearing you, Spark for Chrome, disk space, every permission and music control. Anything not right comes first, with the button that fixes it." },
            { title: "Checks before it clicks", where: "When it does things for you", body: "Right before every click it looks again: if the button moved it clicks where it is now, and if it's gone it stops and takes a fresh look instead of clicking the wrong thing." },
            { title: "Does it directly", where: "“make a folder called test on my Desktop”", body: "New Apple Notes, calendar events, folders, opening or revealing files, and your open Safari and Chrome tabs happen straight away, with no clicking through apps." },
            { title: "Exact on any web page", where: "Spark for Chrome", body: "In Chrome it finds buttons, links and fields by name on the page itself, so highlights land exactly and clicks and typing hit the right element even after the page scrolls." },
            { title: "Knows your Mac", where: "Just ask", body: "Finds and reads your files and PDFs (Spotlight), checks your calendar and reminders (and adds one), searches your Notes and contacts, and knows what's open, your battery and storage. Read on this Mac; your work folders and secrets are always off-limits." },
            { title: "Straight to any setting", where: "“take me to Night Shift”", body: "Opens the exact page of System Settings (Wi-Fi, Displays, Bluetooth, Privacy switches like Screen Recording or Full Disk Access) instead of hunting for it." },
            { title: "Apple Music, fully", where: "“play my workout playlist”", body: "Your playlists by name, shuffle, repeat, favourite this song, add it to your library, open an artist or album, and “what's this song?” answered instantly." },
            { title: "Answers with your context", where: "Every question", body: "It knows what you're working in, what's next on your calendar, what's due today and the files you just changed, so answers fit your day. Only what you've allowed; never prompts on its own." },
            { title: "New voices", where: "Settings → Shua companion → Voice", body: "Eight clear voices (Michael, Heart, Puck, Bella, Fenrir, Emma, George, Daniel) that start in a blink and never drag, even while it watches your screen." },
            { title: "What it can reach", where: "Settings → Shua companion", body: "A live panel of every ability (screen, clicking, files, calendar, reminders, contacts, mic, apps), what's on, and one tap to the exact switch that turns the rest on." },
            { title: "Voice mode in the notch", where: "Hover the notch → Talk", body: "A live spoken conversation with the chat closed: just talk, it answers out loud, and you can talk over it. Your waveform shows in the notch. Or say “turn on voice mode”; “stop talking” or “shh” stops it." },
            { title: "Instant commands", where: "Say or type", body: "Pause, resume, skip, “play Drake”, “play jazz on Spotify”, voice mode on/off: done instantly on whatever's actually playing, with no model in the way. While you talk, music dips and comes back instead of pausing." },
            { title: "Does it with you, as long as it takes", where: "Guides and autopilot", body: "It guides you step by step (the box lands on the real control), moves on after any action of yours, or does the clicking itself until the job's done. Approve, let it run, or stop, right from the notch." },
            { title: "Looks it up, then teaches", where: "Any question", body: "When it isn't sure, it searches the web and reads the source, then explains, drawing on your screen as it talks, and ends with a few next moves you can tap." },
            { title: "Works better with…", where: "In your chats", body: "It suggests the connection (Vercel, Stripe, Sentry, Notion…) or skill that fits what you asked, only ones you don't have. One tap connects and signs you in; × hides it for good." },
            { title: "Full screen", where: "⌘⇧J · Esc to leave", body: "Spark takes the whole window: the same conversation, roomy and centred, for long talks, lessons and diagrams." },
          ]} />
        </Section>

        <Section id="chrome" hub="In your browser · ⌥⇧S" title="Spark for Chrome" intro={`Highlight anything on the web and ${name} acts on it right there. It works with ShuaCrew on this Mac, and nothing else can use it.`}>
          <div className="guide-spark">
            <div className="guide-prose">
              <p><b>Highlight, then choose.</b> A small Spark button appears next to your selection: <b>Explain</b>, <b>Summarize</b>, <b>Rewrite</b> (and put it back into the box you selected from), <b>Draft a reply</b>, <b>Ask</b> anything about it, <b>Save to Library</b>, or <b>Hand to the crew</b> as a mission {name} stays with on your Mac.</p>
              <p><b>Or right-click</b> a selection, or press <kbd>⌥⇧S</kbd>. With nothing selected, it summarizes the page.</p>
              <p><b>Proactive, quietly.</b> On a long read it offers once to give you the gist. Turn that off in the extension's popup.</p>
              <p><b>Private by design.</b> Your gateway still refuses every website and every other extension. Only Spark for Chrome, holding your pairing key, gets through, and page text is treated as material to work on, never as instructions.</p>
            </div>
            <ol className="guide-steps">
              <li><b>Load it</b><span>Open <code>chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick <code>~/Developer/projects/shuacrew/apps/chrome</code>.</span></li>
              <li><b>Copy your key</b><span>Settings → Spark → Spark for Chrome → Copy key.</span></li>
              <li><b>Pair</b><span>Click the Spark icon in Chrome, paste the key, and choose Pair. It says “Connected to ShuaCrew”.</span></li>
            </ol>
          </div>
        </Section>

        {HUBS.map((h) => <Section key={h.id} id={h.id} hub={h.hub} title={h.title} intro={h.intro}><Cards features={h.features} /></Section>)}

        <Section id="engines" hub="Reference" title="Engines" intro="ShuaCrew doesn't have its own model. It runs on the subscriptions you already have, and you can set a fallback order and routing rules in Settings.">
          <div className="guide-engines">
            {[["Claude", "Through the Claude Agent SDK, using your Claude Code login. Also runs background subagents."],
              ["Codex", "Through Codex's own app server, using your Codex login."],
              ["Any ACP agent", "Works with any agent that speaks the Agent Client Protocol."],
              ["Claude Haiku", "Quick questions and commands: the first word in about 3 seconds."]].map(([n, d]) => <div key={n}><b>{n}</b><span>{d}</span></div>)}
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
              <tr><td>Email</td><td>The Mail app, only when you ask: unread, search, read, draft</td><td>Read on your Mac; it never sends. macOS asks once to allow it.</td></tr>
              <tr><td>fn key</td><td>Watches for fn on its own (Accessibility access)</td><td>Nothing is recorded; other keys are ignored</td></tr>
              <tr><td>Spark for Chrome</td><td>Only the text you highlight or the page you ask about</td><td>Sent to your gateway with a pairing key only this Mac has; answered by Claude with no tools</td></tr>
              <tr><td>Missions</td><td>The crew, working end to end</td><td>Approvals always come to you; it never answers them for you</td></tr>
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
              <tr><td>Tap <kbd>fn</kbd></td><td>Shows or hides the quick card beside your pointer</td></tr>
              <tr><td>Hold <kbd>fn</kbd></td><td>Talk from anywhere; let go to send</td></tr>
              <tr><td><kbd>⌘</kbd> <kbd>T</kbd> · <kbd>⌘</kbd> <kbd>D</kbd> · <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>H</kbd></td><td>In the Terminal: new terminal, split, history and snippets</td></tr>
              <tr><td><kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>S</kbd></td><td>In Chrome: Spark on your selection, or the page</td></tr>
            </tbody>
          </table></div>
          <div className="guide-table"><table>
            <thead><tr><th>In chat</th><th>What it does</th></tr></thead>
            <tbody>
              <tr><td><code>agent: …</code></td><td>To {name}: start a mission it stays with until it's done</td></tr>
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
            <li><b>Look:</b> Onyx (default) and its light twin Porcelain, plus Pristine, Frost Black, Graphite, Carbon, Midnight, Paper and Sand palettes. Geist (Space Grotesk on the older palettes) or SF Pro for the interface, and JetBrains Mono, SF Mono or Menlo for code. Share a theme as a code. Your accent colour carries through everything: the ShuaCrew logo (in the sidebar, the top bar and on Sessions), gradient buttons, the lit edge on where you are, and a glowing ring around the box you're typing in.</li>
            <li><b>Modes:</b> Deep work, Cost saver and Wind down, which can switch on automatically on a schedule. Also quiet hours and a daily budget.</li>
            <li><b>Crew behavior:</b> engine fallback order, routing rules, session limits, hooks, your own instructions and a prompt inspector.</li>
            <li><b>{name}:</b> follow my cursor, keep going on its own (missions), fn key, “Hey {name}”, voice, character and colour, the chat window's look (Solid or Glass, tone, corners, text size, header), plus Email (via Mail), Notion and Spark for Chrome (your pairing key).</li>
            <li><b>Always on:</b> the gateway runs as a background service, with backups, automatic retries and a menu bar item.</li>
            <li><b>Time machine & export:</b> roll back settings, or export and import your whole setup.</li>
          </ul>
          <Link to="/settings" className="guide-open">Open Settings <ArrowUpRight size={13} /></Link>
        </Section>

        <Section id="status" hub="Honest status · 28 Sep 2026" title="Where things stand" intro="ShuaCrew is under active development. Here's what you can rely on today and what isn't finished yet.">
          <div className="guide-status">
            <div><span className="is-ready">Ready</span><p>Mac app, gateway, crew, sessions, the Board, Library, memory, schedules, policy and audit, voice and actions, and radio, terminal snippets, missions, email through Mail, Spark for Chrome, the live chat window and its look settings, and the themed logo and gradients. Covered by 579 automated tests.</p></div>
            <div><span className="is-partial">Partial</span><p>Follow my cursor and the fn key are built and tested in code but not yet tried with a real key press. fn needs Accessibility access and the Globe key set to “Do Nothing” (System Settings → Keyboard). Email needs your account in the Mail app.</p></div>
            <div><span className="is-partial">Partial</span><p>Spark for Chrome loads unpacked from your ShuaCrew folder; it isn't in the Chrome Web Store.</p></div>
            <div><span className="is-partial">Partial</span><p>Visual teaching uses Claude only; Codex support for teaching isn't connected yet. Voice uses turn-taking with soft interruptions, not true full-duplex conversation.</p></div>
            <div><span className="is-partial">Partial</span><p>The iPhone and Apple Watch companions (Today, Crew, room chat, Face ID approvals) are built and tested in the simulator. Pairing with real devices over iCloud isn't verified yet.</p></div>
            <div><span className="is-open">Not yet</span><p>A signed, notarized download with automatic updates. For now, the app is built and installed from source.</p></div>
          </div>
        </Section>
      </div>
    </div>
  </PaneLayout>;
}
