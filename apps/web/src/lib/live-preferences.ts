export function classicCaptureWanted(input: { engine: "live" | "classic"; conversation: boolean; wake: boolean; voice: boolean; callActive: boolean; switchBlocked: boolean }) {
  return !input.callActive && !input.switchBlocked && ((input.engine === "classic" && input.conversation) || input.wake || input.voice);
}
