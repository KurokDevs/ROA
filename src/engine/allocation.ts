import Decimal from 'decimal.js';
import { applyRate, clampPositive, divideCentsUp, minCents, multiplyCents, sumCents, type Cents } from '@/lib/money';
import { addDays, countWeekdaysBetween, diffDays, nextMonthlyOccurrence, type ISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { BudgetLine, BudgetMode, Debt, Envelope, TaxMode, Tier } from '@/models/types';
import { OBLIGATION_TIERS, TIER_ORDER } from '@/models/types';

/**
 * ORGANIZADOR SEMANAL — cálculo 100 % determinista.
 *
 * Mismas entradas ⇒ mismo resultado. Orden estricto de prioridades:
 *   1. Reserva fiscal (1099)          4. Pagos pendientes / adelantos
 *   2. Obligaciones esenciales        5. Vida diaria (personal, pareja, suscripciones)
 *   3. Trabajo (gasolina, carro)      6. Ahorro / emergencias      7. Inversión
 * Un nivel solo recibe dinero si todos los anteriores quedaron cubiertos;
 * así nunca se recomienda ahorrar o invertir dinero de una obligación prioritaria.
 */

export interface EnvelopeState {
  envelope: Envelope;
  balance: Cents;
}

export interface DebtState {
  debt: Debt;
  balance: Cents;
}

export interface PlanInput {
  income: Cents;
  payDate: ISODate;
  paydayWeekday: number;
  taxMode: TaxMode;
  taxRate: string;
  envelopes: EnvelopeState[];
  debts: DebtState[];
  /** Gasto mensual de suscripciones que siguen cobrando (frecuencia confirmada). */
  subscriptionsMonthly: Cents;
  surplusToSavingsRate: string;
  surplusToInvestRate: string;
}

export interface PlanResult {
  mode: BudgetMode;
  lines: BudgetLine[];
  taxAmount: Cents;
  totalAllocated: Cents;
  unassigned: Cents;
  /** Lo que faltó para cubrir obligaciones (solo > 0 en Supervivencia). */
  deficit: Cents;
  obligationsNeed: Cents;
  shortfalls: { key: string; label: string; missing: Cents }[];
  warnings: string[];
  steps: string[];
}

interface Need {
  key: string;
  envelope: Envelope;
  debtId: string | null;
  label: string;
  tier: Tier;
  need: Cents;
  dueDate: ISODate | null;
  reason: string;
}

const WEEKS_PER_MONTH = new Decimal(52).dividedBy(12);

/** Vencimiento efectivo de una factura para un día de cobro dado. */
export function effectiveDueDate(env: Envelope, payDate: ISODate): ISODate | null {
  if (env.nextDueDate) return env.nextDueDate;
  if (env.dueDay) return nextMonthlyOccurrence(payDate, env.dueDay);
  return null;
}

/**
 * Cuánto necesita una factura esta semana.
 * Con vencimiento: lo que falta ÷ cobros restantes hasta el vencimiento (incluido el de hoy).
 * Así un mes de cinco viernes reparte entre 5 y uno de cuatro entre 4, y el sobre
 * llega exacto al importe. Si ya está cubierta (pago anticipado o saldo de sobra) pide 0.
 */
export function billNeed(env: Envelope, balance: Cents, payDate: ISODate, paydayWeekday: number): { need: Cents; dueDate: ISODate | null; reason: string } {
  const missing = clampPositive(env.billAmount - balance);
  const dueDate = effectiveDueDate(env, payDate);
  if (missing === 0) {
    return { need: 0, dueDate, reason: 'Factura ya cubierta con el saldo del sobre' };
  }
  if (!dueDate) {
    const need = minCents(env.weeklyAmount, missing);
    return { need, dueDate, reason: `Reserva semanal de ${formatMoney(env.weeklyAmount)} (tope: importe de la factura)` };
  }
  if (diffDays(dueDate, payDate) < 0) {
    return { need: missing, dueDate, reason: 'Factura vencida: se cubre completa' };
  }
  const paydays = Math.max(1, countWeekdaysBetween(payDate, dueDate, paydayWeekday));
  const need = minCents(missing, divideCentsUp(missing, paydays));
  return {
    need,
    dueDate,
    reason: paydays === 1 ? 'Vence antes del próximo cobro' : `Faltan ${formatMoney(missing)} en ${paydays} cobros hasta el vencimiento`
  };
}

function envelopeNeed(state: EnvelopeState, input: PlanInput): Need | null {
  const env = state.envelope;
  const base = { key: env.id, envelope: env, debtId: null, label: env.name, tier: env.tier, dueDate: null as ISODate | null };
  switch (env.method) {
    case 'bill': {
      const r = billNeed(env, state.balance, input.payDate, input.paydayWeekday);
      return { ...base, need: r.need, dueDate: r.dueDate, reason: r.reason };
    }
    case 'topup': {
      const need = clampPositive(env.weeklyAmount - state.balance);
      return {
        ...base,
        need,
        reason: state.balance > 0 ? `Rellenar hasta ${formatMoney(env.weeklyAmount)} (ya tiene ${formatMoney(state.balance)})` : `Presupuesto semanal de ${formatMoney(env.weeklyAmount)}`
      };
    }
    case 'fixed': {
      const room = env.targetAmount > 0 ? clampPositive(env.targetAmount - state.balance) : env.weeklyAmount;
      const need = minCents(env.weeklyAmount, room);
      return {
        ...base,
        need,
        reason: env.targetAmount > 0 && room === 0 ? 'Objetivo alcanzado' : `Aportación semanal de ${formatMoney(env.weeklyAmount)}`
      };
    }
    case 'subscriptions': {
      const weekly = new Decimal(input.subscriptionsMonthly).dividedBy(WEEKS_PER_MONTH).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
      const room = clampPositive(input.subscriptionsMonthly - state.balance);
      return { ...base, need: minCents(weekly, room), reason: 'Equivalente semanal de suscripciones que siguen cobrando' };
    }
    default:
      return null;
  }
}

function debtNeeds(input: PlanInput, debtsEnvelope: EnvelopeState | undefined): Need[] {
  if (!debtsEnvelope) return [];
  const weekEnd = addDays(input.payDate, 6);
  let reserved = clampPositive(debtsEnvelope.balance);
  const open = input.debts
    .filter((d) => !d.debt.closed && d.balance > 0)
    .sort((a, b) => (a.debt.dueDate ?? '9999').localeCompare(b.debt.dueDate ?? '9999') || a.debt.createdAt.localeCompare(b.debt.createdAt));
  return open.map((d) => {
    const dueSoon = d.debt.dueDate !== null && d.debt.dueDate <= weekEnd;
    const weekly = d.debt.weeklyPayment > 0 ? d.debt.weeklyPayment : d.balance;
    let need = dueSoon ? d.balance : minCents(weekly, d.balance);
    // El dinero ya apartado en "Pagos pendientes" reduce lo que falta.
    const used = minCents(reserved, need);
    reserved -= used;
    need -= used;
    const kindLabel = d.debt.kind === 'advance' ? 'Adelanto' : 'Deuda';
    return {
      key: `debt:${d.debt.id}`,
      envelope: debtsEnvelope.envelope,
      debtId: d.debt.id,
      label: `${kindLabel}: ${d.debt.name}`,
      tier: 'debt' as Tier,
      need,
      dueDate: d.debt.dueDate,
      reason: dueSoon ? 'Vence esta semana: se cubre el saldo' : `Pago semanal pactado (saldo ${formatMoney(d.balance)})`
    };
  });
}

function sortNeeds(a: Need, b: Need): number {
  const ad = a.dueDate ?? '9999-12-31';
  const bd = b.dueDate ?? '9999-12-31';
  if (ad !== bd) return ad.localeCompare(bd);
  if (a.envelope.priority !== b.envelope.priority) return a.envelope.priority - b.envelope.priority;
  return a.label.localeCompare(b.label);
}

const line = (n: Need, amount: Cents, reason = n.reason): BudgetLine => ({
  key: n.key,
  envelopeId: n.envelope.id,
  debtId: n.debtId,
  label: n.label,
  tier: n.tier,
  need: n.need,
  recommended: amount,
  amount,
  reason,
  transferred: false,
  transferredAt: null
});

export function buildPlan(input: PlanInput): PlanResult {
  const income = clampPositive(input.income);
  let remaining = income;
  const lines: BudgetLine[] = [];
  const shortfalls: PlanResult['shortfalls'] = [];
  const warnings: string[] = [];
  const steps: string[] = [];
  const active = input.envelopes.filter((s) => !s.envelope.archived);
  const bySystem = (sys: string) => active.find((s) => s.envelope.system === sys);

  // 1. Reserva fiscal
  let taxAmount = 0;
  const taxEnv = bySystem('tax');
  if (input.taxMode === '1099' && taxEnv) {
    const taxNeed = applyRate(income, input.taxRate);
    taxAmount = minCents(taxNeed, remaining);
    remaining -= taxAmount;
    const n: Need = { key: taxEnv.envelope.id, envelope: taxEnv.envelope, debtId: null, label: taxEnv.envelope.name, tier: 'tax', need: taxNeed, dueDate: null, reason: '' };
    lines.push(line(n, taxAmount, `Estimación provisional del ${new Decimal(input.taxRate).times(100).toString()} % (contratista 1099)`));
    steps.push(`Reserva fiscal provisional: ${formatMoney(taxAmount)}`);
  } else if (input.taxMode === 'w2') {
    steps.push('Empleado W-2: los impuestos ya se retienen en nómina');
  }

  // 2–5. Obligaciones por nivel
  const needs: Need[] = [];
  for (const s of active) {
    if (!OBLIGATION_TIERS.includes(s.envelope.tier) || s.envelope.method === 'tax' || s.envelope.method === 'debts') continue;
    const n = envelopeNeed(s, input);
    if (n) needs.push(n);
  }
  needs.push(...debtNeeds(input, bySystem('debts')));

  let obligationsNeed = taxAmount;
  for (const tier of OBLIGATION_TIERS) {
    if (tier === 'tax') continue;
    const tierNeeds = needs.filter((n) => n.tier === tier).sort(sortNeeds);
    for (const n of tierNeeds) {
      obligationsNeed += n.need;
      const amount = minCents(n.need, remaining);
      remaining -= amount;
      if (n.need > 0 || n.envelope.method !== 'fixed') lines.push(line(n, amount));
      if (amount < n.need) shortfalls.push({ key: n.key, label: n.label, missing: n.need - amount });
    }
  }
  const taxShort = taxEnv && input.taxMode === '1099' ? applyRate(income, input.taxRate) - taxAmount : 0;
  if (taxShort > 0 && taxEnv) shortfalls.unshift({ key: taxEnv.envelope.id, label: taxEnv.envelope.name, missing: taxShort });

  const deficit = sumCents(shortfalls.map((s) => s.missing));
  let mode: BudgetMode;

  if (deficit > 0) {
    mode = 'survival';
    steps.push(`Ingreso insuficiente: faltan ${formatMoney(deficit)} para cubrir obligaciones`);
    warnings.push('Modo Supervivencia: no se aparta nada para ahorro ni inversión hasta cubrir obligaciones.');
  } else {
    steps.push('Obligaciones cubiertas');
    // 6. Ahorro base
    const savings = active.filter((s) => s.envelope.tier === 'savings').sort((a, b) => a.envelope.priority - b.envelope.priority);
    const savingsAlloc = new Map<string, Cents>();
    for (const s of savings) {
      const n = envelopeNeed(s, input);
      if (!n || n.need <= 0) continue;
      const amount = minCents(n.need, remaining);
      remaining -= amount;
      savingsAlloc.set(s.envelope.id, amount);
    }

    const gateMissing = (s: EnvelopeState) => clampPositive(s.envelope.minBeforeInvest - (s.balance + (savingsAlloc.get(s.envelope.id) ?? 0)));
    const unmet = savings.filter((s) => gateMissing(s) > 0);
    const investEnv = bySystem('investment');

    if (unmet.length > 0 || !investEnv) {
      mode = 'stability';
      // Priorizar ahorro: una parte del excedente refuerza las reservas incompletas.
      let extra = multiplyCents(remaining, input.surplusToSavingsRate);
      const targets = unmet.length > 0 ? unmet : savings;
      for (const s of targets) {
        if (extra <= 0) break;
        const current = s.balance + (savingsAlloc.get(s.envelope.id) ?? 0);
        const cap = s.envelope.targetAmount > 0 ? clampPositive(s.envelope.targetAmount - current) : extra;
        const add = minCents(extra, cap);
        if (add <= 0) continue;
        savingsAlloc.set(s.envelope.id, (savingsAlloc.get(s.envelope.id) ?? 0) + add);
        extra -= add;
        remaining -= add;
      }
      if (unmet.length > 0) steps.push(`Reservas incompletas: se refuerza ${unmet.map((s) => s.envelope.name).join(', ')}`);
    } else {
      mode = 'growth';
    }

    for (const s of savings) {
      const amount = savingsAlloc.get(s.envelope.id) ?? 0;
      const n = envelopeNeed(s, input);
      const missingGate = gateMissing(s);
      if (amount === 0 && (!n || n.need === 0)) continue;
      const reason =
        amount > (n?.need ?? 0)
          ? missingGate > 0
            ? `Aportación + refuerzo (faltan ${formatMoney(missingGate)} para la reserva mínima)`
            : 'Aportación + refuerzo del excedente'
          : n?.reason ?? '';
      lines.push(line({ key: s.envelope.id, envelope: s.envelope, debtId: null, label: s.envelope.name, tier: 'savings', need: n?.need ?? 0, dueDate: null, reason }, amount));
    }

    // 7. Inversión — solo con obligaciones y reservas mínimas cubiertas.
    if (mode === 'growth' && investEnv) {
      const amount = multiplyCents(remaining, input.surplusToInvestRate);
      remaining -= amount;
      lines.push(
        line(
          { key: investEnv.envelope.id, envelope: investEnv.envelope, debtId: null, label: investEnv.envelope.name, tier: 'investment', need: amount, dueDate: null, reason: '' },
          amount,
          `${new Decimal(input.surplusToInvestRate).times(100).toString()} % del excedente (reservas mínimas cubiertas)`
        )
      );
      steps.push(`Modo Crecimiento: ${formatMoney(amount)} disponibles para invertir`);
    }
  }

  const ordered = lines.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  const totalAllocated = sumCents(ordered.map((l) => l.amount));
  steps.push(`Sin asignar: ${formatMoney(income - totalAllocated)}`);

  return {
    mode,
    lines: ordered,
    taxAmount,
    totalAllocated,
    unassigned: income - totalAllocated,
    deficit,
    obligationsNeed,
    shortfalls,
    warnings,
    steps
  };
}

export interface LinesSummary {
  totalAllocated: Cents;
  unassigned: Cents;
  overAllocated: Cents;
  hasNegative: boolean;
  byTier: Record<Tier, Cents>;
}

/** Recalcula totales tras la edición manual del usuario. */
export function summarizeLines(income: Cents, lines: BudgetLine[]): LinesSummary {
  const totalAllocated = sumCents(lines.map((l) => l.amount));
  const byTier = Object.fromEntries(TIER_ORDER.map((t) => [t, 0])) as Record<Tier, Cents>;
  for (const l of lines) byTier[l.tier] += l.amount;
  return {
    totalAllocated,
    unassigned: income - totalAllocated,
    overAllocated: clampPositive(totalAllocated - income),
    hasNegative: lines.some((l) => l.amount < 0),
    byTier
  };
}

export function validateLines(income: Cents, lines: BudgetLine[]): string | null {
  if (income <= 0) return 'Introduce un ingreso mayor que cero.';
  const s = summarizeLines(income, lines);
  if (s.hasNegative) return 'Ninguna asignación puede ser negativa.';
  if (s.overAllocated > 0) return `Has asignado ${formatMoney(s.overAllocated)} más de lo que cobraste.`;
  return null;
}

/** Agrupa las líneas por sobre para generar los movimientos de reserva. */
export function allocationsByEnvelope(lines: BudgetLine[]): Map<string, Cents> {
  const map = new Map<string, Cents>();
  for (const l of lines) if (l.amount > 0) map.set(l.envelopeId, (map.get(l.envelopeId) ?? 0) + l.amount);
  return map;
}
