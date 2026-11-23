/**
 * Оценка ответа: детерминированный «судья» против разметки человека и каппа Коэна.
 * Судья видит вопрос, ответ и фрагменты, но не эталон: он проверяет опору на источник.
 * Метки человека поставлены автором книги по эталонным ответам.
 */
import { checkSupport, REFUSAL } from './answer.ts';
import type { Chunk } from './chunk.ts';

export type Label = 'ok' | 'bad';

export function cohenKappa(a: Label[], b: Label[]): { po: number; pe: number; kappa: number } {
  const n = a.length;
  const cats = [...new Set([...a, ...b])];
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pe = cats.reduce((s, c) => s + (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n), 0);
  // при pe = 1 ожидаемое согласие полное: оба оценщика всегда правы одинаково,
// знаменатель обращается в ноль; по конвенции считаем каппу равной 1 (расхождений нет)
  return { po, pe, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe) };
}

export interface JudgeCase { id: string; question: string; answer: string; chunks: string[]; human: Label; note: string }

export const JUDGE_CASES: JudgeCase[] = [
  { id: 'j01', question: 'q01', answer: 'Покупатель может вернуть товар ненадлежащего качества в течение 30 дней с момента получения [1].', chunks: ['ret-defect-v2#1'], human: 'ok', note: 'дословно' },
  { id: 'j02', question: 'q01', answer: 'Вернуть брак можно в течение месяца [1].', chunks: ['ret-defect-v2#1'], human: 'ok', note: 'пересказ' },
  { id: 'j03', question: 'q01', answer: 'Покупатель может вернуть товар ненадлежащего качества в течение 14 дней [1].', chunks: ['ret-defect-v1#1'], human: 'bad', note: 'устаревшая версия' },
  { id: 'j04', question: 'q04', answer: 'Заказ хранится в пункте выдачи 5 дней [1].', chunks: ['delivery-pickup-v1#1'], human: 'ok', note: 'дословно' },
  { id: 'j05', question: 'q04', answer: 'Заказ хранится в пункте выдачи 7 дней [1].', chunks: ['delivery-pickup-v1#1'], human: 'bad', note: 'чужое число' },
  { id: 'j06', question: 'q05', answer: 'Доставка бесплатна от трёх тысяч рублей [1].', chunks: ['delivery-courier-v2#1'], human: 'ok', note: 'число словами' },
  { id: 'j07', question: 'q07', answer: 'Гарантийный ремонт длится не дольше 45 дней [1].', chunks: ['warranty#1'], human: 'ok', note: 'дословно' },
  { id: 'j08', question: 'q08', answer: 'Вскрытую косметику вернуть нельзя [1].', chunks: ['ret-nonreturnable#2'], human: 'ok', note: 'сокращение' },
  { id: 'j09', question: 'q09', answer: 'Деньги возвращаются покупателю на карту [1].', chunks: ['installment#2'], human: 'bad', note: 'противоречит' },
  { id: 'j10', question: 'q10', answer: 'Бонусами можно оплатить до 30% стоимости заказа [1].', chunks: ['bonus#1'], human: 'ok', note: 'дословно' },
  { id: 'j11', question: 'q11', answer: 'Бонусы не сгорают [1].', chunks: ['bonus#2'], human: 'bad', note: 'потеряно отрицание' },
  { id: 'j12', question: 'q13', answer: 'Чек для возврата не нужен, достаточно номера заказа [1].', chunks: ['faq-return#1'], human: 'ok', note: 'дословно' },
  { id: 'j13', question: 'q15', answer: 'Подарочный сертификат нельзя обменять на деньги [1].', chunks: ['gift-cards#2'], human: 'ok', note: 'дословно' },
  { id: 'j14', question: 'q18', answer: 'Можно спросить последние четыре цифры карты [1].', chunks: ['personal-data#1'], human: 'ok', note: 'сокращение' },
  { id: 'j15', question: 'q19', answer: 'Промокоды суммируются [1].', chunks: ['promo#1'], human: 'bad', note: 'потеряно отрицание' },
  { id: 'j16', question: 'q22', answer: 'Магазин доставляет заказы в Беларусь и Казахстан [1].', chunks: ['international#1'], human: 'ok', note: 'дословно' },
  { id: 'j17', question: 'q23', answer: 'Деньги придут на карту в течение 5 рабочих дней [1].', chunks: ['refund-methods#1'], human: 'ok', note: 'пересказ' },
  { id: 'j18', question: 'q26', answer: REFUSAL, chunks: ['bonus#1'], human: 'ok', note: 'верный отказ' },
  { id: 'j19', question: 'q17', answer: REFUSAL, chunks: ['escalation#1'], human: 'bad', note: 'лишний отказ' },
  { id: 'j20', question: 'q20', answer: 'Бонусы возвращаются на бонусный счёт [1].', chunks: ['bonus#3'], human: 'ok', note: 'сокращение' },
  { id: 'j21', question: 'q21', answer: 'Юрлицо возвращает товар по акту [1].', chunks: ['legal-entity#2'], human: 'ok', note: 'сокращение слова' },
  { id: 'j22', question: 'q12', answer: 'Отменить заказ можно в любой момент [1].', chunks: ['order-cancel#2'], human: 'bad', note: 'противоречит' },
];

/** Детерминированный судья: отказ принимается, ответ должен опираться на фрагменты. */
export function strictJudge(answer: string, chunks: Chunk[]): Label {
  if (answer === REFUSAL) return 'ok';
  return checkSupport(answer, chunks).ok ? 'ok' : 'bad';
}
