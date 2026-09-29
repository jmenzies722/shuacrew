export interface VoiceSessionState {
  capture: "off" | "listening" | "muted";
  turn: "idle" | "waiting" | "cancelling" | "uncertain" | "approval";
  playback: "idle" | "buffering" | "speaking";
  generation: number;
  pendingTranscript: string;
}
export type VoiceEvent = { type: "start" | "userSpeech" | "cancellationSettled" | "mute" | "end" | "approval" | "waiting" | "buffering" | "playbackEnded" } | { type: "cancellationUnknown"; transcript?: string } | { type: "audioChunk"; generation: number };
export const initialVoiceState = (): VoiceSessionState => ({ capture: "off", turn: "idle", playback: "idle", generation: 0, pendingTranscript: "" });
export function reduceVoice(state: VoiceSessionState, event: VoiceEvent): VoiceSessionState {
  switch (event.type) {
    case "start": return ["uncertain", "cancelling", "approval"].includes(state.turn) ? state : { ...state, capture: "listening", generation: state.generation + 1 };
    case "userSpeech": return { ...state, playback: "idle", turn: state.turn === "waiting" ? "cancelling" : state.turn, generation: state.generation + 1 };
    case "cancellationUnknown": return { ...state, turn: "uncertain", playback: "idle", pendingTranscript: (event.transcript ?? state.pendingTranscript).slice(0, 8_000) };
    case "cancellationSettled": return { ...state, turn: "idle" };
    case "mute": return { ...state, capture: "muted", playback: "idle", generation: state.generation + 1 };
    case "end": return { ...state, capture: "off", playback: "idle", generation: state.generation + 1 };
    case "approval": return { ...state, capture: "off", turn: "approval", playback: "idle", generation: state.generation + 1 };
    case "waiting": return { ...state, turn: "waiting", pendingTranscript: "" };
    case "buffering": return { ...state, playback: "buffering" };
    case "playbackEnded": return { ...state, playback: "idle" };
    case "audioChunk": return event.generation === state.generation && state.capture !== "off" && !["approval", "uncertain", "cancelling"].includes(state.turn) ? { ...state, playback: "speaking" } : state;
  }
}
