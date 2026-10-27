import type { RoaDB } from '@/db/database';
import { addDays, addMonths, addYears, isValidISO, type ISODate } from '@/lib/dates';
import { formatMoney, type Cents } from '@/lib/money';
import { uid } from '@/lib/utils';
import type { Debt, Envelope, Transaction, TxType } from '@/models/types';
import { VEHICLE_CATEGORIES } from '@/models/types';
import { effectiveDueDate } from '@/engine/allocation';
import { debtBalance, envelopeBalance } from '@/engine/ledger';
import { AppError } from './errors';

export interface TxDraft {
  date: ISODate;
  type: TxType;
  amount: Cents;
  accountId: string;
  toAccountId?: string | null;
  envelopeId?: string | null;
  category?: string;
  description?: string;
  debtId?: string | null;
  isBusiness?: boolean;
  isBillPayment?: boolean;
  /** Para adelantos recibidos: nombre de quién adelanta y pago semanal pactado. */
  advanceName?: string;
  advanceWeeklyPayment?: Cents;
  advanceDueDate?: ISODate | null;
}

export interface SaveTxResult {
  tx: Transaction;
  warnings: string[];
}

const DEFAULT_CATEGORY: Record<TxType, string> = {
  income: 'Trabajo delivery',
  expense: 'Otros',
  transfer: 'Transferencia',
  debt_payment: 'Deudas',
  advance_received: 'Adelanto',
  advance_repaid: 'Deudas',
  fee: 'Comisiones',
  contribution: 'Ahorro'
};

/** Próximo vencimiento tras pagar una factura (sirve también para pagos anticipados). */
export function advanceDueDate(env: Envelope, paidOn: ISODate): ISODate | null {
  const due = effectiveDueDate(env, paidOn);
  if (!due) return null;
  if (env.billFrequency === 'yearly') return addYears(due, 1);
  if (env.billFrequency === 'weekly') return addDays(due, 7);
  return addMonths(due, 1, env.dueDay ?? undefined);
}

export function validateDraft(d: TxDraft): string | null {
  if (!isValidISO(d.date)) return 'Fecha no válida.';
  if (!Number.isInteger(d.amount) || d.amount <= 0) return 'El importe debe ser mayor que cero.';
  if (!d.accountId) return 'Selecciona una cuenta.';
  if ((d.type === 'transfer' || d.type === 'contribution') && !d.toAccountId) return 'Selecciona la cuenta de destino.';
  if ((d.type === 'transfer' || d.type === 'contribution') && d.toAccountId === d.accountId) return 'La cuenta de origen y destino no pueden ser la misma.';
  if ((d.type === 'debt_payment' || d.type === 'advance_repaid') && !d.debtId) return 'Selecciona la deuda o adelanto que pagas.';
  return null;
}

export async function saveTransaction(db: RoaDB, draft: TxDraft, id?: string): Promise<SaveTxResult> {
  const error = validateDraft(draft);
  if (error) throw new AppError(error);
  const now = new Date().toISOString();
  const warnings: string[] = [];

  return db.transaction('rw', [db.transactions, db.debts, db.envelopes, db.entries], async () => {
    const existing = id ? await db.transactions.get(id) : undefined;
    if (id && !existing) throw new AppError('El movimiento ya no existe.');
    if (existing?.budgetId) throw new AppError('Este ingreso pertenece a un presupuesto semanal: edítalo desde Mi Semana.');
    if (existing && existing.type !== draft.type && (existing.type === 'advance_received' || draft.type === 'advance_received')) {
      throw new AppError('No se puede cambiar el tipo de un adelanto. Elimínalo y créalo de nuevo.');
    }

    const usesEnvelope = ['expense', 'fee', 'debt_payment', 'advance_repaid', 'contribution'].includes(draft.type);
    let envelopeId = usesEnvelope ? draft.envelopeId ?? null : null;
    if (!envelopeId && (draft.type === 'debt_payment' || draft.type === 'advance_repaid')) envelopeId = 'env_debts';
    if (envelopeId && !(await db.envelopes.get(envelopeId))) envelopeId = null;

    const txId = existing?.id ?? uid('tx');
    let debtId = draft.debtId ?? null;

    if (draft.type === 'advance_received') {
      if (existing?.debtId) {
        await db.debts.update(existing.debtId, {
          originalAmount: draft.amount,
          name: draft.advanceName || 'Adelanto',
          weeklyPayment: draft.advanceWeeklyPayment ?? 0,
          dueDate: draft.advanceDueDate ?? null
        });
        debtId = existing.debtId;
      } else {
        const debt: Debt = {
          id: uid('debt'),
          name: draft.advanceName || draft.description || 'Adelanto',
          kind: 'advance',
          originalAmount: draft.amount,
          weeklyPayment: draft.advanceWeeklyPayment ?? 0,
          dueDate: draft.advanceDueDate ?? null,
          sourceTxId: txId,
          closed: false,
          notes: '',
          createdAt: now
        };
        await db.debts.add(debt);
        debtId = debt.id;
      }
    }

    if (debtId && (draft.type === 'debt_payment' || draft.type === 'advance_repaid')) {
      const debt = await db.debts.get(debtId);
      if (!debt) throw new AppError('La deuda seleccionada no existe.');
      const others = (await db.transactions.where('debtId').equals(debtId).toArray()).filter((t) => t.id !== txId);
      const balance = debtBalance(debt, others);
      if (draft.amount > balance) warnings.push(`El pago supera el saldo pendiente (${formatMoney(balance)}).`);
    }

    const env = envelopeId ? await db.envelopes.get(envelopeId) : undefined;
    const category = draft.category || DEFAULT_CATEGORY[draft.type];
    if (env) {
      const entries = await db.entries.where('envelopeId').equals(env.id).toArray();
      const txs = (await db.transactions.where('envelopeId').equals(env.id).toArray()).filter((t) => t.id !== txId);
      const balance = envelopeBalance(env.id, entries, txs);
      if (draft.amount > balance) warnings.push(`El sobre "${env.name}" solo tenía ${formatMoney(balance)}: quedará en negativo.`);
      if (env.isVehicle && (draft.type === 'expense' || draft.type === 'fee') && !VEHICLE_CATEGORIES.includes(category)) {
        warnings.push(`Estás usando "${env.name}" (fondo del vehículo, herramienta de trabajo) para un gasto personal.`);
      }
    }

    const tx: Transaction = {
      id: txId,
      date: draft.date,
      type: draft.type,
      amount: draft.amount,
      accountId: draft.accountId,
      toAccountId: draft.type === 'transfer' || draft.type === 'contribution' ? draft.toAccountId ?? null : null,
      envelopeId,
      category,
      description: draft.description?.trim() ?? '',
      debtId,
      budgetId: null,
      isBusiness: draft.isBusiness ?? false,
      isBillPayment: (draft.isBillPayment ?? false) && !!env && env.method === 'bill',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await db.transactions.put(tx);

    // Pagar una factura (≠ apartar): solo al crear, para no avanzar dos veces el vencimiento.
    if (!existing && tx.isBillPayment && env) {
      const next = advanceDueDate(env, tx.date);
      if (next) await db.envelopes.update(env.id, { nextDueDate: next });
    }

    if (debtId && (tx.type === 'debt_payment' || tx.type === 'advance_repaid')) {
      const debt = await db.debts.get(debtId);
      if (debt) {
        const all = await db.transactions.where('debtId').equals(debtId).toArray();
        await db.debts.update(debtId, { closed: debtBalance(debt, all) === 0 });
      }
    }

    return { tx, warnings };
  });
}

export async function deleteTransaction(db: RoaDB, id: string): Promise<void> {
  await db.transaction('rw', [db.transactions, db.debts], async () => {
    const tx = await db.transactions.get(id);
    if (!tx) return;
    if (tx.budgetId) throw new AppError('Este ingreso pertenece a un presupuesto semanal: elimínalo desde Mi Semana.');
    if (tx.type === 'advance_received' && tx.debtId) {
      const payments = (await db.transactions.where('debtId').equals(tx.debtId).toArray()).filter((t) => t.id !== id);
      if (payments.length > 0) throw new AppError('Este adelanto ya tiene devoluciones registradas. Elimínalas primero.');
      await db.debts.delete(tx.debtId);
    }
    await db.transactions.delete(id);
    if (tx.debtId && (tx.type === 'debt_payment' || tx.type === 'advance_repaid')) {
      const debt = await db.debts.get(tx.debtId);
      if (debt) {
        const all = await db.transactions.where('debtId').equals(tx.debtId).toArray();
        await db.debts.update(tx.debtId, { closed: debtBalance(debt, all) === 0 });
      }
    }
  });
}

export async function saveDebt(db: RoaDB, debt: Omit<Debt, 'id' | 'createdAt' | 'sourceTxId' | 'closed'> & { id?: string }): Promise<Debt> {
  if (!debt.name.trim()) throw new AppError('Ponle un nombre a la deuda.');
  if (debt.originalAmount <= 0) throw new AppError('El importe debe ser mayor que cero.');
  const existing = debt.id ? await db.debts.get(debt.id) : undefined;
  const record: Debt = {
    ...debt,
    id: existing?.id ?? uid('debt'),
    name: debt.name.trim(),
    sourceTxId: existing?.sourceTxId ?? null,
    closed: existing?.closed ?? false,
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };
  await db.debts.put(record);
  return record;
}
