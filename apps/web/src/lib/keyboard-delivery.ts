type Delivery = Pick<KeyboardEvent, "type" | "timeStamp" | "code" | "key" | "location" | "repeat" | "isTrusted" | "isComposing" | "cancelable" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;

export class KeyboardDelivery {
  private seen = new Set<string>();
  replayed(event: Delivery): boolean {
    if (!event.isTrusted || !event.cancelable || event.isComposing || !Number.isFinite(event.timeStamp) || event.timeStamp <= 0) return false;
    const identity = JSON.stringify([event.type, event.timeStamp, event.code, event.key, event.location, event.repeat, event.ctrlKey, event.altKey, event.metaKey, event.shiftKey]);
    if (this.seen.has(identity)) return true;
    this.seen.add(identity);
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    return false;
  }
}

export function protectKeyboardDelivery(target: Window): () => void {
  const delivery = new KeyboardDelivery();
  const handle = (event: KeyboardEvent) => {
    if (!delivery.replayed(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  target.addEventListener("keydown", handle, true);
  target.addEventListener("keyup", handle, true);
  return () => { target.removeEventListener("keydown", handle, true); target.removeEventListener("keyup", handle, true); };
}
