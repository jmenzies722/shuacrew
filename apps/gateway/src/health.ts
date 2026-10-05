/**
 * The Health check: everything ShuaCrew needs to work, checked in one go and said plainly — green when it's fine, amber
 * when it works but could be better, red when something's broken — each with the one thing that fixes it. Pure: the
 * route gathers the facts, this turns them into checks (so the rules are testable).
 */
export type HealthStatus = "ok" | "warn" | "fail";
export interface HealthFix { kind: "settings" | "page" | "howto"; target: string; label: string }
export interface HealthCheck { id: string; label: string; status: HealthStatus; detail: string; fix?: HealthFix }

export interface HealthFacts {
  runtimes: Array<{ id: string; label: string; installed: boolean; signedIn: boolean | null; limitedUntil: number; error?: string }>;
  speech: { state: string; firstAudioMs: number | null; coldMs?: number; error?: string } | null;
  transcription: { ffmpeg: boolean; whisper: boolean; model: boolean };
  chrome: { connected: boolean };
  diskFreeGb: number | null;
  memoryMb: number;
  now: number;
}

const inMinutes = (until: number, now: number) => Math.max(1, Math.round((until - now) / 60_000));

export function healthChecks(f: HealthFacts): HealthCheck[] {
  const checks: HealthCheck[] = [{ id: "gateway", label: "ShuaCrew engine", status: "ok", detail: `Running on this Mac (${f.memoryMb} MB).` }];
  if (f.memoryMb > 2500) Object.assign(checks[0]!, { status: "warn", detail: `Running, but using ${f.memoryMb} MB. Restarting ShuaCrew frees it.` });

  // The brains: at least one must be usable, or Spark and the crew can't think.
  const usable = f.runtimes.filter((r) => r.installed && r.signedIn === true && r.limitedUntil <= f.now);
  if (!f.runtimes.length) checks.push({id:"runtime",label:"AI runtime",status:"fail",detail:"No AI runtime is connected.",fix:{kind:"page",target:"/settings#agents",label:"Connect Codex"}});
  for (const r of f.runtimes) {
    const id = `runtime-${r.id}`;
    if (!r.installed) checks.push({ id, label: r.label, status: usable.length ? "warn" : "fail", detail: `Not installed.${usable.length ? " Spark uses the other one." : ""}`, fix: { kind: "page", target: "/settings#agents", label: "Connect" } });
    else if (r.signedIn === false) checks.push({ id, label: r.label, status: usable.length ? "warn" : "fail", detail: "Installed but signed out.", fix: { kind: "page", target: "/settings#agents", label: "Sign in" } });
    else if (r.limitedUntil > f.now) checks.push({ id, label: r.label, status: usable.length ? "warn" : "fail", detail: `At its usage limit for about ${inMinutes(r.limitedUntil, f.now)} more minutes.${usable.length ? " Spark uses the other one meanwhile." : ""}` });
    else if (r.signedIn === null) checks.push({id,label:r.label,status:"warn",detail:"Installed; authentication has not been verified. Run the setup model check.",fix:{kind:"page",target:"/settings#agents",label:"Check connection"}});
    else checks.push({ id, label: r.label, status: "ok", detail: "Signed in. A successful task still needs its own verification." });
  }

  // Voice: installed, and fast enough that it never drags (a sentence should start well under a second).
  const s = f.speech;
  if (!s) checks.push({ id: "voice", label: "Spark's voice", status: "warn", detail: "The voice engine isn't set up.", fix: { kind: "settings", target: "voice", label: "Set up" } });
  else if (s.state !== "ready") checks.push({ id: "voice", label: "Spark's voice", status: s.state === "installing" ? "warn" : "fail", detail: s.state === "installing" ? "Installing the voice engine…" : `The voice engine isn't ready${s.error ? `: ${s.error}` : "."}`, fix: { kind: "settings", target: "voice", label: "Open voice settings" } });
  else if (s.firstAudioMs === null) checks.push({ id: "voice", label: "Spark's voice", status: "fail", detail: `Installed, but the test sentence produced no audio${s.error ? `: ${s.error}` : "."}`, fix: { kind: "settings", target: "voice", label: "Open voice settings" } });
  else checks.push({ id: "voice", label: "Spark's voice", status: s.firstAudioMs <= 1500 ? "ok" : "warn",
    detail: (s.firstAudioMs <= 1500 ? `Audio generated in ${(s.firstAudioMs / 1000).toFixed(1)} s. Playback not verified.` : `Audio generation took ${(s.firstAudioMs / 1000).toFixed(1)} s. Playback not verified.`)
      + (s.coldMs ? ` (The first sentence after a restart took ${(s.coldMs / 1000).toFixed(1)} s while the voice loaded.)` : "") });

  // Hearing you: voice mode and dictation need ffmpeg, whisper and a model on this Mac.
  const t = f.transcription, missing = [!t.ffmpeg && "ffmpeg", !t.whisper && "whisper-cpp", !t.model && "a speech model"].filter(Boolean);
  checks.push(missing.length
    ? { id: "hearing", label: "Local transcription", status: "fail", detail: `Local transcription is unavailable: missing ${missing.join(", ")}.`, fix: { kind: "howto", target: "brew install ffmpeg whisper-cpp", label: "How to fix" } }
    : { id: "hearing", label: "Local transcription", status: "ok", detail: "Local transcription components are installed. Microphone input is not verified; live OpenAI voice has a separate path." });

  checks.push(f.chrome.connected
    ? { id: "chrome", label: "Spark for Chrome", status: "ok", detail: "Connected: exact on web pages." }
    : { id: "chrome", label: "Spark for Chrome", status: "warn", detail: "Not connected. Spark still works in Chrome, just less precisely on pages.", fix: { kind: "page", target: "/settings#play", label: "Set up" } });

  if (f.diskFreeGb !== null) checks.push(f.diskFreeGb < 5
    ? { id: "disk", label: "Disk space", status: "fail", detail: `Only ${f.diskFreeGb.toFixed(1)} GB free: sessions and the voice may fail.`, fix: { kind: "settings", target: "storage", label: "Free up space" } }
    : f.diskFreeGb < 15 ? { id: "disk", label: "Disk space", status: "warn", detail: `${f.diskFreeGb.toFixed(0)} GB free: getting low.`, fix: { kind: "settings", target: "storage", label: "Manage storage" } }
    : { id: "disk", label: "Disk space", status: "ok", detail: `${f.diskFreeGb.toFixed(0)} GB free.` });
  return checks;
}
