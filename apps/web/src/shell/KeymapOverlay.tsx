import { Kbd } from "@shuacrew/ui";
import { AnimatePresence, motion } from "motion/react";
import { useLive } from "../lib/live";
import { NAV } from "./Shell";

const KEYS: Array<[string, string[]]> = [
  ["Command palette — everything", ["⌘", "K"]],
  ["Launch a run", ["⌘", "N"]],
  ["Launch from the sheet", ["⌘", "↵"]],
  ["Approve the newest approval", ["A"]],
  ["Deny it", ["D"]],
  ["Explain why it was asked", ["E"]],
  ["Send a follow-up in a run", ["⌘", "↵"]],
  ["This map", ["?"]],
];

export function KeymapOverlay() {
  const open = useLive((s) => s.keymapOpen);
  const setOpen = useLive((s) => s.setKeymap);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="grid w-[640px] max-w-[94vw] grid-cols-2 gap-x-8 gap-y-2 rounded-[var(--radius-l)] border border-line-strong p-6 backdrop-blur-xl"
            style={{ background: "var(--glass)" }}
          >
            <h2 className="col-span-2 mb-2 text-[15px] font-semibold">Keyboard</h2>
            {KEYS.map(([label, keys]) => (
              <Row key={label} label={label} keys={keys} />
            ))}
            <h3 className="col-span-2 mt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">Go to</h3>
            {NAV.map((n) => (
              <Row key={n.to} label={n.label} keys={["g", n.key]} />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] text-fg-2">
      <span>{label}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}
