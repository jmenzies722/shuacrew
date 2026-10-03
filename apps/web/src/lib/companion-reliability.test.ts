import { expect, it } from "vitest";
import { companionControl, focusContext, actionTimingSummary } from "./companion-reliability";
it("distinguishes speech-only interruption, task cancellation and unrelated crew/media commands", () => {
  expect(companionControl("Please stop talking!")).toBe("silence");
  expect(companionControl("cancel this request")).toBe("cancel");
  expect(companionControl("say that again")).toBe("repeat");
  expect(companionControl("open our chat")).toBe("open-chat");
  expect(companionControl("show me again")).toBe("show-again");
  for (const q of ["stop the parser crew session", "repeat this song", "tell Eli to stop talking", "stop talking and open Settings"]) expect(companionControl(q)).toBeNull();
});
it("does not carry a missing or archived session into pronoun resolution", () => {
  expect(focusContext({ run: "gone" }, {})).toContain("No current explicitly selected");
  expect(focusContext({ run: "a" }, { a: { title: "Old", archived: true } })).not.toContain("— Old");
  expect(focusContext({ run: "a", target: "Save" }, { a: { title: "Parser" } })).toContain("a — Parser");
});
it("reports observed dispatch latency and excludes incomplete samples", () => {
  expect(actionTimingSummary([{ request:"a",route:"direct",started:10,dispatched:30,completed:40,ok:true },{request:"b",route:"model",started:0}])).toEqual({samples:1,medianDispatchMs:20,p95DispatchMs:20,completed:1,failed:0});
});

it("preserves spoken correction order despite reversed recognition completion", async()=>{
 const {orderedTranscript,completionClaim}=await import("./companion-reliability");
 expect(orderedTranscript([{order:2,text:"Actually only list them"},{order:1,text:"Add tests"},{order:3,text:"Actually only list them"}])).toBe("Add tests Actually only list them");
 expect(completionClaim("Opened Safari.")).toBe(true);
 expect(completionClaim("I'll open Safari.")).toBe(false);
 expect(completionClaim("Here is how merging works.")).toBe(false);
});
