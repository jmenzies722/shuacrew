# Authentic MCP branding and professional tool cards

Status: proposed written design awaiting review. Not implemented.

## Outcome and approach

Make installed connectors recognizable and tool activity easy to inspect without
mistaking attractive branding for trust. Reuse existing MCP discovery, conversation
events and approval paths. Prefer curated bundled official brand assets plus
validated server icons over a third-party logo CDN or arbitrary embedded MCP apps.
No authentication or remote tool execution is triggered just by opening a card.

## Brand provenance

Build a small brand catalog for providers actually represented in the app. For
each asset record its official source URL, usage/license reference, retrieval date,
hash and approved light/dark versions. Do not invent company marks or assume an
unrestricted right to redistribute them. If a usable official asset is unavailable,
use a neutral connector glyph and name and record the coverage gap.

Match catalog entries only through reviewed exact endpoint origins or exact
package identities, never arbitrary server display names or substring matching.
Community connectors may show a service logo only alongside a clear Community
connector label and their actual publisher/origin. A logo is not a verified badge.

Preserve bounded MCP server/tool icon metadata through mcp-client discovery.
Remote icon support follows the protocol's untrusted-input guidance: credentialless
same-origin HTTPS only, no redirects, private/link-local/loopback address fetches,
or arbitrary proxy URLs; bind fetch requests to installed server IDs. Validate
DNS/address selection at connection time, MIME magic, bytes (256KiB), dimensions
(512x512), timeout (3 seconds), and concurrency (2). Decode/re-encode static PNG
or JPEG; reject runtime SVG, animated content and unknown formats. Safe bounded
PNG/JPEG data URIs are allowed without network. Limit cache to 10MiB with eviction;
icons may fail without blocking tools. Bundled reviewed assets avoid runtime loads.

Source: https://modelcontextprotocol.io/specification/2025-11-25/basic#icons
The specification treats icon metadata as untrusted and prohibits credentialed
fetches; this design deliberately supports a narrower image set.

## Card design

One reusable tool-card presentation in sessions and Crew Rooms: brand/name,
human-readable operation, exact connector origin in details, observed status,
recorded duration when available, concise result and expandable redacted inputs/
outputs. Separate connected, authenticated and last-checked states in settings.
Unknown status never appears green. Server read-only/destructive annotations are
advisory metadata, not trusted permission decisions.

Support bounded text, sanitized markdown, allowlisted external links, structured
key/value output and existing file/check references. Unknown payloads fall back
to bounded redacted text/JSON. Do not execute server HTML/JavaScript or render a
third-party iframe. Large output uses truncation and existing inspect views.

Interactions: expand details, copy safe text, inspect originating run, open vetted
source links and open existing connector settings. Any retry is an explicit new
supervised request after reviewing uncertain side effects, not a blind re-run
button. Pending approvals use the existing exact tool request and Allow once/Deny
mechanism; branding cannot replace the action summary or input review.

Settings adds brand-icon visibility, compact/comfortable cards, auto-expand errors
and clear icon cache. Defaults inherit current app density and show errors.
Phone adopts these visuals only for allowlisted data already in its signed
contract; it does not fetch tool payloads or gain direct MCP execution authority.

## Boundaries and acceptance

Discovery/brand resolution, safe asset loading, result normalization and card UI
are separate modules. Tests cover spoofed names, community labeling, private-IP
and redirect rejection, malformed/oversized images, timeouts, missing assets,
redaction, hostile markdown/URLs, unknown status and approval binding. Check long
outputs with existing transcript virtualization and measure before optimizing.
Verify light/dark, reduced motion, keyboard navigation and VoiceOver. Maintain an
asset manifest and report exact logo coverage rather than claiming every connector.
No account sign-in, new connector installation or tool action occurs in verification
without task-specific authority. No commits/pushes.
