import { expect, it } from "vitest";
import { autopilotRequest, autopilotTarget, autopilotResult } from "./voice-autopilot";
const runs = { a: { id:"a",title:"Parser",status:"running",labels:[] }, b:{id:"b",title:"Login",status:"awaiting_approval",labels:[]} };
it("only enables autopilot on a direct whole-utterance request",()=>{
 expect(autopilotRequest("Go autopilot mode!")).toEqual({mode:"auto"});
 expect(autopilotRequest("Turn off autopilot")).toEqual({mode:"ask"});
 expect(autopilotRequest("Enable autopilot for Parser")).toEqual({mode:"auto",target:"Parser"});
 expect(autopilotRequest("Explain autopilot mode")).toBeNull();
 expect(autopilotRequest("Tell Eli to go autopilot mode")).toBeNull();
});
it("uses explicit or discussed sessions, and refuses ambiguous, archived, and crew-room targets",()=>{
 expect(autopilotTarget(runs,{target:"Parser"})).toBe("a");
 expect(autopilotTarget(runs,{focused:"b"})).toBe("b");
 expect(autopilotTarget(runs,{})).toBeNull();
 expect(autopilotTarget({a:runs.a},{})).toBe("a");
 expect(autopilotTarget({a:{...runs.a,archived:true}},{})).toBeNull();
 expect(autopilotTarget({a:{...runs.a,labels:["crew-room"]}},{})).toBeNull();
 expect(autopilotTarget(runs,{target:"missing",focused:"a"})).toBeNull();
});
it("notifies on completion, failure, cancellation or review without claiming a merge",()=>{
 expect(autopilotResult("Parser","running")).toBeNull();
 expect(autopilotResult("Parser","done")).toContain("finished");
 expect(autopilotResult("Parser","reviewing")).toContain("ready for your review");
 expect(autopilotResult("Parser","failed")).toContain("needs your attention");
 expect(autopilotResult("Parser","cancelled")).toContain("canceled");
});
