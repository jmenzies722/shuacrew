type Signal = "down" | "hold" | "release" | "tap" | "cancel";
type Microphone = { mode: "auto" | "hold"; warm(): unknown; press(): unknown; release(): void; cool(): void };

export function fnCapture(signal: Signal, mic: Microphone, callActive: boolean) {
  if (callActive) return;
  if (signal === "down" || signal === "hold") mic.mode = "hold";
  if (signal === "down") void mic.warm();
  else if (signal === "hold") void mic.press();
  else if (signal === "release") mic.release();
  else mic.cool();
}
