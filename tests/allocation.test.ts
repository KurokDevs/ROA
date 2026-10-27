import { describe, expect, it } from 'vitest';
import { buildPlan, summarizeLines, validateLines } from '@/engine/allocation';
import { amountOf, debt, planInput, seedEnvelopes } from './helpers';

const OBLIGATIONS = ['env_rent', 'env_phone', 'env_insurance', 'env_gas', 'env_maint', 'env_personal', 'env_couple', 'env_subs'];

describe('organizador semanal con la configuración inicial (1099, 25 %)', () => {
  it('semana de $500: Supervivencia con déficit, sin ahorro ni inversión', () => {
    const r = buildPlan(planInput(50000));
    expect(r.mode).toBe('survival');
    expect(r.taxAmount).toBe(12500);
    expect(amountOf(r.lines, 'env_rent')).toBe(10000);
    expect(amountOf(r.lines, 'env_phone')).toBe(3000);
    expect(amountOf(r.lines, 'env_insurance')).toBe(3000);
    expect(amountOf(r.lines, 'env_gas')).toBe(15000);
    expect(amountOf(r.lines, 'env_maint')).toBe(1000);
    expect(amountOf(r.lines, 'env_personal')).toBe(5000);
    expect(amountOf(r.lines, 'env_couple')).toBe(500);
    expect(amountOf(r.lines, 'env_subs')).toBe(0);
    expect(r.deficit).toBe(4500 + 1401);
    expect(r.unassigned).toBe(0);
    expect(r.lines.some((l) => l.tier === 'savings' || l.tier === 'investment')).toBe(false);
    expect(r.shortfalls.map((s) => s.key)).toEqual(['env_couple', 'env_subs']);
  });

  it('semana de $600: obligaciones cubiertas, el resto a emergencias (Estabilidad)', () => {
    const r = buildPlan(planInput(60000));
    expect(r.mode).toBe('stability');
    expect(r.deficit).toBe(0);
    expect(amountOf(r.lines, 'env_subs')).toBe(1401);
    expect(amountOf(r.lines, 'env_emergency')).toBe(1599);
    expect(amountOf(r.lines, 'env_car_fund')).toBe(0);
    expect(r.unassigned).toBe(0);
    expect(r.totalAllocated).toBe(60000);
  });

  it('semana de $800: ahorro base + refuerzo del 50 % del excedente', () => {
    const r = buildPlan(planInput(80000));
    expect(r.mode).toBe('stability');
    expect(r.taxAmount).toBe(20000);
    expect(amountOf(r.lines, 'env_emergency')).toBe(4000 + 5300);
    expect(amountOf(r.lines, 'env_car_fund')).toBe(2000);
    expect(amountOf(r.lines, 'env_invest')).toBe(0);
    expect(r.unassigned).toBe(5299);
    expect(r.totalAllocated + r.unassigned).toBe(80000);
  });

  it('semana de $1,100 sin reservas: sigue priorizando ahorro, no invierte', () => {
    const r = buildPlan(planInput(110000));
    expect(r.mode).toBe('stability');
    expect(r.taxAmount).toBe(27500);
    expect(amountOf(r.lines, 'env_invest')).toBe(0);
    expect(amountOf(r.lines, 'env_emergency')).toBe(4000 + 16550);
    expect(r.unassigned).toBe(16549);
  });

  it('semana de $1,100 con reserva mínima cubierta: Crecimiento e inversión', () => {
    const r = buildPlan(planInput(110000, { balances: { env_emergency: 50000 } }));
    expect(r.mode).toBe('growth');
    expect(amountOf(r.lines, 'env_emergency')).toBe(4000);
    expect(amountOf(r.lines, 'env_invest')).toBe(16550);
    expect(r.unassigned).toBe(16549);
  });

  it('nunca invierte ni ahorra con déficit aunque las reservas estén llenas', () => {
    const r = buildPlan(planInput(40000, { balances: { env_emergency: 200000 } }));
    expect(r.mode).toBe('survival');
    expect(amountOf(r.lines, 'env_invest')).toBe(0);
    expect(amountOf(r.lines, 'env_emergency')).toBe(0);
  });

  it('el total asignado + sin asignar siempre cuadra con el ingreso', () => {
    for (const income of [1, 9999, 43401, 50000, 60000, 77777, 80000, 110000, 250000]) {
      const r = buildPlan(planInput(income));
      expect(r.totalAllocated + r.unassigned).toBe(income);
      expect(r.lines.every((l) => l.amount >= 0)).toBe(true);
    }
  });

  it('es determinista: mismas entradas, mismo resultado', () => {
    const a = buildPlan(planInput(83217));
    const b = buildPlan(planInput(83217));
    expect(a).toEqual(b);
  });

  it('ingreso cero: todo en déficit', () => {
    const r = buildPlan(planInput(0));
    expect(r.mode).toBe('survival');
    expect(r.totalAllocated).toBe(0);
    expect(r.deficit).toBeGreaterThan(0);
  });
});

describe('saldos existentes y prioridades', () => {
  it('rellena gasolina solo hasta el presupuesto semanal', () => {
    const r = buildPlan(planInput(80000, { balances: { env_gas: 4000 } }));
    expect(amountOf(r.lines, 'env_gas')).toBe(11000);
  });

  it('el fondo de mantenimiento deja de pedir al llegar a su objetivo', () => {
    const r = buildPlan(planInput(80000, { balances: { env_maint: 30000 } }));
    expect(amountOf(r.lines, 'env_maint')).toBe(0);
  });

  it('respeta el orden: obligaciones esenciales antes que trabajo y vida diaria', () => {
    const r = buildPlan(planInput(30000));
    expect(amountOf(r.lines, 'env_rent')).toBe(10000);
    expect(amountOf(r.lines, 'env_gas')).toBe(30000 - 7500 - 16000);
    expect(amountOf(r.lines, 'env_personal')).toBe(0);
  });

  it('el mismo fondo del carro como herramienta de trabajo: mantenimiento antes que vida diaria', () => {
    const r = buildPlan(planInput(50000));
    const order = r.lines.map((l) => l.key);
    expect(order.indexOf('env_maint')).toBeLessThan(order.indexOf('env_personal'));
  });
});

describe('impuestos configurables', () => {
  it('reserva fiscal del 15 %', () => {
    const r = buildPlan(planInput(80000, { taxRate: '0.15' }));
    expect(r.taxAmount).toBe(12000);
  });

  it('reserva fiscal 0 %', () => {
    const r = buildPlan(planInput(80000, { taxRate: '0' }));
    expect(r.taxAmount).toBe(0);
  });

  it('empleado W-2: no aparta impuestos (ya retenidos)', () => {
    const r = buildPlan(planInput(60000, { taxMode: 'w2' }));
    expect(r.taxAmount).toBe(0);
    expect(r.lines.find((l) => l.key === 'env_tax')).toBeUndefined();
    expect(r.mode).toBe('stability');
    expect(amountOf(r.lines, 'env_emergency')).toBe(4000 + 5300);
  });
});

describe('deudas y adelantos pendientes', () => {
  it('financia el pago semanal pactado antes que la vida diaria', () => {
    const r = buildPlan(planInput(60000, { debts: [{ debt: debt({ id: 'd1', originalAmount: 20000, weeklyPayment: 5000 }), balance: 20000 }] }));
    expect(amountOf(r.lines, 'debt:d1')).toBe(5000);
    expect(r.lines.find((l) => l.key === 'debt:d1')?.envelopeId).toBe('env_debts');
    expect(amountOf(r.lines, 'env_emergency')).toBe(0);
  });

  it('un adelanto que vence esta semana se cubre completo', () => {
    const r = buildPlan(
      planInput(80000, {
        payDate: '2026-11-06',
        debts: [{ debt: debt({ id: 'a1', kind: 'advance', originalAmount: 10000, weeklyPayment: 2000, dueDate: '2026-11-10' }), balance: 10000 }]
      })
    );
    expect(amountOf(r.lines, 'debt:a1')).toBe(10000);
  });

  it('lo ya apartado en Pagos pendientes reduce la necesidad', () => {
    const r = buildPlan(
      planInput(80000, { balances: { env_debts: 3000 }, debts: [{ debt: debt({ id: 'd1', originalAmount: 20000, weeklyPayment: 5000 }), balance: 20000 }] })
    );
    expect(amountOf(r.lines, 'debt:d1')).toBe(2000);
  });

  it('ignora deudas saldadas', () => {
    const r = buildPlan(planInput(80000, { debts: [{ debt: debt({ id: 'd1', originalAmount: 20000, weeklyPayment: 5000 }), balance: 0 }] }));
    expect(r.lines.find((l) => l.key === 'debt:d1')).toBeUndefined();
  });
});

describe('edición manual antes de confirmar', () => {
  it('recalcula sin asignar y detecta sobreasignación', () => {
    const r = buildPlan(planInput(80000));
    const edited = r.lines.map((l) => (l.key === 'env_couple' ? { ...l, amount: 2000 } : l));
    const s = summarizeLines(80000, edited);
    expect(s.unassigned).toBe(r.unassigned + 3000);
    expect(validateLines(80000, edited)).toBeNull();

    const over = r.lines.map((l) => (l.key === 'env_rent' ? { ...l, amount: 99999 } : l));
    expect(validateLines(80000, over)).toMatch(/más de lo que cobraste/);
    const neg = r.lines.map((l) => (l.key === 'env_rent' ? { ...l, amount: -1 } : l));
    expect(validateLines(80000, neg)).toMatch(/negativa/);
  });

  it('sobres archivados no reciben dinero', () => {
    const envelopes = seedEnvelopes({ env_couple: { archived: true } });
    const r = buildPlan(planInput(80000, { envelopes }));
    expect(r.lines.find((l) => l.key === 'env_couple')).toBeUndefined();
  });

  it('las obligaciones iniciales suman $410 + mantenimiento + suscripciones', () => {
    const envs = seedEnvelopes();
    const userTable = ['env_rent', 'env_phone', 'env_insurance', 'env_gas', 'env_personal', 'env_couple'];
    const total = envs.filter((e) => userTable.includes(e.id)).reduce((s, e) => s + e.weeklyAmount, 0);
    expect(total).toBe(41000);
    const r = buildPlan(planInput(200000));
    const oblig = r.lines.filter((l) => OBLIGATIONS.includes(l.key)).reduce((s, l) => s + l.amount, 0);
    expect(oblig).toBe(41000 + 1000 + 1401);
  });
});
