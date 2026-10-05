import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@shuacrew/ui";
import { sessionRemovalCopy } from "../lib/session-removal";

/** "Delete session?" — shared by the Sessions panel and the sidebar's session rows. */
export function SessionRemovalConfirmation({ title, error, removing, allowed, onConfirm, returnFocus }: { title: string; error: string; removing: boolean; allowed: boolean; onConfirm: () => void; returnFocus?: () => void }) {
  return <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" /><Dialog.Content onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus(); } }} className="fixed left-1/2 top-1/2 z-[81] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-panel p-6 shadow-2xl">
    <Dialog.Title className="text-lg font-semibold text-fg">{sessionRemovalCopy.title}</Dialog.Title>
    <Dialog.Description className="mt-3 text-sm leading-relaxed text-fg-2">“{title}” — {sessionRemovalCopy.description}</Dialog.Description>
    {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    <div className="mt-5 flex justify-end gap-3"><Dialog.Close asChild><Button disabled={removing}>Cancel</Button></Dialog.Close><Button disabled={removing || !allowed} onClick={onConfirm}>{removing ? "Deleting…" : "Delete session"}</Button></div>
  </Dialog.Content></Dialog.Portal>;
}
