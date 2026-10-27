import Decimal from 'decimal.js';

/**
 * Todo el dinero se guarda como centavos enteros (Cents) y toda operación
 * que implique porcentajes, divisiones o conversiones se hace con decimal.js
 * para evitar errores de coma flotante. Redondeo bancario estándar: medio hacia arriba.
 */
export type Cents = number;

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const D = (v: Decimal.Value) => new Decimal(v);

/** Convierte un importe en dólares (string o número) a centavos enteros. */
export function toCents(value: Decimal.Value | null | undefined): Cents {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value;
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  try {
    return new Decimal(cleaned).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
}

/** Convierte centavos a un string con 2 decimales, apto para inputs. */
export function centsToInput(cents: Cents): string {
  return new Decimal(cents).dividedBy(100).toFixed(2);
}

export function centsToDecimal(cents: Cents): Decimal {
  return new Decimal(cents).dividedBy(100);
}

/** Aplica una tasa (0.25 = 25 %) a un importe en centavos y redondea al centavo. */
export function applyRate(cents: Cents, rate: Decimal.Value): Cents {
  return new Decimal(cents).times(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** División exacta redondeada al centavo. */
export function divideCents(cents: Cents, divisor: Decimal.Value): Cents {
  const d = new Decimal(divisor);
  if (d.isZero()) return cents;
  return new Decimal(cents).dividedBy(d).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** División redondeada hacia arriba (para reservas: mejor sobrar un centavo que faltar). */
export function divideCentsUp(cents: Cents, divisor: Decimal.Value): Cents {
  const d = new Decimal(divisor);
  if (d.isZero()) return cents;
  return new Decimal(cents).dividedBy(d).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
}

export function multiplyCents(cents: Cents, factor: Decimal.Value): Cents {
  return new Decimal(cents).times(factor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function sumCents(values: Cents[]): Cents {
  // Los centavos son enteros: la suma de enteros < 2^53 es exacta.
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export const minCents = (a: Cents, b: Cents) => (a < b ? a : b);
export const maxCents = (a: Cents, b: Cents) => (a > b ? a : b);
export const clampPositive = (v: Cents) => (v > 0 ? v : 0);

const usd = new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const usdCompact = new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatMoney(cents: Cents, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const value = centsToDecimal(cents).toNumber();
  const formatted = opts.compact ? usdCompact.format(value) : usd.format(value);
  if (opts.sign && cents > 0) return `+${formatted}`;
  return formatted;
}

export function formatPercent(rate: Decimal.Value, digits = 0): string {
  return `${new Decimal(rate).times(100).toFixed(digits)} %`;
}

/** Porcentaje (0–1) de progreso, acotado. */
export function progressRatio(current: Cents, target: Cents): number {
  if (target <= 0) return current > 0 ? 1 : 0;
  const r = new Decimal(current).dividedBy(target).toNumber();
  return Math.max(0, Math.min(1, r));
}
