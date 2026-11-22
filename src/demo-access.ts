/** npm run access : права до поиска и свежесть версий. */
import { aclExperiment, freshnessExperiment } from './experiments.ts';

const a = aclExperiment();
console.log('Оператор, фильтр до поиска:', a.operatorAnswer);
console.log('Оператор, без фильтра:', a.leakAnswer);
console.log(`Фильтр после поиска: из ${a.postTop} фрагментов осталось ${a.postKept}`);
const f = freshnessExperiment();
console.log('Без фильтра версий:', f.staleAnswer);
console.log('Пункт выдачи сегодня:', f.pickupNow, '| 15 декабря:', f.pickupLater);
console.log(`Верных ответов без фильтра версий ${f.correctOff}, с фильтром ${f.correctOn}`);
