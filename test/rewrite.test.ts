import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandQuery, rewriteQuery } from '../src/rewrite.ts';
import { rewriteExperiment } from '../src/experiments.ts';

test('глава 6: переписывание запроса заменяет разговорные слова словами корпуса', () => {
  assert.equal(rewriteQuery('сколько ремонтируют по гарантии'), 'сколько ремонт по гарантии');
  assert.equal(rewriteQuery('юрлицо оформляет возврат'), 'юридическое лицо оформляет возврат');
  assert.equal(rewriteQuery('до скольки процентов заказа можно платить баллами'),
    'до скольки процентов заказа можно платить бонусы');
  assert.deepEqual(expandQuery('возрат уценки'), ['возрат уценки'], 'без правил вариант один');
  assert.deepEqual(expandQuery('сколько ремонтируют по гарантии'),
    ['сколько ремонт по гарантии', 'сколько ремонтируют по гарантии']);
});

test('глава 6: переписывание закрывает промахи лексического этапа', () => {
  const r = rewriteExperiment();
  assert.equal(r.bm25.missPlain.length, 4);
  assert.deepEqual(r.bm25.missExpand, []);
  assert.deepEqual(r.rrf.missExpand, []);
  assert.ok(r.bm25.mrrExpand > r.bm25.mrr);
  assert.ok(r.rrf.mrrExpand >= r.rrf.mrr);
});
