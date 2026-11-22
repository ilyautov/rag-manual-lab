/** Свежесть: какая версия документа действует на дату. */
import type { Doc } from './prepare.ts';

export function validOn(doc: Doc, date: string): boolean {
  return doc.validFrom <= date && (!doc.validUntil || date < doc.validUntil);
}

/** Действующие на дату документы: из каждой группы последняя версия, вступившая в силу. */
export function currentDocs(docs: Doc[], date: string): Doc[] {
  const best = new Map<string, Doc>();
  for (const d of docs) {
    if (!validOn(d, date)) continue;
    const cur = best.get(d.group);
    if (!cur || d.version > cur.version) best.set(d.group, d);
  }
  return docs.filter((d) => best.get(d.group) === d);
}
