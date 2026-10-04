export function notchPreviewWanted({ active, tucked, expanded }: { active: boolean; tucked: boolean; expanded: boolean }) {
  return active && !tucked && !expanded;
}

export function notchReplyText(stream: string, completed: string, voiceEnabled: boolean, playbackPending: boolean) {
  if (voiceEnabled && (stream || playbackPending)) return "";
  return stream || completed;
}
