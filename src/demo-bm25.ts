/** npm run bm25 : BM25 и TF-IDF на трёх документах, как в главе 4. */
import { bm25ByHand, MINI, MINI_QUERY } from './experiments.ts';

const b = bm25ByHand();
console.log(`Запрос: «${MINI_QUERY}» → термы ${b.terms.join(', ')}`);
MINI.forEach((d) => console.log(`${d.id}: ${d.text}`));
console.log(`N = ${b.N}, avgdl = ${b.avgdl.toFixed(2)}`);
for (const w of b.terms) console.log(`  ${w}: df = ${b.df[w]}, idf = ${b.idf[w].toFixed(3)}`);
for (const r of b.rows) console.log(`  ${r.id} (длина ${r.len}):`, Object.entries(r.parts).map(([w, v]) => `${w} ${(v as number).toFixed(3)}`).join(', '));
console.log('BM25:', b.bm25.map((h) => `${h.id} ${h.score.toFixed(3)}`).join(', '));
console.log('TF-IDF:', b.tfidf.map((h) => `${h.id} ${h.score.toFixed(3)}`).join(', '));
console.log('k1 →', b.k1Sweep.map((x) => `${x.k1}: ${x.tovarB.toFixed(3)}`).join(', '));
