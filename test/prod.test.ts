import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, queryLog, naiveModel, planReindex, hashes, docHash } from '../src/prod.ts';
import { DOCS } from '../src/prepare.ts';
import { structuralChunks } from '../src/chunk.ts';
import { productionExperiment } from '../src/experiments.ts';

test('ключ кеша учитывает роль, дату и версию индекса, но не регистр и пунктуацию', () => {
  const d = '2026-11-10';
  assert.equal(cacheKey('Нужен ли чек?', 'all', d, 'v1'), cacheKey('нужен ли чек', 'all', d, 'v1'));
  assert.notEqual(cacheKey('Нужен ли чек?', 'all', d, 'v1'), cacheKey('Нужен ли чек?', 'senior', d, 'v1'));
  assert.notEqual(cacheKey('Нужен ли чек?', 'all', d, 'v1'), cacheKey('Нужен ли чек?', 'all', '2026-12-15', 'v1'));
  assert.notEqual(cacheKey('Нужен ли чек?', 'all', d, 'v1'), cacheKey('Нужен ли чек?', 'all', d, 'v2'));
});

test('хеш документа меняется от заголовка и версии, а не только от текста', () => {
  const d = DOCS.find((x) => x.id === 'bonus')!;
  assert.notEqual(docHash(d), docHash({ ...d, title: 'Бонусы' }));
  assert.notEqual(docHash(d), docHash({ ...d, version: 2 }));
  assert.notEqual(docHash(d), docHash({ ...d, access: 'senior' }));
});

test('журнал запросов воспроизводим по сиду', () => {
  assert.deepEqual(queryLog(['a', 'b', 'c'], 20, 3), queryLog(['a', 'b', 'c'], 20, 3));
});

test('без изменений переиндексировать нечего', () => {
  const p = planReindex(hashes(DOCS), DOCS, structuralChunks);
  assert.equal(p.chunksToEmbed, 0);
  assert.equal(p.unchanged, DOCS.length);
});

test('глава 12: инкрементальная индексация, кеш и журнал', () => {
  const p = productionExperiment();
  assert.deepEqual([p.plan.added.length, p.plan.changed.length, p.plan.removed.length], [1, 1, 1]);
  // новый документ из одного раздела даёт 1 фрагмент, изменённый регламент 3: разделы пересобраны из текста
  assert.equal(p.plan.chunksToEmbed, 4);
  assert.equal(p.plan.chunksTotal, 67);
  assert.equal(p.log, 400);
  assert.equal(p.hits, 344);
  assert.equal(p.misses, 56);
  assert.equal(p.refusals, 24);
  assert.equal(p.empty, 3);
  assert.equal(p.unsupported, 0);
  assert.equal(Math.round(p.avgCtx), 150);
  assert.equal(p.perQuery, 300);
  assert.equal(p.per1000NoCache, 300000);
  assert.equal(p.per1000Cache, 42000);
});

test('глава 12: карантин убирает инструкцию из контекста', () => {
  const p = productionExperiment();
  assert.equal(p.injUnsafeInCtx, true);
  assert.equal(p.injSafeInCtx, false);
  assert.ok(p.naiveUnsafe.includes('365'));
  assert.ok(!p.naiveSafe.includes('365'));
  assert.equal(naiveModel('обычный текст', 'x'), 'x');
});
