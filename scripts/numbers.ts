/** Печатает build/numbers.json: все числа книги, отформатированные по-русски. */
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as X from '../src/experiments.ts';
import { DEFAULT } from '../src/pipeline.ts';
import { ndcgAtK, dcg } from '../src/metrics.ts';
import { cohenKappa, type Label } from '../src/judge.ts';
import { QUESTIONS } from '../src/questions.ts';

const ROOT = join(import.meta.dirname, '..');
const f = (x: number, d = 2) => {
  const s = x.toFixed(d);
  return (Number(s) === 0 ? Math.abs(0).toFixed(d) : s).replace('.', ',').replace('-', '−');
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const int = (x: number) => String(Math.round(x));
const big = (x: number) => Math.round(x).toLocaleString('ru-RU').replace(/\s/g, '\u00A0');
/** Перечень по-русски: «а», «б» и «в». */
const listRu = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`);
const qText = (id: string) => QUESTIONS.find((q) => q.id === id)!.q.replace(/\?$/, '');
/** Вопросы тестового набора текстом в кавычках. */
const ql = (ids: string[]) => listRu(ids.map((id) => `«${qText(id)}»`));
const il = (ids: string[]) => listRu(ids);

const c = X.corpusStats();
const ch = X.chunkSizeExperiment();
const b = X.bm25ByHand();
const em = X.embeddingExamples();
const cmp = X.retrievalComparison();
const rh = X.rrfByHand();
const rs = X.rawSumDominance();
const bs = X.bootstrapComparisons();
const mh = X.metricsByHand();
const mm = X.mmrExample();
const bud = X.budgetExperiment();
const chk = X.answerChecks();
const aq = X.answerQuality();
const tau = X.thresholdSweep();
const acl = X.aclExperiment();
const fr = X.freshnessExperiment();
const jd = X.judgeAgreement();
const pr = X.productionExperiment();
const pq = X.perQuestion();
const ct = X.configTable();

const [tv, tm, tt] = b.terms; // верну, уцененн, товар
const row = (id: string) => b.rows.find((r) => r.id === id)!;

const cmpOut: Record<string, unknown> = {};
for (const [k, v] of Object.entries(cmp)) {
  cmpOut[k] = Object.fromEntries(Object.entries(v).map(([s, m]) => [s, {
    r1: f(m.r1), r3: f(m.r3), r4: f(m.r4), r5: f(m.r5), p3: f(m.p3), mrr: f(m.mrr), ndcg: f(m.ndcg5), miss: int(m.top1miss),
  }]));
}

const boot = (r: typeof bs.bm25VsRrf) => ({ diff: f(r.diff), lo: f(r.lo), hi: f(r.hi), share: pct(r.shareAbove0) });
const chunkRow = (r: { recall: number; tokens: number; chunks: number }) => ({
  rec: pct(r.recall), tok: int(r.tokens), n: int(r.chunks),
  h: (r.recall * 140).toFixed(1), y: (170 - r.recall * 140).toFixed(1), ty: (170 - r.recall * 140 - 5).toFixed(1),
});
const check = Object.fromEntries(chk.map((d) => [d.id, { ok: d.ok ? 'да' : 'нет', share: d.shares.map((s) => f(s)).join(' и '), missing: d.missing.join(', ') || 'нет' }]));
const tauOut = Object.fromEntries(tau.map((t) => [`t${Math.round(t.tau * 10)}`, { tau: f(t.tau, 1), correct: int(t.correct), falseAns: int(t.falseAns), over: int(t.overRefuse) }]));
const budGained = bud[0].missed.filter((id) => !bud[2].missed.includes(id));
const budOut = Object.fromEntries(bud.map((x) => [`b${x.budget}`, { budget: int(x.budget), inCtx: pct(x.inCtx), tok: int(x.tokens), correct: pct(x.correct), correctN: int(x.correctN), missed: ql(x.missed), missedN: int(x.missed.length) }]));

const testCount = readdirSync(join(ROOT, 'test')).filter((n) => n.endsWith('.test.ts'))
  .reduce((s, n) => s + (readFileSync(join(ROOT, 'test', n), 'utf8').match(/^test\(/gm) ?? []).length, 0);

const exLabels: Label[] = [...Array(7).fill('ok'), ...Array(3).fill('bad')];
const exK = cohenKappa(exLabels, Array(10).fill('ok'));
const answers = {
  rrf23: f(1 / 62 + 1 / 63, 4),
  ndcgDcg: f(dcg([0, 1, 2]), 3), ndcgIdcg: f(dcg([2, 1]), 3), ndcg: f(ndcgAtK(['x', 'p', 'g'], { p: 1, g: 2 }, 3)), mrr: f(1 / 3),
  kPo: pct(exK.po), kPe: pct(exK.pe), kappa: f(exK.kappa),
};

const numbers = {
  ans: answers,
  tests: { count: int(testCount) },
  corpus: {
    rawDocs: int(c.rawDocs), docs: int(c.docs), dup: int(c.duplicates), dupJaccard: f(c.dupJaccard), versionJaccard: f(c.versionJaccard),
    boiler: int(c.boilerLines), senior: int(c.senior), versioned: int(c.versioned), injection: int(c.injection),
    tokens: big(c.tokens), words: big(c.words), rawChars: big(c.rawChars), cleanChars: big(c.cleanChars),
    sampleRaw: int(c.sampleRawChars), sampleClean: int(c.sampleCleanChars),
    questions: int(c.questions), answerable: int(c.answerable), unanswerable: int(c.unanswerable),
    formal: int(c.formal), colloquial: int(c.colloquial), chunks: int(c.chunks), avgWords: int(c.words / c.docs),
  },
  cfg: { candidates: int(DEFAULT.candidates), budget: int(DEFAULT.budget), maxChunks: int(DEFAULT.maxChunks), lambda: f(DEFAULT.lambda, 1), tau: f(DEFAULT.tau, 1) },
  chunk: {
    f10: chunkRow(ch.fixed[0]), f20: chunkRow(ch.fixed[1]), f40: chunkRow(ch.fixed[2]), f80: chunkRow(ch.fixed[3]),
    o10: chunkRow(ch.overlap[0]), o20: chunkRow(ch.overlap[1]), o40: chunkRow(ch.overlap[2]), o80: chunkRow(ch.overlap[3]),
    st: chunkRow(ch.structural), whole: chunkRow(ch.wholeDoc), ratio: f(Math.round(ch.fixed[3].tokens) / Math.round(ch.fixed[0].tokens), 1),
    st40diff: int(Math.round((ch.fixed[2].recall - ch.structural.recall) * X.ANSWERABLE.length)),
    missedAll: ql(ch.missedByAll), missedAllN: int(ch.missedByAll.length), missedAllIds: il(ch.missedByAll),
  },
  bm25: {
    N: int(b.N), avgdl: f(b.avgdl), tv, tm, tt,
    dfV: int(b.df[tv]), dfM: int(b.df[tm]), dfT: int(b.df[tt]),
    idfV: f(b.idf[tv], 3), idfM: f(b.idf[tm], 3), idfT: f(b.idf[tt], 3),
    lenA: int(row('A').len), lenB: int(row('B').len), lenC: int(row('C').len),
    tfBT: int(row('B').tf[tt] as number),
    aV: f(row('A').parts[tv] as number, 3), aM: f(row('A').parts[tm] as number, 3), aT: f(row('A').parts[tt] as number, 3),
    bV: f(row('B').parts[tv] as number, 3), bT: f(row('B').parts[tt] as number, 3), cT: f(row('C').parts[tt] as number, 3),
    sA: f(b.bm25[0].score, 3), sB: f(b.bm25[1].score, 3), sC: f(b.bm25[2].score, 3),
    tfA: f(b.tfidf[0].score, 3), tfB: f(b.tfidf[1].score, 3),
    k1_0: f(b.k1Sweep[0].tovarB, 3), k1_05: f(b.k1Sweep[1].tovarB, 3), k1_12: f(b.k1Sweep[2].tovarB, 3), k1_2: f(b.k1Sweep[3].tovarB, 3), k1_5: f(b.k1Sweep[4].tovarB, 3),
    b0: f(b.bSweep[0].tovarB, 3), b075: f(b.bSweep[1].tovarB, 3), b1: f(b.bSweep[2].tovarB, 3),
  },
  emb: { dim: int(em.dim), ...Object.fromEntries(em.pairs.map((p, i) => [`p${i + 1}`, f(p.cos)])) },
  cmp: cmpOut,
  rrf: {
    query: rh.query,
    lexN: int(rh.lex.length), lex1: rh.lex[0].id, lex1s: f(rh.lex[0].score),
    vec1: rh.vec[0].id, vec1s: f(rh.vec[0].score), vec4: rh.vec[3].id, vec4s: f(rh.vec[3].score),
    f1: f(rh.fused[0].score, 4), f2: f(rh.fused[1].score, 4), fv: f(1 / 61 + 1 / 64, 4), one: f(1 / 61, 4), four: f(1 / 64, 4),
    mm1: f(rh.minmax[0].score), mm2: f(rh.minmax[1].score), raw1: f(rh.raw[0].score), raw2: f(rh.raw[1].score),
  },
  raw: {
    same: int(rs.same), n: int(rs.n), lexTop: f(rs.lexTop, 1), vecTop: f(rs.vecTop), differN: int(rs.differ.length),
    emptyIds: il(rs.differ.filter((d) => d.lexEmpty).map((d) => d.id)), emptyN: int(rs.differ.filter((d) => d.lexEmpty).length),
    otherIds: il(rs.differ.filter((d) => !d.lexEmpty).map((d) => d.id)), otherN: int(rs.differ.filter((d) => !d.lexEmpty).length),
  },
  ex: {
    vecGain: ql(pq.vecGain), vecGainIds: il(pq.vecGain), vecGainN: int(pq.vecGain.length),
    vecLoss: ql(pq.vecLoss), vecLossIds: il(pq.vecLoss), vecLossN: int(pq.vecLoss.length),
    vecLossBm: f(pq.bm[pq.vecLoss[0]]), vecLossVec: f(pq.vec[pq.vecLoss[0]]),
    collBmTop: ql(pq.collBmTop), collBmTopN: int(pq.collBmTop.length),
    collBmMiss: ql(pq.collBmMiss), collBmMissN: int(pq.collBmMiss.length),
    bmEmpty: ql(pq.bmEmpty), bmEmptyIds: il(pq.bmEmpty), bmEmptyN: int(pq.bmEmpty.length),
    rrBmUp: il(pq.rerank.bm25.up), rrBmUpN: int(pq.rerank.bm25.up.length), rrBmDown: il(pq.rerank.bm25.down),
    rrVecUp: il(pq.rerank.vector.up), rrVecUpN: int(pq.rerank.vector.up.length), rrVecDown: il(pq.rerank.vector.down), rrVecDownN: int(pq.rerank.vector.down.length),
    rrRrfUp: il(pq.rerank.rrf.up), rrRrfUpN: int(pq.rerank.rrf.up.length), rrRrfDown: il(pq.rerank.rrf.down), rrRrfDownN: int(pq.rerank.rrf.down.length),
  },
  cfgT: Object.fromEntries(Object.entries(ct).map(([k, v]) => [k, { mrr: f(v.mrr), r4: f(v.r4), gold: int(v.goldInCtx), correct: int(v.correct) }])),
  boot: {
    n: int(bs.n), iters: '2000', bm25Rrf: boot(bs.bm25VsRrf), bm25Vec: boot(bs.bm25VsVector), rrfVec: boot(bs.rrfVsVector), rrfRerank: boot(bs.rrfVsRerank),
    better: int(bs.better), worse: int(bs.worse), same: int(bs.n - bs.better - bs.worse),
  },
  mh: { r1: f(mh.r1), r3: f(mh.r3), p3: f(mh.p3), mrr: f(mh.mrr), dcg: f(mh.dcg, 3), idcg: f(mh.idcg, 3), ndcg: f(mh.ndcg), g2: f(1 / Math.log2(3), 3) },
  mmr: { query: mm.query, plainDocs: int(mm.plainDocs), diverseDocs: int(mm.diverseDocs), plain: mm.plain.join(', '), diverse: mm.diverse.join(', ') },
  budget: { ...budOut, gained300: ql(budGained) },
  edges: X.edgesExample(),
  check,
  aq: {
    total: int(aq.total), correct: int(aq.correct), correctPct: pct(aq.correct / aq.total),
    ansCorrect: int(aq.answerableCorrect), answerable: int(aq.answerable), refusedAns: int(aq.refusedAnswerable),
    unRefused: int(aq.unanswerableRefused), unanswerable: int(aq.unanswerable),
    given: int(aq.given), supported: int(aq.supported),
    retrieval: int(aq.retrieval), generation: int(aq.generation), falseAnswer: int(aq.falseAnswer),
    genRefused: int(aq.generationRefused), genWrong: int(aq.generationWrong),
    fails: int(aq.total - aq.correct),
    retFirst: ql(aq.retrievalFirst), retFirstN: int(aq.retrievalFirst.length),
    retRerank: ql(aq.retrievalRerank), retRerankN: int(aq.retrievalRerank.length), retPackN: int(aq.retrievalPack.length),
    genRefusedQ: ql(aq.ids('generation', true)), genWrongQ: ql(aq.ids('generation', false)),
  },
  tau: tauOut,
  acl: {
    leaked: acl.leaked ? 'да' : 'нет', postTop: int(acl.postTop), postKept: int(acl.postKept),
    chunksSenior: int(acl.chunksSenior), chunksAll: int(acl.chunksAll), hidden: int(acl.hidden),
  },
  fresh: {
    v1Rank: int(fr.staleV1Rank), v2Rank: int(fr.staleV2Rank), correctOff: int(fr.correctOff), correctOn: int(fr.correctOn),
    current: int(fr.current), total: int(fr.total), hidden: int(fr.hiddenByDate),
  },
  judge: { n: int(jd.n), po: pct(jd.po), pe: pct(jd.pe), kappa: f(jd.kappa), okOk: int(jd.okOk), okBad: int(jd.okBad), badOk: int(jd.badOk), badBad: int(jd.badBad), agree: int(jd.okOk + jd.badBad),
    humanOk: int(jd.okOk + jd.okBad), humanBad: int(jd.badOk + jd.badBad), judgeOk: int(jd.okOk + jd.badOk), judgeBad: int(jd.okBad + jd.badBad) },
  prod: {
    added: int(pr.plan.added.length), changed: int(pr.plan.changed.length), removed: int(pr.plan.removed.length), unchanged: int(pr.plan.unchanged),
    embed: int(pr.plan.chunksToEmbed), total: int(pr.plan.chunksTotal), embedPct: pct(pr.plan.chunksToEmbed / pr.plan.chunksTotal),
    log: int(pr.log), unique: int(pr.unique), hits: int(pr.hits), hitRate: pct(pr.hitRate),
    refusals: int(pr.refusals), refusalRate: f(pr.refusalRate * 100, 1) + '%', empty: int(pr.empty), unsupported: int(pr.unsupported), misses: int(pr.misses),
    injQ: pr.injQ,
    avgCtx: int(pr.avgCtx), prompt: int(pr.prompt), perQuery: int(pr.perQuery),
    per1000: big(pr.per1000NoCache), per1000Cache: big(pr.per1000Cache),
    injUnsafe: pr.injUnsafeInCtx ? 'да' : 'нет', injSafe: pr.injSafeInCtx ? 'да' : 'нет',
  },
};

mkdirSync(join(ROOT, 'build'), { recursive: true });
writeFileSync(join(ROOT, 'build/numbers.json'), JSON.stringify(numbers, null, 2) + '\n');
console.log('build/numbers.json: ok');
