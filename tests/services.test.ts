import { beforeEach, describe, expect, it } from 'vitest';
import type { RoaDB } from '@/db/database';
import { confirmBudget, deleteBudget, proposePlan, setLineTransferred } from '@/services/budgetService';
import { deleteTransaction, saveDebt, saveTransaction } from '@/services/transactionService';
import { moveFunds, saveEnvelope, setEnvelopeBalance } from '@/services/envelopeService';
import { exportBackup, importBackup, parseBackup, transactionsToCSV } from '@/services/backupService';
import { markSubscriptionCancelled } from '@/services/crudService';
import { DuplicateBudgetError } from '@/services/errors';
import { debtBalance, envelopeBalances, flowTotals, accountBalance, netWorth } from '@/engine/ledger';
import { summarizeSubscriptions } from '@/engine/subscriptions';
import { goalCurrent } from '@/engine/goals';
import { amountOf, freshDb } from './helpers';

let db: RoaDB;
beforeEach(async () => {
  db = await freshDb();
});

async function confirmWeek(income: number, payDate: string, id?: string) {
  const plan = await proposePlan(db, income, payDate, id);
  return confirmBudget(db, { id, payDate, income, lines: plan.lines, mode: plan.mode, deficit: plan.deficit, accountId: 'acc_main' });
}

async function balances() {
  return envelopeBalances(await db.entries.toArray(), await db.transactions.toArray());
}

describe('flujo cobro → distribución → confirmación → almacenamiento', () => {
  it('confirma un presupuesto, registra el ingreso y llena los sobres', async () => {
    const b = await confirmWeek(80000, '2026-11-06');
    expect(b.weekKey).toBe('2026-11-02');
    const stored = await db.budgets.get(b.id);
    expect(stored?.income).toBe(80000);
    const txs = await db.transactions.toArray();
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('income');
    const bal = await balances();
    expect(bal.get('env_rent')).toBe(10000);
    expect(bal.get('env_emergency')).toBe(19300);
  });

  it('impide duplicar el presupuesto de la misma semana', async () => {
    await confirmWeek(80000, '2026-11-06');
    await expect(confirmWeek(80000, '2026-11-06')).rejects.toBeInstanceOf(DuplicateBudgetError);
    // Otro día de la misma semana también es duplicado
    await expect(confirmWeek(50000, '2026-11-04')).rejects.toBeInstanceOf(DuplicateBudgetError);
    expect(await db.budgets.count()).toBe(1);
    expect(await db.transactions.count()).toBe(1);
  });

  it('dos confirmaciones simultáneas (doble toque) solo guardan una', async () => {
    const plan = await proposePlan(db, 80000, '2026-11-06');
    const params = { payDate: '2026-11-06', income: 80000, lines: plan.lines, mode: plan.mode, deficit: plan.deficit, accountId: 'acc_main' };
    const results = await Promise.allSettled([confirmBudget(db, params), confirmBudget(db, params)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.budgets.count()).toBe(1);
  });

  it('la siguiente semana usa los saldos acumulados (top-up de gasolina)', async () => {
    await confirmWeek(80000, '2026-11-06');
    await saveTransaction(db, { date: '2026-11-08', type: 'expense', amount: 12000, accountId: 'acc_main', envelopeId: 'env_gas', category: 'Gasolina' });
    const plan = await proposePlan(db, 80000, '2026-11-13');
    expect(amountOf(plan.lines, 'env_gas')).toBe(12000);
    // El alquiler sigue acumulándose
    await confirmBudget(db, { payDate: '2026-11-13', income: 80000, lines: plan.lines, mode: plan.mode, deficit: plan.deficit, accountId: 'acc_main' });
    expect((await balances()).get('env_rent')).toBe(20000);
  });

  it('edición de un registro histórico reemplaza sus reservas sin duplicar', async () => {
    const b = await confirmWeek(80000, '2026-11-06');
    await confirmWeek(60000, '2026-11-13');
    const plan = await proposePlan(db, 110000, '2026-11-06', b.id);
    await confirmBudget(db, { id: b.id, payDate: '2026-11-06', income: 110000, lines: plan.lines, mode: plan.mode, deficit: plan.deficit, accountId: 'acc_main' });
    expect(await db.budgets.count()).toBe(2);
    const incomes = (await db.transactions.toArray()).filter((t) => t.type === 'income');
    expect(incomes).toHaveLength(2);
    expect(flowTotals(incomes).income).toBe(170000);
    expect((await balances()).get('env_rent')).toBe(20000);
    expect(await db.entries.where('budgetId').equals(b.id).count()).toBeGreaterThan(0);
  });

  it('semanas que cruzan de año: claves distintas y sin falsos duplicados', async () => {
    const a = await confirmWeek(80000, '2026-12-25');
    const b = await confirmWeek(60000, '2027-01-01');
    expect(a.weekKey).toBe('2026-12-21');
    expect(b.weekKey).toBe('2026-12-28');
    expect(await db.budgets.count()).toBe(2);
    // El jueves 31 dic pertenece a la misma semana que el viernes 1 ene
    await expect(confirmWeek(10000, '2026-12-31')).rejects.toBeInstanceOf(DuplicateBudgetError);
  });

  it('eliminar un presupuesto revierte ingreso y reservas', async () => {
    const b = await confirmWeek(80000, '2026-11-06');
    await deleteBudget(db, b.id);
    expect(await db.entries.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });

  it('distingue plan de transferencia realmente ejecutada', async () => {
    const b = await confirmWeek(80000, '2026-11-06');
    expect(b.lines.every((l) => !l.transferred)).toBe(true);
    await setLineTransferred(db, b.id, 'env_rent', true);
    const after = await db.budgets.get(b.id);
    expect(after?.lines.find((l) => l.key === 'env_rent')?.transferred).toBe(true);
    expect(after?.lines.find((l) => l.key === 'env_phone')?.transferred).toBe(false);
  });
});

describe('facturas: apartar ≠ pagar', () => {
  it('pagar la factura descuenta el sobre y avanza el vencimiento', async () => {
    const rent = (await db.envelopes.get('env_rent'))!;
    await saveEnvelope(db, { ...rent, dueDay: 1 }, '2026-11-06');
    expect((await db.envelopes.get('env_rent'))?.nextDueDate).toBe('2026-12-01');
    await setEnvelopeBalance(db, 'env_rent', 40000, '2026-11-06');
    await saveTransaction(db, { date: '2026-11-28', type: 'expense', amount: 40000, accountId: 'acc_main', envelopeId: 'env_rent', category: 'Vivienda', isBillPayment: true });
    expect((await balances()).get('env_rent')).toBe(0);
    expect((await db.envelopes.get('env_rent'))?.nextDueDate).toBe('2027-01-01');
  });
});

describe('adelantos y devoluciones', () => {
  it('un adelanto entra a la cuenta pero no es ingreso, y crea una deuda', async () => {
    const { tx } = await saveTransaction(db, { date: '2026-11-03', type: 'advance_received', amount: 15000, accountId: 'acc_main', advanceName: 'Adelanto app', advanceWeeklyPayment: 5000 });
    const debts = await db.debts.toArray();
    expect(debts).toHaveLength(1);
    expect(debts[0].kind).toBe('advance');
    expect(tx.debtId).toBe(debts[0].id);
    const txs = await db.transactions.toArray();
    expect(flowTotals(txs).income).toBe(0);
    expect(accountBalance((await db.accounts.get('acc_main'))!, txs)).toBe(15000);

    // El organizador incluye la devolución
    const plan = await proposePlan(db, 80000, '2026-11-06');
    expect(amountOf(plan.lines, `debt:${debts[0].id}`)).toBe(5000);
    await confirmBudget(db, { payDate: '2026-11-06', income: 80000, lines: plan.lines, mode: plan.mode, deficit: plan.deficit, accountId: 'acc_main' });

    // Devolución: sale del sobre Pagos pendientes, reduce la deuda, no es gasto
    const r = await saveTransaction(db, { date: '2026-11-07', type: 'advance_repaid', amount: 5000, accountId: 'acc_main', debtId: debts[0].id });
    expect(r.tx.envelopeId).toBe('env_debts');
    const all = await db.transactions.toArray();
    expect(debtBalance((await db.debts.get(debts[0].id))!, all)).toBe(10000);
    expect(flowTotals(all).expenses).toBe(0);
    expect((await balances()).get('env_debts')).toBe(0);
  });

  it('saldar la deuda la cierra y deja de pedir pagos', async () => {
    const d = await saveDebt(db, { name: 'Préstamo', kind: 'debt', originalAmount: 10000, weeklyPayment: 5000, dueDate: null, notes: '' });
    await saveTransaction(db, { date: '2026-11-07', type: 'debt_payment', amount: 10000, accountId: 'acc_main', debtId: d.id });
    expect((await db.debts.get(d.id))?.closed).toBe(true);
    const plan = await proposePlan(db, 80000, '2026-11-13');
    expect(plan.lines.find((l) => l.debtId === d.id)).toBeUndefined();
  });

  it('no permite borrar un adelanto con devoluciones', async () => {
    const { tx } = await saveTransaction(db, { date: '2026-11-03', type: 'advance_received', amount: 15000, accountId: 'acc_main' });
    await saveTransaction(db, { date: '2026-11-07', type: 'advance_repaid', amount: 5000, accountId: 'acc_main', debtId: tx.debtId });
    await expect(deleteTransaction(db, tx.id)).rejects.toThrow(/devoluciones/);
  });
});

describe('transferencias internas', () => {
  it('no cuentan como ingreso ni gasto y conservan el total', async () => {
    await confirmWeek(80000, '2026-11-06');
    await saveTransaction(db, { date: '2026-11-06', type: 'transfer', amount: 30000, accountId: 'acc_main', toAccountId: 'acc_savings' });
    const txs = await db.transactions.toArray();
    const t = flowTotals(txs);
    expect(t.income).toBe(80000);
    expect(t.expenses).toBe(0);
    const accounts = await db.accounts.toArray();
    const total = accounts.reduce((s, a) => s + accountBalance(a, txs), 0);
    expect(total).toBe(80000);
    expect(accountBalance(accounts.find((a) => a.id === 'acc_savings')!, txs)).toBe(30000);
  });

  it('mover fondos entre sobres no crea ingresos ni gastos', async () => {
    await confirmWeek(80000, '2026-11-06');
    const before = await balances();
    await moveFunds(db, { fromId: 'env_emergency', toId: 'env_car_fund', amount: 2500, date: '2026-11-07' });
    const after = await balances();
    expect(after.get('env_emergency')).toBe(before.get('env_emergency')! - 2500);
    expect(after.get('env_car_fund')).toBe(before.get('env_car_fund')! + 2500);
    expect(await db.transactions.count()).toBe(1);
    await expect(moveFunds(db, { fromId: 'env_couple', toId: 'env_gas', amount: 999999, date: '2026-11-07' })).rejects.toThrow(/solo tiene/);
  });

  it('rechaza transferencias a la misma cuenta', async () => {
    await expect(saveTransaction(db, { date: '2026-11-06', type: 'transfer', amount: 100, accountId: 'acc_main', toAccountId: 'acc_main' })).rejects.toThrow();
  });
});

describe('patrimonio sin doble conteo', () => {
  it('los sobres son parte del efectivo y no se suman otra vez', async () => {
    await confirmWeek(80000, '2026-11-06');
    const txs = await db.transactions.toArray();
    const bal = await balances();
    const envelopeTotal = [...bal.values()].reduce((s, v) => s + v, 0);
    const nw = netWorth({ accounts: await db.accounts.toArray(), txs, debts: [], holdings: [], trades: [], envelopeTotal });
    expect(nw.netWorth).toBe(80000);
    expect(nw.reservedInEnvelopes).toBe(80000 - 15299);
    const goal = (await db.goals.get('goal_nw5'))!;
    expect(goalCurrent(goal, bal, nw.netWorth)).toBe(80000);
  });

  it('el vehículo avisa si se usa para gastos personales', async () => {
    await confirmWeek(80000, '2026-11-06');
    const r = await saveTransaction(db, { date: '2026-11-07', type: 'expense', amount: 500, accountId: 'acc_main', envelopeId: 'env_car_fund', category: 'Entretenimiento' });
    expect(r.warnings.join(' ')).toMatch(/gasto personal/);
  });
});

describe('suscripciones', () => {
  it('las pendientes no se cancelan solas y el ahorro solo usa frecuencias confirmadas', async () => {
    const subs = await db.subscriptions.toArray();
    expect(subs.every((s) => s.status === 'pending_cancel')).toBe(true);
    let s = summarizeSubscriptions(subs);
    expect(s.monthlySavingsPotential).toBe(6068); // Tinder excluido
    expect(s.unverified.map((x) => x.name)).toEqual(['Tinder']);
    await markSubscriptionCancelled(db, 'sub_crunch', '2026-11-06');
    s = summarizeSubscriptions(await db.subscriptions.toArray());
    expect(s.monthlySavedConfirmed).toBe(3446);
    expect(s.monthlyCharging).toBe(6068 - 3446);
    // Tras cancelar, el organizador aparta menos para suscripciones
    const plan = await proposePlan(db, 80000, '2026-11-06');
    expect(amountOf(plan.lines, 'env_subs')).toBe(606); // ceil(2622 × 12 / 52 = 605.08)
  });
});

describe('copias de seguridad', () => {
  it('exporta, valida e importa sin perder datos', async () => {
    await confirmWeek(80000, '2026-11-06');
    const backup = await exportBackup(db);
    const raw = JSON.stringify(backup);
    const other = await freshDb();
    await importBackup(other, parseBackup(raw));
    expect(await other.budgets.count()).toBe(1);
    expect(await other.entries.count()).toBe(await db.entries.count());
    expect(() => parseBackup('{"app":"otra"}')).toThrow();
    expect(() => parseBackup('no json')).toThrow();
  });

  it('exporta CSV escapando comas y fórmulas', async () => {
    await saveTransaction(db, { date: '2026-11-06', type: 'expense', amount: 1234, accountId: 'acc_main', description: '=SUM(A1), "café"', category: 'Comida' });
    const csv = transactionsToCSV(await db.transactions.toArray(), await db.accounts.toArray(), await db.envelopes.toArray());
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('Fecha');
    expect(row).toContain('12.34');
    expect(row).toContain(`"'=SUM(A1), ""café"""`);
  });
});
