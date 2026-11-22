/** npm run eval : метрики поиска и bootstrap-интервалы. */
import { retrievalComparison, bootstrapComparisons } from './experiments.ts';

const c = retrievalComparison();
for (const [k, v] of Object.entries(c)) console.log(`${k.padEnd(10)} R@1 ${v.all.r1.toFixed(2)} R@3 ${v.all.r3.toFixed(2)} P@3 ${v.all.p3.toFixed(2)} MRR ${v.all.mrr.toFixed(2)} nDCG@5 ${v.all.ndcg5.toFixed(2)}`);
const b = bootstrapComparisons();
for (const [k, r] of Object.entries(b)) if (typeof r === 'object') console.log(`${k}: разница ${r.diff.toFixed(3)}, 95% [${r.lo.toFixed(3)}; ${r.hi.toFixed(3)}]`);
