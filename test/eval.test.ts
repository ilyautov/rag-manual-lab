import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recallAtK, precisionAtK, reciprocalRank, ndcgAtK, dcg } from '../src/metrics.ts';
import { mulberry32, pairedBootstrap } from '../src/bootstrap.ts';
import { cohenKappa } from '../src/judge.ts';
import { metricsByHand, bootstrapComparisons, answerQuality, judgeAgreement, configTable } from '../src/experiments.ts';

const r3 = (x: number) => Math.round(x * 1000) / 1000;

test('метрики на простых списках', () => {
  const rel = new Set(['b', 'd']);
  assert.equal(recallAtK(['a', 'b', 'c'], rel, 3), 0.5);
  assert.equal(precisionAtK(['a', 'b', 'c'], rel, 3), 1 / 3);
  assert.equal(reciprocalRank(['a', 'b'], rel), 0.5);
  assert.equal(reciprocalRank(['a'], rel), 0);
  assert.equal(ndcgAtK(['b', 'd'], { b: 1, d: 1 }, 2), 1);
  assert.equal(dcg([1]), 1);
});

test('глава 10: метрики руками', () => {
  const m = metricsByHand();
  assert.equal(m.r1, 0);
  assert.equal(m.r3, 1);
  assert.equal(r3(m.p3), 0.667);
  assert.equal(m.mrr, 0.5);
  assert.equal(r3(m.dcg), 1.762);
  assert.equal(r3(m.idcg), 2.631);
  assert.equal(r3(m.ndcg), 0.67);
});

test('mulberry32 детерминирован', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.equal(a(), b());
  const r = mulberry32(1)();
  assert.ok(r >= 0 && r < 1);
});

test('bootstrap: одинаковые системы дают нулевую разницу', () => {
  const r = pairedBootstrap([1, 0, 1], [1, 0, 1], 100, 1);
  assert.equal(r.diff, 0);
  assert.equal(r.lo, 0);
  assert.equal(r.hi, 0);
});

test('глава 10: интервал разницы MRR между BM25 и гибридом содержит ноль', () => {
  const b = bootstrapComparisons();
  assert.equal(b.n, 37);
  assert.ok(b.bm25VsRrf.lo < 0 && b.bm25VsRrf.hi > 0);
  // разница, границы 95% интервала и доля повторов выше нуля для всех четырёх строк таблицы
  const row = (r: typeof b.bm25VsRrf) => [r3(r.diff), r3(r.lo), r3(r.hi), r.shareAbove0];
  assert.deepEqual(row(b.bm25VsRrf), [0.038, -0.036, 0.107, 0.8435]);
  assert.deepEqual(row(b.bm25VsVector), [0.073, -0.018, 0.164, 0.9415]);
  assert.deepEqual(row(b.rrfVsVector), [0.035, 0, 0.084, 0.954]);
  assert.deepEqual(row(b.rrfVsRerank), [0.049, -0.006, 0.115, 0.9465]);
  assert.equal(b.better, 6);
  assert.equal(b.worse, 1);
});

test('каппа Коэна: полное согласие 1, случайное около 0', () => {
  assert.equal(cohenKappa(['ok', 'bad'], ['ok', 'bad']).kappa, 1);
  assert.equal(cohenKappa(['ok', 'ok', 'bad', 'bad'], ['ok', 'bad', 'ok', 'bad']).kappa, 0);
});

test('глава 11: судья против человека', () => {
  const j = judgeAgreement();
  assert.equal(j.n, 22);
  assert.deepEqual([j.okOk, j.okBad, j.badOk, j.badBad], [12, 3, 4, 3]);
  assert.equal(r3(j.po), 0.682);
  assert.equal(r3(j.pe), 0.583);
  assert.equal(Math.round(j.kappa * 100), 24);
});

test('глава 11: разложение сбоев сквозного конвейера', () => {
  const a = answerQuality();
  assert.equal(a.correct, 32);
  assert.equal(a.total, 40);
  assert.equal(a.retrieval, 2);
  assert.equal(a.generation, 6);
  assert.equal(a.generationRefused, 4);
  assert.equal(a.generationWrong, 2);
  assert.equal(a.falseAnswer, 0);
  assert.equal(a.given, 31);
  assert.equal(a.supported, 31);
  assert.equal(a.unanswerableRefused, 3);
  assert.deepEqual(a.failures, ['q24:generation', 'q25:generation', 'c01:retrieval', 'c02:generation', 'c03:generation', 'c09:retrieval', 'c10:generation', 'c12:generation']);
  // на каком этапе выпал документ: c01 не нашёл первый этап, c09 был в контексте до реранкера
  assert.deepEqual(a.retrievalFirst, ['c01']);
  assert.deepEqual(a.retrievalRerank, ['c09']);
});

test('глава 10: конфигурации целиком', () => {
  const t = configTable();
  const row = (k: string) => [r3(t[k].mrr), r3(t[k].r4), t[k].goldInCtx, t[k].correct];
  assert.deepEqual(row('bm25'), [0.835, 0.892, 33, 29]);
  assert.deepEqual(row('vector'), [0.908, 0.986, 36, 32]);
  assert.deepEqual(row('rrf'), [0.873, 0.959, 33, 31]);
  assert.deepEqual(row('bm25_rr'), [0.881, 0.932, 34, 31]);
  assert.deepEqual(row('vector_rr'), [0.921, 0.973, 35, 32]);
  assert.deepEqual(row('rrf_rr'), [0.921, 0.973, 35, 32]);
});
