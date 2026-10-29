import { Buddy } from "../screens/Buddy";

/**
 * Shua, full size: the same conversation, brain and hands as the notch (Buddy, embedded) — so it is exactly as
 * accurate as the Shua you already use; the lean app only gives it the whole window.
 */
export function Chat() {
  return <div className="chat"><Buddy embedded full page="chat" /></div>;
}
