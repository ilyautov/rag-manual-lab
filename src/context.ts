/** Сборка контекста: бюджет токенов и порядок фрагментов. */
import { estimateTokens } from './normalize.ts';
import type { Chunk } from './chunk.ts';

export interface Packed { chunks: Chunk[]; tokens: number; dropped: string[] }

/** Жадно берём фрагменты по убыванию релевантности, пока помещаются в бюджет. */
export function packContext(ranked: Chunk[], budget: number, maxChunks = 5): Packed {
  const chunks: Chunk[] = [];
  const dropped: string[] = [];
  let tokens = 0;
  for (const c of ranked) {
    const t = estimateTokens(c.text);
    if (chunks.length < maxChunks && tokens + t <= budget) { chunks.push(c); tokens += t; }
    else dropped.push(c.id);
  }
  return { chunks, tokens, dropped };
}

/** Порядок «по краям»: самый релевантный первым, второй последним, слабые в середине. */
export function edgesOrder<T>(ranked: T[]): T[] {
  const head: T[] = [];
  const tail: T[] = [];
  ranked.forEach((x, i) => (i % 2 === 0 ? head.push(x) : tail.unshift(x)));
  return [...head, ...tail];
}
