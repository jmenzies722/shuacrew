/**
 * Live: a phone call with Shua. The page holds the WebRTC call (mic in, voice out, echo cancelled by the browser's
 * audio stack so you can talk over it on speakers); the gateway negotiates it with Codex realtime and relays what the
 * hands are doing. See apps/gateway/src/live.ts.
 */
import { NativePlayback } from "./native-playback";
import { NativeInputBuffer } from "./native-input";
import { micConstraints } from "./mic-route";

export type LiveState = "connecting" | "ready" | "listening" | "speaking" | "working" | "ended" | "error";
export type LiveEvent =
  | { type: "capture"; on: boolean; mode: "hold" | "talk" | "silent" }
  | { type: "muted"; on: boolean }
  | { type: "playback"; text: string }
  | { type: "state"; state: LiveState; detail?: string }
  | { type: "caption"; role: "user" | "assistant"; text: string; final: boolean }
  | { type: "step"; text: string }
  | { type: "result"; text: string; final: boolean }
  | { type: "approval"; id: string; kind: "command" | "files"; text: string; why?: string }
  | { type: "levels"; mic: number; voice: number }
  | { type: "do"; id: string; actions: unknown[] }
  | { type: "task"; id: string; request: string }
  | { type: "cancel"; id: string }
  | { type: "correction"; said: string; result: string }
  | { type: "usage"; percent: number };

export interface LiveOptions {
  mode?: "hold" | "talk" | "silent";
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
  private speaking = false;
  private playback = new NativePlayback(muted => {
    if (this.audio) {
      this.audio.muted = muted;
      if (muted) { this.audio.pause(); this.audio.srcObject = null; }
      else { this.audio.srcObject = this.remote ?? null; void this.audio.play().catch(() => this.fail("Voice playback was blocked. Tap Talk to try again.")); }
    }
    this.speaking = false;
    this.o.onEvent({ type: "muted", on: muted });
    this.o.onEvent({ type: "playback", text: "" });
    this.o.onEvent({ type: "levels", mic: 0, voice: 0 });
  });
  private remote?: MediaStream;
  private processor?: ScriptProcessorNode;
  private micSource?: MediaStreamAudioSourceNode;
  private micAnalyser?: AnalyserNode;
  private input?: NativeInputBuffer;
  private wantsMic: boolean;
  private accepted: boolean;
  private mode: "hold" | "talk" | "silent";
  private captionText = "";
  private pendingCaption?: { type: "caption"; role: "assistant"; text: string; final: boolean };
  private heardAssistant = false;
  private publishedText = "";
  private announcementPending = false;
  private announcementTimer?: ReturnType<typeof setTimeout>;
  private captions = { user: "", assistant: "" };
  private over = false;
  private started = false;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private setupTimer?: ReturnType<typeof setTimeout>;
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  private cancelWait?: () => void;

  constructor(private o: LiveOptions) {
    this.mode = o.mode ?? "talk";
    this.wantsMic = this.mode !== "silent";
    this.accepted = this.mode !== "hold";
  }

  private micAcquisition?: Promise<void>;
  private async acquireMic() {
    if (!this.ctx || !this.processor || !this.wantsMic || this.over || this.micSource) return;
    if (this.micAcquisition) return this.micAcquisition;
    // Device startup can outlive a hold. Reuse that startup for a new hold instead of
    // opening a second stream and stopping the first underneath the audio device.
    this.micAcquisition = (async () => {
      try {
        const stream = this.o.mic ?? await navigator.mediaDevices.getUserMedia({ audio: await micConstraints({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }) });
        if (this.over || !this.wantsMic) { if (!this.o.mic) stream.getTracks().forEach(track => track.stop()); return; }
        this.mic = stream;
        this.micSource = this.ctx!.createMediaStreamSource(stream);
        this.micSource.connect(this.processor!);
        this.micSource.connect(this.micAnalyser!);
        this.o.onEvent({ type: "capture", on: true, mode: this.mode });
      } catch (error) {
        if (!this.over && this.wantsMic) throw error;
      }
    })();
    try { await this.micAcquisition; } finally { this.micAcquisition = undefined; }
  }

  private closeMic() {
    this.micSource?.disconnect(); this.micSource = undefined;
    if (!this.o.mic) this.mic?.getTracks().forEach(track => track.stop());
    this.mic = undefined;
    this.o.onEvent({ type: "capture", on: false, mode: this.mode });
  }

  press() {
    if (this.over || this.mode === "talk") return;
    this.mode = "hold"; this.wantsMic = true; this.accepted = false;
    this.input?.press();
    if (this.state !== "connecting" && (this.speaking || this.working || this.announcementPending)) this.stopSpeaking();
    void this.acquireMic().catch(error => this.fail(String(error.message)));
  }
  acceptHold() { this.accepted = true; this.input?.accept(); }
  release(cancel = false) {
    if (this.mode === "talk") return;
    this.wantsMic = false;
    if (cancel) this.input?.cancel(); else this.input?.release();
    this.closeMic();
  }
  talk() {
    if (this.over) return;
    this.mode = "talk"; this.wantsMic = true; this.accepted = true;
    this.input?.press(); this.input?.accept();
    void this.acquireMic().catch(error => this.fail(String(error.message)));
  }

  stopSpeaking() {
    this.playback.stop(); this.captionText = ""; this.announcementPending = false;
    this.pendingCaption = undefined; this.heardAssistant = false; this.publishedText = "";
    clearTimeout(this.announcementTimer);
    this.send({ type: "text", text: "Stop speaking now. Do not resume the previous answer. Wait quietly for my next spoken request." });
  }

  private set(state: LiveState, detail?: string) {
    if (this.over && state !== "ended" && state !== "error") return;
    if (state !== this.state || detail) { this.state = state; this.o.onEvent({ type: "state", state, detail }); }
  }

  async start() {
    if (this.over || this.started) return;
    this.started = true;
    let setupStage = "microphone acquisition";
    this.set("connecting");
    this.setupTimer = setTimeout(() => { if (this.state === "connecting") this.fail(`The call timed out during ${setupStage}${typeof document !== "undefined" && document.hidden ? " while the notch was hidden" : ""}. Please retry.`); }, 30_000);
    try {
      if (typeof document !== "undefined" && document.hidden) {
        setupStage = "opening the notch";
        await new Promise<void>(resolve => {
          const finish = () => { document.removeEventListener("visibilitychange", visible); this.cancelWait = undefined; resolve(); };
          const visible = () => { if (!document.hidden) finish(); };
          this.cancelWait = finish;
          document.addEventListener("visibilitychange", visible);
          visible();
        });
      }
      if (this.over) return;
      setupStage = "microphone acquisition";
      const ctx = (this.ctx = new AudioContext({ latencyHint: "interactive" }));
      if (ctx.state === "suspended") await ctx.resume();
      if (this.over) return;
      this.input = new NativeInputBuffer(ctx.sampleRate * 30);
      if (this.wantsMic) this.input.press();
      if (this.accepted) this.input.accept();
      setupStage = "audio and WebRTC setup";
      const out = ctx.createMediaStreamDestination();
      const micAn = this.micAnalyser = ctx.createAnalyser();
      this.processor = ctx.createScriptProcessor(2048, 1, 1);
      this.processor.onaudioprocess = event => {
        if (this.over) return;
        if (!this.input!.push(event.inputBuffer.getChannelData(0))) { this.fail("Voice input exceeded the 30-second buffer. Release Fn and try a shorter request."); return; }
        event.outputBuffer.getChannelData(0).set(this.input!.read(event.outputBuffer.length));
      };
      this.processor.connect(out);
      await this.acquireMic();
      if (this.over) return;
      // Room tone, far below speech: the realtime voice runs on the input audio clock and goes quiet if the mic sends
      // digital silence (measured: it never spoke a result until input kept flowing).
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.002;
      const tone = ctx.createBufferSource(); tone.buffer = noise; tone.loop = true; tone.connect(out); tone.start();

      const pc = (this.pc = new RTCPeerConnection());
      pc.addTrack(out.stream.getAudioTracks()[0]!, out.stream);
      // The realtime events channel: its "session.started" is when the voice can really hear you.
      const events = pc.createDataChannel("oai-events");
      events.onmessage = ev => {
        if (this.over) return;
        try {
          const message = JSON.parse(String(ev.data));
          this.playback.event(message);
          if (message.type === "session.started") {
            this.input!.ready = true;
            this.set(this.wantsMic ? "listening" : "ready");
          }
          if (message.type === "turn.done" && message.turn?.role === "assistant") {
            this.announcementPending = false; clearTimeout(this.announcementTimer);
          }
        } catch { return; }
      };
      const voiceAn = ctx.createAnalyser();
      pc.ontrack = (ev) => {
        if (this.over) return;
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        // An <audio> element plays it (WebKit doesn't render remote WebRTC audio through Web Audio alone); the analyser only measures.
        this.remote = stream;
        this.audio?.pause();
        this.audio = new Audio(); this.audio.muted = this.playback.muted; this.audio.autoplay = true;
        if (!this.playback.muted) { this.audio.srcObject = stream; void this.audio.play().catch(() => this.fail("Voice playback was blocked. Tap Talk to try again.")); }
        ctx.createMediaStreamSource(stream).connect(voiceAn);
      };
      pc.onconnectionstatechange = () => {
        clearTimeout(this.disconnectTimer);
        if (this.over) return;
        if (pc.connectionState === "failed") this.fail("The call dropped. Check your connection and try again.");
        else if (pc.connectionState === "disconnected") this.disconnectTimer = setTimeout(() => {
          if (pc.connectionState === "disconnected") this.fail("The voice connection was lost. Your microphone is off. Try again when your connection returns.");
        }, 5000);
      };
      await pc.setLocalDescription(await pc.createOffer());
      if (this.over) return;
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const finish = () => { clearTimeout(timer); pc.onicegatheringstatechange = null; this.cancelWait = undefined; resolve(); };
        const timer = setTimeout(finish, 1200);
        this.cancelWait = finish; pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") finish(); };
      });

      if (this.over) return;
      const ws = (this.ws = new WebSocket(this.o.wsUrl ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live`));
      setupStage = "gateway connection";
      ws.onmessage = (e) => { try { void this.received(JSON.parse(String(e.data))).catch(() => this.fail("The call response was invalid.")); } catch { this.fail("The call response was invalid."); } };
      ws.onclose = () => { if (!this.over) this.fail("The live connection closed."); };
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: string) => { clearTimeout(timer); this.cancelWait = undefined; if (error) reject(new Error(error)); else resolve(); };
        const timer = setTimeout(() => finish("Couldn't connect to ShuaCrew in time."), 20_000);
        this.cancelWait = () => finish("Call ended while connecting.");
        ws.onopen = () => finish(); ws.onerror = () => finish("Couldn't reach ShuaCrew.");
        ws.onclose = () => { finish("The live connection closed."); if (!this.over) this.fail("The live connection closed."); };
      });
      if (this.over) return;
      setupStage = "Live service negotiation";
      ws.send(JSON.stringify({ type: "start", sdp: pc.localDescription!.sdp, voice: this.o.voice, vocab: this.o.vocab }));

      const mb = new Float32Array(micAn.fftSize);
      const vb = new Float32Array(voiceAn.fftSize);
      let loud = 0;
      this.timer = setInterval(() => {
        const mic = this.wantsMic && this.micSource ? level(micAn, mb) : 0, voice = this.playback.muted ? 0 : level(voiceAn, vb);
        this.o.onEvent({ type: "levels", mic, voice });
        if (this.state === "connecting" || this.over) return;
        // Speaking while its voice is audible (with a short hang so word gaps don't flicker), else working or listening.
        loud = voice > 0.012 ? 6 : Math.max(0, loud - 1);
        if (this.playback.muted) loud = 0;
        this.speaking = loud > 0;
        if (this.speaking) {
          this.heardAssistant = true;
          if (this.pendingCaption) { this.o.onEvent(this.pendingCaption); this.pendingCaption = undefined; }
          if (this.captionText && this.captionText !== this.publishedText) { this.publishedText = this.captionText; this.o.onEvent({ type: "playback", text: this.captionText }); }
        }
        this.set(this.speaking ? "speaking" : this.working ? "working" : this.wantsMic ? "listening" : "ready");
      }, 50);
    } catch (e) {
      const name = (e as Error).name;
      this.fail(name === "NotAllowedError" ? "Microphone access is off for ShuaCrew." : name === "NotFoundError" ? "No microphone found." : name === "NotSupportedError" || !navigator.mediaDevices ? "This window can't use the microphone." : (e as Error).message);
    }
  }

  private async received(m: { type: string; [k: string]: unknown }) {
    if (this.over) return;
    if (m.type === "answer") {
      await this.pc?.setRemoteDescription({ type: "answer", sdp: String(m.sdp) });
      // "Listening" waits for session.started: speech before it is lost (measured: one start took 12 s). Never stuck, though.
      this.readyTimer = setTimeout(() => { if (this.state === "connecting") this.fail("The voice did not become ready. Please retry."); }, 15_000);
    } else if (m.type === "delta") {
      const role = m.role === "assistant" ? "assistant" : "user";
      this.captions[role] += String(m.text);
      if (role === "assistant") {
        if (this.playback.muted) return;
        this.captionText = this.captions[role].trim();
        this.pendingCaption = { type: "caption", role, text: this.captionText, final: false };
        return;
      } else if (String(m.text).trim()) { this.captionText = ""; this.heardAssistant = false; this.pendingCaption = undefined; this.publishedText = ""; this.o.onEvent({ type: "playback", text: "" }); }
      this.o.onEvent({ type: "caption", role, text: this.captions[role].trim(), final: false });
    } else if (m.type === "transcript") {
      const role = m.role === "assistant" ? "assistant" : "user";
      this.captions[role] = "";
      if (role === "assistant") {
        if (this.playback.muted) return;
        this.captionText = String(m.text);
        this.pendingCaption = { type: "caption", role, text: this.captionText, final: true };
        if (this.heardAssistant) { this.o.onEvent(this.pendingCaption); this.pendingCaption = undefined; }
        return;
      } else if (String(m.text).trim()) { this.captionText = ""; this.heardAssistant = false; this.pendingCaption = undefined; this.publishedText = ""; this.o.onEvent({ type: "playback", text: "" }); }
      this.o.onEvent({ type: "caption", role, text: String(m.text), final: true });
    } else if (m.type === "working") this.working = m.on === true;
    else if (m.type === "step") this.o.onEvent({ type: "step", text: String(m.text) });
    else if (m.type === "result") this.o.onEvent({ type: "result", text: String(m.text), final: m.final === true });
    else if (m.type === "approval") this.o.onEvent({ type: "approval", id: String(m.id), kind: m.kind === "files" ? "files" : "command", text: String(m.text), why: m.why ? String(m.why) : undefined });
    else if (m.type === "usage") this.o.onEvent({ type: "usage", percent: Number(m.percent) });
    else if (m.type === "correction") this.o.onEvent({ type: "correction", said: String(m.said), result: String(m.result) });
    else if (m.type === "do" && Array.isArray(m.actions)) this.o.onEvent({ type: "do", id: String(m.id), actions: m.actions });
    else if (m.type === "task" && typeof m.request === "string") this.o.onEvent({ type: "task", id: String(m.id), request: m.request });
    else if (m.type === "cancel" && typeof m.id === "string") this.o.onEvent({ type: "cancel", id: m.id });
    else if (m.type === "error") this.fail(String(m.message));
    else if (m.type === "closed") this.end();
  }


  /** What Spark's actions did, back to the hands. */
  /** Have the voice say this (a question Spark needs answered mid-task). */
  speak(text: string) { return !this.playback.muted && this.send({ type: "say", text }); }
  announce(text: string) {
    if (this.over || this.state === "connecting" || this.announcementPending || this.speaking || this.captions.user || this.captions.assistant || !this.speak(text)) return false;
    this.announcementPending = true;
    this.announcementTimer = setTimeout(() => { if (this.announcementPending) this.fail("The voice did not acknowledge an announcement. It remains in the activity feed."); }, 20000);
    return true;
  }
  done(id: string, text: string) { return this.send({ type: "done", id, text }); }
  approve(id: string, allow: boolean) { return this.send({ type: "approve", id, allow }); }
  /** Typed text into the call (a link, a name that's hard to say). */
  sendText(text: string) { return this.send({ type: "text", text }); }
  recordText(text: string) { return this.send({ type: "typed", text }); }
  recordResult(text: string) { return this.send({ type: "typedResult", text }); }

  private send(message: Record<string, unknown>) {
    if (this.over || this.ws?.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  private fail(detail: string) { if (this.over) return; this.set("error", detail); this.teardown(); }
  end() { if (this.over) return; this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "stop" })); this.set("ended"); this.teardown(); }
  private teardown() {
    this.over = true;
    this.closeMic(); this.input?.cancel(); this.processor?.disconnect();
    clearInterval(this.timer);
    clearTimeout(this.readyTimer);
    clearTimeout(this.setupTimer);
    clearTimeout(this.disconnectTimer);
    clearTimeout(this.announcementTimer);
    this.cancelWait?.(); this.cancelWait = undefined;
    this.pc?.close(); this.ws?.close();
    this.mic?.getTracks().forEach((t) => { if (!this.o.mic) t.stop(); });
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
    void this.ctx?.close().catch(() => undefined);
  }
}
