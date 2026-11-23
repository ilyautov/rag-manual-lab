/** Сквозной конвейер: права → свежесть → поиск → реранкинг → контекст → ответ → проверка. */
import { DOCS, looksLikeInjection, type Doc } from './prepare.ts';
import { chunkCorpus, structuralChunks, type Chunk } from './chunk.ts';
import { buildIndex, bm25Search, type Bm25Index, type Hit } from './bm25.ts';
import { buildVectorIndex, vectorSearch, type VectorIndex } from './vector.ts';
import { rrf, minMaxFusion } from './hybrid.ts';
import { expandQuery } from './rewrite.ts';
import { rerankScore, mmr } from './rerank.ts';
import { packContext } from './context.ts';
import { compose, checkSupport } from './answer.ts';
import { canRead } from './acl.ts';
import { currentDocs } from './freshness.ts';
import type { Access } from './corpus.ts';

export const TODAY = '2026-11-10';

export type Retriever = 'bm25' | 'vector' | 'rrf' | 'minmax';
export interface Config {
  retriever: Retriever;
  candidates: number;
  rerank: boolean;
  mmr: boolean;
  lambda: number;
  budget: number;
  maxChunks: number;
  role: Access;
  asOf: string;
  freshness: boolean;
  acl: 'before' | 'none';
  quarantine: boolean;
  tau: number; // порог отказа: минимальное покрытие вопроса лучшим фрагментом
  /** Переписывание запроса: разговорные слова заменяются словами корпуса до поиска. */
  expand: boolean;
}

export const DEFAULT: Config = {
  retriever: 'rrf', candidates: 20, rerank: true, mmr: false, lambda: 0.7, budget: 300, maxChunks: 4,
  role: 'all', asOf: TODAY, freshness: true, acl: 'before', quarantine: true, tau: 0.4, expand: false,
};

export interface Engine { docs: Doc[]; chunks: Chunk[]; byId: Map<string, Chunk>; docOf: Map<string, Doc>; bm25: Bm25Index; vec: VectorIndex }

export function buildEngine(docs: Doc[] = DOCS, how: (d: Doc) => Chunk[] = structuralChunks): Engine {
  const chunks = chunkCorpus(docs, how);
  return {
    docs, chunks,
    byId: new Map(chunks.map((c) => [c.id, c])),
    docOf: new Map(docs.map((d) => [d.id, d])),
    bm25: buildIndex(chunks),
    vec: buildVectorIndex(chunks),
  };
}

/** Какие фрагменты вообще участвуют в поиске при данной конфигурации. */
export function allowedChunks(e: Engine, cfg: Config): Set<string> {
  let docs = e.docs;
  if (cfg.acl === 'before') docs = docs.filter((d) => canRead(cfg.role, d));
  if (cfg.freshness) docs = currentDocs(docs, cfg.asOf);
  const ok = new Set(docs.map((d) => d.id));
  return new Set(e.chunks.filter((c) => ok.has(c.docId) && !(cfg.quarantine && looksLikeInjection(c.text))).map((c) => c.id));
}

function filterHits(hits: Hit[], allow: Set<string>, k: number): Hit[] {
  return hits.filter((h) => allow.has(h.id)).slice(0, k);
}

export function firstStage(e: Engine, query: string, cfg: Config): Hit[] {
  const allow = allowedChunks(e, cfg);
  const all = e.chunks.length;
  // лексический этап ищет по каждому варианту запроса и сводит списки рангов
  const lex = () => {
    const variants = cfg.expand ? expandQuery(query) : [query];
    const lists = variants.map((v) => bm25Search(e.bm25, v, all));
    const merged = lists.length === 1 ? lists[0] : rrf(lists);
    return filterHits(merged, allow, cfg.candidates);
  };
  const vec = () => filterHits(vectorSearch(e.vec, query, all), allow, cfg.candidates);
  if (cfg.retriever === 'bm25') return lex();
  if (cfg.retriever === 'vector') return vec();
  if (cfg.retriever === 'rrf') return rrf([lex(), vec()]).slice(0, cfg.candidates);
  return minMaxFusion(lex(), vec()).slice(0, cfg.candidates);
}

export function retrieve(e: Engine, query: string, cfg: Config): Hit[] {
  const first = firstStage(e, query, cfg);
  if (!cfg.rerank) return first;
  // при равных баллах реранкер не различает фрагменты, и порядок первого этапа сохраняется
  return first.map((h, rank) => {
    const c = e.byId.get(h.id)!;
    return { id: h.id, score: rerankScore(e.bm25, query, c.text, c.title), rank };
  }).sort((a, b) => b.score - a.score || a.rank - b.rank).map(({ id, score }) => ({ id, score }));
}

/** Ранжированный список документов: первое появление документа среди фрагментов. */
export function docRanking(e: Engine, hits: Hit[]): string[] {
  const seen: string[] = [];
  for (const h of hits) {
    const d = e.byId.get(h.id)!.docId;
    if (!seen.includes(d)) seen.push(d);
  }
  return seen;
}

export interface Trace {
  query: string;
  hits: Hit[];
  context: Chunk[];
  contextTokens: number;
  answer: string;
  refused: boolean;
  supported: boolean;
}

export function answerQuestion(e: Engine, query: string, cfg: Config = DEFAULT): Trace {
  const hits = retrieve(e, query, cfg);
  let order = hits.map((h) => e.byId.get(h.id)!);
  if (cfg.mmr) {
    const ids = mmr(hits.map((h) => ({ id: h.id, rel: h.score, vec: e.vec.vecs[e.vec.ids.indexOf(h.id)] })), cfg.maxChunks * 2, cfg.lambda);
    order = ids.map((id) => e.byId.get(id)!);
  }
  const packed = packContext(order, cfg.budget, cfg.maxChunks);
  const out = compose(e.bm25, query, packed.chunks, cfg.tau);
  const sup = out.refused ? { ok: true } : checkSupport(out.answer, packed.chunks);
  return { query, hits, context: packed.chunks, contextTokens: packed.tokens, answer: out.answer, refused: out.refused, supported: sup.ok };
}
