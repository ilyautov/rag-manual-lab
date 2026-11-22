/** npm run chunk : размер фрагмента против полноты и объёма контекста. */
import { chunkSizeExperiment } from './experiments.ts';

const ch = chunkSizeExperiment();
console.log('слов | фрагментов | факт в top-3 | токенов в top-3 | с перекрытием 25%');
ch.sizes.forEach((s, i) => console.log(`${String(s).padStart(4)} | ${String(ch.fixed[i].chunks).padStart(10)} | ${(ch.fixed[i].recall * 100).toFixed(0).padStart(11)}% | ${ch.fixed[i].tokens.toFixed(0).padStart(15)} | ${(ch.overlap[i].recall * 100).toFixed(0)}%`));
console.log(`по разделам: ${(ch.structural.recall * 100).toFixed(0)}%, ${ch.structural.tokens.toFixed(0)} токенов, ${ch.structural.chunks} фрагментов`);
