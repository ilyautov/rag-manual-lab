/** npm run answer : проверка опоры на источники и порог отказа. */
import { answerChecks, thresholdSweep } from './experiments.ts';

for (const c of answerChecks()) console.log(`${c.id.padEnd(9)} опора: ${c.ok ? 'да ' : 'нет'}  доля слов: ${c.shares.map((s) => s.toFixed(2)).join('/')}  чужие числа: ${c.missing.join(',') || '-'}`);
for (const t of thresholdSweep()) console.log(`tau ${t.tau}: верно ${t.correct}, ответ без основания ${t.falseAns}, лишний отказ ${t.overRefuse}`);
