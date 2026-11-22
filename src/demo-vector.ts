/** npm run vector : косинус игрушечных эмбеддингов. */
import { embeddingExamples } from './experiments.ts';

const e = embeddingExamples();
console.log(`Размерность: ${e.dim}. Это хеш символьных 3-грамм, не нейросеть.`);
for (const p of e.pairs) console.log(`${p.cos.toFixed(2)}  «${p.a}» ~ «${p.b}»`);
