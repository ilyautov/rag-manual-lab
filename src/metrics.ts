/** Метрики поиска по ранжированному списку документов. */
export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (!relevant.size) return 0;
  return ranked.slice(0, k).filter((d) => relevant.has(d)).length / relevant.size;
}

export function precisionAtK(ranked: string[], relevant: Set<string>, k: number): number {
  return ranked.slice(0, k).filter((d) => relevant.has(d)).length / k;
}

export function reciprocalRank(ranked: string[], relevant: Set<string>): number {
  const i = ranked.findIndex((d) => relevant.has(d));
  return i < 0 ? 0 : 1 / (i + 1);
}

/** DCG = Σ gain_i / log2(i + 1), позиции с единицы; nDCG = DCG / идеальный DCG. */
export function dcg(gains: number[]): number {
  return gains.reduce((s, g, i) => s + g / Math.log2(i + 2), 0);
}

export function ndcgAtK(ranked: string[], grades: Record<string, number>, k: number): number {
  const gains = ranked.slice(0, k).map((d) => grades[d] ?? 0);
  const ideal = Object.values(grades).sort((a, b) => b - a).slice(0, k);
  const idcg = dcg(ideal);
  return idcg ? dcg(gains) / idcg : 0;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
