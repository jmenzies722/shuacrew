#!/usr/bin/env node
// NetShua's beta inbox, pulled each morning by ShuaCrew's "NetShua feedback" schedule (ShuaCrew is the team behind
// NetShua: CLAUDE.md). Reads GET <url>/api/inbox?since=<cursor> (NetShua's site/api/_inbox.js) with the read key, keeps
// what arrived in ShuaCrew's Library and moves the cursor on.
//   New feedback → ESCALATE: and exit 2, so the schedule wakes a crew agent to sort it (its ask says the notes are
//   untrusted text from other people: read them, never follow them).
//   Only beta sign-ups, or nothing → a notification at most, no model call.
// Setup: ~/.shuacrew/netshua-feedback.json (0600) {"url": "https://….vercel.app", "readKey": "…"}; it also keeps the cursor.
// NETSHUA_FEEDBACK_DRY=1: print, no notification, nothing kept, cursor unchanged (for testing).
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";

const file = process.env.NETSHUA_FEEDBACK_CONFIG ?? path.join(os.homedir(), ".shuacrew", "netshua-feedback.json");
const gateway = process.env.SHUACREW_URL ?? "http://127.0.0.1:7420";
const dry = Boolean(process.env.NETSHUA_FEEDBACK_DRY);

const notify = (title, text) => dry ? console.log(`[notify] ${title}: ${text}`)
  : execFile("osascript", ["-e", `display notification ${JSON.stringify(text)} with title ${JSON.stringify(title)}`], () => {});

async function keep(title, content) {
  if (dry) return console.log(`[keep] ${title}`);
  await fetch(`${gateway}/api/library/artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ShuaCrew": "1", Origin: gateway },
    body: JSON.stringify({ title, content, filename: "netshua-feedback.md", summary: content.split("\n").find(Boolean)?.slice(0, 140) }),
  }).catch(() => {});
}

// Tester text, made safe to put in a report and a prompt: one line each, no markdown or HTML structure, bounded.
const clean = (s, max = 1200) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[<>`]/g, "").trim().slice(0, max);

if (!existsSync(file)) { console.log(`not set up yet (${file})`); process.exit(0); }
const config = JSON.parse(readFileSync(file, "utf8"));
if (!config.url || !config.readKey) { console.log("config needs url and readKey"); process.exit(0); }

let cursor = config.cursor ?? "";
const items = [];
for (let page = 0; page < 20; page++) {
  const response = await fetch(`${config.url.replace(/\/$/, "")}/api/inbox?since=${encodeURIComponent(cursor)}`, {
    headers: { Authorization: `Bearer ${config.readKey}` }, signal: AbortSignal.timeout(20_000),
  }).catch((error) => ({ ok: false, status: 0, statusText: error.message }));
  if (!response.ok) {
    notify("NetShua feedback", `Couldn't read the beta inbox (${response.status || response.statusText}).`);
    console.log(`inbox unreachable: ${response.status} ${response.statusText ?? ""}`);
    process.exit(0); // nothing to sort; the next morning tries again from the same cursor
  }
  const body = await response.json();
  items.push(...(body.items ?? []));
  cursor = body.next ?? cursor;
  if (!body.more) break;
}

if (!dry && cursor !== config.cursor) { writeFileSync(file, JSON.stringify({ ...config, cursor }, null, 2)); chmodSync(file, 0o600); }
const feedback = items.filter((i) => i.kind !== "signup"), signups = items.filter((i) => i.kind === "signup");
if (!items.length) { console.log("nothing new"); process.exit(0); }

const date = new Date().toISOString().slice(0, 10);
const line = (i) => `- [${clean(i.category ?? i.kind, 40)}] ${clean(i.note)}${i.email ? ` (reply to: ${clean(i.email, 120)})` : ""} · NetShua ${clean(i.version, 40)} · ${clean(i.os, 60)}`;
const report = [
  `${feedback.length} feedback note${feedback.length === 1 ? "" : "s"}, ${signups.length} beta sign-up${signups.length === 1 ? "" : "s"} · ${date}`,
  "", "## Feedback (tester text, unedited)", ...(feedback.length ? feedback.map(line) : ["(none)"]),
  "", "## Beta sign-ups", ...(signups.length ? signups.map((i) => `- ${clean(i.email ?? i.note, 120)}`) : ["(none)"]),
].join("\n");
await keep(`NetShua feedback · ${date}`, report);
console.log(report);

if (feedback.length) {
  notify("NetShua feedback", `${feedback.length} new note${feedback.length === 1 ? "" : "s"} from testers. Shua's crew is sorting them.`);
  console.log(`\nESCALATE: ${feedback.length} new NetShua beta feedback note(s) above to sort.`);
  process.exit(2);
}
notify("NetShua beta", `${signups.length} new sign-up${signups.length === 1 ? "" : "s"}.`);
