/** Activity remains visible in the compact notch, independently of transcript visibility. */
export function notchActivity(input: { approval: boolean; failed: boolean; preparing: boolean; acting: boolean; working: boolean; listening: boolean; speaking: boolean; watching: boolean }): { label: string; tone: string } | null {
  if (input.approval) return { label: "Needs permission", tone: "permission" };
  if (input.failed) return { label: "Needs attention", tone: "attention" };
  if (input.preparing) return { label: "Getting ready", tone: "working" };
  if (input.acting) return { label: "Acting", tone: "working" };
  if (input.working) return { label: "Working", tone: "working" };
  if (input.listening) return { label: "Listening", tone: "listening" };
  if (input.speaking) return { label: "Speaking", tone: "speaking" };
  if (input.watching) return { label: "Watching", tone: "watching" };
  return null;
}
