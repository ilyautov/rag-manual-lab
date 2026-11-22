/** Подготовка документов: очистка выгрузки, разбор структуры, метаданные, дедупликация. */
import { RAW_DOCS, type RawDoc, type Access } from './corpus.ts';
import { tokenize } from './normalize.ts';

export interface Section { heading: string; text: string }
export interface Doc {
  id: string; group: string; title: string; version: number;
  validFrom: string; validUntil?: string; access: Access; source: string;
  text: string; sections: Section[]; injectionFlag: boolean;
}

/** Строки, которые повторяются во многих документах, считаем колонтитулами. */
export function boilerplateLines(raws: string[], minDocs = 3): Set<string> {
  const count = new Map<string, number>();
  for (const raw of raws) {
    for (const line of new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean))) {
      count.set(line, (count.get(line) ?? 0) + 1);
    }
  }
  return new Set([...count].filter(([l, c]) => c >= minDocs && !l.startsWith('##')).map(([l]) => l));
}

const PAGE_LINE = /^.{0,60}стр\.\s*\d+\s*$/u;

export function cleanText(raw: string, boiler: Set<string>): string {
  return raw
    .replace(/&nbsp;/g, ' ')
    .replace(/(\p{L})-\n(\p{L})/gu, '$1$2')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !boiler.has(l) && !PAGE_LINE.test(l))
    .map((l) => l.replace(/[ \t]+/g, ' '))
    .join('\n');
}

export function parseSections(text: string): Section[] {
  const out: Section[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) out.push({ heading: line.slice(3).trim(), text: '' });
    else if (out.length) out[out.length - 1].text += (out[out.length - 1].text ? '\n' : '') + line;
    else out.push({ heading: '', text: line });
  }
  return out;
}

/** Множество словесных шинглов длины n для поиска почти-дубликатов. */
export function shingles(text: string, n = 3): Set<string> {
  const t = tokenize(text);
  const s = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) s.add(t.slice(i, i + n).join(' '));
  return s;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Простая эвристика: фраза, обращённая к ассистенту, внутри документа. */
const INJECTION = /(игнорируй|забудь)\s+(все\s+)?(предыдущие|прежние)\s+(инструкции|правила)|ассистент,\s/iu;
export function looksLikeInjection(text: string): boolean {
  return INJECTION.test(text);
}

export interface PrepareReport { docs: Doc[]; boiler: string[]; duplicates: { kept: string; dropped: string; jaccard: number }[] }

export function prepare(raws: RawDoc[] = RAW_DOCS, dupThreshold = 0.8): PrepareReport {
  const boiler = boilerplateLines(raws.map((r) => r.raw));
  const cleaned = raws.map((r) => {
    const text = cleanText(r.raw, boiler);
    const { raw: _raw, ...meta } = r;
    return { ...meta, text, sections: parseSections(text), injectionFlag: looksLikeInjection(text) } as Doc;
  });
  const docs: Doc[] = [];
  const duplicates: PrepareReport['duplicates'] = [];
  const sh = new Map<string, Set<string>>();
  for (const d of cleaned) {
    const s = shingles(d.text);
    const twin = docs.find((k) => jaccard(sh.get(k.id)!, s) >= dupThreshold);
    if (twin) { duplicates.push({ kept: twin.id, dropped: d.id, jaccard: jaccard(sh.get(twin.id)!, s) }); continue; }
    sh.set(d.id, s);
    docs.push(d);
  }
  return { docs, boiler: [...boiler], duplicates };
}

export const DOCS: Doc[] = prepare().docs;
