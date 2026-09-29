import { expect, it } from "vitest";
import { buildStage } from "./floor-graph";

const now = 1_000_000;
const member = (id: string) => ({ id, name: id.toUpperCase(), role: "r", persona: "", color: "#fff", emoji: "", triggers: [] });
const run = (id: string, extra: Record<string, unknown>) => ({ id, status: "done", updatedAt: now - 1000, labels: [], subagents: [], runtime: "claude", ...extra });

it("draws only real work: sessions from you, room delegations, waiting and idle states", () => {
  const g = buildStage({
    now,
    members: { rhea: member("rhea"), eli: member("eli"), maya: member("maya") } as never,
    runs: {
      r1: run("r1", { member: "rhea", status: "running", labels: ["crew-room"], subagents: [{ done: false }, { done: true }] }),
      r2: run("r2", { member: "eli", status: "running", parent: "r1" }),
      r3: run("r3", { status: "awaiting_approval", runtime: "codex" }),
      old: run("old", { member: "maya", status: "done", updatedAt: now - 10 * 60_000 }),
    } as never,
    rooms: { room: { coordinator: "rhea", assignments: { a1: { id: "a1", memberId: "eli", runId: "r2", status: "running", task: "Build it", updatedAt: now } } } } as never,
    approvals: { ap: { run: "r3" } },
    activity: [{ kind: "tool.called", run: "r2", at: now - 2000, body: { tool: "Edit", input: { file_path: "/x/README.md" } } }] as never,
  });
  const n = Object.fromEntries(g.nodes.map((x) => [x.id, x]));
  expect(n.rhea).toMatchObject({ state: "working", subagents: 1 });
  expect(n.eli).toMatchObject({ state: "working", tool: { name: "Edit", detail: "README.md" } });
  expect(n.maya!.state).toBe("idle"); // finished 10 minutes ago: settled
  expect(n["agent:codex"]).toMatchObject({ state: "waiting", label: "Codex" });
  expect(g.edges.map((e) => `${e.from}>${e.to}:${e.kind}:${e.live}`).sort()).toEqual(["rhea>eli:delegation:true", "you>agent:codex:session:false", "you>rhea:session:true"].sort());
});
