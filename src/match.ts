/**
 * Нечёткое сопоставление слов вопроса со словами текста. Каждое слово вопроса ищет
 * самое похожее слово текста: совпадение основ даёт 1, иначе по символьным 3-граммам
 * сравниваются и сами слова, и их основы, берётся лучшее («ремонтируют» ≈ «ремонт»,
 * «возрат» ≈ «возврат», «карточку» ≈ «карту»). Одних основ мало: обрезка окончаний
 * может испортить слово с опечаткой, а одни слова расходятся из-за окончаний.
 * Так скорер смотрит на пару «вопрос, фрагмент» целиком.
 */
import { tokenize, isStop, stem } from './normalize.ts';
import { ngrams } from './embed.ts';
import { idf, type Bm25Index } from './bm25.ts';

export function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  if (/\d/.test(a) || /\d/.test(b)) return 0;
  const ga = new Set(ngrams(a));
  const gb = new Set(ngrams(b));
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  const dice = (2 * inter) / (ga.size + gb.size);
  return dice >= 0.5 ? dice : 0;
}

/** Доля слов вопроса с весом IDF, у каждого слова берётся лучшее совпадение в тексте. */
const words = (text: string) => [...new Set(tokenize(text).filter((t) => !isStop(t)))];

export function fuzzyCoverage(index: Bm25Index, query: string, text: string): number {
  const t = words(text).map((w) => ({ w, s: stem(w) }));
  // одно слово вопроса = одна основа: «возврат» и «возврата» в вопросе не считаются дважды
  const q = new Map<string, string>();
  for (const w of words(query)) if (!q.has(stem(w))) q.set(stem(w), w);
  let total = 0, got = 0;
  for (const [s, w] of q) {
    const weight = idf(index, s);
    total += weight;
    let best = 0;
    for (const x of t) {
      const sim = x.s === s ? 1 : Math.max(wordSim(w, x.w), wordSim(s, x.s));
      if (sim > best) best = sim;
      if (best === 1) break;
    }
    got += weight * best;
  }
  return total ? got / total : 0;
}
