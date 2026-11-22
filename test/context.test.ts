import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmr } from '../src/rerank.ts';
import { packContext, edgesOrder } from '../src/context.ts';
import { checkSupport, compose, REFUSAL, wantsQuantity } from '../src/answer.ts';
import { wordSim, fuzzyCoverage } from '../src/match.ts';
import { mmrExample, budgetExperiment, answerChecks, ENGINE, thresholdSweep } from '../src/experiments.ts';

test('нечёткое совпадение слов: опечатка и форма слова', () => {
  assert.equal(wordSim('товар', 'товар'), 1);
  assert.ok(wordSim('возрат', 'возврат') >= 0.5);
  assert.equal(wordSim('30', '300'), 0);
  assert.equal(wordSim('поменя', 'обмен'), 0);
});

test('реранкер связывает опечатку «возрат» со словом «возврат» в настоящем фрагменте', () => {
  const text = ENGINE.byId.get('ret-markdown#2')!.text;
  assert.ok(text.includes('возврат'));
  // слово вопроса с опечаткой получает почти полный вес, а не ноль
  assert.ok(fuzzyCoverage(ENGINE.bm25, 'возрат', text) >= 0.6);
  assert.equal(fuzzyCoverage(ENGINE.bm25, 'возврат', text), 1);
  assert.equal(fuzzyCoverage(ENGINE.bm25, 'флакон', text), 0);
});

test('MMR: при λ = 1 порядок не меняется, при λ = 0,5 убирает повтор', () => {
  const v = (x: number[]) => Float64Array.from(x);
  const c = [
    { id: 'a', rel: 1, vec: v([1, 0]) },
    { id: 'a2', rel: 0.95, vec: v([1, 0]) },
    { id: 'b', rel: 0.6, vec: v([0, 1]) },
  ];
  assert.deepEqual(mmr(c, 2, 1), ['a', 'a2']);
  assert.deepEqual(mmr(c, 2, 0.5), ['a', 'b']);
});

test('глава 7: MMR добавляет документ в контекст', () => {
  const r = mmrExample();
  assert.equal(r.plainDocs, 2);
  assert.equal(r.diverseDocs, 3);
  assert.deepEqual(r.plain, ['delivery-pickup-v1#1', 'delivery-pickup-v2#1', 'delivery-pickup-v1#2', 'delivery-pickup-v2#2']);
  assert.equal(r.diverse[3], 'payment-methods#2');
});

test('бюджет: фрагмент, который не помещается, пропускается', () => {
  const ch = (id: string, n: number) => ({ id, docId: id, title: '', text: 'x'.repeat(n * 4), body: '' });
  const p = packContext([ch('a', 60), ch('b', 50), ch('c', 30)], 100);
  assert.deepEqual(p.chunks.map((c) => c.id), ['a', 'c']);
  assert.equal(p.tokens, 90);
});

test('глава 7: бюджет токенов против доли контекстов с ответом', () => {
  const b = budgetExperiment();
  assert.deepEqual(b.map((x) => Math.round(x.inCtx * 100)), [95, 95, 97, 97]);
  assert.deepEqual(b.map((x) => Math.round(x.tokens)), [92, 192, 290, 383]);
  assert.deepEqual(b.map((x) => x.correctN), [29, 29, 29, 29]);
  assert.deepEqual(b[3].missed, ['c01']);
});

test('порядок по краям: сильные в начале и в конце', () => {
  assert.deepEqual(edgesOrder([1, 2, 3, 4, 5]), [1, 3, 5, 4, 2]);
});

test('глава 8: проверка опоры ловит чужое число, отсутствие ссылки и выдумку', () => {
  const r = Object.fromEntries(answerChecks().map((x) => [x.id, x]));
  assert.equal(r.good.ok, true);
  assert.equal(r.number.ok, false);
  assert.deepEqual(r.number.missing, ['60']);
  assert.equal(r.nocite.ok, false);
  assert.equal(r.invented.ok, false);
  assert.deepEqual(r.invented.shares, [1, 0]);
  assert.equal(r.wrongcite.ok, false);
});

test('отказ, когда контекст не покрывает вопрос', () => {
  const ctx = [ENGINE.byId.get('bonus#1')!];
  assert.equal(compose(ENGINE.bm25, 'Есть ли программа trade-in для смартфонов?', ctx).answer, REFUSAL);
  const ok = compose(ENGINE.bm25, 'Какую часть заказа можно оплатить бонусами?', ctx);
  assert.equal(ok.refused, false);
  assert.ok(checkSupport(ok.answer, ctx).ok);
});

test('глава 8: порог отказа tau', () => {
  const t = thresholdSweep();
  assert.deepEqual(t.map((x) => [x.correct, x.falseAns, x.overRefuse]), [[33, 1, 4], [32, 0, 6], [28, 0, 10], [27, 0, 12]]);
});

test('вопрос о количестве распознаётся по общим словам, а не по фразам набора', () => {
  for (const q of ['Сколько стоит доставка?', 'Когда придёт заказ', 'Как долго идёт посылка?', 'Какой срок у гарантии?', 'Какую сумму вернут?', 'от какой суммы скидка'])
    assert.ok(wantsQuantity(q), q);
  for (const q of ['Можно ли вернуть духи?', 'Как вернуть холодильник?', 'Какие цифры карты можно спросить?'])
    assert.ok(!wantsQuantity(q), q);
});
