/** npm run hybrid : BM25, вектор, RRF и min-max на тестовом наборе. */
import { retrievalComparison, rrfByHand } from './experiments.ts';

const r = rrfByHand();
console.log(`Запрос «${r.query}»`);
console.log('  BM25:', r.lex.map((h) => `${h.id} ${h.score.toFixed(2)}`).join(', '));
console.log('  вектор:', r.vec.map((h) => `${h.id} ${h.score.toFixed(2)}`).join(', '));
console.log('  RRF:', r.fused.map((h) => `${h.id} ${h.score.toFixed(4)}`).join(', '));
const c = retrievalComparison();
console.log('\nконфигурация | Recall@3 | MRR | nDCG@5 (все вопросы) | MRR разговорные');
for (const [k, v] of Object.entries(c)) console.log(`${k.padEnd(10)} | ${v.all.r3.toFixed(2)} | ${v.all.mrr.toFixed(2)} | ${v.all.ndcg5.toFixed(2)} | ${v.colloquial.mrr.toFixed(2)}`);
