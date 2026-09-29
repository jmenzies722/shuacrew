# Observability, usage and Developer settings

Status: user approved 2026-09-24; implementation in progress.

## Intent

For the solo owner of ShuaCrew, answer: what is working, what is stuck, what consumed my subscription usage, and where can I inspect the evidence? Keep this inside the installed Mac application, with its existing themes and navigation. No separate dashboard product, remote analytics service, credentials, publication or billing dependency.

## Surfaces

Observability opens with active runs, queued work, approvals and failures, followed by a recent event timeline. Each record opens the actual session or room. A provider status strip distinguishes connected, unavailable and observed usage-limit states. Time to first response and turn duration use recorded timestamps, with sample counts and missing coverage visible; neither is labelled microphone-to-audio latency.

Usage shows observed input/output tokens by day and provider, with per-run and per-venture drill-down. Filters cover the last 7/30 days or all recorded history, provider and venture. Every card, chart and record table uses the same filtered population. UTC day boundaries are explicitly labelled. Cache tokens are separate because provider semantics differ; they are not blindly added to input. Reported API cost is nullable. Consumer-subscription billing and remaining quota are unknown unless the provider explicitly reports them; never render missing cost as $0 or invent reset dates.

Developer is a Settings section with gateway uptime/version/build/memory, provider availability, event-log sequence, and an explicit read-only audit-chain verification action. Show latest verification time/result, not an evergreen “secure” badge. No raw environment variables, credentials or transcript bodies in diagnostics. Link to Observability, existing Policy/Audit and session details. Local preferences control refresh cadence (5/15/30 seconds or manual) and default usage period. These do not change approval policy or retention.

## Data contract

The local immutable event log is the source. A bounded read-only gateway endpoint returns source metadata, observation window, last event sequence/time, metric definitions, derived aggregates, and paginated run records. Run-to-venture and run-to-room membership come from persisted facts, not text inference. Error counts use fatal run errors with explicit definitions. Missing data remains null; an empty selection has an explicit empty state.

Audit the runtime usage adapters first: repeated cumulative Codex notifications must not count twice; reasoning output must not be counted both within output and again separately. Preserve old events and label legacy accounting coverage where old records cannot be reconstructed accurately. Do not silently rewrite the audit trail. New accounting metadata distinguishes corrected measurements from legacy records.

## Presentation and interactions

Reuse the application’s panels, typography and theme tokens. Limit headline cards to operational priorities; use a zero-baseline daily token chart, provider comparison, and actionable run table with search/sort and session links. Charts include exact values and accessible text equivalents. Loading, unavailable, empty and disconnected are different states. Prefer restrained motion and responsive stacking over decorative animation. Refresh preserves filters and does not erase drafts elsewhere in the app.

## Verification

Literal-fixture tests cover duplicate events, cumulative counters, counter resets, unknown costs, absent usage, old/new accounting, provider/venture filters, time boundaries, weighted rates and aggregate/table reconciliation. Route tests cover the existing security gates and bounded results. Inspect every new pane in the actual Mac application, representative filters, returning to All, empty results, and narrow layout. Run the full TypeScript suite, typecheck and production build. No claim of public-release readiness follows from dashboard completion.

## Alternatives considered

An external telemetry stack adds setup and privacy exposure that this solo local app does not need. A visual-only dashboard over existing totals would preserve known accounting ambiguity. The proposed implementation instead uses the current event store, fixes measurable adapter defects, and exposes coverage limitations.
