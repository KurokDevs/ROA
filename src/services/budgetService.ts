import type { RoaDB } from '@/db/database';
import { addDays, isValidISO, weekStart, type ISODate } from '@/lib/dates';
import type { Cents } from '@/lib/money';
import { uid } from '@/lib/utils';
import type { BudgetLine, BudgetMode, Transaction, WeeklyBudget } from '@/models/types';
import { allocationsByEnvelope, buildPlan, summarizeLines, validateLines, type PlanInput, type PlanResult } from '@/engine/allocation';
import { debtBalance, envelopeBalances } from '@/engine/ledger';
import { summarizeSubscriptions } from '@/engine/subscriptions';
import { AppError, DuplicateBudgetError } from './errors';

/**
 * Reúne el estado actual (saldos de sobres, deudas, suscripciones, ajustes)
 * para alimentar al organizador. Al editar un presupuesto histórico se excluyen
 * sus propias reservas para no contarlas dos veces.
 */
export async function loadPlanInput(db: RoaDB, income: Cents, payDate: ISODate, excludeBudgetId?: string): Promise<PlanInput> {
  const [settings, envelopes, entries, txs, debts, subs] = await Promise.all([
    db.settings.get('main'),
    db.envelopes.toArray(),
    db.entries.toArray(),
    db.transactions.toArray(),
    db.debts.toArray(),
    db.subscriptions.toArray()
  ]);
  if (!settings) throw new AppError('La aplicación no está inicializada.');
  const relevantEntries = excludeBudgetId ? entries.filter((e) => e.budgetId !== excludeBudgetId) : entries;
  const balances = envelopeBalances(relevantEntries, txs);
  return {
    income,
    payDate,
    paydayWeekday: settings.paydayWeekday,
    taxMode: settings.taxMode,
    taxRate: settings.taxRate,
    envelopes: envelopes.map((envelope) => ({ envelope, balance: balances.get(envelope.id) ?? 0 })),
    debts: debts.map((debt) => ({ debt, balance: debtBalance(debt, txs) })),
    subscriptionsMonthly: summarizeSubscriptions(subs).monthlyCharging,
    surplusToSavingsRate: settings.surplusToSavingsRate,
    surplusToInvestRate: settings.surplusToInvestRate
  };
}

export async function proposePlan(db: RoaDB, income: Cents, payDate: ISODate, excludeBudgetId?: string): Promise<PlanResult> {
  return buildPlan(await loadPlanInput(db, income, payDate, excludeBudgetId));
}

export interface ConfirmBudgetParams {
  /** Si se indica, se edita ese presupuesto (registro histórico). */
  id?: string;
  payDate: ISODate;
  income: Cents;
  grossIncome?: Cents | null;
  withholdings?: Cents | null;
  lines: BudgetLine[];
  mode: BudgetMode;
  deficit: Cents;
  accountId: string;
  note?: string;
}

/**
 * Confirma (o reedita) el presupuesto semanal de forma atómica:
 *  - registra el ingreso como transacción,
 *  - crea los movimientos de reserva en cada sobre,
 *  - guarda el presupuesto con clave única por semana (sin duplicados).
 */
export async function confirmBudget(db: RoaDB, params: ConfirmBudgetParams): Promise<WeeklyBudget> {
  if (!isValidISO(params.payDate)) throw new AppError('Fecha de cobro no válida.');
  const error = validateLines(params.income, params.lines);
  if (error) throw new AppError(error);
  const weekKey = weekStart(params.payDate);
  const now = new Date().toISOString();

  return db.transaction('rw', [db.budgets, db.entries, db.transactions, db.envelopes, db.settings], async () => {
    const settings = await db.settings.get('main');
    if (!settings) throw new AppError('La aplicación no está inicializada.');

    const clash = await db.budgets.where('weekKey').equals(weekKey).first();
    if (clash && clash.id !== params.id) throw new DuplicateBudgetError(weekKey, clash.id);

    const envelopeIds = new Set((await db.envelopes.toArray()).map((e) => e.id));
    for (const l of params.lines) if (!envelopeIds.has(l.envelopeId)) throw new AppError(`El sobre de "${l.label}" ya no existe.`);

    let existing: WeeklyBudget | undefined;
    if (params.id) {
      existing = await db.budgets.get(params.id);
      if (!existing) throw new AppError('El presupuesto que intentas editar no existe.');
      await db.entries.where('budgetId').equals(existing.id).delete();
    }

    const budgetId = existing?.id ?? uid('bud');
    const incomeTxId = existing?.incomeTxId ?? uid('tx');
    const incomeTx: Transaction = {
      id: incomeTxId,
      date: params.payDate,
      type: 'income',
      amount: params.income,
      accountId: params.accountId,
      toAccountId: null,
      envelopeId: null,
      category: 'Trabajo delivery',
      description: `Cobro semanal${params.note ? ` · ${params.note}` : ''}`,
      debtId: null,
      budgetId,
      isBusiness: false,
      isBillPayment: false,
      createdAt: existing ? (await db.transactions.get(incomeTxId))?.createdAt ?? now : now,
      updatedAt: now
    };
    await db.transactions.put(incomeTx);

    const allocations = allocationsByEnvelope(params.lines);
    await db.entries.bulkAdd(
      [...allocations.entries()].map(([envelopeId, amount]) => ({
        id: uid('ent'),
        envelopeId,
        date: params.payDate,
        amount,
        kind: 'allocation' as const,
        budgetId,
        moveId: null,
        note: `Reserva semana ${weekKey}`,
        createdAt: now
      }))
    );

    const summary = summarizeLines(params.income, params.lines);
    // Conservar el estado "transferido" de las líneas que siguen existiendo al editar.
    const previous = new Map(existing?.lines.map((l) => [l.key, l]) ?? []);
    const lines = params.lines.map((l) => {
      const prev = previous.get(l.key);
      return prev && prev.amount === l.amount ? { ...l, transferred: prev.transferred, transferredAt: prev.transferredAt } : { ...l };
    });

    const budget: WeeklyBudget = {
      id: budgetId,
      weekKey,
      payDate: params.payDate,
      income: params.income,
      grossIncome: params.grossIncome ?? null,
      withholdings: params.withholdings ?? null,
      taxMode: settings.taxMode,
      taxRate: settings.taxRate,
      mode: params.mode,
      lines,
      unassigned: summary.unassigned,
      deficit: params.deficit,
      accountId: params.accountId,
      incomeTxId,
      note: params.note ?? '',
      createdAt: existing?.createdAt ?? now,
      confirmedAt: existing?.confirmedAt ?? now,
      updatedAt: now
    };
    await db.budgets.put(budget);
    return budget;
  });
}

export async function deleteBudget(db: RoaDB, id: string): Promise<void> {
  await db.transaction('rw', [db.budgets, db.entries, db.transactions], async () => {
    const b = await db.budgets.get(id);
    if (!b) return;
    await db.entries.where('budgetId').equals(id).delete();
    await db.transactions.delete(b.incomeTxId);
    await db.budgets.delete(id);
  });
}

/** Marca que el dinero de una línea se movió realmente en el banco (plan ≠ transferencia). */
export async function setLineTransferred(db: RoaDB, budgetId: string, key: string, transferred: boolean): Promise<void> {
  await db.transaction('rw', db.budgets, async () => {
    const b = await db.budgets.get(budgetId);
    if (!b) throw new AppError('Presupuesto no encontrado.');
    const lines = b.lines.map((l) => (l.key === key ? { ...l, transferred, transferredAt: transferred ? new Date().toISOString() : null } : l));
    await db.budgets.update(budgetId, { lines, updatedAt: new Date().toISOString() });
  });
}

export async function getBudgetForWeek(db: RoaDB, date: ISODate): Promise<WeeklyBudget | undefined> {
  return db.budgets.where('weekKey').equals(weekStart(date)).first();
}

export async function previousBudget(db: RoaDB, date: ISODate): Promise<WeeklyBudget | undefined> {
  return db.budgets.where('weekKey').equals(addDays(weekStart(date), -7)).first();
}
