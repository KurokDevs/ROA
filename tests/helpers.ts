import { defaultEnvelopes, defaultSettings } from '@/data/seed';
import type { PlanInput } from '@/engine/allocation';
import type { Debt, Envelope } from '@/models/types';
import type { Cents } from '@/lib/money';
import { RoaDB, ensureSeeded } from '@/db/database';

export const NOW = '2026-01-01T00:00:00.000Z';

export function seedEnvelopes(overrides: Record<string, Partial<Envelope>> = {}): Envelope[] {
  return defaultEnvelopes(NOW).map((e) => ({ ...e, ...(overrides[e.id] ?? {}) }));
}

/** Suscripciones semilla con frecuencia confirmada: 16.23 + 34.46 + 9.99 = 60.68/mes */
export const SEED_SUBS_MONTHLY = 6068;

export function planInput(
  income: Cents,
  opts: {
    payDate?: string;
    balances?: Record<string, Cents>;
    envelopes?: Envelope[];
    debts?: { debt: Debt; balance: Cents }[];
    subscriptionsMonthly?: Cents;
  } = {}
): PlanInput {
  const s = defaultSettings(NOW);
  const envelopes = opts.envelopes ?? seedEnvelopes();
  return {
    income,
    payDate: opts.payDate ?? '2026-11-06',
    paydayWeekday: s.paydayWeekday,
    envelopes: envelopes.map((envelope) => ({ envelope, balance: opts.balances?.[envelope.id] ?? 0 })),
    debts: opts.debts ?? [],
    subscriptionsMonthly: opts.subscriptionsMonthly ?? SEED_SUBS_MONTHLY,
    surplusToSavingsRate: s.surplusToSavingsRate,
    surplusToInvestRate: s.surplusToInvestRate
  };
}

export function debt(partial: Partial<Debt> & Pick<Debt, 'id' | 'originalAmount'>): Debt {
  return { name: 'Deuda', kind: 'debt', weeklyPayment: 0, dueDate: null, sourceTxId: null, closed: false, notes: '', createdAt: NOW, ...partial };
}

let counter = 0;
export async function freshDb(): Promise<RoaDB> {
  counter++;
  const db = new RoaDB(`roa-test-${counter}-${Math.random().toString(36).slice(2)}`);
  await ensureSeeded(db);
  return db;
}

export const amountOf = (lines: { key: string; amount: number }[], key: string) => lines.find((l) => l.key === key)?.amount ?? 0;
