import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, idf, bm25Term, bm25Search } from '../src/bm25.ts';
import { embed, cosine, dot } from '../src/embed.ts';
import { rrf, minMax, minMaxFusion } from '../src/hybrid.ts';
import { bm25ByHand, embeddingExamples, rrfByHand, rawSumDominance, retrievalComparison, perQuestion } from '../src/experiments.ts';

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;

test('IDF: слово во всех документах весит мало, редкое много', () => {
  const idx = buildIndex([{ id: 'a', text: 'товар брак' }, { id: 'b', text: 'товар' }]);
  assert.ok(idf(idx, 'брак') > idf(idx, 'товар'));
  assert.ok(idf(idx, 'товар') > 0);
});

test('BM25: насыщение по tf и нормализация длины', () => {
  assert.ok(bm25Term(10, 10, 10, 1) < 2.2 + 1e-9);
  assert.ok(bm25Term(1, 5, 10, 1) > bm25Term(1, 20, 10, 1));
  assert.equal(bm25Term(3, 10, 10, 1, 1.2, 0), bm25Term(3, 30, 10, 1, 1.2, 0));
});

test('глава 4: расчёт BM25 руками на трёх документах', () => {
  const b = bm25ByHand();
  assert.deepEqual(b.terms, ['верну', 'уцененн', 'товар']);
  assert.equal(r2(b.avgdl), 8.67);
  assert.deepEqual([b.idf['верну'], b.idf['уцененн'], b.idf['товар']].map(r3), [0.47, 0.981, 0.134]);
  assert.deepEqual(b.bm25.map((h) => [h.id, r3(h.score)]), [['A', 1.813], ['B', 0.543], ['C', 0.161]]);
  assert.deepEqual(b.tfidf.map((h) => [h.id, r3(h.score)]), [['A', 1.504], ['B', 0.405]]);
  assert.deepEqual(b.k1Sweep.map((x) => r3(x.tovarB)), [0.134, 0.159, 0.181, 0.197, 0.224]);
  assert.deepEqual(b.bSweep.map((x) => r3(x.tovarB)), [0.21, 0.181, 0.174]);
});

test('эмбеддинги нормированы: косинус равен скалярному произведению', () => {
  const a = embed('возврат товара');
  const b = embed('вернуть уценённый товар');
  assert.equal(r3(dot(a, a)), 1);
  assert.equal(r3(cosine(a, b)), r3(dot(a, b)));
});

test('глава 5: символьные n-граммы ловят форму слова, но не смысл', () => {
  const p = embeddingExamples().pairs.map((x) => r2(x.cos));
  assert.deepEqual(p, [0.77, 0.62, 0, 0.16, 0.44, 0.08]);
});

test('RRF: k = 60, ранги с единицы', () => {
  const fused = rrf([[{ id: 'x', score: 9 }, { id: 'y', score: 1 }], [{ id: 'y', score: 0.9 }]]);
  assert.equal(fused[0].id, 'y');
  assert.equal(r3(fused[0].score * 1000), r3((1 / 62 + 1 / 61) * 1000));
});

test('min-max: лучший получает 1, худший 0', () => {
  assert.deepEqual(minMax([{ id: 'a', score: 5 }, { id: 'b', score: 3 }, { id: 'c', score: 1 }]).map((h) => h.score), [1, 0.5, 0]);
  assert.equal(minMaxFusion([{ id: 'a', score: 9 }], [{ id: 'a', score: 0.1 }, { id: 'b', score: 0.05 }])[0].id, 'a');
});

test('глава 6: ручной RRF для «возрат уценки»', () => {
  const r = rrfByHand();
  assert.equal(r.lex.length, 1);
  assert.equal(r.lex[0].id, 'ret-markdown#1');
  assert.equal(r.vec[3].id, 'ret-markdown#1');
  assert.equal(r.fused[0].id, 'ret-markdown#1');
  assert.equal(r3(r.fused[0].score * 100), r3((1 / 61 + 1 / 64) * 100));
});

test('глава 6: сырая сумма почти всегда повторяет BM25', () => {
  const r = rawSumDominance();
  assert.equal(r.same, 33);
  assert.equal(r.n, 37);
  // расхождения: два вопроса, где BM25 не нашёл ничего, и два настоящих
  assert.deepEqual(r.differ, [{ id: 'q20', lexEmpty: false }, { id: 'c01', lexEmpty: true }, { id: 'c05', lexEmpty: true }, { id: 'c11', lexEmpty: false }]);
});

test('глава 6: сравнение конфигураций на тестовом наборе', () => {
  const c = retrievalComparison();
  const row = (k: keyof typeof c, s: 'all' | 'formal' | 'colloquial') =>
    [c[k][s].r1, c[k][s].r3, c[k][s].r4, c[k][s].p3, c[k][s].mrr, c[k][s].ndcg5].map(r3);
  // Recall@1, Recall@3, Recall@4, Precision@3, MRR, nDCG@5 по всем вопросам с ответом
  assert.deepEqual(row('bm25', 'all'), [0.757, 0.892, 0.892, 0.342, 0.835, 0.85]);
  assert.deepEqual(row('vector', 'all'), [0.824, 0.932, 0.986, 0.36, 0.908, 0.93]);
  assert.deepEqual(row('rrf', 'all'), [0.784, 0.905, 0.959, 0.351, 0.873, 0.909]);
  assert.deepEqual(row('minmax', 'all'), [0.838, 0.932, 0.959, 0.36, 0.906, 0.934]);
  assert.deepEqual(row('rrf_rr', 'all'), [0.851, 0.946, 0.973, 0.36, 0.921, 0.947]);
  // MRR по типам вопросов, без реранкера и с ним
  const mrr = (k: keyof typeof c) => [c[k].formal.mrr, c[k].colloquial.mrr].map(r3);
  assert.deepEqual(mrr('bm25'), [0.98, 0.532]);
  assert.deepEqual(mrr('vector'), [0.95, 0.819]);
  assert.deepEqual(mrr('rrf'), [0.95, 0.711]);
  assert.deepEqual(mrr('minmax'), [0.98, 0.753]);
  assert.deepEqual(mrr('bm25_rr'), [0.973, 0.688]);
  assert.deepEqual(mrr('vector_rr'), [0.973, 0.813]);
  assert.deepEqual(mrr('rrf_rr'), [0.973, 0.813]);
  assert.equal(r3(c.bm25_rr.all.mrr), 0.881);
  assert.equal(r3(c.vector_rr.all.mrr), 0.921);
});

test('bm25Search не возвращает документы без общих слов', () => {
  const idx = buildIndex([{ id: 'a', text: 'бонусы' }, { id: 'b', text: 'доставка' }]);
  assert.deepEqual(bm25Search(idx, 'бонусы').map((h) => h.id), ['a']);
});

test('главы 4, 5, 7: разбор по вопросам', () => {
  const p = perQuestion();
  assert.deepEqual(p.vecGain, ['c03', 'c04', 'c05', 'c07', 'c09', 'c11']);
  assert.deepEqual(p.vecLoss, ['q24']);
  assert.deepEqual(p.collBmTop, ['c02', 'c06', 'c08', 'c10', 'c12']);
  assert.deepEqual(p.bmEmpty, ['c01', 'c05']);
  assert.deepEqual(p.rerank.bm25, { up: ['c03', 'c04', 'c07', 'c11'], down: ['q10', 'c09'] });
  assert.deepEqual(p.rerank.vector, { up: ['q24', 'c11'], down: ['q10', 'c09'] });
  assert.deepEqual(p.rerank.rrf, { up: ['q24', 'c03', 'c07', 'c11'], down: ['q10', 'c09'] });
});
