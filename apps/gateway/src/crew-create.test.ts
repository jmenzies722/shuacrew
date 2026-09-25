import { expect, it } from "vitest";
import { EventStore } from "./store.js";
import { Crew } from "./crew.js";
import { createCrewMember } from "./crew-create.js";

it("adds a new member without delegation, and refuses to overwrite or invent agents", () => {
  const store = new EventStore(":memory:"), crew = new Crew(store);
  const m = createCrewMember(crew, { name: "Nova", role: "Security reviewer", persona: "Check diffs for secrets." }, ["claude", "codex"]);
  expect(m).toMatchObject({ id: "nova", name: "Nova", role: "Security reviewer", delegatable: false });
  expect(() => createCrewMember(crew, { name: "nova" }, ["claude"])).toThrow(/already a crew member/);
  expect(crew.get("nova")!.persona).toBe("Check diffs for secrets.");
  expect(() => createCrewMember(crew, { name: "Ghost", runtime: "gpt-99" }, ["claude"])).toThrow(/No agent called/);
  expect(createCrewMember(crew, { name: "Quill" }, ["claude"]).persona).toContain("Quill");
  crew.stop(); store.close();
});
