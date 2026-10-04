const subscribers = new Set<() => void>();
let level = 0;
export const getMicLevel = () => level;
export function setMicLevel(value: number) {
  const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  if (next === level) return;
  level = next;
  subscribers.forEach(listener => listener());
}
export function subscribeMicLevel(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
