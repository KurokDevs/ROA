import { describe, expect, it } from 'vitest';
import { billNeed } from '@/engine/allocation';
import { addDays } from '@/lib/dates';
import { advanceDueDate } from '@/services/transactionService';
import { seedEnvelopes } from './helpers';
import type { Envelope } from '@/models/types';

const rent = (patch: Partial<Envelope> = {}): Envelope => ({ ...seedEnvelopes().find((e) => e.id === 'env_rent')!, dueDay: 1, ...patch });

describe('facturas mensuales y acumulación de sobres', () => {
  it('sin fecha de vencimiento usa la reserva semanal con tope en el importe', () => {
    const env = rent({ dueDay: null, nextDueDate: null });
    expect(billNeed(env, 0, '2026-11-06', 5).need).toBe(10000);
    expect(billNeed(env, 35000, '2026-11-06', 5).need).toBe(5000);
    expect(billNeed(env, 40000, '2026-11-06', 5).need).toBe(0);
  });

  it('mes de cinco viernes: reparte entre 5 cobros y llega exacto al vencimiento', () => {
    // Alquiler $400 vence el 1 de enero de 2027. Cobros: 4, 11, 18, 25 dic y 1 ene.
    let env = rent({ nextDueDate: '2027-01-01' });
    let balance = 0;
    const allocated: number[] = [];
    let payday = '2026-12-04';
    const paid: { date: string; before: number }[] = [];
    for (let i = 0; i < 13; i++) {
      const { need } = billNeed(env, balance, payday, 5);
      balance += need;
      allocated.push(need);
      // Pagar la factura cuando llega su vencimiento (antes del siguiente cobro)
      while (env.nextDueDate && env.nextDueDate < addDays(payday, 7)) {
        paid.push({ date: env.nextDueDate, before: balance });
        balance -= env.billAmount;
        env = { ...env, nextDueDate: advanceDueDate(env, env.nextDueDate) };
      }
      payday = addDays(payday, 7);
    }
    expect(allocated.slice(0, 5)).toEqual([8000, 8000, 8000, 8000, 8000]);
    // Febrero: 8, 15, 22, 29 ene → 4 cobros de $100
    expect(allocated.slice(5, 9)).toEqual([10000, 10000, 10000, 10000]);
    for (const p of paid) expect(p.before).toBeGreaterThanOrEqual(40000);
    expect(paid.map((p) => p.date)).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it('pago anticipado: con el sobre lleno no pide más', () => {
    const env = rent({ nextDueDate: '2026-12-01' });
    expect(billNeed(env, 40000, '2026-11-06', 5).need).toBe(0);
    // Tras pagar antes de tiempo, el siguiente vencimiento salta al mes siguiente
    expect(advanceDueDate(env, '2026-11-20')).toBe('2027-01-01');
  });

  it('factura vencida sin cubrir: pide todo lo que falta', () => {
    const env = rent({ nextDueDate: '2026-11-01' });
    const r = billNeed(env, 15000, '2026-11-06', 5);
    expect(r.need).toBe(25000);
    expect(r.reason).toMatch(/vencida/i);
  });

  it('vencimiento que cruza de año', () => {
    const env = rent({ nextDueDate: null, dueDay: 5 });
    // Desde el viernes 25 dic 2026, el próximo 5 es el 5 ene 2027: cobros 25 dic y 1 ene
    expect(billNeed(env, 0, '2026-12-25', 5).need).toBe(20000);
  });

  it('factura anual', () => {
    const env = rent({ billFrequency: 'yearly', billAmount: 52000, dueDay: null, nextDueDate: '2027-11-06' });
    // 53 viernes entre 6 nov 2026 y 5 nov 2027 inclusive (el propio 6 nov 2027 también es viernes)
    expect(billNeed(env, 0, '2026-11-06', 5).need).toBe(982);
    expect(advanceDueDate(env, '2027-11-06')).toBe('2028-11-06');
  });
});
