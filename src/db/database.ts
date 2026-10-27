import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Debt,
  Envelope,
  EnvelopeEntry,
  Goal,
  Holding,
  MileageLog,
  Settings,
  Subscription,
  Trade,
  Transaction,
  WeeklyBudget
} from '@/models/types';
import { defaultAccounts, defaultEnvelopes, defaultGoals, defaultSettings, defaultSubscriptions } from '@/data/seed';

/**
 * Base de datos local (IndexedDB vía Dexie).
 * Los datos financieros NUNCA se guardan en localStorage.
 * Esta capa está aislada en /db y /services para poder añadir más adelante
 * un adaptador de sincronización (p. ej. Supabase) sin tocar la UI.
 */
export class RoaDB extends Dexie {
  settings!: Table<Settings, string>;
  accounts!: Table<Account, string>;
  envelopes!: Table<Envelope, string>;
  entries!: Table<EnvelopeEntry, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<WeeklyBudget, string>;
  debts!: Table<Debt, string>;
  goals!: Table<Goal, string>;
  subscriptions!: Table<Subscription, string>;
  mileage!: Table<MileageLog, string>;
  holdings!: Table<Holding, string>;
  trades!: Table<Trade, string>;

  constructor(name = 'roa-finance') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      accounts: 'id, type',
      envelopes: 'id, tier, system',
      entries: 'id, envelopeId, date, budgetId, moveId',
      transactions: 'id, date, type, accountId, envelopeId, debtId, budgetId, category',
      // &weekKey = índice único: imposible guardar dos presupuestos para la misma semana.
      budgets: 'id, &weekKey, payDate',
      debts: 'id, kind',
      goals: 'id',
      subscriptions: 'id, status',
      mileage: 'id, date',
      holdings: 'id',
      trades: 'id, holdingId, date'
    });
  }
}

export const ALL_TABLES = [
  'settings',
  'accounts',
  'envelopes',
  'entries',
  'transactions',
  'budgets',
  'debts',
  'goals',
  'subscriptions',
  'mileage',
  'holdings',
  'trades'
] as const;

export type TableName = (typeof ALL_TABLES)[number];

export async function ensureSeeded(db: RoaDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const existing = await db.settings.get('main');
    if (existing) return;
    const now = new Date().toISOString();
    await db.settings.put(defaultSettings(now));
    await db.accounts.bulkPut(defaultAccounts(now));
    await db.envelopes.bulkPut(defaultEnvelopes(now));
    await db.goals.bulkPut(defaultGoals(now));
    await db.subscriptions.bulkPut(defaultSubscriptions(now));
  });
}
