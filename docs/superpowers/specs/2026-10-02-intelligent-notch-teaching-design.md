# Intelligent notch teaching

Status: proposed design for review; implementation not started.

## Outcome

Shua explains architectures through an accurate, readable diagram and synchronized narration, preserves the lesson across follow-up questions, and offers useful next steps without interrupting the user. A Netflix-like streaming design is the primary acceptance scenario, not a claim about Netflix's private production architecture. Voice quality is evaluated with real playback, interruption, and device tests rather than assumed from a provider name.

## Existing gaps

- `notch-lesson.ts` limits diagrams to six nodes and validates references but not architectural truth.
- `ArchitectureCard.tsx` renders component tiles and textual edge chips, not a connected spatial diagram. Caption matching depends on exact component labels.
- `Buddy.tsx` keeps a current visual, but follow-ups have no explicit versioned lesson contract. Architecture arrival returns before the normal automatic expansion behavior.
- `SpeechQueue` already queues audio and exposes captions on actual playback. Preserve this rather than replacing it with an unrelated speech pipeline.

## Approach

Extend the existing teaching path, not a second assistant. Keep structured diagrams deterministic and text selectable. Do not use image generation for technical diagrams: it makes labels, graph validation, navigation and synchronized highlighting unreliable. Do not squeeze a full system into the closed notch.

Deliver in two independently verifiable phases: teaching first, then voice comparison. No provider migration or permission expansion is implied by approving the teaching design.

## 1. Lesson contract and accuracy

Introduce a versioned architecture lesson with stable lesson/node/edge/step IDs; title; scope; assumptions; component roles; grouped paths; labeled directed edges; explanation steps; trade-offs; failure modes; sources; and suggested follow-ups. Preserve compatibility with existing saved architecture cards.

Limit one overview to 12 nodes and 20 edges; larger architectures use separate views. Reject malformed graphs, duplicate IDs, dangling references, unsupported source URL schemes and invalid step targets. Never silently truncate a graph into a misleading diagram. Invalid generated content yields a readable explanation and a retry action, not an invented successful diagram.

Explicitly distinguish proposed designs, general principles and sourced claims about a real system. Ask one scale question when it materially changes the design; otherwise state a working assumption and proceed. Never claim schema validation proves factual correctness. The model performs a consistency review of the explanation against the graph; uncertain claims stay labeled.

Architecture requests use the existing strongest-capable reasoning route and current selected-provider constraints. Do not silently downgrade or change the user's provider. For claims about current real systems, use available research tools and attach supporting sources. If research is unavailable, present a proposed design rather than asserting verified company internals.

## 2. Diagram experience

The closed notch shows the topic and current teaching state. A completed lesson produces one nonintrusive preview. It expands only when appropriate: never steal typing focus, interrupt speech input, or obscure an approval request. The user can open the preview, dismiss it, or pin it to Visual teaching.

The expanded notch shows a compact connected overview with restrained depth, legible labels, differentiated component roles, arrows and path labels. A larger canvas in the main window provides full details. Deterministic SVG layout keeps edges attached to their nodes; cycles and cross-links remain visible. Color supports meaning but never carries it alone. Support keyboard navigation, reduced motion and light/dark themes.

Use path views for a streaming service: viewer requests, video ingestion/delivery and background events. Do not imply video bytes travel through the same API service used for metadata and account checks.

## 3. Narration synchronization

Each narration segment has a lesson revision and step ID. When its audio actually starts, highlight the step's referenced nodes and edges. Do not start highlighting when a request is sent or when text arrives. Pause/replay/interruption operates on this same identity. Late audio callbacks from cancelled turns cannot update a newer lesson.

Offer Follow voice and manual step navigation. Manual navigation pauses automatic page-following until the user resumes it. Component highlighting does not announce every frame to screen readers. Without voice, the complete lesson remains usable.

Preserve ordered playback, the existing microphone handling and user voice settings. Reduced motion disables decorative movement without disabling meaningful step updates.

## 4. Follow-ups and proactive behavior

Keep the active lesson revision available to the next prompt. A follow-up such as “why Kafka?”, “simplify this” or “what fails first?” refines that lesson instead of replacing it with an unrelated card. Retain stable identities for unchanged components, and offer the previous version.

After an explanation, offer at most three context-relevant actions such as Simplify, Walk a request, or Explore failure handling. Do not automatically run tools, deploy infrastructure, start new lessons or speak repeated completion announcements. Wait until the user finishes speaking. Dismissal suppresses that revision's repeated announcements.

## 5. Voice evaluation

First add an in-app comparison using the existing configured local voices and a fixed architecture passage. Show the actual voice/engine, playback status and measured first-audio latency. Stop the previous sample before starting another. Do not change the saved voice until the user explicitly chooses it.

A cloud voice option is a separate opt-in: explain the provider, text transmission and cost before configuration. Validate current official provider documentation during implementation before choosing an adapter. Credentials stay server-side and out of logs; no automatic subscriptions, key creation or transmission to a new provider. If unconfigured, the cloud option remains honestly unavailable, with local playback fully functional.

Preserve sentence order, cancellation and device recovery in either mode. Compare naturalness by user preference; compare latency, gaps, stale playback and recovery by measurement. No claim that a cloud voice is inherently faster or better.

## 6. Performance and lifecycle

Keep audio-energy updates outside full lesson renders. Memoize graph layout by lesson revision, not by audio frame. Use bounded revision history and unsubscribe timers/listeners on dismissal or unmount. Avoid extra model/research calls per animation or caption update. Reuse existing event batching and audio queue behavior.

Targets, to be measured rather than promised: prompt acknowledgment under 100 ms at p95 on this Mac; no unintended silent gap over 250 ms between already-buffered segments; no monotonic retained lesson/listener growth over 100 open/replay/dismiss cycles. Model generation and network time are reported separately from UI acknowledgment.

## Acceptance and verification

1. “How would you build Netflix?” yields a clearly labeled proposed architecture with assumptions, separate content/control paths, connected nodes and trade-offs. Any real-Netflix claim has a checked source or is explicitly uncertain.
2. Follow-up “why Kafka?” preserves the current diagram and explains the actual role or explains why Kafka is unnecessary for the stated scale.
3. Malformed graphs and stale narration callbacks fail safely; saved older lessons still open.
4. Voice playback drives the correct highlights; manual navigation, replay, cancellation and text-only mode work.
5. No announcement interrupts listening; each lesson revision gets at most one completion preview.
6. Native Mac screenshots verify compact/expanded/main-window layouts, keyboard controls and reduced motion.
7. Voice comparison works with existing local voices; cloud remains off without explicit setup. Test speakers and AirPods when available, and record any untested device rather than claiming universal compatibility.
8. Unit/integration tests cover parser limits, graph layout, revisions, narration identity, deduplication and teardown. Run web typecheck/build and full existing tests. Measure performance and a repeated-use soak; report outcomes and limitations.

## Review boundary

This spec is the next approval artifact. After review, produce the file-level implementation plan and review its execution method before changing product code. No commit or push without the user's separate permission.
