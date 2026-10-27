import Decimal from 'decimal.js';
import type { Cents } from '@/lib/money';
import { sumCents } from '@/lib/money';
import type { Account, Debt, EnvelopeEntry, Holding, Trade, Transaction, TxType } from '@/models/types';
import { holdingSummary } from './investments';

/** Tipos de transacción que consumen el saldo de un sobre cuando llevan envelopeId. */
export const ENVELOPE_SPENDING_TYPES: TxType[] = ['expense', 'fee', 'debt_payment', 'advance_repaid', 'contribution'];

/** Lo que cuenta como ingreso real (no adelantos ni transferencias). */
export const INCOME_TYPES: TxType[] = ['income'];
/** Lo que cuenta como gasto real (no transferencias, no pagos de capital de deudas, no aportaciones). */
export const EXPENSE_TYPES: TxType[] = ['expense', 'fee'];

export function envelopeBalance(envelopeId: string, entries: EnvelopeEntry[], txs: Transaction[]): Cents {
  let total = 0;
  for (const e of entries) if (e.envelopeId === envelopeId) total += e.amount;
  for (const t of txs) {
    if (t.envelopeId === envelopeId && ENVELOPE_SPENDING_TYPES.includes(t.type)) total -= t.amount;
  }
  return total;
}

export function envelopeBalances(entries: EnvelopeEntry[], txs: Transaction[]): Map<string, Cents> {
  const map = new Map<string, Cents>();
  const add = (id: string, v: Cents) => map.set(id, (map.get(id) ?? 0) + v);
  for (const e of entries) add(e.envelopeId, e.amount);
  for (const t of txs) {
    if (t.envelopeId && ENVELOPE_SPENDING_TYPES.includes(t.type)) add(t.envelopeId, -t.amount);
  }
  return map;
}

/** Efecto de una transacción sobre el saldo de una cuenta. */
export function txAccountEffect(tx: Transaction, accountId: string): Cents {
  let effect = 0;
  if (tx.accountId === accountId) {
    switch (tx.type) {
      case 'income':
      case 'advance_received':
        effect += tx.amount;
        break;
      default:
        effect -= tx.amount;
    }
  }
  if ((tx.type === 'transfer' || tx.type === 'contribution') && tx.toAccountId === accountId) {
    effect += tx.amount;
  }
  return effect;
}

/** Efecto de compras/ventas en el efectivo de la cuenta de inversión. */
export function tradeCashEffect(trade: Trade): Cents {
  if (trade.type === 'valuation') return 0;
  const gross = new Decimal(trade.shares).times(trade.price).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return trade.type === 'buy' ? -(gross + trade.fees) : gross - trade.fees;
}

export function accountBalance(account: Account, txs: Transaction[], trades: Trade[] = [], holdings: Holding[] = []): Cents {
  let total = account.openingBalance;
  for (const t of txs) total += txAccountEffect(t, account.id);
  if (trades.length) {
    const holdingAccount = new Map(holdings.map((h) => [h.id, h.accountId]));
    for (const tr of trades) if (holdingAccount.get(tr.holdingId) === account.id) total += tradeCashEffect(tr);
  }
  return total;
}

export function debtBalance(debt: Debt, txs: Transaction[]): Cents {
  const paid = sumCents(
    txs.filter((t) => t.debtId === debt.id && (t.type === 'debt_payment' || t.type === 'advance_repaid')).map((t) => t.amount)
  );
  return Math.max(0, debt.originalAmount - paid);
}

export interface NetWorthBreakdown {
  /** Efectivo en cuentas (corriente, ahorro, efectivo, efectivo no invertido del bróker). */
  cash: Cents;
  /** Valor de mercado registrado de las posiciones. */
  investments: Cents;
  /** Saldos pendientes de deudas y adelantos. */
  debts: Cents;
  /** cash + investments − debts. Las cuentas de crédito restan porque su saldo es negativo. */
  netWorth: Cents;
  /** Dinero apartado en sobres: es parte de `cash`, NO se suma otra vez. */
  reservedInEnvelopes: Cents;
}

/**
 * Patrimonio = efectivo de todas las cuentas + valor de inversiones − deudas.
 * Los sobres son una subdivisión virtual del efectivo, así que nunca se suman
 * por separado (evita contar dos veces las reservas).
 */
export function netWorth(params: {
  accounts: Account[];
  txs: Transaction[];
  debts: Debt[];
  holdings: Holding[];
  trades: Trade[];
  envelopeTotal: Cents;
}): NetWorthBreakdown {
  const cash = sumCents(params.accounts.map((a) => accountBalance(a, params.txs, params.trades, params.holdings)));
  const investments = sumCents(
    params.holdings.map((h) => holdingSummary(params.trades.filter((t) => t.holdingId === h.id)).marketValue)
  );
  const debts = sumCents(params.debts.filter((d) => !d.closed).map((d) => debtBalance(d, params.txs)));
  return { cash, investments, debts, netWorth: cash + investments - debts, reservedInEnvelopes: params.envelopeTotal };
}

/** Efectivo líquido (excluye cuentas de inversión). */
export function liquidCash(accounts: Account[], txs: Transaction[]): Cents {
  return sumCents(accounts.filter((a) => a.type !== 'investment').map((a) => accountBalance(a, txs)));
}

export interface FlowTotals {
  income: Cents;
  expenses: Cents;
  debtPayments: Cents;
  advancesReceived: Cents;
  advancesRepaid: Cents;
  contributions: Cents;
  transfers: Cents;
}

/** Totales de flujo: las transferencias internas nunca suman como ingreso ni gasto. */
export function flowTotals(txs: Transaction[]): FlowTotals {
  const t: FlowTotals = { income: 0, expenses: 0, debtPayments: 0, advancesReceived: 0, advancesRepaid: 0, contributions: 0, transfers: 0 };
  for (const tx of txs) {
    switch (tx.type) {
      case 'income':
        t.income += tx.amount;
        break;
      case 'expense':
      case 'fee':
        t.expenses += tx.amount;
        break;
      case 'debt_payment':
        t.debtPayments += tx.amount;
        break;
      case 'advance_received':
        t.advancesReceived += tx.amount;
        break;
      case 'advance_repaid':
        t.advancesRepaid += tx.amount;
        break;
      case 'contribution':
        t.contributions += tx.amount;
        break;
      case 'transfer':
        t.transfers += tx.amount;
        break;
    }
  }
  return t;
}
