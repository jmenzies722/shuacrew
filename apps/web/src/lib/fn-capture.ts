type Signal = "down" | "hold" | "release" | "tap" | "cancel";
type Microphone = { mode: "auto" | "hold"; warm(): unknown; press(): unknown; release(): void; cool(): void };

export function fnCapture(signal: Signal, mic: Microphone, callActive: boolean) {
  if (callActive) return;
  if (signal === "hold") mic.mode = "hold";
  // A tap or modifier chord must not open the microphone.
  if (signal === "down") return;
  if (signal === "hold") void mic.press();
  else if (signal === "release") mic.release();
  else mic.cool();
}
