import { useMemo } from "react";
import { inbox, inboxCount, type InboxItem } from "@shuacrew/core/inbox";
import { useLive } from "./live";

/**
 * The Inbox as the screens read it (core/inbox.ts). The store changes on every streamed token and `inbox()` builds
 * new objects each time, so both hooks select a primitive (a number, a JSON string): a screen re-renders only when
 * what is waiting on you actually changes.
 */
export const useInboxCount = () => useLive((s) => inboxCount(inbox(s.crew)));
export function useInbox(): InboxItem[] {
  const json = useLive((s) => JSON.stringify(inbox(s.crew)));
  return useMemo(() => JSON.parse(json) as InboxItem[], [json]);
}
