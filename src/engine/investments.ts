import Decimal from 'decimal.js';
import type { Cents } from '@/lib/money';
import type { Trade } from '@/models/types';

export interface HoldingSummary {
  shares: string;
  /** Capital aportado neto (coste de las acciones que siguen en cartera). */
  costBasis: Cents;
  /** Total invertido históricamente (compras + comisiones). */
  totalInvested: Cents;
  /** Ganancia/pérdida realizada por ventas. */
  realizedPL: Cents;
  lastPrice: string | null;
  lastPriceDate: string | null;
  marketValue: Cents;
  unrealizedPL: Cents;
  /** Rendimiento sobre el coste (0.1 = 10 %). null si no hay coste. */
  returnRate: number | null;
}

const toCentsD = (d: Decimal) => d.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

/**
 * Coste medio ponderado. Se procesan las operaciones en orden cronológico.
 * Solo registra datos introducidos por el usuario: no ejecuta operaciones reales
 * ni proyecta rendimientos.
 */
export function holdingSummary(trades: Trade[]): HoldingSummary {
  const sorted = [...trades].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
  let shares = new Decimal(0);
  let cost = new Decimal(0); // en dólares
  let invested = new Decimal(0);
  let realized = new Decimal(0);
  let lastPrice: Decimal | null = null;
  let lastPriceDate: string | null = null;

  for (const t of sorted) {
    const q = new Decimal(t.shares || 0);
    const p = new Decimal(t.price || 0);
    const fees = new Decimal(t.fees).dividedBy(100);
    if (t.type === 'buy') {
      shares = shares.plus(q);
      cost = cost.plus(q.times(p)).plus(fees);
      invested = invested.plus(q.times(p)).plus(fees);
    } else if (t.type === 'sell') {
      const sellQty = Decimal.min(q, shares);
      const avg = shares.isZero() ? new Decimal(0) : cost.dividedBy(shares);
      const costOut = avg.times(sellQty);
      realized = realized.plus(sellQty.times(p).minus(fees).minus(costOut));
      shares = shares.minus(sellQty);
      cost = cost.minus(costOut);
    }
    if (!p.isZero()) {
      lastPrice = p;
      lastPriceDate = t.date;
    }
  }

  const marketValue = lastPrice ? shares.times(lastPrice) : new Decimal(0);
  const unrealized = marketValue.minus(cost);
  return {
    shares: shares.toString(),
    costBasis: toCentsD(cost),
    totalInvested: toCentsD(invested),
    realizedPL: toCentsD(realized),
    lastPrice: lastPrice ? lastPrice.toString() : null,
    lastPriceDate,
    marketValue: toCentsD(marketValue),
    unrealizedPL: toCentsD(unrealized),
    returnRate: cost.isZero() ? null : unrealized.dividedBy(cost).toNumber()
  };
}
