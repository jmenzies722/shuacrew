import {expect,it} from "vitest";
import {scoreTranscript,benchmarkSummary} from "./voice-benchmark";
it("scores corrections, near-names, silence and dangerous control substitutions",()=>{
 expect(scoreTranscript("Tell Eli to add tests","Tell Ellie to add tests").wordErrors).toBe(1);
 expect(scoreTranscript("stop talking","stop")).toMatchObject({expectedControl:"silence",actualControl:"cancel"});
 expect(scoreTranscript("","open chat").falseActivation).toBe(true);
 expect(scoreTranscript("No, actually only list tests.","no actually only list tests").exact).toBe(true);
 expect(benchmarkSummary([]).p95Ms).toBeNull();
});
