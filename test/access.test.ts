import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRead } from '../src/acl.ts';
import { currentDocs, validOn } from '../src/freshness.ts';
import { DOCS } from '../src/prepare.ts';
import { aclExperiment, freshnessExperiment } from '../src/experiments.ts';

test('роль оператора не читает документы старших смен', () => {
  const senior = DOCS.find((d) => d.access === 'senior')!;
  assert.equal(canRead('all', senior), false);
  assert.equal(canRead('senior', senior), true);
});

test('глава 9: без фильтра до поиска ответ утекает', () => {
  const a = aclExperiment();
  assert.equal(a.operatorRefused, false);
  assert.ok(!a.operatorAnswer.includes('500'));
  assert.ok(a.leakAnswer.includes('500 бонусов'));
  assert.equal(a.leaked, true);
  assert.equal(a.postTop, 4);
  assert.equal(a.postKept, 1);
  assert.equal(a.hidden, 4);
});

test('действующая версия выбирается по дате', () => {
  const ids = (date: string) => currentDocs(DOCS, date).map((d) => d.id);
  assert.ok(ids('2026-11-10').includes('delivery-pickup-v1'));
  assert.ok(ids('2026-12-15').includes('delivery-pickup-v2'));
  assert.ok(!ids('2026-11-10').includes('black-friday-2024'));
  assert.ok(validOn(DOCS.find((d) => d.id === 'black-friday-2024')!, '2024-11-30'));
});

test('глава 9: устаревшая версия даёт неверный срок', () => {
  const f = freshnessExperiment();
  assert.ok(f.staleAnswer.includes('14 дней'));
  assert.equal(f.staleV1Rank, 1);
  assert.equal(f.staleCorrect, false);
  assert.ok(f.pickupNow.includes('5 дней'));
  assert.ok(f.pickupLater.includes('7 дней'));
  assert.ok(f.promoStale.includes('30 дней'));
  // с фильтром акции нет в контексте, первым идёт действующий регламент с 14 днями
  assert.equal(f.promoStaleTop, 'black-friday-2024#1');
  assert.equal(f.promoFreshHasPromo, false);
  assert.equal(f.promoFreshTop, 'ret-normal#1');
  assert.equal(f.correctOff, 30);
  assert.equal(f.correctOn, 32);
  assert.equal(f.current, 27);
});
