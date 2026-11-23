/**
 * Ответ с опорой на источники. Модели нет: ответ собирает шаблон, который берёт
 * лучшее предложение из контекста и ставит ссылку [n]. Проверка опоры работает
 * с любым текстом, в том числе с ответом настоящей LLM.
 */
import { terms, tokenize } from './normalize.ts';
import { idf, type Bm25Index } from './bm25.ts';
import type { Chunk } from './chunk.ts';
import { fuzzyCoverage } from './match.ts';

export const REFUSAL = 'В базе нет ответа на этот вопрос. Передайте обращение старшему смены.';

export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export interface Composed { answer: string; refused: boolean; cited: number | null; best: number }

// Вопрос о количестве или сроке: общие вопросительные слова, а не фразы из тестового набора.
const QUANTITY_WORD = /(^|[^\p{L}])(скольк\p{L}*|когда|насколько|как долго|как скоро)(?![\p{L}])/iu;
const QUANTITY_NOUN = /(^|[^\p{L}])как(ой|ая|ую|ого|ом|ие|их)\s+(\p{L}+\s+)?(срок|сумм|част|дол|процент|размер|стоимост|цен|врем|числ|количеств)/iu;
export const wantsQuantity = (q: string) => QUANTITY_WORD.test(q) || QUANTITY_NOUN.test(q);

/**
 * Шаблон вместо модели. Балл предложения: покрытие вопроса самим предложением и его
 * фрагментом целиком; на вопрос о количестве предпочитаем предложение с числом.
 * Отказ, если ни один фрагмент не покрывает вопрос хотя бы на tau.
 */
export function compose(index: Bm25Index, query: string, context: Chunk[], tau = 0.4): Composed {
  const wantsNumber = wantsQuantity(query);
  let best = { s: '', n: 0, score: -1 };
  let bestChunk = 0;
  context.forEach((c, i) => {
    const chunkCov = fuzzyCoverage(index, query, c.text);
    bestChunk = Math.max(bestChunk, chunkCov);
    // отвечаем предложениями из тела раздела: заголовки и вопросы FAQ ответом не считаются
    for (const s of sentences(c.body).filter((x) => !x.endsWith('?'))) {
      const score = 0.6 * fuzzyCoverage(index, query, s) + 0.4 * chunkCov + (wantsNumber && /\d/.test(s) ? 0.15 : 0);
      if (score > best.score) best = { s, n: i + 1, score };
    }
  });
  if (bestChunk < tau || !best.s) return { answer: REFUSAL, refused: true, cited: null, best: bestChunk };
  return { answer: `${best.s.replace(/\.$/, '')} [${best.n}].`, refused: false, cited: best.n, best: bestChunk };
}

export interface ClaimCheck { claim: string; cited: number[]; share: number; missingNumbers: string[]; ok: boolean }

/** Каждое предложение ответа должно ссылаться на фрагмент и опираться на него словами и числами. */
export function checkSupport(answer: string, context: Chunk[], minShare = 0.8): { ok: boolean; claims: ClaimCheck[] } {
  const claims = sentences(answer).map((raw) => {
    const cited = [...raw.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const claim = raw.replace(/\s*\[\d+\]/g, '');
    const src = cited.map((n) => context[n - 1]?.text ?? '').join(' ');
    const ct = terms(claim);
    const st = new Set(terms(src));
    const share = ct.length ? ct.filter((w) => st.has(w)).length / ct.length : 1;
    const srcTokens = new Set(tokenize(src));
    const missingNumbers = tokenize(claim).filter((t) => /\d/.test(t) && !srcTokens.has(t));
    return { claim, cited, share, missingNumbers, ok: cited.length > 0 && share >= minShare && missingNumbers.length === 0 };
  });
  return { ok: claims.length > 0 && claims.every((c) => c.ok), claims };
}
