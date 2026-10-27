import Decimal from 'decimal.js';
import type { Cents } from '@/lib/money';
import { sumCents } from '@/lib/money';
import type { Subscription, SubscriptionFrequency } from '@/models/types';
import { addDays, addMonths, addYears, diffDays, type ISODate } from '@/lib/dates';

/** Equivalente mensual. null si la frecuencia no está confirmada. */
export function monthlyEquivalent(price: Cents, frequency: SubscriptionFrequency): Cents | null {
  switch (frequency) {
    case 'monthly':
      return price;
    case 'weekly':
      return new Decimal(price).times(52).dividedBy(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    case 'yearly':
      return new Decimal(price).dividedBy(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    default:
      return null;
  }
}

export function yearlyEquivalent(price: Cents, frequency: SubscriptionFrequency): Cents | null {
  switch (frequency) {
    case 'monthly':
      return price * 12;
    case 'weekly':
      return price * 52;
    case 'yearly':
      return price;
    default:
      return null;
  }
}

/** Una suscripción sigue cobrando mientras no esté cancelada ni pausada. */
export const isCharging = (s: Subscription) => s.status === 'active' || s.status === 'pending_cancel';

export interface SubscriptionSummary {
  /** Gasto mensual de las que siguen cobrando con frecuencia confirmada. */
  monthlyCharging: Cents;
  /** Ahorro mensual ya conseguido (canceladas con frecuencia confirmada). */
  monthlySavedConfirmed: Cents;
  /** Ahorro mensual potencial si se cancelan las pendientes (solo frecuencias confirmadas). */
  monthlySavingsPotential: Cents;
  /** Suscripciones que no se incluyen en estimaciones por frecuencia sin verificar. */
  unverified: Subscription[];
  pendingCount: number;
}

export function summarizeSubscriptions(subs: Subscription[]): SubscriptionSummary {
  const monthly = (s: Subscription) => monthlyEquivalent(s.price, s.frequency);
  const known = (s: Subscription) => monthly(s) !== null;
  return {
    monthlyCharging: sumCents(subs.filter((s) => isCharging(s) && known(s)).map((s) => monthly(s)!)),
    monthlySavedConfirmed: sumCents(subs.filter((s) => s.status === 'cancelled' && known(s)).map((s) => monthly(s)!)),
    monthlySavingsPotential: sumCents(subs.filter((s) => s.status === 'pending_cancel' && known(s)).map((s) => monthly(s)!)),
    unverified: subs.filter((s) => !known(s) && s.status !== 'cancelled'),
    pendingCount: subs.filter((s) => s.status === 'pending_cancel').length
  };
}

/** Cancelar es una acción explícita del usuario: nunca se hace automáticamente. */
export function cancelSubscription(sub: Subscription, date: ISODate): Subscription {
  return { ...sub, status: 'cancelled', cancelledAt: date };
}

export function nextRenewal(sub: Subscription, from: ISODate): ISODate | null {
  if (!sub.renewalDate) return null;
  let d = sub.renewalDate;
  let guard = 0;
  while (diffDays(d, from) < 0 && guard < 1000) {
    guard++;
    if (sub.frequency === 'weekly') d = addDays(d, 7);
    else if (sub.frequency === 'yearly') d = addYears(d, 1);
    else if (sub.frequency === 'monthly') d = addMonths(d, 1, Number(sub.renewalDate.slice(8, 10)));
    else return sub.renewalDate;
  }
  return d;
}

/** ¿Toca avisar? (renovación dentro de los días de recordatorio). */
export function needsReminder(sub: Subscription, today: ISODate): boolean {
  if (!isCharging(sub)) return false;
  const next = nextRenewal(sub, today);
  if (!next) return false;
  const days = diffDays(next, today);
  return days >= 0 && days <= sub.reminderDays;
}
