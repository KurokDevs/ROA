import { sumCents, type Cents } from '@/lib/money';
import { addDays, weekStart, type ISODate } from '@/lib/dates';
import type { Account, Debt, EnvelopeEntry, Envelope, Holding, Trade, Transaction, WeeklyBudget } from '@/models/types';
import { ENVELOPE_SPENDING_TYPES, accountBalance, debtBalance } from './ledger';
import { holdingSummary } from './investments';

export interface WeekPoint {
  weekKey: ISODate;
  income: Cents;
  expenses: Cents;
  savings: Cents;
  investment: Cents;
}

/** Últimas `count` semanas terminando en la semana de `today`. */
export function weekKeys(today: ISODate, count: number): ISODate[] {
  const last = weekStart(today);
  return Array.from({ length: count }, (_, i) => addDays(last, -(count - 1 - i) * 7));
}

export function weeklySeries(txs: Transaction[], budgets: WeeklyBudget[], keys: ISODate[]): WeekPoint[] {
  const map = new Map<ISODate, WeekPoint>(keys.map((k) => [k, { weekKey: k, income: 0, expenses: 0, savings: 0, investment: 0 }]));
  for (const t of txs) {
    const p = map.get(weekStart(t.date));
    if (!p) continue;
    if (t.type === 'income') p.income += t.amount;
    if (t.type === 'expense' || t.type === 'fee') p.expenses += t.amount;
  }
  for (const b of budgets) {
    const p = map.get(b.weekKey);
    if (!p) continue;
    for (const l of b.lines) {
      if (l.tier === 'savings') p.savings += l.amount;
      if (l.tier === 'investment') p.investment += l.amount;
    }
  }
  return keys.map((k) => map.get(k)!);
}

export function categoryTotals(txs: Transaction[]): { category: string; amount: Cents }[] {
  const map = new Map<string, Cents>();
  for (const t of txs) if (t.type === 'expense' || t.type === 'fee') map.set(t.category || 'Otros', (map.get(t.category || 'Otros') ?? 0) + t.amount);
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

export interface SeasonComparison {
  low: { weeks: number; average: Cents; total: Cents };
  high: { weeks: number; average: Cents; total: Cents };
}

export function seasonComparison(budgets: WeeklyBudget[], threshold: Cents): SeasonComparison {
  const low = budgets.filter((b) => b.income < threshold);
  const high = budgets.filter((b) => b.income >= threshold);
  const agg = (list: WeeklyBudget[]) => {
    const total = sumCents(list.map((b) => b.income));
    return { weeks: list.length, total, average: list.length ? Math.round(total / list.length) : 0 };
  };
  return { low: agg(low), high: agg(high) };
}

export function topWeeks(budgets: WeeklyBudget[], n = 5): WeeklyBudget[] {
  return [...budgets].sort((a, b) => b.income - a.income || a.weekKey.localeCompare(b.weekKey)).slice(0, n);
}

/** Saldo acumulado de sobres de ahorro al cierre de cada semana. */
export function savingsSeries(envelopes: Envelope[], entries: EnvelopeEntry[], txs: Transaction[], keys: ISODate[]): { weekKey: ISODate; balance: Cents }[] {
  const ids = new Set(envelopes.filter((e) => e.tier === 'savings').map((e) => e.id));
  return keys.map((k) => {
    const end = addDays(k, 6);
    let total = 0;
    for (const e of entries) if (ids.has(e.envelopeId) && e.date <= end) total += e.amount;
    for (const t of txs) if (t.envelopeId && ids.has(t.envelopeId) && ENVELOPE_SPENDING_TYPES.includes(t.type) && t.date <= end) total -= t.amount;
    return { weekKey: k, balance: total };
  });
}

/** Patrimonio al cierre de cada semana, calculado con los datos hasta esa fecha. */
export function netWorthSeries(params: {
  accounts: Account[];
  txs: Transaction[];
  debts: Debt[];
  holdings: Holding[];
  trades: Trade[];
  keys: ISODate[];
}): { weekKey: ISODate; netWorth: Cents }[] {
  return params.keys.map((k) => {
    const end = addDays(k, 6);
    const txs = params.txs.filter((t) => t.date <= end);
    const trades = params.trades.filter((t) => t.date <= end);
    const cash = sumCents(params.accounts.map((a) => accountBalance(a, txs, trades, params.holdings)));
    const inv = sumCents(params.holdings.map((h) => holdingSummary(trades.filter((t) => t.holdingId === h.id)).marketValue));
    const debts = sumCents(params.debts.filter((d) => d.createdAt.slice(0, 10) <= end).map((d) => debtBalance(d, txs)));
    return { weekKey: k, netWorth: cash + inv - debts };
  });
}
