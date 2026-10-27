import type { RoaDB } from '@/db/database';
import { isValidISO, nextMonthlyOccurrence, todayISO, type ISODate } from '@/lib/dates';
import { formatMoney, type Cents } from '@/lib/money';
import { uid } from '@/lib/utils';
import type { Envelope } from '@/models/types';
import { envelopeBalance } from '@/engine/ledger';
import { AppError } from './errors';

/**
 * Mover dinero entre sobres: dos movimientos internos enlazados por moveId.
 * No crea transacciones, así que no cuenta como ingreso ni como gasto.
 */
export async function moveFunds(
  db: RoaDB,
  params: { fromId: string; toId: string; amount: Cents; date: ISODate; note?: string; allowNegative?: boolean }
): Promise<string> {
  if (params.fromId === params.toId) throw new AppError('Elige dos sobres distintos.');
  if (!Number.isInteger(params.amount) || params.amount <= 0) throw new AppError('El importe debe ser mayor que cero.');
  if (!isValidISO(params.date)) throw new AppError('Fecha no válida.');
  return db.transaction('rw', [db.entries, db.transactions, db.envelopes], async () => {
    const [from, to] = await Promise.all([db.envelopes.get(params.fromId), db.envelopes.get(params.toId)]);
    if (!from || !to) throw new AppError('Sobre no encontrado.');
    const entries = await db.entries.where('envelopeId').equals(from.id).toArray();
    const txs = await db.transactions.where('envelopeId').equals(from.id).toArray();
    const balance = envelopeBalance(from.id, entries, txs);
    if (!params.allowNegative && params.amount > balance) {
      throw new AppError(`"${from.name}" solo tiene ${formatMoney(balance)} disponibles.`);
    }
    const moveId = uid('mov');
    const now = new Date().toISOString();
    const note = params.note?.trim() || `${from.name} → ${to.name}`;
    await db.entries.bulkAdd([
      { id: uid('ent'), envelopeId: from.id, date: params.date, amount: -params.amount, kind: 'move', budgetId: null, moveId, note, createdAt: now },
      { id: uid('ent'), envelopeId: to.id, date: params.date, amount: params.amount, kind: 'move', budgetId: null, moveId, note, createdAt: now }
    ]);
    return moveId;
  });
}

export async function deleteMove(db: RoaDB, moveId: string): Promise<void> {
  await db.entries.where('moveId').equals(moveId).delete();
}

/** Fija el saldo de un sobre (p. ej. dinero que ya tenías apartado al empezar). */
export async function setEnvelopeBalance(db: RoaDB, envelopeId: string, newBalance: Cents, date: ISODate, note = 'Ajuste de saldo'): Promise<void> {
  await db.transaction('rw', [db.entries, db.transactions], async () => {
    const entries = await db.entries.where('envelopeId').equals(envelopeId).toArray();
    const txs = await db.transactions.where('envelopeId').equals(envelopeId).toArray();
    const diff = newBalance - envelopeBalance(envelopeId, entries, txs);
    if (diff === 0) return;
    await db.entries.add({ id: uid('ent'), envelopeId, date, amount: diff, kind: 'adjust', budgetId: null, moveId: null, note, createdAt: new Date().toISOString() });
  });
}

export function newEnvelope(partial: Partial<Envelope> & Pick<Envelope, 'name' | 'tier' | 'method'>): Envelope {
  return {
    id: uid('env'),
    icon: 'wallet',
    weeklyAmount: 0,
    billAmount: 0,
    billFrequency: 'monthly',
    dueDay: null,
    nextDueDate: null,
    targetAmount: 0,
    minBeforeInvest: 0,
    isVehicle: false,
    system: null,
    priority: 10,
    archived: false,
    createdAt: new Date().toISOString(),
    ...partial
  };
}

export async function saveEnvelope(db: RoaDB, envelope: Envelope, today: ISODate = todayISO()): Promise<Envelope> {
  if (!envelope.name.trim()) throw new AppError('El sobre necesita un nombre.');
  if (envelope.dueDay !== null && (envelope.dueDay < 1 || envelope.dueDay > 31)) throw new AppError('El día de vencimiento debe estar entre 1 y 31.');
  const existing = await db.envelopes.get(envelope.id);
  let nextDueDate = envelope.nextDueDate;
  if (envelope.method === 'bill' && envelope.dueDay && (!existing || existing.dueDay !== envelope.dueDay || !nextDueDate)) {
    nextDueDate = nextMonthlyOccurrence(today, envelope.dueDay);
  }
  if (!envelope.dueDay) nextDueDate = envelope.billFrequency === 'yearly' ? envelope.nextDueDate : null;
  const record = { ...envelope, name: envelope.name.trim(), nextDueDate };
  await db.envelopes.put(record);
  return record;
}

export async function archiveEnvelope(db: RoaDB, id: string, archived = true): Promise<void> {
  const env = await db.envelopes.get(id);
  if (!env) return;
  if (env.system && archived && ['debts', 'investment', 'subscriptions'].includes(env.system)) {
    throw new AppError('Este sobre es parte del sistema y no se puede archivar.');
  }
  await db.envelopes.update(id, { archived });
}
