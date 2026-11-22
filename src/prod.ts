/** Продакшен в миниатюре: инкрементальная индексация, кеш, журнал запросов, внедрённые инструкции. */
import { createHash } from 'node:crypto';
import { terms } from './normalize.ts';
import type { Doc } from './prepare.ts';
import type { Chunk } from './chunk.ts';
import { mulberry32 } from './bootstrap.ts';

export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

export interface ReindexPlan { added: string[]; changed: string[]; removed: string[]; unchanged: number; chunksToEmbed: number; chunksTotal: number }

/** Сравниваем хеши содержимого: эмбеддинги пересчитываются только для новых и изменённых документов. */
export function planReindex(old: Map<string, string>, docs: Doc[], chunker: (d: Doc) => Chunk[]): ReindexPlan {
  const added: string[] = [], changed: string[] = [];
  let unchanged = 0, chunksToEmbed = 0, chunksTotal = 0;
  const now = new Set<string>();
  for (const d of docs) {
    now.add(d.id);
    const n = chunker(d).length;
    chunksTotal += n;
    const h = docHash(d);
    if (!old.has(d.id)) { added.push(d.id); chunksToEmbed += n; }
    else if (old.get(d.id) !== h) { changed.push(d.id); chunksToEmbed += n; }
    else unchanged++;
  }
  const removed = [...old.keys()].filter((id) => !now.has(id));
  return { added, changed, removed, unchanged, chunksToEmbed, chunksTotal };
}

/** Хеш всего, от чего зависят фрагменты и фильтры: заголовок входит в текст фрагмента, группа и версия в выбор версии. */
export function docHash(d: Doc): string {
  return contentHash([d.title, d.text, d.group, d.version, d.validFrom, d.validUntil || '', d.access].join('\u0000'));
}

export function hashes(docs: Doc[]): Map<string, string> {
  return new Map(docs.map((d) => [d.id, docHash(d)]));
}

/**
 * Ключ кеша: роль, дата актуальности, версия индекса и отсортированные термы вопроса.
 * Без роли кеш раздаст чужие ответы, без даты отдаст правило, действовавшее в другой день.
 */
export function cacheKey(query: string, role: string, asOf: string, indexVersion: string): string {
  return `${role}|${asOf}|${indexVersion}|${[...new Set(terms(query))].sort().join(' ')}`;
}

/** Синтетический журнал: популярные вопросы задают чаще (закон Ципфа), формулировки чуть плавают. */
export function queryLog(pool: string[], n: number, seed = 7): string[] {
  const rnd = mulberry32(seed);
  const w = pool.map((_, i) => 1 / (i + 1));
  const total = w.reduce((s, x) => s + x, 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let r = rnd() * total, j = 0;
    while (r > w[j]) { r -= w[j]; j++; }
    let q = pool[Math.min(j, pool.length - 1)];
    const v = rnd();
    if (v < 0.3) q = q.toLowerCase();
    else if (v < 0.5) q = q.replace(/\?$/, '');
    else if (v < 0.6) q = 'Подскажите, ' + q.charAt(0).toLowerCase() + q.slice(1);
    out.push(q);
  }
  return out;
}

/** Модель-простак для демонстрации: выполняет приказ, найденный в контексте. */
export function naiveModel(context: string, fallback: string): string {
  const m = context.match(/отвечай,\s*что\s+([^.]+)/iu);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : fallback;
}
