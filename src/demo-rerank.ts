/** npm run rerank : MMR и бюджет контекста. */
import { mmrExample, budgetExperiment, edgesExample } from './experiments.ts';

const m = mmrExample();
console.log(`«${m.query}» без MMR: ${m.plain.join(', ')} (${m.plainDocs} док.)`);
console.log(`с MMR: ${m.diverse.join(', ')} (${m.diverseDocs} док.)`);
for (const b of budgetExperiment()) console.log(`бюджет ${b.budget}: ответ в контексте ${(b.inCtx * 100).toFixed(0)}%, в среднем ${b.tokens.toFixed(0)} токенов`);
console.log('Порядок по краям для 1..5:', edgesExample());
