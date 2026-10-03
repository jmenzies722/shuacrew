import { expect, it, vi } from "vitest";
import { KeyboardDelivery, protectKeyboardDelivery } from "./keyboard-delivery";

const key = (timeStamp: number, overrides = {}) => ({ type: "keydown", timeStamp, code: "KeyO", key: "o", location: 0, repeat: false, isTrusted: true, isComposing: false, cancelable: true, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...overrides });
it("rejects a replay of the same native event, not a repeated letter", () => {
  const delivery = new KeyboardDelivery();
  expect(delivery.replayed(key(214832.125))).toBe(false);
  expect(delivery.replayed(key(214832.125))).toBe(true);
  expect(delivery.replayed(key(215056.75))).toBe(false);
});
it("preserves distinct simultaneous keys, keyup, autorepeat and composition", () => {
  const delivery = new KeyboardDelivery();
  expect(delivery.replayed(key(10))).toBe(false);
  expect(delivery.replayed(key(10, { code: "KeyB", key: "b" }))).toBe(false);
  expect(delivery.replayed(key(10, { type: "keyup" }))).toBe(false);
  expect(delivery.replayed(key(11, { repeat: true }))).toBe(false);
  expect(delivery.replayed(key(12, { isComposing: true }))).toBe(false);
  expect(delivery.replayed(key(12, { isComposing: true }))).toBe(false);
});
it("does not round timestamps or intercept synthetic events", () => {
  const delivery = new KeyboardDelivery();
  expect(delivery.replayed(key(5.01))).toBe(false);
  expect(delivery.replayed(key(5.02))).toBe(false);
  expect(delivery.replayed(key(5.01, { isTrusted: false }))).toBe(false);
  expect(delivery.replayed(key(0))).toBe(false);
  expect(delivery.replayed(key(0))).toBe(false);
});
it("cancels the replay before default insertion and shortcuts, and removes listeners", () => {
  const handlers = new Map<string, EventListener>();
  const target = { addEventListener: (type: string, handler: EventListener, capture: boolean) => { expect(capture).toBe(true); handlers.set(type, handler); }, removeEventListener: (type: string) => handlers.delete(type) } as unknown as Window;
  const stop = protectKeyboardDelivery(target);
  const original = { ...key(100), preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  handlers.get("keydown")!(original as unknown as Event);
  expect(original.preventDefault).not.toHaveBeenCalled();
  const replay = { ...key(100), preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  handlers.get("keydown")!(replay as unknown as Event);
  expect(replay.preventDefault).toHaveBeenCalledOnce();
  expect(replay.stopImmediatePropagation).toHaveBeenCalledOnce();
  stop();
  expect(handlers.size).toBe(0);
});
