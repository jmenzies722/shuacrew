# Shua voice: conversational Mac workspace

## User intent

ShuaCrew should feel like a ChatGPT/Codex-style workspace where the user can
type or speak to Shua, ask for work, and see what the crew is doing. Shua is the
default coordinator, not a separate demo or a replacement application. Users
can create their own crew with distinct roles, personalities, and voices.

Required constraints:

- Existing macOS application; preserve its chat, session history, themes, and tools.
- Use existing authenticated Claude/Codex runtime connections for intelligence.
- No newly billed voice API, API-key setup, or claim of unlimited subscription use.
- Local neural speech. English US/UK only; a small curated cast, male Shua default.
- No giant system-voice list. Personality and voice identity remain independent.
- Preserve approval policy, protected paths, and visible activity.
- No commits, pushes, or access to the user's sealed day-job directories.

## Approach and alternatives

Recommended: local speech recognition and neural synthesis around the existing
gateway Supervisor. This retains subscription authentication, resumable sessions,
tools, event history, and approvals. It has turn-boundary and inference delays;
it is not a claim of cloud speech-to-speech latency.

A hosted realtime speech API could simplify low-latency conversation, but introduces
separate credentials and usage billing, contrary to this brief. Built-in Mac speech
is simpler but has already failed the user's naturalness requirement.

## Primary interaction

1. Open or create a normal conversation with Shua selected. The composer has a
   clearly labeled **Voice mode** button alongside text entry. Existing dictation
   remains distinct: it inserts editable text without starting a voice conversation.
2. Voice mode opens a focused panel inside the Mac window. The first entry checks
   local speech dependencies and the chosen provider connection. Model downloads
   show source, disk size, progress, cancel, and retry before enabling a call.
3. Press **Start conversation** to activate the microphone. Display a persistent
   recording indicator, selected voice, provider, and listening state. Opening the
   panel alone must not activate the microphone or generate audio.
4. Capture speech in bounded utterances with local speech detection. Show the
   recognized transcript when available; do not label a level meter as live words.
   Send accepted utterances to the same durable session used by text chat.
5. Render the agent's streaming response in the transcript. Synthesize completed
   user-facing sentences with a small bounded playback queue. Never speak internal
   reasoning, raw tool output, secrets, code blocks, or historical answers on reopen.
6. Show actual tools, crew delegation, pending approvals, and results beside the
   conversation. Audio gives concise progress summaries, never fabricated success.
7. **Interrupt** stops speech immediately, invalidates pending audio, requests
   cancellation of the current agent turn, and permits a new utterance after the
   session acknowledges it. Cancellation cannot undo completed external actions.
8. **Mute microphone** releases microphone tracks. **End voice** releases audio,
   capture, and outstanding speech requests while leaving session history intact.
   If work continues in the background, say so and offer a separate **Stop work**.

Initial delivery uses explicit interrupt plus automatically detected end-of-turn,
with push-to-talk as a recovery mode. Do not market full-duplex acoustic barge-in
until speaker echo, headphones, and cancellation have been validated.

## Layout and visual language

Keep the familiar session sidebar, central conversation, bottom composer, and
provider selector. Voice mode is a spacious panel within that layout, not another
web app. It includes:

- Crew identity and selected voice at the top; Shua is the initial selection.
- A restrained animated voice visualization reflecting measured input/playback,
  plus explicit Listening / Transcribing / Thinking / Speaking / Needs approval.
- A readable transcript and collapsible work/crew activity area.
- Persistent mute, interrupt, end-voice, and return-to-chat controls.
- Existing palette and accent support, reduced motion, keyboard access, visible
  focus, accessible state labels, and sufficient contrast.

Errors replace animation with an actionable state. Never display Listening when
capture is inactive or Speaking merely because a request has been queued.

## Voice cast and personalization

Replace the default system inventory with a curated neural voice library. Start
by auditioning Qwen3-TTS 1.7B CustomVoice Ryan/Aiden for US English and suitable
licensed British English references or generated original voices for UK English.
Use an Apple-Silicon implementation. Pocket TTS is the alternative if its sampled
quality and latency better fit interactive conversations.

US presets must not be relabeled British. The shipping cast targets two US and
two UK voices, but a voice enters the picker only after accent, license,
naturalness, and local performance are verified. If fewer pass, show fewer and
report the gap rather than filling slots with robotic voices.

Each entry has a friendly name, accent, short character description, and Preview.
The model/provider implementation is secondary detail, not a list of hundreds of
models. Normal speech must not silently fall back to rejected system voices.

Crew members retain name, role, instructions, runtime/model, and standing thread.
Add voice identity, pace, and personality preset (Calm, Warm, Direct, Energetic),
with editable instructions. Shua is a non-destructive starter template; existing
members are never overwritten. Creating a member can copy Shua's starting settings.
Personality instructions do not broaden permissions.

Only one voice speaks at a time. Shua normally summarizes crew work; selecting or
explicitly addressing a member changes the active speaker with a visible handoff.
Names embedded in tool output cannot trigger a handoff or execution by themselves.

## Architecture boundaries

- **Local speech service:** managed process, pinned dependencies/model revisions,
  loopback-only gateway access, bounded input and output, health/readiness,
  cancellation, playback generation IDs, and idle resource release. No arbitrary
  model URL, script execution, or filesystem path from untrusted requests.
- **Conversation controller:** state machine owns microphone capture, utterance
  acceptance, transcript submission, agent response segmentation, interruption,
  reconnect, mute, and cleanup. One active voice session per window.
- **Existing Supervisor:** launches/resumes real Claude/Codex sessions using their
  current authenticated runtime adapters. Subscription limits and authentication
  failures are surfaced as provider states, not hidden by mock replies.
- **Crew orchestration:** preserve native Claude delegation where supported. Any
  new cross-provider handoff must create scoped, auditable child runs, enforce
  delegation depth/concurrency limits, and retain parent policy. Unsupported
  delegation is labeled unavailable rather than simulated.
- **Persistence:** durable member voice preferences and existing event-backed
  conversation history; audio recordings are temporary and removed after use.

Transcription stays local, but accepted transcript and task context are sent to
the chosen AI provider. State this plainly. Local speech does not make provider
reasoning local or unlimited. No new login, microphone grant, or sensitive system
access is silently approved by the application or by the implementation process.

## Safety and failure behavior

- Voice never enables autopilot or modifies deny rules.
- Consequential actions retain explicit on-screen approval; ambiguous spoken
  “yes” does not approve a pending tool call.
- Stop/end/close/reload invalidates pending audio so stale replies cannot play.
- Microphone denial, empty/noisy speech, unavailable model, synthesis failure,
  provider disconnect/rate limit, and timeout each have recoverable visible states.
- Audio size/duration, recognition timeout, synthesis queue, and concurrency are
  bounded. A silent open microphone cannot create unbounded uploads or inference.
- No always-listening wake word, background recording, or unrestricted computer
  control is implied. Computer actions use installed tools and approved access.

## End-to-end acceptance

1. Audition the same short conversational script across shortlisted voices; measure
   warm/cold first-audio time and sustained generation speed on this actual Mac.
   Report measurements and leave subjective voice approval to the user.
2. Test utterance boundaries, silence/noise rejection, sentence segmentation,
   duplicate events, reconnect, stale audio after interruption, and resource cleanup.
3. Test preference persistence, custom crew creation, unsupported voice fallback,
   run ownership, policy inheritance, and bounded delegation.
4. Exercise real authenticated Claude and Codex text-to-response flows; confirm no
   voice API key is used. Do not claim microphone speech tested without permitted
   live input or a clearly identified prerecorded test fixture.
5. In the installed Mac app, verify start, transcript, spoken response, mute,
   interrupt, provider errors, approval handling, end, and return-to-chat history.
6. Run the complete TypeScript and Swift tests, typecheck, production builds, and
   code review. Install with recoverable app backup and verify code signature.

## Current status

Design approved by the user. The installed application currently has system-voice
previews, not this neural conversation flow. No implementation or dependency
installation for this design has begun. The implementation plan is at
`docs/superpowers/plans/2026-09-24-shua-voice.md`; its review and execution-method
selection are the next gate.
