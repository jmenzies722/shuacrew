export function notchPreviewWanted({ active, tucked, expanded }: { active: boolean; tucked: boolean; expanded: boolean }) {
  return active && !tucked && !expanded;
}

export function notchReplyText(stream: string, completed: string, _voiceEnabled: boolean, _playbackPending: boolean) {
  return stream || completed;
}
