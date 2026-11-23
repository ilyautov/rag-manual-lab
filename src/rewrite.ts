/**
 * Переписывание запроса: разговорные слова оператора заменяются словами регламентов.
 * Словарь явный и детерминированный, никакой модели. Замена идёт по началу слова,
 * поэтому охватывает падежи («баллами», «ремонтируют», «юрлица»).
 */

/** Ключ: начало слова из живой речи. Значение: слова корпуса «Полки». */
const RULES: ReadonlyArray<readonly [string, string]> = [
  ['балл', 'бонусы'],
  ['ремонтир', 'ремонт'],
  ['юрлиц', 'юридическое лицо'],
  ['брак', 'ненадлежащего качества'],
  ['сда', 'вернуть'],
  ['карточк', 'карта'],
];

/** Один вариант запроса: слова, у которых нашлось правило, заменены. */
export function rewriteQuery(query: string): string {
  const isWord = (ch: string) => /\p{L}|\p{N}/u.test(ch);
  let out = '';
  let word = '';
  const flush = () => {
    if (!word) return;
    const rule = RULES.find(([key]) => word.toLowerCase().startsWith(key));
    out += rule ? rule[1] : word;
    word = '';
  };
  for (const ch of query) {
    if (isWord(ch)) word += ch;
    else { flush(); out += ch; }
  }
  flush();
  return out.replace(/\s+/g, ' ').trim();
}

/** Варианты для поиска: сначала переписанный, затем исходный. Дубли убраны. */
export function expandQuery(query: string): string[] {
  const rewritten = rewriteQuery(query);
  return rewritten === query ? [query] : [rewritten, query];
}
