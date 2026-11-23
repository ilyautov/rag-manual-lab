/**
 * Все опыты книги в одном месте. Функции возвращают сырые числа;
 * scripts/numbers.ts форматирует их для текста, тесты сверяют их же.
 */
import { RAW_DOCS, RAW_PDF_SAMPLE } from './corpus.ts';
import { prepare, cleanText, boilerplateLines, shingles, jaccard, parseSections, DOCS, type Doc } from './prepare.ts';
import { QUESTIONS, type TestQuestion } from './questions.ts';
import { structuralChunks, fixedChunks, chunkCorpus, type Chunk } from './chunk.ts';
import { buildIndex, bm25Search, tfidfSearch, idf, bm25Term, type Hit } from './bm25.ts';
import { buildVectorIndex, vectorSearch } from './vector.ts';
import { embed, cosine, DIM } from './embed.ts';
import { rrf, minMaxFusion, rawSum, minMax } from './hybrid.ts';
import { mmr } from './rerank.ts';
import { rewriteQuery } from './rewrite.ts';
import { packContext, edgesOrder } from './context.ts';
import { checkSupport, compose, REFUSAL } from './answer.ts';
import { recallAtK, precisionAtK, reciprocalRank, ndcgAtK, mean, dcg } from './metrics.ts';
import { pairedBootstrap } from './bootstrap.ts';
import { cohenKappa, JUDGE_CASES, strictJudge, type Label } from './judge.ts';
import { planReindex, hashes, cacheKey, queryLog, naiveModel } from './prod.ts';
import { estimateTokens, flat, terms } from './normalize.ts';
import { canRead } from './acl.ts';
import { currentDocs } from './freshness.ts';
import {
  buildEngine, DEFAULT, retrieve, docRanking, answerQuestion, allowedChunks, firstStage,
  type Config, type Engine, type Retriever, TODAY,
} from './pipeline.ts';

export const ENGINE: Engine = buildEngine();
export const ANSWERABLE = QUESTIONS.filter((q) => Object.keys(q.relevant).length > 0);
export const UNANSWERABLE = QUESTIONS.filter((q) => Object.keys(q.relevant).length === 0);

const cfgFor = (q: TestQuestion, cfg: Config): Config => ({ ...cfg, role: q.role ?? 'all' });
/** Все факты есть в тексте; факт «а|б» засчитывается, если есть любой из вариантов. */
export const factsIn = (text: string, facts: string[]) =>
  facts.every((f) => f.split('|').some((alt) => flat(text).includes(flat(alt))));
export const isCorrect = (q: TestQuestion, answer: string, refused: boolean) =>
  q.facts.length ? !refused && factsIn(answer, q.facts) : refused;

// ---------- глава 1 и 2: корпус и подготовка ----------
export function corpusStats() {
  const rep = prepare();
  const text = rep.docs.map((d) => d.text).join('\n');
  const rawLen = RAW_DOCS.reduce((s, d) => s + d.raw.length, 0);
  const cleanLen = rep.docs.reduce((s, d) => s + d.text.length, 0);
  const boiler = boilerplateLines(RAW_DOCS.map((d) => d.raw));
  const sample = cleanText(RAW_PDF_SAMPLE, boiler);
  const a = RAW_DOCS.find((d) => d.id === 'ret-normal')!;
  const b = RAW_DOCS.find((d) => d.id === 'ret-normal-copy')!;
  const sa = shingles(cleanText(a.raw, boiler));
  const sb = shingles(cleanText(b.raw, boiler));
  const near = jaccard(shingles(DOCS.find((d) => d.id === 'ret-defect-v1')!.text), shingles(DOCS.find((d) => d.id === 'ret-defect-v2')!.text));
  return {
    rawDocs: RAW_DOCS.length,
    docs: rep.docs.length,
    duplicates: rep.duplicates.length,
    dupJaccard: jaccard(sa, sb),
    versionJaccard: near,
    boilerLines: rep.boiler.length,
    senior: rep.docs.filter((d) => d.access === 'senior').length,
    versioned: new Set(rep.docs.filter((d) => rep.docs.some((x) => x.group === d.group && x.id !== d.id)).map((d) => d.group)).size,
    injection: rep.docs.filter((d) => d.injectionFlag).length,
    tokens: estimateTokens(text),
    words: text.split(/\s+/).length,
    rawChars: rawLen,
    cleanChars: cleanLen,
    sampleRawChars: RAW_PDF_SAMPLE.length,
    sampleCleanChars: sample.length,
    sampleClean: sample,
    questions: QUESTIONS.length,
    answerable: ANSWERABLE.length,
    unanswerable: UNANSWERABLE.length,
    formal: ANSWERABLE.filter((q) => q.id.startsWith('q')).length,
    colloquial: ANSWERABLE.filter((q) => q.id.startsWith('c')).length,
    chunks: ENGINE.chunks.length,
  };
}

// ---------- глава 3: размер фрагмента ----------
/** Факт найден, если среди top-k фрагментов есть фрагмент документа с ответом, содержащий все факты. */
export function factRecall(chunks: Chunk[], k: number, how: 'bm25' | 'vector' = 'bm25') {
  const idx = buildIndex(chunks);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const allowed = new Set(currentDocs(DOCS.filter((d) => canRead('senior', d)), TODAY).map((d) => d.id));
  const vecIdx = how === 'vector' ? buildVectorIndex(chunks) : null;
  let found = 0, tokens = 0;
  const foundIds: string[] = [];
  for (const q of ANSWERABLE) {
    const top2 = new Set(Object.entries(q.relevant).filter(([, g]) => g === 2).map(([d]) => d));
    // векторная ветка идёт через общий vectorSearch: одна реализация вместо трёх копий перебора
    const hits: Hit[] = vecIdx ? vectorSearch(vecIdx, q.q, chunks.length) : bm25Search(idx, q.q, chunks.length);
    const top = hits.filter((h) => allowed.has(byId.get(h.id)!.docId)).slice(0, k).map((h) => byId.get(h.id)!);
    if (top.some((c) => top2.has(c.docId) && factsIn(c.text, q.facts))) { found++; foundIds.push(q.id); }
    tokens += top.reduce((s, c) => s + estimateTokens(c.text), 0);
  }
  return { recall: found / ANSWERABLE.length, tokens: tokens / ANSWERABLE.length, chunks: chunks.length, foundIds };
}

export function chunkSizeExperiment() {
  const sizes = [10, 20, 40, 80];
  const fixed = sizes.map((s) => ({ size: s, ...factRecall(chunkCorpus(DOCS, (d) => fixedChunks(d, s, 0)), 3) }));
  const overlap = sizes.map((s) => ({ size: s, ...factRecall(chunkCorpus(DOCS, (d) => fixedChunks(d, s, Math.floor(s / 4))), 3) }));
  const structural = factRecall(chunkCorpus(DOCS, structuralChunks), 3);
  const wholeDoc = factRecall(chunkCorpus(DOCS, (d) => fixedChunks(d, 10000, 0)), 3);
  // вопросы, которые не нашла ни одна нарезка
  const all = [...fixed, ...overlap, structural, wholeDoc];
  const missedByAll = ANSWERABLE.map((q) => q.id).filter((id) => all.every((r) => !r.foundIds.includes(id)));
  return { sizes, fixed, overlap, structural, wholeDoc, missedByAll };
}

// ---------- глава 4: BM25 руками ----------
export const MINI = [
  { id: 'A', text: 'Уценённый товар можно вернуть, только если обнаружен новый недостаток.' },
  { id: 'B', text: 'Товар надлежащего качества можно вернуть в течение 14 дней. Товар должен сохранить товарный вид, товар не должен быть в употреблении.' },
  { id: 'C', text: 'Бонусы возвращаются на счёт при возврате товара.' },
];
export const MINI_QUERY = 'вернуть уценённый товар';

export function bm25ByHand() {
  const idx = buildIndex(MINI);
  const q = [...new Set(terms(MINI_QUERY))];
  const rows = idx.docs.map((d) => ({
    id: d.id, len: d.len,
    tf: Object.fromEntries(q.map((w) => [w, d.tf.get(w) ?? 0])),
    parts: Object.fromEntries(q.map((w) => [w, d.tf.get(w) ? bm25Term(d.tf.get(w)!, d.len, idx.avgdl, idf(idx, w)) : 0])),
  }));
  const k1Sweep = [0, 0.5, 1.2, 2, 5].map((k1) => ({ k1, tovarB: bm25Term(rows[1].tf[q[2]] as number, rows[1].len, idx.avgdl, idf(idx, q[2]), k1, 0.75) }));
  const bSweep = [0, 0.75, 1].map((b) => ({ b, tovarB: bm25Term(rows[1].tf[q[2]] as number, rows[1].len, idx.avgdl, idf(idx, q[2]), 1.2, b) }));
  return {
    terms: q, N: idx.N, avgdl: idx.avgdl,
    df: Object.fromEntries(q.map((w) => [w, idx.df.get(w) ?? 0])),
    idf: Object.fromEntries(q.map((w) => [w, idf(idx, w)])),
    rows, k1Sweep, bSweep,
    bm25: bm25Search(idx, MINI_QUERY, 3),
    tfidf: tfidfSearch(idx, MINI_QUERY, 3),
  };
}

// ---------- глава 5: эмбеддинги ----------
export function embeddingExamples() {
  const pairs: [string, string][] = [
    ['возврат', 'возврата'],
    ['возврат', 'возрат'],
    ['возврат', 'вернуть'],
    ['поменять', 'обмен'],
    ['сколько ремонтируют по гарантии', 'Гарантийный ремонт длится не дольше 45 дней'],
    ['сколько ремонтируют по гарантии', 'Бонусы сгорают через 180 дней после начисления'],
  ];
  return { dim: DIM, pairs: pairs.map(([a, b]) => ({ a, b, cos: cosine(embed(a), embed(b)) })) };
}

// ---------- главы 6, 7, 10: оценка поиска ----------
export interface QScore { id: string; r1: number; r3: number; r4: number; r5: number; p3: number; mrr: number; ndcg5: number; ranked: string[] }

export function evalRetrieval(cfg: Config, qs: TestQuestion[] = ANSWERABLE, e: Engine = ENGINE): QScore[] {
  return qs.map((q) => {
    const ranked = docRanking(e, retrieve(e, q.q, cfgFor(q, cfg)));
    const rel = new Set(Object.keys(q.relevant));
    const top = new Set(Object.entries(q.relevant).filter(([, g]) => g === 2).map(([d]) => d));
    return {
      id: q.id,
      r1: recallAtK(ranked, rel, 1), r3: recallAtK(ranked, rel, 3), r4: recallAtK(ranked, rel, DEFAULT.maxChunks), r5: recallAtK(ranked, rel, 5),
      p3: precisionAtK(ranked, rel, 3),
      mrr: reciprocalRank(ranked, top),
      ndcg5: ndcgAtK(ranked, q.relevant, 5),
      ranked,
    };
  });
}

export function summarize(rows: QScore[]) {
  return {
    r1: mean(rows.map((r) => r.r1)), r3: mean(rows.map((r) => r.r3)), r4: mean(rows.map((r) => r.r4)), r5: mean(rows.map((r) => r.r5)),
    p3: mean(rows.map((r) => r.p3)), mrr: mean(rows.map((r) => r.mrr)), ndcg5: mean(rows.map((r) => r.ndcg5)),
    top1miss: rows.filter((r) => r.mrr < 1).length,
  };
}

export const RETRIEVERS: Retriever[] = ['bm25', 'vector', 'rrf', 'minmax'];

export function retrievalComparison() {
  const out: Record<string, Record<string, ReturnType<typeof summarize>>> = {};
  for (const r of RETRIEVERS) {
    for (const rr of [false, true]) {
      const cfg = { ...DEFAULT, retriever: r, rerank: rr };
      const all = evalRetrieval(cfg);
      out[`${r}${rr ? '_rr' : ''}`] = {
        all: summarize(all),
        formal: summarize(all.filter((x) => x.id.startsWith('q'))),
        colloquial: summarize(all.filter((x) => x.id.startsWith('c'))),
      };
    }
  }
  return out;
}

/** Разбор по вопросам: где вектор выиграл или проиграл у BM25, где BM25 пуст, что сделал реранкер. */
export function perQuestion() {
  const mrrOf = (cfg: Config) => Object.fromEntries(evalRetrieval(cfg).map((r) => [r.id, r.mrr]));
  const bm = mrrOf({ ...DEFAULT, retriever: 'bm25', rerank: false });
  const vec = mrrOf({ ...DEFAULT, retriever: 'vector', rerank: false });
  const ids = ANSWERABLE.map((q) => q.id);
  const coll = ids.filter((id) => id.startsWith('c'));
  const bmEmpty = ANSWERABLE.filter((q) => !firstStage(ENGINE, q.q, cfgFor(q, { ...DEFAULT, retriever: 'bm25' })).length).map((q) => q.id);
  const rerankDiff = (r: Retriever) => {
    const a = mrrOf({ ...DEFAULT, retriever: r, rerank: false });
    const b = mrrOf({ ...DEFAULT, retriever: r, rerank: true });
    return { up: ids.filter((id) => b[id] > a[id]), down: ids.filter((id) => b[id] < a[id]) };
  };
  return {
    bm, vec,
    vecGain: ids.filter((id) => vec[id] > bm[id]), vecLoss: ids.filter((id) => vec[id] < bm[id]),
    collBmTop: coll.filter((id) => bm[id] === 1), collBmMiss: coll.filter((id) => bm[id] < 1),
    bmEmpty,
    rerank: { bm25: rerankDiff('bm25'), vector: rerankDiff('vector'), rrf: rerankDiff('rrf') },
  };
}

/** Конфигурации целиком: MRR, Recall@k при k = числу фрагментов в контексте, сквозной результат. */
export function configTable() {
  const rows: Record<string, { mrr: number; r4: number; goldInCtx: number; correct: number }> = {};
  for (const r of RETRIEVERS) for (const rr of [false, true]) {
    const cfg = { ...DEFAULT, retriever: r, rerank: rr };
    const s = summarize(evalRetrieval(cfg));
    const run = pipelineRun(cfg);
    rows[`${r}${rr ? '_rr' : ''}`] = { mrr: s.mrr, r4: s.r4, goldInCtx: run.filter((x) => x.goldInCtx).length, correct: run.filter((x) => x.ok).length };
  }
  return rows;
}

/**
 * Переписывание запроса (глава 6): словарь разговорных слов заменяется словами корпуса,
 * первый этап ищет по обоим вариантам и сводит списки RRF. Считается без реранкера,
 * чтобы эффект переписывания не прятался за ним.
 */
export function rewriteExperiment() {
  const missIds = (cfg: Config) => evalRetrieval(cfg).filter((r) => r.r4 === 0).map((r) => r.id);
  const pair = (cfg: Config) => {
    const plain = evalRetrieval(cfg);
    const expand = evalRetrieval({ ...cfg, expand: true });
    return {
      mrr: summarize(plain).mrr, mrrExpand: summarize(expand).mrr,
      missPlain: missIds(cfg), missExpand: missIds({ ...cfg, expand: true }),
    };
  };
  const examples = ['c01', 'c05'].map((id) => {
    const q = ANSWERABLE.find((x) => x.id === id)!;
    return { id, from: q.q, to: rewriteQuery(q.q) };
  });
  return { examples, bm25: pair({ ...DEFAULT, retriever: 'bm25', rerank: false }), rrf: pair({ ...DEFAULT, retriever: 'rrf', rerank: false }) };
}

/** Ручной расчёт RRF для одного вопроса: позиции документа в двух списках. */
export function rrfByHand(query = 'возрат уценки') {
  const cfg = { ...DEFAULT, rerank: false, candidates: 10 };
  const lex = firstStage(ENGINE, query, { ...cfg, retriever: 'bm25' });
  const vec = firstStage(ENGINE, query, { ...cfg, retriever: 'vector' });
  const fused = rrf([lex, vec]);
  const mm = minMaxFusion(lex, vec);
  const raw = rawSum(lex, vec);
  return { query, lex: lex.slice(0, 5), vec: vec.slice(0, 5), fused: fused.slice(0, 5), minmax: mm.slice(0, 5), raw: raw.slice(0, 5), lexNorm: minMax(lex).slice(0, 3) };
}

/** Сколько раз сырая сумма баллов совпала с BM25 по первому месту. */
export function rawSumDominance() {
  let same = 0, lexMax = 0, vecMax = 0;
  const differ: { id: string; lexEmpty: boolean }[] = [];
  for (const q of ANSWERABLE) {
    const cfg = cfgFor(q, { ...DEFAULT, rerank: false });
    const lex = firstStage(ENGINE, q.q, { ...cfg, retriever: 'bm25' });
    const vec = firstStage(ENGINE, q.q, { ...cfg, retriever: 'vector' });
    const raw = rawSum(lex, vec);
    if (lex[0] && raw[0] && raw[0].id === lex[0].id) same++;
    else differ.push({ id: q.id, lexEmpty: !lex.length });
    lexMax += lex[0]?.score ?? 0;
    vecMax += vec[0]?.score ?? 0;
  }
  return { same, n: ANSWERABLE.length, differ, lexTop: lexMax / ANSWERABLE.length, vecTop: vecMax / ANSWERABLE.length };
}

export function bootstrapComparisons() {
  const base = evalRetrieval({ ...DEFAULT, retriever: 'bm25', rerank: false }).map((r) => r.mrr);
  const vec = evalRetrieval({ ...DEFAULT, retriever: 'vector', rerank: false }).map((r) => r.mrr);
  const hyb = evalRetrieval({ ...DEFAULT, retriever: 'rrf', rerank: false }).map((r) => r.mrr);
  const pipe = evalRetrieval(DEFAULT).map((r) => r.mrr);
  return {
    bm25VsRrf: pairedBootstrap(base, hyb, 2000, 42),
    bm25VsVector: pairedBootstrap(base, vec, 2000, 42),
    rrfVsVector: pairedBootstrap(hyb, vec, 2000, 42),
    rrfVsRerank: pairedBootstrap(hyb, pipe, 2000, 42),
    n: base.length,
    better: hyb.filter((x, i) => x > base[i]).length,
    worse: hyb.filter((x, i) => x < base[i]).length,
  };
}

/** Метрики руками на одном списке из пяти документов. */
export function metricsByHand() {
  const ranked = ['refund-methods', 'bonus', 'payment-methods', 'promo', 'gift-cards'];
  const grades = { bonus: 2, 'payment-methods': 1 } as Record<string, number>;
  const rel = new Set(Object.keys(grades));
  const gains = ranked.map((d) => grades[d] ?? 0);
  return {
    ranked, grades,
    r1: recallAtK(ranked, rel, 1), r3: recallAtK(ranked, rel, 3), p3: precisionAtK(ranked, rel, 3),
    mrr: reciprocalRank(ranked, new Set(['bonus'])),
    dcg: dcg(gains), idcg: dcg([2, 1]), ndcg: ndcgAtK(ranked, grades, 5),
  };
}

// ---------- глава 7: реранкинг, MMR, бюджет ----------
export function mmrExample(query = 'сколько дней заказ хранится в пункте выдачи') {
  const cfg = { ...DEFAULT, freshness: false, rerank: true };
  const hits = retrieve(ENGINE, query, cfg).slice(0, 8);
  const plain = hits.slice(0, 4).map((h) => h.id);
  const vecOf = (id: string) => ENGINE.vec.vecs[ENGINE.vec.ids.indexOf(id)];
  const diverse = mmr(hits.map((h) => ({ id: h.id, rel: h.score, vec: vecOf(h.id) })), 4, DEFAULT.lambda);
  const docs = (ids: string[]) => new Set(ids.map((id) => ENGINE.byId.get(id)!.docId)).size;
  return { query, plain, diverse, plainDocs: docs(plain), diverseDocs: docs(diverse) };
}

export function budgetExperiment() {
  return [100, 200, 300, 600].map((budget) => {
    let inCtx = 0, tokens = 0, correct = 0;
    const missed: string[] = [];
    for (const q of ANSWERABLE) {
      const t = answerQuestion(ENGINE, q.q, cfgFor(q, { ...DEFAULT, budget, maxChunks: 10 }));
      const top2 = new Set(Object.entries(q.relevant).filter(([, g]) => g === 2).map(([d]) => d));
      if (t.context.some((c) => top2.has(c.docId) && factsIn(c.text, q.facts))) inCtx++;
      else missed.push(q.id);
      tokens += t.contextTokens;
      if (isCorrect(q, t.answer, t.refused)) correct++;
    }
    return { budget, inCtx: inCtx / ANSWERABLE.length, tokens: tokens / ANSWERABLE.length, correct: correct / ANSWERABLE.length, correctN: correct, missed };
  });
}

export function edgesExample() {
  return edgesOrder(['1', '2', '3', '4', '5']).join(', ');
}

// ---------- глава 8: ответ и проверка опоры ----------
export function answerChecks() {
  const ctx = ['ret-defect-v2#1', 'ret-defect-v2#2'].map((id) => ENGINE.byId.get(id)!);
  const drafts = [
    { id: 'good', text: 'Покупатель может вернуть товар ненадлежащего качества в течение 30 дней с момента получения [1].' },
    { id: 'number', text: 'Покупатель может вернуть товар ненадлежащего качества в течение 60 дней с момента получения [1].' },
    { id: 'nocite', text: 'Покупатель может вернуть товар ненадлежащего качества в течение 30 дней с момента получения.' },
    { id: 'invented', text: 'Покупатель может вернуть товар ненадлежащего качества в течение 30 дней [1]. Обратную доставку всегда оплачивает магазин [1].' },
    { id: 'wrongcite', text: 'Деньги возвращаются в течение 7 дней после решения о возврате [1].' },
  ];
  return drafts.map((d) => {
    const r = checkSupport(d.text, ctx);
    return { id: d.id, ok: r.ok, shares: r.claims.map((c) => c.share), missing: r.claims.flatMap((c) => c.missingNumbers) };
  });
}

export function pipelineRun(cfg: Config = DEFAULT) {
  return QUESTIONS.map((q) => {
    const t = answerQuestion(ENGINE, q.q, cfgFor(q, cfg));
    const top2 = new Set(Object.entries(q.relevant).filter(([, g]) => g === 2).map(([d]) => d));
    const goldInCtx = t.context.some((c) => top2.has(c.docId));
    const ok = isCorrect(q, t.answer, t.refused);
    let kind: 'ok' | 'retrieval' | 'generation' | 'false-answer';
    if (ok) kind = 'ok';
    else if (!q.facts.length) kind = 'false-answer';
    else kind = goldInCtx ? 'generation' : 'retrieval';
    // на каком этапе выпал документ: был ли он среди кандидатов и попал бы он в контекст без реранкера
    let stage: 'first' | 'rerank' | 'pack' | null = null;
    if (kind === 'retrieval') {
      const c = cfgFor(q, cfg);
      const first = firstStage(ENGINE, q.q, c).map((h) => ENGINE.byId.get(h.id)!);
      const noRerank = packContext(first, c.budget, c.maxChunks).chunks;
      if (!first.some((x) => top2.has(x.docId))) stage = 'first';
      else if (c.rerank && noRerank.some((x) => top2.has(x.docId))) stage = 'rerank';
      else stage = 'pack';
    }
    return { id: q.id, answer: t.answer, refused: t.refused, supported: t.supported, ok, goldInCtx, kind, stage, tokens: t.contextTokens };
  });
}

export function answerQuality() {
  const run = pipelineRun();
  const ans = run.filter((r) => QUESTIONS.find((q) => q.id === r.id)!.facts.length);
  const un = run.filter((r) => !QUESTIONS.find((q) => q.id === r.id)!.facts.length);
  const given = run.filter((r) => !r.refused);
  const count = (k: string) => run.filter((r) => r.kind === k).length;
  return {
    total: run.length,
    correct: run.filter((r) => r.ok).length,
    answerableCorrect: ans.filter((r) => r.ok).length,
    answerable: ans.length,
    refusedAnswerable: ans.filter((r) => r.refused).length,
    unanswerableRefused: un.filter((r) => r.refused).length,
    unanswerable: un.length,
    given: given.length,
    supported: given.filter((r) => r.supported).length,
    retrieval: count('retrieval'),
    generation: count('generation'),
    falseAnswer: count('false-answer'),
    generationRefused: run.filter((r) => r.kind === 'generation' && r.refused).length,
    generationWrong: run.filter((r) => r.kind === 'generation' && !r.refused).length,
    retrievalFirst: run.filter((r) => r.stage === 'first').map((r) => r.id),
    retrievalRerank: run.filter((r) => r.stage === 'rerank').map((r) => r.id),
    retrievalPack: run.filter((r) => r.stage === 'pack').map((r) => r.id),
    ids: (kind: string, refused?: boolean) => run.filter((r) => r.kind === kind && (refused === undefined || r.refused === refused)).map((r) => r.id),
    failures: run.filter((r) => !r.ok).map((r) => `${r.id}:${r.kind}`),
    run,
  };
}

/** Порог отказа: сколько верных ответов и отказов при разных tau. */
export function thresholdSweep() {
  return [0.3, 0.4, 0.5, 0.6].map((tau) => {
    let correct = 0, falseAns = 0, overRefuse = 0;
    for (const q of QUESTIONS) {
      const cfg = cfgFor(q, DEFAULT);
      const hits = retrieve(ENGINE, q.q, cfg);
      const packed = packContext(hits.map((h) => ENGINE.byId.get(h.id)!), cfg.budget, cfg.maxChunks);
      const out = compose(ENGINE.bm25, q.q, packed.chunks, tau);
      if (isCorrect(q, out.answer, out.refused)) correct++;
      if (!q.facts.length && !out.refused) falseAns++;
      if (q.facts.length && out.refused) overRefuse++;
    }
    return { tau, correct, falseAns, overRefuse };
  });
}

// ---------- глава 9: права и свежесть ----------
export function aclExperiment() {
  const q = QUESTIONS.find((x) => x.id === 'q14')!;
  const operator: Config = { ...DEFAULT, role: 'all' };
  const before = answerQuestion(ENGINE, q.q, operator);
  const none = answerQuestion(ENGINE, q.q, { ...operator, acl: 'none' });
  const leaked = none.context.some((c) => ENGINE.docOf.get(c.docId)!.access === 'senior');
  // фильтр после поиска: берём top-4 без прав и выкидываем недоступное
  const post = retrieve(ENGINE, q.q, { ...operator, acl: 'none' }).slice(0, 4);
  const postKept = post.filter((h) => canRead('all', ENGINE.docOf.get(ENGINE.byId.get(h.id)!.docId)!)).length;
  const seniorCount = allowedChunks(ENGINE, { ...DEFAULT, role: 'senior' }).size;
  const allCount = allowedChunks(ENGINE, { ...DEFAULT, role: 'all' }).size;
  return {
    operatorRefused: before.refused, operatorAnswer: before.answer,
    leakAnswer: none.answer, leaked,
    postTop: post.length, postKept,
    chunksSenior: seniorCount, chunksAll: allCount, hidden: seniorCount - allCount,
  };
}

export function freshnessExperiment() {
  const q1 = QUESTIONS.find((x) => x.id === 'q01')!;
  const stale = answerQuestion(ENGINE, q1.q, { ...DEFAULT, freshness: false });
  const staleRank = docRanking(ENGINE, stale.hits);
  const q4 = QUESTIONS.find((x) => x.id === 'q04')!;
  const now = answerQuestion(ENGINE, q4.q, DEFAULT);
  const later = answerQuestion(ENGINE, q4.q, { ...DEFAULT, asOf: '2026-12-15' });
  const promoQ = 'сколько дней на возврат товара надлежащего качества во время акции';
  const promoStale = answerQuestion(ENGINE, promoQ, { ...DEFAULT, freshness: false });
  const promoFresh = answerQuestion(ENGINE, promoQ, DEFAULT);
  const off = pipelineRun({ ...DEFAULT, freshness: false });
  const on = pipelineRun(DEFAULT);
  const current = currentDocs(DOCS, TODAY).length;
  return {
    staleAnswer: stale.answer, staleV1Rank: staleRank.indexOf('ret-defect-v1') + 1, staleV2Rank: staleRank.indexOf('ret-defect-v2') + 1,
    staleCorrect: isCorrect(q1, stale.answer, stale.refused),
    pickupNow: now.answer, pickupLater: later.answer,
    promoStale: promoStale.answer, promoFresh: promoFresh.answer,
    promoStaleTop: promoStale.context[0].id, promoFreshTop: promoFresh.context[0].id,
    promoFreshHasPromo: promoFresh.context.some((c) => c.docId === 'black-friday-2024'),
    correctOff: off.filter((r) => r.ok).length, correctOn: on.filter((r) => r.ok).length,
    current, total: DOCS.length, hiddenByDate: DOCS.length - current,
  };
}

// ---------- глава 11: судья ----------
export function judgeAgreement() {
  const human: Label[] = [];
  const judge: Label[] = [];
  const rows = JUDGE_CASES.map((c) => {
    const chunks = c.chunks.map((id) => ENGINE.byId.get(id)!);
    const j = strictJudge(c.answer, chunks);
    human.push(c.human);
    judge.push(j);
    return { id: c.id, human: c.human, judge: j, note: c.note };
  });
  const k = cohenKappa(human, judge);
  const cell = (h: Label, j: Label) => rows.filter((r) => r.human === h && r.judge === j).length;
  return { n: rows.length, ...k, okOk: cell('ok', 'ok'), okBad: cell('ok', 'bad'), badOk: cell('bad', 'ok'), badBad: cell('bad', 'bad'), rows };
}

// ---------- глава 12: продакшен ----------
export const INJECTION_QUERY = 'Какие условия возврата товара во время распродажи?';
export function productionExperiment() {
  const chunker = structuralChunks;
  const old = hashes(DOCS);
  // правка и новый документ: разделы пересобираются из текста, иначе фрагменты разойдутся с текстом
  const withText = (d: Doc, text: string): Doc => ({ ...d, text, sections: parseSections(text) });
  const edited = DOCS.map((d) => (d.id === 'ret-defect-v2' ? withText(d, d.text.replace('до 20 дней', 'до 15 дней')) : d))
    .filter((d) => d.id !== 'black-friday-2024');
  const tone = DOCS.find((d) => d.id === 'tone')!;
  const added = withText({ ...tone, id: 'chat-templates', group: 'chat-templates', title: 'Шаблоны ответов в чате', source: 'wiki/support/chat-templates' },
    '## Приветствие\nЗдравствуйте! Меня зовут ..., я помогу с заказом.');
  const plan = planReindex(old, [...edited, added], chunker);

  const pool = QUESTIONS.map((q) => q.q);
  const log = queryLog(pool, 400, 7);
  const cache = new Map<string, string>();
  let hits = 0, refusals = 0, empty = 0, tokens = 0, unsupported = 0;
  for (const q of log) {
    const key = cacheKey(q, 'all', TODAY, 'idx-2026-11-10');
    if (cache.has(key)) { hits++; if (cache.get(key) === REFUSAL) refusals++; continue; }
    const first = firstStage(ENGINE, q, { ...DEFAULT, retriever: 'bm25' });
    if (!first.length) empty++;
    const t = answerQuestion(ENGINE, q, DEFAULT);
    tokens += t.contextTokens;
    if (t.refused) refusals++;
    if (!t.supported) unsupported++;
    cache.set(key, t.answer);
  }
  const misses = log.length - hits;
  const PROMPT = 150; // условный размер системного промпта и шаблона в токенах
  const avgCtx = tokens / misses;

  const injQ = INJECTION_QUERY;
  const unsafe = answerQuestion(ENGINE, injQ, { ...DEFAULT, quarantine: false });
  const safe = answerQuestion(ENGINE, injQ, DEFAULT);
  const ctxText = (cs: Chunk[]) => cs.map((c) => c.text).join('\n');
  return {
    plan, injQ,
    log: log.length, unique: cache.size, hits, misses, hitRate: hits / log.length,
    refusals, refusalRate: refusals / log.length, empty, unsupported,
    // округляем один раз: расход на тысячу запросов считается от целого числа токенов на запрос
    avgCtx, perQuery: Math.round(PROMPT + avgCtx), prompt: PROMPT,
    per1000NoCache: 1000 * Math.round(PROMPT + avgCtx), per1000Cache: Math.round(1000 * (1 - hits / log.length)) * Math.round(PROMPT + avgCtx),
    injUnsafeInCtx: unsafe.context.some((c) => c.docId === 'sale-memo' && /игнорируй/i.test(c.text)),
    injSafeInCtx: safe.context.some((c) => /игнорируй/i.test(c.text)),
    naiveUnsafe: naiveModel(ctxText(unsafe.context), unsafe.answer),
    naiveSafe: naiveModel(ctxText(safe.context), safe.answer),
    keyOperator: cacheKey('Сколько бонусов старший смены может начислить?', 'all', TODAY, 'v1') !== cacheKey('Сколько бонусов старший смены может начислить?', 'senior', TODAY, 'v1'),
  };
}
