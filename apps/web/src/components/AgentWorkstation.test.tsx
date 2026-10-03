import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentWorkstation } from "./AgentWorkstation";

it("only gives working agents an animated typing pose", () => {
  expect(renderToStaticMarkup(<AgentWorkstation state="working" identity="agent:codex" />)).toContain("hq-pixel-typing");
  for (const state of ["idle", "waiting", "queued", "failed", "recent"] as const) {
    expect(renderToStaticMarkup(<AgentWorkstation state={state} identity="agent:codex" />)).not.toContain("hq-pixel-typing");
  }
  expect(renderToStaticMarkup(<AgentWorkstation state="working" identity="agent:codex" live={false} />)).not.toContain("hq-pixel-typing");
});

it("keeps an agent's appearance stable across work states and distinguishes agents", () => {
  const appearance = (identity: string, state: "idle" | "working") => renderToStaticMarkup(<AgentWorkstation state={state} identity={identity} />).match(/data-sprite="(\d+)"/)?.[1];
  expect(appearance("agent:codex", "idle")).toBeDefined();
  expect(appearance("agent:codex", "idle")).toBe(appearance("agent:codex", "working"));
  expect(appearance("agent:codex", "idle")).not.toBe(appearance("agent:claude", "idle"));
});
