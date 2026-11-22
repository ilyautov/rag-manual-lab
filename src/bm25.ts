/** Лексический поиск: TF-IDF и BM25 по термам из normalize.ts. */
import { terms } from './normalize.ts';

export interface Hit { id: string; score: number }
export interface Bm25Index {
  N: number;
  avgdl: number;
  df: Map<string, number>;
  docs: { id: string; tf: Map<string, number>; len: number }[];
}

export function buildIndex(items: { id: string; text: string }[]): Bm25Index {
  const df = new Map<string, number>();
  const docs = items.map(({ id, text }) => {
    const t = terms(text);
    const tf = new Map<string, number>();
    for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1);
    for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    return { id, tf, len: t.length };
  });
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { N: docs.length, avgdl, df, docs };
}

/** IDF в варианте Lucene: всегда положительный, редкие слова весят больше. */
export function idf(index: Bm25Index, term: string): number {
  const n = index.df.get(term) ?? 0;
  return Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
}

export function bm25Term(tf: number, len: number, avgdl: number, idfValue: number, k1 = 1.2, b = 0.75): number {
  return idfValue * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len / avgdl));
}

export function bm25Search(index: Bm25Index, query: string, k = 10, k1 = 1.2, b = 0.75): Hit[] {
  const q = [...new Set(terms(query))];
  const hits = index.docs.map((d) => {
    let score = 0;
    for (const w of q) {
      const tf = d.tf.get(w) ?? 0;
      if (tf) score += bm25Term(tf, d.len, index.avgdl, idf(index, w), k1, b);
    }
    return { id: d.id, score };
  });
  return hits.filter((h) => h.score > 0).sort((a, b2) => b2.score - a.score || a.id.localeCompare(b2.id)).slice(0, k);
}

/** Классический TF-IDF для сравнения: tf · ln(N / df). */
export function tfidfSearch(index: Bm25Index, query: string, k = 10): Hit[] {
  const q = [...new Set(terms(query))];
  return index.docs.map((d) => {
    let score = 0;
    for (const w of q) {
      const n = index.df.get(w) ?? 0;
      if (n) score += (d.tf.get(w) ?? 0) * Math.log(index.N / n);
    }
    return { id: d.id, score };
  }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}
