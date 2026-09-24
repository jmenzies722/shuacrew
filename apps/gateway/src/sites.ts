/**
 * Sites: put a page the crew made on the internet, with a waitlist that really collects emails,
 * and read the signups back into the venture.
 *
 * Publishing runs the Vercel CLI you're logged into (like the agents use your Claude and Codex
 * CLIs) — ShuaCrew never sees your Vercel token. It's always your click: agents can't publish.
 *
 * Each site is a folder under ~/.shuacrew/sites/<id>: the page, with a small script that sends
 * any email form to /api/join, and two functions. Signups are stored in the project's Vercel Blob
 * store (connect one in the project's Storage tab — free on Hobby). Reading them needs a secret
 * only ShuaCrew holds: its hash is baked into the function, the secret stays in a 0600 file here.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CrewState, SiteView } from "@shuacrew/core";
import type { Library } from "./library.js";
import type { EventStore } from "./store.js";

export type Runner = (args: string[], cwd: string, timeoutMs: number) => Promise<{ code: number; out: string }>;

const vercelBin = () => ["/opt/homebrew/bin/vercel", "/usr/local/bin/vercel", ...(process.env.PATH ?? "").split(":").map((d) => path.join(d, "vercel"))].find((p) => existsSync(p));

/** The Vercel CLI, never interactive: CI=1 makes it fail fast instead of waiting for a login. */
export const vercel: Runner = (args, cwd, timeoutMs) =>
  new Promise((resolve) => {
    const bin = vercelBin();
    if (!bin) return resolve({ code: 127, out: "the Vercel CLI isn't installed (brew install vercel-cli)" });
    execFile(bin, args, { cwd, timeout: timeoutMs, env: { ...process.env, CI: "1", FORCE_COLOR: "0" }, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ code: error ? ((error as NodeJS.ErrnoException & { code?: number }).code as unknown as number) || 1 : 0, out: `${stdout}\n${stderr}` }),
    );
  });

/** The script every published page gets: any form with an email field joins the waitlist. */
export const WAITLIST_SCRIPT = `<script>
(function(){
  function wire(form){
    var email=form.querySelector('input[type=email],input[name*=email i]');
    if(!email||form.dataset.shuacrew)return;
    form.dataset.shuacrew='1';
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var btn=form.querySelector('button,[type=submit]');var label=btn&&btn.textContent;
      if(btn){btn.disabled=true;btn.textContent='Joining…';}
      fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,ref:document.referrer||''})})
        .then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b.error||'Something went wrong');return b;});})
        .then(function(){form.innerHTML='<p style="font:inherit;margin:0;padding:12px 0">You\\u2019re on the list \\u2014 thank you!</p>';})
        .catch(function(err){if(btn){btn.disabled=false;btn.textContent=label;}alert(err.message);});
    });
  }
  document.querySelectorAll('form').forEach(wire);
})();
</script>`;

const JOIN = `// Waitlist: POST {email} -> one private record in this project's Blob store.
import { put } from "@vercel/blob";
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\\s]{1,64}@[^@\\s]{1,190}\\.[a-z]{2,}$/i.test(email)) return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "The waitlist isn't collecting yet." }, { status: 503 });
  const at = new Date().toISOString();
  await put("signups/" + at.replace(/[:.]/g, "-") + ".json", JSON.stringify({ email, at, ref: String(body.ref || "").slice(0, 300) }), { access: "public", addRandomSuffix: true, contentType: "application/json" });
  return Response.json({ ok: true });
}
`;

const SIGNUPS = (keyHash: string) => `// For ShuaCrew only: how many have joined (and the latest few). Needs ShuaCrew's key.
import { list } from "@vercel/blob";
import { createHash } from "node:crypto";
const KEY_HASH = "${keyHash}";
export async function GET(request) {
  const key = request.headers.get("x-shuacrew-key") || "";
  if (createHash("sha256").update(key).digest("hex") !== KEY_HASH) return Response.json({ error: "not allowed" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "no Blob store connected to this project yet" }, { status: 503 });
  let cursor, count = 0; const recent = [];
  do {
    const page = await list({ prefix: "signups/", cursor, limit: 1000 });
    count += page.blobs.length;
    for (const b of page.blobs) recent.push({ url: b.url, at: b.uploadedAt });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  recent.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const latest = await Promise.all(recent.slice(0, 10).map((r) => fetch(r.url).then((x) => x.json()).catch(() => null)));
  return Response.json({ count, latest: latest.filter(Boolean).map((s) => ({ email: s.email, at: s.at })) });
}
`;

export class Sites {
  constructor(
    private store: EventStore,
    private root: string,
    private library: Library,
    private state: () => CrewState,
    private run: Runner = vercel,
    private http: typeof fetch = fetch,
  ) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }

  /** Is the Vercel CLI here, and are you logged in? */
  async status(): Promise<{ cli: boolean; user?: string; hint?: string }> {
    const r = await this.run(["whoami"], this.root, 20_000);
    if (r.code === 127) return { cli: false, hint: r.out.trim() };
    const user = r.out
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /^[a-z0-9][a-z0-9_-]*$/i.test(l));
    return r.code === 0 && user ? { cli: true, user } : { cli: true, hint: "Log in once: run `vercel login` in Terminal" };
  }

  list(): SiteView[] {
    return Object.values(this.state().sites).sort((a, b) => b.publishedAt - a.publishedAt);
  }

  /** Publish (or re-publish) an HTML artifact. Returns the live site. */
  async publish(input: { artifact: string; venture?: string }): Promise<SiteView> {
    const artifact = this.library.artifact(input.artifact);
    if (!artifact) throw new Error("no such artifact");
    if (artifact.kind !== "page") throw new Error("only pages (HTML) can be published");
    const file = this.library.fileOf(artifact.id);
    if (!file) throw new Error("the page's file is missing");
    const existing = this.list().find((s) => s.artifact === artifact.id);
    const id = existing?.id ?? `s_${randomUUID().slice(0, 8)}`;
    const venture = input.venture ?? existing?.venture ?? (artifact.run ? this.state().runs[artifact.run]?.venture : undefined);
    const dir = path.join(this.root, id);
    mkdirSync(path.join(dir, "api"), { recursive: true, mode: 0o700 });

    // The page, with the waitlist wired into any email form.
    let html = readFileSync(file, "utf8");
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${WAITLIST_SCRIPT}\n</body>`) : `${html}\n${WAITLIST_SCRIPT}`;
    writeFileSync(path.join(dir, "index.html"), html);
    writeFileSync(path.join(dir, "api", "join.js"), JOIN);
    writeFileSync(path.join(dir, "api", "signups.js"), SIGNUPS(createHash("sha256").update(this.key(id)).digest("hex")));
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: slug(artifact.title), private: true, type: "module", dependencies: { "@vercel/blob": "^2.8.0" } }, null, 2));
    writeFileSync(path.join(dir, ".vercelignore"), ".shuacrew-key\n");

    const project = existing?.project ?? `${slug(artifact.title)}-${id.slice(2, 6)}`;
    const r = await this.run(["deploy", "--prod", "--yes", "--name", project], dir, 300_000);
    // The CLI prints the production URL; prefer the stable alias over the per-deploy one.
    const urls = [...r.out.matchAll(/https:\/\/[a-z0-9.-]+\.vercel\.app/gi)].map((m) => m[0]);
    const url = urls.find((u) => !/-[a-z0-9]{9}-/.test(u)) ?? urls[0];
    if (r.code !== 0 || !url) throw new Error(explain(r.out));
    this.store.append("site.published", { id, artifact: artifact.id, venture, url, project, version: artifact.version });
    return this.state().sites[id]!;
  }

  /** Read the waitlist count back (and the latest few, which aren't logged). */
  async signups(id: string): Promise<{ count: number; latest: Array<{ email: string; at: string }> }> {
    const site = this.state().sites[id];
    if (!site) throw new Error("no such site");
    try {
      const response = await this.http(`${site.url}/api/signups`, { headers: { "x-shuacrew-key": this.key(id) }, signal: AbortSignal.timeout(20_000) });
      const body = (await response.json().catch(() => ({}))) as { count?: number; latest?: Array<{ email: string; at: string }>; error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      if (body.count !== site.signups?.count) this.store.append("site.signups", { id, count: body.count ?? 0 });
      return { count: body.count ?? 0, latest: body.latest ?? [] };
    } catch (error) {
      const message = (error as Error).message.slice(0, 240);
      if (message !== site.signupsError) this.store.append("site.signups", { id, count: site.signups?.count ?? 0, error: message });
      throw error;
    }
  }

  async syncAll() {
    for (const site of this.list()) await this.signups(site.id).catch(() => undefined);
  }

  forget(id: string) {
    if (!this.state().sites[id]) throw new Error("no such site");
    this.store.append("site.removed", { id });
  }

  /** The secret that reads a site's signups: made once, kept in a 0600 file beside it. */
  private key(id: string): string {
    const file = path.join(this.root, id, ".shuacrew-key");
    if (existsSync(file)) return readFileSync(file, "utf8").trim();
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const key = randomBytes(24).toString("base64url");
    writeFileSync(file, key, { mode: 0o600 });
    chmodSync(file, 0o600);
    return key;
  }
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site";
}

/** The CLI's failure, in one line you can act on. */
function explain(out: string): string {
  if (/no existing credentials|not logged in|please log in|vercel login/i.test(out)) return "Log in to Vercel once: run `vercel login` in Terminal, then publish again.";
  const line = out.split("\n").map((l) => l.trim()).filter((l) => /error|failed/i.test(l)).pop();
  return line ? line.replace(/^Error:?\s*/i, "").slice(0, 300) : "The deploy didn't finish — see the Vercel CLI output.";
}
