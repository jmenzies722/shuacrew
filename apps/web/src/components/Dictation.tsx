import { Loader2, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Talk instead of type. Records in the page, transcribes on this Mac (whisper, via the gateway),
 * and hands the words to the composer to edit before sending. Click to start, click (or ↵) to
 * finish, Esc to throw it away.
 */
export function Dictation({ onText, available, reason }: { onText: (text: string) => void; available: boolean; reason?: string }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(18).fill(0));
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const stopAll = useRef<() => void>(() => undefined);

  useEffect(() => () => stopAll.current(), []);

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      // A live level meter, so you can see it's hearing you.
      const audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 64;
      audio.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setLevels((l) => [...l.slice(1), Math.min(1, avg * 2.2)]);
        frame = requestAnimationFrame(tick);
      };
      tick();
      const started = Date.now();
      const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
      stopAll.current = () => {
        cancelAnimationFrame(frame);
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        void audio.close();
      };
      rec.onstop = async () => {
        stopAll.current();
        if (cancelled.current || !chunks.current.length) return setState("idle");
        setState("transcribing");
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        try {
          const response = await fetch(`/api/transcribe?name=voice.${rec.mimeType.includes("mp4") ? "m4a" : "webm"}`, {
            method: "POST",
            headers: { "X-ShuaCrew": "1", "Content-Type": "application/octet-stream" },
            body: blob,
          });
          const body = (await response.json()) as { text?: string; error?: string };
          if (!response.ok) throw new Error(body.error ?? "couldn't transcribe");
          if (body.text) onText(body.text);
          else setError("didn't catch any words");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setState("idle");
        }
      };
      recorder.current = rec;
      rec.start(250);
      setSeconds(0);
      setState("recording");
    } catch (e) {
      setError((e as Error).name === "NotAllowedError" ? "microphone access was denied — allow it in System Settings → Privacy → Microphone" : (e as Error).message);
    }
  };
  const finish = (cancel = false) => {
    cancelled.current = cancel;
    recorder.current?.state === "recording" && recorder.current.stop();
  };

  useEffect(() => {
    if (state !== "recording") return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") (e.preventDefault(), finish(true));
      if (e.key === "Enter") (e.preventDefault(), finish());
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [state]);

  if (state === "recording") {
    return (
      <div className="dictate is-on" role="status" aria-label="Recording">
        <span className="dictate-dot" />
        <span className="dictate-bars" aria-hidden>
          {levels.map((l, i) => (
            <span key={i} style={{ transform: `scaleY(${0.15 + l * 0.85})` }} />
          ))}
        </span>
        <span className="mono text-[11.5px] tabular-nums text-fg-2">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
        <button className="dictate-btn" onClick={() => finish(true)} title="Discard (Esc)" aria-label="Discard recording">
          <X size={13} />
        </button>
        <button className="dictate-btn is-stop" onClick={() => finish()} title="Done (↵)" aria-label="Finish and transcribe">
          <Square size={10} fill="currentColor" />
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        onClick={() => void start()}
        disabled={!available || state === "transcribing"}
        className="grid h-6 w-6 place-items-center rounded-full text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-40"
        title={available ? "Talk instead of typing (transcribed on this Mac)" : `Voice needs ${reason ?? "whisper"}`}
        aria-label="Dictate"
      >
        {state === "transcribing" ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
      </button>
      {state === "transcribing" && <span className="shimmer-text text-[11.5px]">Transcribing…</span>}
      {error && <span className="max-w-[260px] truncate text-[11.5px] text-bad" title={error}>{error}</span>}
    </>
  );
}
