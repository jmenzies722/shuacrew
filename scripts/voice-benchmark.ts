/** Run with optional real recordings: each case may have audio: "relative/file.wav". Never executes commands. */
import {readFile,writeFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {companionControl} from "../apps/web/src/lib/companion-reliability.js";
import {benchmarkSummary} from "../apps/web/src/lib/voice-benchmark.js";
const manifest=resolve(process.argv[2]??"tests/voice/commands.json");
const cases=JSON.parse(await readFile(manifest,"utf8")) as Array<{name:string;expected:string;control:string|null;audio?:string}>;
const rows=[];let routingFailures=0,audioCases=0;
for(const c of cases){
 const start=performance.now();let actual=c.expected;
 if(c.audio){audioCases++;const bytes=await readFile(resolve(dirname(manifest),c.audio));const r=await fetch(`http://127.0.0.1:7420/api/transcribe?voice=1&name=${encodeURIComponent(c.audio)}`,{method:"POST",headers:{"X-ShuaCrew":"1","Content-Type":"application/octet-stream"},body:bytes,signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`${c.name}: transcription HTTP ${r.status}`);actual=(await r.json() as {text:string}).text;}
 const control=companionControl(actual);if(control!==c.control)routingFailures++;
 rows.push({name:c.name,expected:c.expected,actual,ms:performance.now()-start,control});
}
const report={mode:audioCases?"recorded-audio-and-routing":"text-routing-only",audioCases,routingFailures,...benchmarkSummary(rows)};
if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(routingFailures)process.exitCode=1;
