import { lazy, Suspense } from "react";

const TerminalDrawer = lazy(() => import("../components/TerminalDrawer"));

/** The terminal as a place of its own: your shells, in tabs, with the crew one line away. */
export function TerminalPage() {
  return (
    <div className="h-full p-2 pt-0">
      <div className="h-full overflow-hidden rounded-[14px] border border-line">
        <Suspense fallback={<div className="grid h-full place-items-center bg-[#0a0c0f] text-[12px] text-[#7b8494]">Starting terminal…</div>}>
          <TerminalDrawer scope={{}} onClose={() => undefined} full />
        </Suspense>
      </div>
    </div>
  );
}
