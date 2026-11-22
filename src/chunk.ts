/** Нарезка документов на фрагменты (chunks). */
import type { Doc } from './prepare.ts';

export interface Chunk { id: string; docId: string; title: string; text: string; body: string }

/** По структуре: один раздел документа = один фрагмент, к тексту добавлены заголовки. */
export function structuralChunks(doc: Doc): Chunk[] {
  return doc.sections.map((s, i) => ({
    id: `${doc.id}#${i + 1}`,
    docId: doc.id,
    title: doc.title,
    text: `${doc.title}. ${s.heading ? s.heading + (/[.?!]$/.test(s.heading) ? ' ' : '. ') : ''}${s.text}`.replace(/\n/g, ' '),
    body: s.text.replace(/\n/g, ' '),
  }));
}

/** Фиксированный размер в словах с перекрытием. Заголовки разделов идут в текст как обычные слова. */
export function fixedChunks(doc: Doc, size: number, overlap = 0): Chunk[] {
  const words = `${doc.title}. ${doc.text.replace(/^## /gm, '')}`.split(/\s+/).filter(Boolean);
  const step = Math.max(1, size - overlap);
  const out: Chunk[] = [];
  for (let start = 0, i = 1; start < words.length; start += step, i++) {
    const text = words.slice(start, start + size).join(' ');
    out.push({ id: `${doc.id}#w${i}`, docId: doc.id, title: doc.title, text, body: text });
    if (start + size >= words.length) break;
  }
  return out;
}

export function chunkCorpus(docs: Doc[], how: (d: Doc) => Chunk[] = structuralChunks): Chunk[] {
  return docs.flatMap(how);
}
