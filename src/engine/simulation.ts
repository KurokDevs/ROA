import Decimal from 'decimal.js';
import type { Cents } from '@/lib/money';

export interface SimulationInput {
  months: number;
  weeklySavings: Cents;
  weeklyInvestment: Cents;
  startSavings: Cents;
  startInvestments: Cents;
  /** Rendimiento anual HIPOTÉTICO aplicado solo a inversiones (0.05 = 5 %). No es una promesa. */
  hypotheticalAnnualReturn: string;
}

export interface SimulationPoint {
  week: number;
  savings: Cents;
  investments: Cents;
  contributed: Cents;
  total: Cents;
}

export interface SimulationResult {
  weeks: number;
  points: SimulationPoint[];
  final: SimulationPoint;
  totalContributed: Cents;
  hypotheticalGrowth: Cents;
  hypothetical: true;
}

const toC = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

/** Proyección HIPOTÉTICA basada en aportes semanales constantes. */
export function simulate(input: SimulationInput): SimulationResult {
  const weeks = new Decimal(input.months).times(52).dividedBy(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const weeklyFactor = new Decimal(1).plus(input.hypotheticalAnnualReturn || 0).pow(new Decimal(1).dividedBy(52));
  let savings = new Decimal(input.startSavings);
  let inv = new Decimal(input.startInvestments);
  let contributed = new Decimal(0);
  const points: SimulationPoint[] = [{ week: 0, savings: input.startSavings, investments: input.startInvestments, contributed: 0, total: input.startSavings + input.startInvestments }];
  for (let w = 1; w <= weeks; w++) {
    inv = inv.times(weeklyFactor).plus(input.weeklyInvestment);
    savings = savings.plus(input.weeklySavings);
    contributed = contributed.plus(input.weeklySavings + input.weeklyInvestment);
    points.push({ week: w, savings: toC(savings), investments: toC(inv), contributed: toC(contributed), total: toC(savings.plus(inv)) });
  }
  const final = points[points.length - 1];
  const totalContributed = toC(contributed);
  return {
    weeks,
    points,
    final,
    totalContributed,
    hypotheticalGrowth: final.total - input.startSavings - input.startInvestments - totalContributed,
    hypothetical: true
  };
}
