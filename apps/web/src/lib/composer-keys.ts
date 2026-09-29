import type { Appearance } from "./appearance";

export function shouldSend(event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "isComposing"> & { keyCode?: number }, shortcut: Appearance["sendShortcut"]): boolean {
  if (shortcut === "button-only") return false;
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.isComposing || event.keyCode === 229) return false;
  return shortcut === "enter" || event.metaKey || event.ctrlKey;
}
