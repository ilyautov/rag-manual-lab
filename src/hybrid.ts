/** Гибридный поиск: слияние ранжированных списков. */
import type { Hit } from './bm25.ts';

/** Reciprocal Rank Fusion: score(d) = Σ 1 / (k + rank), ранги с единицы. */
export function rrf(lists: Hit[][], k = 60): Hit[] {
  const s = new Map<string, number>();
  for (const list of lists) list.forEach((h, i) => s.set(h.id, (s.get(h.id) ?? 0) + 1 / (k + i + 1)));
  return [...s].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function minMax(list: Hit[]): Hit[] {
  if (!list.length) return [];
  const hi = Math.max(...list.map((h) => h.score));
  const lo = Math.min(...list.map((h) => h.score));
  return list.map((h) => ({ id: h.id, score: hi === lo ? 1 : (h.score - lo) / (hi - lo) }));
}

/** Взвешенная сумма после min-max: alpha · лексика + (1 − alpha) · вектор. */
export function minMaxFusion(lexical: Hit[], vector: Hit[], alpha = 0.5): Hit[] {
  const s = new Map<string, number>();
  for (const h of minMax(lexical)) s.set(h.id, (s.get(h.id) ?? 0) + alpha * h.score);
  for (const h of minMax(vector)) s.set(h.id, (s.get(h.id) ?? 0) + (1 - alpha) * h.score);
  return [...s].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Наивная сумма сырых баллов: так делать не надо, функция нужна для сравнения. */
export function rawSum(lexical: Hit[], vector: Hit[]): Hit[] {
  const s = new Map<string, number>();
  for (const h of [...lexical, ...vector]) s.set(h.id, (s.get(h.id) ?? 0) + h.score);
  return [...s].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
