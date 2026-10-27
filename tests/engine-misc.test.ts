import { describe, expect, it } from 'vitest';
import { holdingSummary } from '@/engine/investments';
import { simulate } from '@/engine/simulation';
import { estimateCompletion, goalProgress } from '@/engine/goals';
import { monthlyEquivalent, needsReminder } from '@/engine/subscriptions';
import { seasonComparison, weekKeys } from '@/engine/stats';
import type { Subscription, Trade, WeeklyBudget } from '@/models/types';

const trade = (t: Partial<Trade> & Pick<Trade, 'type' | 'shares' | 'price' | 'date'>): Trade => ({ id: Math.random().toString(), holdingId: 'h', fees: 0, note: '', createdAt: t.date, ...t });

describe('inversiones (registro manual)', () => {
  it('coste medio, valor, ganancia no realizada y pérdidas', () => {
    const s = holdingSummary([
      trade({ type: 'buy', shares: '2', price: '400', date: '2026-01-01' }),
      trade({ type: 'buy', shares: '1', price: '430', date: '2026-02-01' }),
      trade({ type: 'valuation', shares: '0', price: '380', date: '2026-03-01' })
    ]);
    expect(s.shares).toBe('3');
    expect(s.costBasis).toBe(123000);
    expect(s.marketValue).toBe(114000);
    expect(s.unrealizedPL).toBe(-9000);
    expect(s.returnRate).toBeCloseTo(-0.0732, 3);
  });

  it('ventas con acciones fraccionarias', () => {
    const s = holdingSummary([
      trade({ type: 'buy', shares: '0.5', price: '100', date: '2026-01-01' }),
      trade({ type: 'sell', shares: '0.25', price: '120', date: '2026-02-01' })
    ]);
    expect(s.shares).toBe('0.25');
    expect(s.realizedPL).toBe(500);
    expect(s.costBasis).toBe(2500);
  });
});

describe('simulaciones hipotéticas', () => {
  it('sin rendimiento, suma lineal de aportes', () => {
    const r = simulate({ months: 12, weeklySavings: 5000, weeklyInvestment: 0, startSavings: 0, startInvestments: 0, hypotheticalAnnualReturn: '0' });
    expect(r.weeks).toBe(52);
    expect(r.final.total).toBe(260000);
    expect(r.hypothetical).toBe(true);
    expect(r.hypotheticalGrowth).toBe(0);
  });

  it('3, 6, 12 y 24 meses', () => {
    const weeks = [3, 6, 12, 24].map((m) => simulate({ months: m, weeklySavings: 1000, weeklyInvestment: 1000, startSavings: 0, startInvestments: 0, hypotheticalAnnualReturn: '0.05' }).weeks);
    expect(weeks).toEqual([13, 26, 52, 104]);
  });
});

describe('metas', () => {
  it('fecha estimada según aportación semanal', () => {
    expect(estimateCompletion(50000, 5000, '2026-11-06')).toBe('2027-01-15');
    expect(estimateCompletion(50000, 0, '2026-11-06')).toBeNull();
  });

  it('marca como corto plazo metas a menos de 2 años', () => {
    const p = goalProgress({
      goal: { id: 'g', name: 'Viaje', target: 100000, priority: 1, type: 'envelope', envelopeIds: ['e'], deadline: '2027-06-01', archived: false, createdAt: '' },
      envelopeBalances: new Map([['e', 25000]]),
      netWorth: 0,
      weeklyRate: 5000,
      today: '2026-11-06'
    });
    expect(p.ratio).toBe(0.25);
    expect(p.shortTerm).toBe(true);
  });
});

describe('suscripciones y estadísticas', () => {
  it('equivalentes mensuales', () => {
    expect(monthlyEquivalent(1000, 'weekly')).toBe(4333);
    expect(monthlyEquivalent(12000, 'yearly')).toBe(1000);
    expect(monthlyEquivalent(2024, 'unknown')).toBeNull();
  });

  it('recordatorio de renovación', () => {
    const sub: Subscription = { id: 's', name: 'x', price: 999, frequency: 'monthly', renewalDate: '2026-10-08', status: 'active', paymentMethod: '', reminderDays: 3, notes: '', cancelledAt: null, createdAt: '' };
    expect(needsReminder(sub, '2026-11-06')).toBe(true);
    expect(needsReminder({ ...sub, status: 'cancelled' }, '2026-11-06')).toBe(false);
  });

  it('temporada alta vs baja y claves de semana a través del año', () => {
    const b = (income: number): WeeklyBudget => ({ income } as WeeklyBudget);
    const s = seasonComparison([b(50000), b(60000), b(110000)], 80000);
    expect(s.low).toEqual({ weeks: 2, total: 110000, average: 55000 });
    expect(s.high.average).toBe(110000);
    expect(weekKeys('2027-01-06', 3)).toEqual(['2026-12-21', '2026-12-28', '2027-01-04']);
  });
});
