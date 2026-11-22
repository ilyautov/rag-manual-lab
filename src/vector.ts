/** Векторный поиск полным перебором: для 50 фрагментов приближённый индекс не нужен. */
import { embed, dot } from './embed.ts';
import type { Hit } from './bm25.ts';

export interface VectorIndex { ids: string[]; vecs: Float64Array[] }

export function buildVectorIndex(items: { id: string; text: string }[]): VectorIndex {
  return { ids: items.map((i) => i.id), vecs: items.map((i) => embed(i.text)) };
}

export function vectorSearch(index: VectorIndex, query: string, k = 10): Hit[] {
  const q = embed(query);
  return index.ids.map((id, i) => ({ id, score: dot(q, index.vecs[i]) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}
