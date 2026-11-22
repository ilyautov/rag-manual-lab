/** npm run prepare:demo : очистка выгрузки, дубликаты, метаданные. */
import { corpusStats } from './experiments.ts';
import { prepare } from './prepare.ts';

const c = corpusStats();
const r = prepare();
console.log(`Сырых документов: ${c.rawDocs}, после подготовки: ${c.docs}`);
console.log('Колонтитулы, найденные по частоте:', r.boiler);
console.log('Дубликаты:', r.duplicates);
console.log(`Выгрузка PDF: ${c.sampleRawChars} → ${c.sampleCleanChars} символов\n${c.sampleClean}`);
console.log('Метаданные первого документа:', { ...r.docs[1], text: '…', sections: r.docs[1].sections.length });
