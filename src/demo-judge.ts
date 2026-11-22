/** npm run judge : судья против человека и разложение сбоев. */
import { judgeAgreement, answerQuality } from './experiments.ts';

const j = judgeAgreement();
console.log(`Совпадение ${(j.po * 100).toFixed(0)}%, случайное ${(j.pe * 100).toFixed(0)}%, каппа ${j.kappa.toFixed(2)}`);
for (const r of j.rows.filter((x) => x.human !== x.judge)) console.log(`  расхождение ${r.id}: человек ${r.human}, судья ${r.judge} (${r.note})`);
const a = answerQuality();
console.log(`Верно ${a.correct} из ${a.total}; сбои: ${a.failures.join(', ')}`);
