// The recall eval, printed: which lessons each ask would be given, against what a person would pick.
import { runRecallEval } from "../packages/memory/src/index.js";

const r = runRecallEval();
for (const c of r.cases) {
  const ok = c.got.join() === c.want.join();
  console.log(`${ok ? "✓" : "✗"} ${c.ask}${c.project ? `  [${c.project}]` : ""}${ok ? "" : `\n    want ${JSON.stringify(c.want)}  got ${JSON.stringify(c.got)}`}`);
}
console.log(`\nprecision ${(r.precision * 100).toFixed(0)}% · recall ${(r.recall * 100).toFixed(0)}% · exact ${(r.exact * 100).toFixed(0)}%`);
