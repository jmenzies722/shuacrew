import type { CrewMember } from "@shuacrew/core";
import type { MemberInput } from "./crew.js";

const PALETTE = ["#f5a524", "#3ecf8e", "#7aa2f7", "#e879f9", "#56d4dd", "#f87171", "#a3e635", "#fb923c"];
export interface NewMember { name: string; role?: string; persona?: string; runtime?: string; model?: string }

/**
 * Add a brand-new crew member from the chat or from an agent. Never overwrites an existing member,
 * never grants delegation (you opt a member in yourself in Crew), and only uses agents you have.
 */
export function createCrewMember(crew: { get(id: string): CrewMember | undefined; set(m: MemberInput): CrewMember; list(): CrewMember[] }, input: NewMember, runtimes: string[]): CrewMember {
  const name = (input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 40) throw new Error("Give the new member a name (up to 40 characters).");
  const id = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!id) throw new Error("Use letters or numbers in the name.");
  if (crew.get(id)) throw new Error(`There's already a crew member called ${crew.get(id)!.name}. Pick another name — existing members are only changed in Crew.`);
  const runtime = input.runtime?.trim();
  if (runtime && !runtimes.includes(runtime)) throw new Error(`No agent called ${runtime}. Available: ${runtimes.join(", ")}.`);
  const role = (input.role ?? "").trim().slice(0, 60) || "Crew member";
  const persona = (input.persona ?? "").trim().slice(0, 4000) || `You are ${name}, the crew's ${role.toLowerCase()}. Do real, verified work and say plainly what you did and didn't check.`;
  return crew.set({ id, name, role, persona, delegatable: false, runtime: runtime || undefined, model: input.model?.trim() || undefined, color: PALETTE[crew.list().length % PALETTE.length]!, emoji: "", triggers: [] });
}
