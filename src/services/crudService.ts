import type { RoaDB } from '@/db/database';
import { isValidISO, todayISO } from '@/lib/dates';
import Decimal from 'decimal.js';
import { uid } from '@/lib/utils';
import type { Account, Goal, Holding, MileageLog, Settings, Subscription, Trade } from '@/models/types';
import { cancelSubscription } from '@/engine/subscriptions';
import { AppError } from './errors';

const now = () => new Date().toISOString();

export async function updateSettings(db: RoaDB, patch: Partial<Settings>): Promise<void> {
  if (patch.taxRate !== undefined) {
    const r = new Decimal(patch.taxRate || 0);
    if (r.isNeg() || r.gt(0.6)) throw new AppError('La reserva fiscal debe estar entre 0 % y 60 %.');
  }
  for (const k of ['surplusToSavingsRate', 'surplusToInvestRate'] as const) {
    if (patch[k] !== undefined) {
      const r = new Decimal(patch[k] || 0);
      if (r.isNeg() || r.gt(1)) throw new AppError('Los porcentajes deben estar entre 0 % y 100 %.');
    }
  }
  await db.settings.update('main', patch);
}

export async function saveGoal(db: RoaDB, goal: Omit<Goal, 'id' | 'createdAt' | 'archived'> & { id?: string; archived?: boolean }): Promise<Goal> {
  if (!goal.name.trim()) throw new AppError('La meta necesita un nombre.');
  if (goal.target <= 0) throw new AppError('El importe objetivo debe ser mayor que cero.');
  if (goal.type === 'envelope' && goal.envelopeIds.length === 0) throw new AppError('Elige al menos un sobre para la meta.');
  const existing = goal.id ? await db.goals.get(goal.id) : undefined;
  const record: Goal = { ...goal, name: goal.name.trim(), id: existing?.id ?? uid('goal'), archived: goal.archived ?? false, createdAt: existing?.createdAt ?? now() };
  await db.goals.put(record);
  return record;
}

export async function saveSubscription(db: RoaDB, sub: Omit<Subscription, 'id' | 'createdAt'> & { id?: string }): Promise<Subscription> {
  if (!sub.name.trim()) throw new AppError('Indica el nombre del servicio.');
  if (sub.price < 0) throw new AppError('El precio no puede ser negativo.');
  if (sub.renewalDate && !isValidISO(sub.renewalDate)) throw new AppError('Fecha de renovación no válida.');
  const existing = sub.id ? await db.subscriptions.get(sub.id) : undefined;
  const record: Subscription = { ...sub, name: sub.name.trim(), id: existing?.id ?? uid('sub'), createdAt: existing?.createdAt ?? now() };
  if (record.status === 'cancelled' && !record.cancelledAt) record.cancelledAt = todayISO();
  if (record.status !== 'cancelled') record.cancelledAt = null;
  await db.subscriptions.put(record);
  return record;
}

export async function markSubscriptionCancelled(db: RoaDB, id: string, date = todayISO()): Promise<void> {
  const sub = await db.subscriptions.get(id);
  if (!sub) throw new AppError('Suscripción no encontrada.');
  await db.subscriptions.put(cancelSubscription(sub, date));
}

export async function saveAccount(db: RoaDB, account: Omit<Account, 'id' | 'createdAt' | 'archived'> & { id?: string; archived?: boolean }): Promise<Account> {
  if (!account.name.trim()) throw new AppError('La cuenta necesita un nombre.');
  const existing = account.id ? await db.accounts.get(account.id) : undefined;
  const record: Account = { ...account, name: account.name.trim(), id: existing?.id ?? uid('acc'), archived: account.archived ?? false, createdAt: existing?.createdAt ?? now() };
  await db.accounts.put(record);
  return record;
}

export async function saveMileage(db: RoaDB, log: Omit<MileageLog, 'id' | 'createdAt'> & { id?: string }): Promise<MileageLog> {
  if (!isValidISO(log.date)) throw new AppError('Fecha no válida.');
  let miles: Decimal;
  try {
    miles = new Decimal(log.miles);
  } catch {
    throw new AppError('Millas no válidas.');
  }
  if (miles.lte(0)) throw new AppError('Las millas deben ser mayores que cero.');
  const existing = log.id ? await db.mileage.get(log.id) : undefined;
  const record: MileageLog = { ...log, miles: miles.toString(), id: existing?.id ?? uid('mi'), createdAt: existing?.createdAt ?? now() };
  await db.mileage.put(record);
  return record;
}

export async function saveHolding(db: RoaDB, h: Omit<Holding, 'id' | 'createdAt' | 'archived'> & { id?: string; archived?: boolean }): Promise<Holding> {
  if (!h.symbol.trim()) throw new AppError('Indica el símbolo (p. ej. VOO).');
  const existing = h.id ? await db.holdings.get(h.id) : undefined;
  const record: Holding = { ...h, symbol: h.symbol.trim().toUpperCase(), id: existing?.id ?? uid('hold'), archived: h.archived ?? false, createdAt: existing?.createdAt ?? now() };
  await db.holdings.put(record);
  return record;
}

export async function saveTrade(db: RoaDB, t: Omit<Trade, 'id' | 'createdAt'> & { id?: string }): Promise<Trade> {
  if (!isValidISO(t.date)) throw new AppError('Fecha no válida.');
  let shares: Decimal;
  let price: Decimal;
  try {
    shares = new Decimal(t.shares || 0);
    price = new Decimal(t.price || 0);
  } catch {
    throw new AppError('Cantidad o precio no válidos.');
  }
  if (price.lte(0)) throw new AppError('El precio debe ser mayor que cero.');
  if (t.type !== 'valuation' && shares.lte(0)) throw new AppError('El número de acciones debe ser mayor que cero.');
  const existing = t.id ? await db.trades.get(t.id) : undefined;
  const record: Trade = { ...t, shares: shares.toString(), price: price.toString(), id: existing?.id ?? uid('trd'), createdAt: existing?.createdAt ?? now() };
  await db.trades.put(record);
  return record;
}
