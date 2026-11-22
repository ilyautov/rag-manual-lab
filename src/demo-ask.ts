/** npm run ask -- "вопрос" [--senior] : трасса одного вопроса через весь конвейер. */
import { answerQuestion, DEFAULT } from './pipeline.ts';
import { ENGINE } from './experiments.ts';

const args = process.argv.slice(2);
const q = args.filter((a) => !a.startsWith('--')).join(' ') || 'Сколько дней у покупателя на возврат товара ненадлежащего качества?';
const t = answerQuestion(ENGINE, q, { ...DEFAULT, role: args.includes('--senior') ? 'senior' : 'all' });
console.log(`Вопрос: ${q}`);
console.log('Кандидаты после реранкинга:');
for (const h of t.hits.slice(0, 5)) console.log(`  ${h.score.toFixed(3)}  ${h.id}`);
console.log(`Контекст (${t.contextTokens} ток.):`);
t.context.forEach((c, i) => console.log(`  [${i + 1}] ${c.id}: ${c.text.slice(0, 90)}…`));
console.log(`Ответ: ${t.answer}`);
console.log(`Опора на источники: ${t.supported ? 'да' : 'нет'}`);
