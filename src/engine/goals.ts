import Decimal from 'decimal.js';
import { clampPositive, progressRatio, sumCents, type Cents } from '@/lib/money';
import { addDays, diffDays, type ISODate } from '@/lib/dates';
import type { EnvelopeEntry, Goal } from '@/models/types';

export interface GoalProgress {
  goal: Goal;
  current: Cents;
  remaining: Cents;
  ratio: number;
  /** Aportación media semanal reciente que alimenta la meta. */
  weeklyRate: Cents;
  estimatedDate: ISODate | null;
  completed: boolean;
  /** Meta con plazo < 2 años: dinero de corto plazo, no apto para bolsa. */
  shortTerm: boolean;
}

/**
 * Progreso de una meta.
 * - Metas de sobre: suma de los saldos de los sobres enlazados.
 * - Metas de patrimonio: patrimonio neto (que ya incluye los sobres dentro del
 *   efectivo, por eso las reservas no se suman dos veces).
 */
export function goalCurrent(goal: Goal, envelopeBalances: Map<string, Cents>, netWorth: Cents): Cents {
  if (goal.type === 'networth') return netWorth;
  return sumCents(goal.envelopeIds.map((id) => envelopeBalances.get(id) ?? 0));
}

/** Media semanal de lo que entró en los sobres indicados durante las últimas `weeks` semanas. */
export function weeklyInflow(envelopeIds: string[], entries: EnvelopeEntry[], today: ISODate, weeks = 8): Cents {
  const from = addDays(today, -weeks * 7);
  const total = sumCents(
    entries.filter((e) => envelopeIds.includes(e.envelopeId) && e.date > from && e.date <= today && e.kind !== 'adjust').map((e) => e.amount)
  );
  return clampPositive(new Decimal(total).dividedBy(weeks).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
}

export function estimateCompletion(remaining: Cents, weeklyRate: Cents, today: ISODate): ISODate | null {
  if (remaining <= 0) return today;
  if (weeklyRate <= 0) return null;
  const weeks = new Decimal(remaining).dividedBy(weeklyRate).ceil().toNumber();
  if (weeks > 52 * 50) return null;
  return addDays(today, weeks * 7);
}

export function goalProgress(params: {
  goal: Goal;
  envelopeBalances: Map<string, Cents>;
  netWorth: Cents;
  weeklyRate: Cents;
  today: ISODate;
}): GoalProgress {
  const current = goalCurrent(params.goal, params.envelopeBalances, params.netWorth);
  const remaining = clampPositive(params.goal.target - current);
  return {
    goal: params.goal,
    current,
    remaining,
    ratio: progressRatio(current, params.goal.target),
    weeklyRate: params.weeklyRate,
    estimatedDate: estimateCompletion(remaining, params.weeklyRate, params.today),
    completed: remaining === 0,
    shortTerm: params.goal.deadline !== null && diffDays(params.goal.deadline, params.today) < 730
  };
}
