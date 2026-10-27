/**
 * Utilidades de fechas basadas en strings ISO "YYYY-MM-DD".
 * Se trabaja internamente en UTC para que los cálculos no dependan
 * de la zona horaria ni de cambios de horario de verano.
 */
export type ISODate = string;

const DAY_MS = 86_400_000;

export function parseISO(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISO(date: Date): ISODate {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fecha local del dispositivo (lo que el usuario considera "hoy"). */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidISO(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return toISO(parseISO(date)) === date;
}

export function addDays(date: ISODate, days: number): ISODate {
  return toISO(new Date(parseISO(date).getTime() + days * DAY_MS));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / DAY_MS);
}

/** 0 = domingo … 5 = viernes … 6 = sábado */
export function weekday(date: ISODate): number {
  return parseISO(date).getUTCDay();
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Suma meses respetando el último día del mes (31 ene + 1 mes = 28/29 feb). */
export function addMonths(date: ISODate, months: number, preferredDay?: number): ISODate {
  const d = parseISO(date);
  const day = preferredDay ?? d.getUTCDate();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return toISO(new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m)))));
}

export function addYears(date: ISODate, years: number): ISODate {
  return addMonths(date, years * 12);
}

/** Lunes de la semana que contiene la fecha. Clave estable aunque la semana cruce meses o años. */
export function weekStart(date: ISODate): ISODate {
  const wd = weekday(date);
  const offset = (wd + 6) % 7; // lunes = 0
  return addDays(date, -offset);
}

export function weekEnd(date: ISODate): ISODate {
  return addDays(weekStart(date), 6);
}

/** Primer día de la semana indicado (p. ej. viernes = 5) en o después de `date`. */
export function nextWeekdayOnOrAfter(date: ISODate, targetWeekday: number): ISODate {
  const diff = (targetWeekday - weekday(date) + 7) % 7;
  return addDays(date, diff);
}

/** Día de cobro de la semana que contiene `date`. */
export function paydayOfWeek(date: ISODate, paydayWeekday: number): ISODate {
  const start = weekStart(date);
  const offset = (paydayWeekday + 6) % 7;
  return addDays(start, offset);
}

/**
 * Cuántos días de cobro hay desde `from` (incluido) hasta `to` (incluido).
 * Si el vencimiento cae antes de cualquier cobro, devuelve 0.
 */
export function countWeekdaysBetween(from: ISODate, to: ISODate, targetWeekday: number): number {
  if (diffDays(to, from) < 0) return 0;
  const first = nextWeekdayOnOrAfter(from, targetWeekday);
  const span = diffDays(to, first);
  if (span < 0) return 0;
  return Math.floor(span / 7) + 1;
}

/** Siguiente ocurrencia del día del mes (1–31) en o después de `from`. */
export function nextMonthlyOccurrence(from: ISODate, dayOfMonth: number): ISODate {
  const d = parseISO(from);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const candidate = toISO(new Date(Date.UTC(y, m, Math.min(dayOfMonth, daysInMonth(y, m)))));
  if (diffDays(candidate, from) >= 0) return candidate;
  return addMonths(candidate, 1, dayOfMonth);
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function isBetween(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

const longFmt = new Intl.DateTimeFormat('es-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('es-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('es-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('es-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const formatDateLong = (d: ISODate) => longFmt.format(parseISO(d));
export const formatDateShort = (d: ISODate) => shortFmt.format(parseISO(d)).replace('.', '');
export const formatMonth = (m: string) => monthFmt.format(parseISO(`${m}-01`));
export const formatWeekdayLong = (d: ISODate) => weekdayFmt.format(parseISO(d));

export function formatWeekRange(start: ISODate): string {
  return `${formatDateShort(start)} – ${formatDateShort(addDays(start, 6))}`;
}

export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
