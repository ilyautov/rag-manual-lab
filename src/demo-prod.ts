/** npm run prod : переиндексация, кеш, журнал и карантин injection. */
import { productionExperiment } from './experiments.ts';

const p = productionExperiment();
console.log('План переиндексации:', p.plan);
console.log(`Журнал ${p.log} запросов: попаданий в кеш ${p.hits} (${(p.hitRate * 100).toFixed(0)}%), отказов ${p.refusals}, пустой лексический поиск ${p.empty}`);
console.log(`Токенов на 1000 запросов: без кеша ${p.per1000NoCache.toFixed(0)}, с кешем ${p.per1000Cache.toFixed(0)}`);
console.log('Модель-простак без карантина:', p.naiveUnsafe);
console.log('Модель-простак с карантином:', p.naiveSafe);
