/**
 * Игрушечные эмбеддинги: хешированные символьные 3-граммы слов.
 * Это не нейросетевая модель: она ловит общие куски слов («возврат» и «возврата»),
 * но не смысл («поменять» и «обмен» для неё разные).
 */
import { tokenize, isStop } from './normalize.ts';

export const DIM = 512;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function ngrams(word: string, n = 3): string[] {
  const w = `#${word}#`;
  const out: string[] = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n));
  return out;
}

export function normalize(v: Float64Array): Float64Array {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

export function embed(text: string, dim = DIM): Float64Array {
  const v = new Float64Array(dim);
  for (const tok of tokenize(text)) {
    if (isStop(tok)) continue;
    for (const g of ngrams(tok)) {
      const h = fnv1a(g);
      v[h % dim] += (h & 0x80000000) ? -1 : 1;
    }
  }
  return normalize(v);
}

export function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return ab / (Math.sqrt(aa * bb) || 1);
}
