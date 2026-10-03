import { companionControl } from "./companion-reliability";
const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
/** Levenshtein word errors; silence/noise has an explicit false-activation score. */
export function scoreTranscript(expected: string, actual: string) {
 const a=words(expected),b=words(actual); let row=b.map((_,i)=>i+1); row.unshift(0);
 for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]!+1,row[j+1]!+1,row[j]!+(a[i]===b[j]?0:1)));row=next;}
 return {wordErrors:row[b.length]!,referenceWords:a.length,exact:a.join(" ")===b.join(" "),falseActivation:!a.length&&!!b.length,expectedControl:companionControl(expected),actualControl:companionControl(actual)};
}
export function benchmarkSummary(rows: Array<{expected:string;actual:string;ms:number}>) {
 const scored=rows.map(r=>({...r,...scoreTranscript(r.expected,r.actual)})),latencies=rows.map(r=>r.ms).filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
 const total=scored.reduce((sum,r)=>sum+r.referenceWords,0);
 return {cases:rows.length,exact:scored.filter(r=>r.exact).length,wordErrorRate:total?scored.reduce((s,r)=>s+r.wordErrors,0)/total:null,controlMismatches:scored.filter(r=>r.expectedControl!==r.actualControl).length,falseActivations:scored.filter(r=>r.falseActivation).length,p95Ms:latencies.length?latencies[Math.ceil(latencies.length*.95)-1]:null,results:scored};
}
