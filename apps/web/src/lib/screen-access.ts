import { useSyncExternalStore } from "react";

export const SEE = "shuacrew.buddy.see";
export const readSee = () => { try { return localStorage.getItem(SEE) !== "0"; } catch { return true; } };
export const screenAllowed = (eye: boolean, watching: boolean) => eye || watching;
export function saveSee(on: boolean) {
  try { localStorage.setItem(SEE, on ? "1" : "0"); } catch { return; }
  window.dispatchEvent(new Event("shuacrew:screen-choice"));
}
export function subscribeScreenAccess(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("shuacrew:screen-choice", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("shuacrew:screen-choice", listener);
  };
}
export const useScreenAccess = () => useSyncExternalStore(subscribeScreenAccess, readSee, () => false);
