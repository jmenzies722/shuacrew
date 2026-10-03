import {expect,it,vi} from "vitest";
import {SpeechQueue} from "./buddy-voice";
it("speech-only stop prevents late utterances from starting synthesis",()=>{
 const queue=new SpeechQueue(); queue.silenced=true;
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 try { queue.say("Done.");expect(fetch).not.toHaveBeenCalled();expect(queue.level()).toBe(0); } finally {vi.unstubAllGlobals();}
});
