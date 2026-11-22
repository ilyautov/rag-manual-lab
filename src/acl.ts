/** Права доступа: фильтр по роли до поиска. */
import type { Access } from './corpus.ts';
import type { Doc } from './prepare.ts';

const LEVEL: Record<Access, number> = { all: 0, senior: 1 };

export function canRead(role: Access, doc: Doc): boolean {
  return LEVEL[role] >= LEVEL[doc.access];
}
