import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { sumCents, type Cents } from '@/lib/money';
import { todayISO } from '@/lib/dates';
import type { Account, Debt, Envelope, EnvelopeEntry, Goal, Holding, MileageLog, Settings, Subscription, Trade, Transaction, WeeklyBudget } from '@/models/types';
import { accountBalance, debtBalance, envelopeBalances, liquidCash, netWorth, type NetWorthBreakdown } from '@/engine/ledger';

export interface FinanceData {
  ready: boolean;
  settings: Settings | undefined;
  accounts: Account[];
  envelopes: Envelope[];
  entries: EnvelopeEntry[];
  transactions: Transaction[];
  budgets: WeeklyBudget[];
  debts: Debt[];
  goals: Goal[];
  subscriptions: Subscription[];
  mileage: MileageLog[];
  holdings: Holding[];
  trades: Trade[];
  balances: Map<string, Cents>;
  accountBalances: Map<string, Cents>;
  debtBalances: Map<string, Cents>;
  /** Total apartado en sobres (solo saldos positivos). */
  reserved: Cents;
  liquid: Cents;
  /** Dinero realmente libre: efectivo líquido − reservado en sobres. */
  available: Cents;
  worth: NetWorthBreakdown;
  today: string;
}

/**
 * Lee toda la base local de forma reactiva (useLiveQuery) y calcula los saldos
 * derivados. Con el volumen de un usuario individual esto es instantáneo.
 */
export function useFinance(): FinanceData {
  const raw = useLiveQuery(async () => {
    const [settings, accounts, envelopes, entries, transactions, budgets, debts, goals, subscriptions, mileage, holdings, trades] = await Promise.all([
      db.settings.get('main'),
      db.accounts.toArray(),
      db.envelopes.toArray(),
      db.entries.toArray(),
      db.transactions.toArray(),
      db.budgets.orderBy('payDate').toArray(),
      db.debts.toArray(),
      db.goals.toArray(),
      db.subscriptions.toArray(),
      db.mileage.toArray(),
      db.holdings.toArray(),
      db.trades.toArray()
    ]);
    return { settings, accounts, envelopes, entries, transactions, budgets, debts, goals, subscriptions, mileage, holdings, trades };
  }, []);

  return useMemo(() => {
    const today = todayISO();
    const empty = {
      settings: undefined,
      accounts: [],
      envelopes: [],
      entries: [],
      transactions: [],
      budgets: [],
      debts: [],
      goals: [],
      subscriptions: [],
      mileage: [],
      holdings: [],
      trades: []
    };
    const d = raw ?? empty;
    const balances = envelopeBalances(d.entries, d.transactions);
    const accountBalances = new Map(d.accounts.map((a) => [a.id, accountBalance(a, d.transactions, d.trades, d.holdings)]));
    const debtBalances = new Map(d.debts.map((x) => [x.id, debtBalance(x, d.transactions)]));
    const activeEnvelopeIds = new Set(d.envelopes.map((e) => e.id));
    const reserved = sumCents([...balances.entries()].filter(([id, v]) => activeEnvelopeIds.has(id) && v > 0).map(([, v]) => v));
    const liquid = liquidCash(d.accounts, d.transactions);
    const worth = netWorth({ accounts: d.accounts, txs: d.transactions, debts: d.debts, holdings: d.holdings, trades: d.trades, envelopeTotal: reserved });
    return {
      ready: raw !== undefined,
      ...d,
      balances,
      accountBalances,
      debtBalances,
      reserved,
      liquid,
      available: liquid - reserved,
      worth,
      today
    };
  }, [raw]);
}
