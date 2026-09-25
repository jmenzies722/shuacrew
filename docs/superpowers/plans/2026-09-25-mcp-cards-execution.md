# MCP Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show authentic connector identity and professional inspectable tool cards without confusing branding with trust.
**Architecture:** Reviewed asset catalog and bounded icon loader feed shared normalized cards; existing tool execution and approval pathways remain authoritative.
**Tech Stack:** MCP SDK, TypeScript, React, Vitest, existing gateway image-processing capabilities after dependency inspection.
**Spec:** `docs/superpowers/specs/2026-09-25-mcp-brand-cards-design.md`.

## Global Constraints

Inherit master constraints. Icon cap256KiB,512x512,3s timeout,2 concurrent fetches,10MiB cache. Runtime PNG/JPEG only; no SVG/iframe execution. Credentialless same-origin HTTPS/data images, no redirects/private-address fetches. No implicit sign-in or tool execution.

## Review Focus

- Display name spoofing and community connector attribution: M1.
- DNS rebinding, redirect and oversized decoded content: M1.
- Tool annotations masquerading as approval authority: M2.
- Links/markdown attempting script or credential disclosure: M2.
- Unknown output/cancellation rendered as successful: M2.

### M1: Brand provenance and safe icon pipeline

**Files:** Create `apps/gateway/src/mcp-brand.ts`, `mcp-brand.test.ts`, `mcp-icons.ts`, `mcp-icons.test.ts`, `apps/web/public/brands/manifest.json`; modify `mcp-client.ts`, `mcp.ts` and existing server routes.

**Interfaces:** `resolveMcpBrand({url?:string,packageId?:string,name:string},catalog):{assetId:string|null;publisher:'official'|'community'|'unknown'}` matches exact reviewed origins/packages only. `loadMcpIcon(serverId:string,iconIndex:number):Promise<Uint8Array|null>` resolves server metadata internally; public routes never accept arbitrary target URLs.

- [ ] Add RED test with an empty catalog: `expect(resolveMcpBrand({name:'GitHub'},[])).toEqual({assetId:null,publisher:'unknown'})`. Add exact-origin versus deceptive subdomain fixtures and run targeted tests.
- [ ] Inventory actual catalog providers from Integrations.tsx; obtain official assets from vendor sources, record source/usage reference/date/hash/light-dark variants in manifest. Do not claim company coverage for missing approved assets; use neutral fallback.
- [ ] Preserve bounded icon metadata from real MCP SDK discovery. Add source-resolution and transport tests using injected network/decoder boundaries: redirects fail; private IPv4/IPv6, mixed DNS results and changed resolution fail; cookies/auth never forwarded; MIME mismatch, decompression dimensions, timeout and capacity fail safely.
- [ ] Implement hostname/IP validation with address pinning at connection time, strict response/decoded bounds and safe static re-encoding using a reviewed existing decoder or explicitly justified dependency. If safe decoding cannot be established, show bundled/neutral icons rather than weakening checks.
- [ ] Test cache eviction/removal and no icon request when cards are hidden; run `pnpm exec vitest run apps/gateway/src/mcp-brand.test.ts apps/gateway/src/mcp-icons.test.ts apps/gateway/src/mcp.test.ts` and typecheck.

### M2: Shared connector/tool cards and interactions

**Files:** Create `apps/web/src/components/ToolActivityCard.tsx`, `apps/web/src/lib/tool-card.ts`, `tool-card.test.ts`; modify `components/Thread.tsx`, `screens/Integrations.tsx`, room work/results components and Settings.tsx.

**Interfaces:** `toolCard(input:{name:string;status:string;output?:unknown;startedAt?:number;endedAt?:number}):{title:string;status:'pending'|'running'|'succeeded'|'failed'|'cancelled'|'unknown';durationMs:number|null;text:string}` accepts untrusted data but emits bounded plain presentation fields. Existing trusted result adapters supply the actual status; arbitrary output text cannot set it.

- [ ] Add RED assertion:

```ts
const card=toolCard({name:'example',status:'mystery',output:'success',startedAt:20,endedAt:10});
expect(card.status).toBe('unknown');
expect(card.durationMs).toBeNull();
```

- [ ] Run targeted Vitest; implement normalization, redaction and existing sanitized Markdown fallback with bounded output. Never infer success from the text body.
- [ ] Build shared identity/operation/status/duration header, concise result and expandable inputs/output. Buttons expose only existing inspect/copy/settings/link/approval pathways. Display exact origin and community attribution; advisory tool annotations do not create trust badges.
- [ ] Add compact/comfortable preference inheriting app density, show-icons, expand-errors and cache-clear controls. Keyboard focus and screen-reader labels expose every action. No blind side-effect Retry button.
- [ ] Test unsafe URLs/HTML, long output, nullable duration, empty results, stale state and exact approval request binding. Verify live connector identity without signing in or invoking a tool, then full TS suite/typecheck/build.
