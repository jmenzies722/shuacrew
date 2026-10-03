/**
 * Live: a phone call with Shua. The page holds the WebRTC call (mic in, voice out, echo cancelled by the browser's
 * audio stack so you can talk over it on speakers); the gateway negotiates it with Codex realtime and relays what the
 * hands are doing. See apps/gateway/src/live.ts.
 */
export type LiveState = "connecting" | "listening" | "speaking" | "working" | "ended" | "error";
export type LiveEvent =
  | { type: "state"; state: LiveState; detail?: string }
  | { type: "caption"; role: "user" | "assistant"; text: string; final: boolean }
  | { type: "step"; text: string }
  | { type: "result"; text: string; final: boolean }
  | { type: "approval"; id: string; kind: "command" | "files"; text: string; why?: string }
  | { type: "levels"; mic: number; voice: number }
  | { type: "do"; id: string; actions: unknown[] }
  | { type: "correction"; said: string; result: string }
  | { type: "usage"; percent: number };

export interface LiveOptions {
  voice?: string;
  onEvent: (e: LiveEvent) => void;
  /** Tests feed a synthetic microphone. */
  mic?: MediaStream;
  wsUrl?: string;
  /** Spark's action vocabulary: with it, the hands can use the Mac natively (calendar, reminders, music…). */
  vocab?: string;
}

const level = (an: AnalyserNode, buf: Float32Array<ArrayBuffer>) => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };

export class LiveCall {
  private pc?: RTCPeerConnection;
  private ws?: WebSocket;
  private ctx?: AudioContext;
  private mic?: MediaStream;
  private audio?: HTMLAudioElement;
  private timer?: ReturnType<typeof setInterval>;
  private state: LiveState = "connecting";
  private working = false;
  private captions = { user: "", assistant: "" };
  private over = false;

  constructor(private o: LiveOptions) {}

  private set(state: LiveState, detail?: string) {
    if (this.over && state !== "ended" && state !== "error") return;
    if (state !== this.state || detail) { this.state = state; this.o.onEvent({ type: "state", state, detail }); }
  }

  async start() {
    this.set("connecting");
    try {
      const ctx = (this.ctx = new AudioContext());
      // Echo cancellation lets you interrupt Shua while it talks on the laptop speakers.
      this.mic = this.o.mic ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const out = ctx.createMediaStreamDestination();
      const micSrc = ctx.createMediaStreamSource(this.mic), micAn = ctx.createAnalyser();
      micSrc.connect(out); micSrc.connect(micAn);
      // Room tone, far below speech: the realtime voice runs on the input audio clock and goes quiet if the mic sends
      // digital silence (measured: it never spoke a result until input kept flowing).
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.002;
      const tone = ctx.createBufferSource(); tone.buffer = noise; tone.loop = true; tone.connect(out); tone.start();

      const pc = (this.pc = new RTCPeerConnection());
      pc.addTrack(out.stream.getAudioTracks()[0]!, out.stream);
      // The realtime events channel: its "session.started" is when the voice can really hear you.
      const events = pc.createDataChannel("oai-events");
      events.onmessage = (ev) => { try { if (JSON.parse(String(ev.data)).type === "session.started" && this.state === "connecting") this.set("listening"); } catch { /* not json */ } };
      const voiceAn = ctx.createAnalyser();
      pc.ontrack = (ev) => {
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        // An <audio> element plays it (WebKit doesn't render remote WebRTC audio through Web Audio alone); the analyser only measures.
        this.audio = new Audio(); this.audio.autoplay = true; this.audio.srcObject = stream; void this.audio.play().catch(() => undefined);
        ctx.createMediaStreamSource(stream).connect(voiceAn);
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") this.fail("The call dropped. Check your connection and try again."); };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve) => { if (pc.iceGatheringState === "complete") return resolve(); pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && resolve(); setTimeout(resolve, 1200); });

      const ws = (this.ws = new WebSocket(this.o.wsUrl ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live`));
      ws.onmessage = (e) => void this.received(JSON.parse(String(e.data)));
      ws.onclose = () => { if (!this.over) this.fail("The live connection closed."); };
      await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error("Couldn't reach ShuaCrew.")); });
      ws.send(JSON.stringify({ type: "start", sdp: pc.localDescription!.sdp, voice: this.o.voice, vocab: this.o.vocab }));

      const mb = new Float32Array(micAn.fftSize), vb = new Float32Array(voiceAn.fftSize);
      let loud = 0;
      this.timer = setInterval(() => {
        const mic = level(micAn, mb), voice = level(voiceAn, vb);
        this.o.onEvent({ type: "levels", mic, voice });
        if (this.state === "connecting" || this.over) return;
        // Speaking while its voice is audible (with a short hang so word gaps don't flicker), else working or listening.
        loud = voice > 0.012 ? 6 : Math.max(0, loud - 1);
        this.set(loud ? "speaking" : this.working ? "working" : "listening");
      }, 50);
    } catch (e) {
      const name = (e as Error).name;
      this.fail(name === "NotAllowedError" ? "Microphone access is off for ShuaCrew." : name === "NotFoundError" ? "No microphone found." : name === "NotSupportedError" || !navigator.mediaDevices ? "This window can't use the microphone." : (e as Error).message);
    }
  }

  private async received(m: { type: string; [k: string]: unknown }) {
    if (m.type === "answer") {
      await this.pc?.setRemoteDescription({ type: "answer", sdp: String(m.sdp) });
      // "Listening" waits for session.started: speech before it is lost (measured: one start took 12 s). Never stuck, though.
      setTimeout(() => { if (this.state === "connecting") this.set("listening"); }, 15_000);
    } else if (m.type === "delta") {
      const role = m.role === "assistant" ? "assistant" : "user";
      this.captions[role] += String(m.text);
      this.o.onEvent({ type: "caption", role, text: this.captions[role].trim(), final: false });
    } else if (m.type === "transcript") {
      const role = m.role === "assistant" ? "assistant" : "user";
      this.captions[role] = "";
      this.o.onEvent({ type: "caption", role, text: String(m.text), final: true });
    } else if (m.type === "working") this.working = m.on === true;
    else if (m.type === "step") this.o.onEvent({ type: "step", text: String(m.text) });
    else if (m.type === "result") this.o.onEvent({ type: "result", text: String(m.text), final: m.final === true });
    else if (m.type === "approval") this.o.onEvent({ type: "approval", id: String(m.id), kind: m.kind === "files" ? "files" : "command", text: String(m.text), why: m.why ? String(m.why) : undefined });
    else if (m.type === "usage") this.o.onEvent({ type: "usage", percent: Number(m.percent) });
    else if (m.type === "correction") this.o.onEvent({ type: "correction", said: String(m.said), result: String(m.result) });
    else if (m.type === "do" && Array.isArray(m.actions)) this.o.onEvent({ type: "do", id: String(m.id), actions: m.actions });
    else if (m.type === "error") this.fail(String(m.message));
    else if (m.type === "closed") this.end();
  }


  /** What Spark's actions did, back to the hands. */
  done(id: string, text: string) { this.ws?.send(JSON.stringify({ type: "done", id, text })); }
  approve(id: string, allow: boolean) { this.ws?.send(JSON.stringify({ type: "approve", id, allow })); }
  /** Typed text into the call (a link, a name that's hard to say). */
  say(text: string) { this.ws?.send(JSON.stringify({ type: "text", text })); }

  private fail(detail: string) { if (this.over) return; this.set("error", detail); this.teardown(); }
  end() { if (this.over) return; this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "stop" })); this.set("ended"); this.teardown(); }
  private teardown() {
    this.over = true;
    clearInterval(this.timer);
    this.pc?.close(); this.ws?.close();
    this.mic?.getTracks().forEach((t) => { if (!this.o.mic) t.stop(); });
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
    void this.ctx?.close().catch(() => undefined);
  }
}
