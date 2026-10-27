import { describe, expect, it } from 'vitest';
import { applyRate, centsToInput, divideCentsUp, formatMoney, sumCents, toCents } from '@/lib/money';

describe('dinero con precisión decimal', () => {
  it('convierte a centavos sin errores de coma flotante', () => {
    expect(toCents('0.1') + toCents('0.2')).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents('$1,100.00')).toBe(110000);
    expect(toCents('1.005')).toBe(101);
    expect(toCents('')).toBe(0);
    expect(toCents('abc')).toBe(0);
  });

  it('aplica porcentajes con redondeo al centavo', () => {
    expect(applyRate(80000, '0.25')).toBe(20000);
    expect(applyRate(55555, '0.25')).toBe(13889); // 138.8875 → 138.89
    expect(applyRate(33333, '0.153')).toBe(5100);
  });

  it('divide redondeando hacia arriba para reservas', () => {
    expect(divideCentsUp(40000, 3)).toBe(13334);
    expect(divideCentsUp(40000, 5)).toBe(8000);
  });

  it('suma y formatea', () => {
    expect(sumCents([1623, 3446, 999])).toBe(6068);
    expect(centsToInput(6068)).toBe('60.68');
    expect(formatMoney(41000)).toContain('410.00');
  });
});
