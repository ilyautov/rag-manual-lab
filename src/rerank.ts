/**
 * Второй этап поиска. Настоящий cross-encoder читает вопрос и фрагмент вместе одной моделью;
 * здесь вместо модели детерминированный скорер, который тоже смотрит на пару целиком:
 * нечёткое покрытие слов вопроса с весом IDF, совпадение с заголовком и соседние пары слов.
 */
import { terms } from './normalize.ts';
import { idf, type Bm25Index } from './bm25.ts';
import { dot } from './embed.ts';
import { fuzzyCoverage } from './match.ts';

export function rerankScore(index: Bm25Index, query: string, text: string, title: string): number {
  const qList = terms(query);
  const q = [...new Set(qList)];
  if (!q.length) return 0;
  const cList = terms(text);
  const t = new Set(terms(title));
  const wsum = q.reduce((s, w) => s + idf(index, w), 0);
  const cov = fuzzyCoverage(index, query, text);
  const tcov = q.reduce((s, w) => s + (t.has(w) ? idf(index, w) : 0), 0) / wsum;
  const pairs = new Set(cList.slice(1).map((w, i) => `${cList[i]} ${w}`));
  const qPairs = qList.slice(1).map((w, i) => `${qList[i]} ${w}`);
  const bigram = qPairs.length ? qPairs.filter((p) => pairs.has(p)).length / qPairs.length : 0;
  return cov + 0.3 * tcov + 0.2 * bigram;
}

export interface Candidate { id: string; rel: number; vec: Float64Array }

/** Maximal Marginal Relevance: λ · релевантность − (1 − λ) · похожесть на уже выбранное. */
export function mmr(cands: Candidate[], k: number, lambda = 0.7): string[] {
  if (!cands.length) return [];
  const hi = Math.max(...cands.map((c) => c.rel));
  const lo = Math.min(...cands.map((c) => c.rel));
  const rel = (c: Candidate) => (hi === lo ? 1 : (c.rel - lo) / (hi - lo));
  const left = [...cands];
  const chosen: Candidate[] = [];
  while (chosen.length < k && left.length) {
    let best = 0, bestScore = -Infinity;
    left.forEach((c, i) => {
      const sim = chosen.length ? Math.max(...chosen.map((s) => dot(c.vec, s.vec))) : 0;
      const score = lambda * rel(c) - (1 - lambda) * sim;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    chosen.push(left.splice(best, 1)[0]);
  }
  return chosen.map((c) => c.id);
}
