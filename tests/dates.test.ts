import { describe, expect, it } from 'vitest';
import { addMonths, countWeekdaysBetween, nextMonthlyOccurrence, paydayOfWeek, weekStart, weekday } from '@/lib/dates';

describe('fechas y semanas', () => {
  it('la clave de semana es el lunes, aunque la semana cruce meses', () => {
    expect(weekStart('2026-10-30')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // domingo
    expect(weekStart('2026-07-03')).toBe('2026-06-29');
  });

  it('semanas que cruzan de año', () => {
    // Viernes 1 de enero de 2027 pertenece a la semana del lunes 28 dic 2026
    expect(weekday('2027-01-01')).toBe(5);
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
    expect(paydayOfWeek('2026-12-28', 5)).toBe('2027-01-01');
  });

  it('cuenta los viernes hasta un vencimiento', () => {
    // Enero 2027 tiene 5 viernes: 1, 8, 15, 22, 29
    expect(countWeekdaysBetween('2027-01-01', '2027-01-31', 5)).toBe(5);
    // Febrero 2027: 5, 12, 19, 26
    expect(countWeekdaysBetween('2027-02-01', '2027-02-28', 5)).toBe(4);
    expect(countWeekdaysBetween('2026-11-06', '2026-11-06', 5)).toBe(1);
    expect(countWeekdaysBetween('2026-11-07', '2026-11-12', 5)).toBe(0);
  });

  it('meses con días que no existen', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2027-02-28', 1, 31)).toBe('2027-03-31');
    expect(nextMonthlyOccurrence('2026-12-15', 1)).toBe('2027-01-01');
    expect(nextMonthlyOccurrence('2027-02-10', 31)).toBe('2027-02-28');
  });
});
