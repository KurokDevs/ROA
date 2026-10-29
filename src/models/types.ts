import type { Cents } from '@/lib/money';
import type { ISODate } from '@/lib/dates';

/**
 * Niveles de prioridad del organizador semanal, en orden estricto.
 * Nunca se financia un nivel inferior mientras uno superior tenga déficit.
 */
export type Tier = 'essential' | 'work' | 'debt' | 'living' | 'savings' | 'investment';

export const TIER_ORDER: Tier[] = ['essential', 'work', 'debt', 'living', 'savings', 'investment'];

/** Niveles que se consideran obligaciones (modo Supervivencia si no se cubren). */
export const OBLIGATION_TIERS: Tier[] = ['essential', 'work', 'debt', 'living'];

/**
 * Cómo calcula el organizador la aportación de un sobre:
 * - bill: factura (mensual/anual). Con fecha de vencimiento reparte lo que falta
 *   entre los cobros restantes; sin fecha usa la reserva semanal con tope en el importe.
 * - topup: rellena hasta la cantidad semanal (gasolina, personal…).
 * - fixed: aporta la cantidad semanal hasta alcanzar el objetivo (si lo hay).
 * - subscriptions: equivalente semanal de las suscripciones que siguen cobrando.
 * - debts: pagos pendientes de deudas y adelantos.
 * - investment: solo en modo Crecimiento.
 */
export type FundingMethod = 'bill' | 'topup' | 'fixed' | 'subscriptions' | 'debts' | 'investment';

export type BillFrequency = 'weekly' | 'monthly' | 'yearly';

export type SystemEnvelope = 'subscriptions' | 'debts' | 'investment' | 'emergency' | 'vehicle_fund' | 'vehicle_maint';

export interface Envelope {
  id: string;
  name: string;
  icon: string;
  tier: Tier;
  method: FundingMethod;
  /** Reserva/aportación semanal de referencia. */
  weeklyAmount: Cents;
  /** Costo real de la factura (para method = bill). */
  billAmount: Cents;
  billFrequency: BillFrequency;
  /** Día del mes en que vence la factura (1–31). */
  dueDay: number | null;
  /** Próximo vencimiento pendiente. Avanza al registrar el pago de la factura. */
  nextDueDate: ISODate | null;
  /** Cantidad objetivo del sobre (0 = sin objetivo). */
  targetAmount: Cents;
  /** Saldo mínimo que debe tener antes de permitir inversiones. */
  minBeforeInvest: Cents;
  /** Sobre protegido del vehículo (herramienta de trabajo). */
  isVehicle: boolean;
  system: SystemEnvelope | null;
  priority: number;
  archived: boolean;
  createdAt: string;
}

export type EnvelopeEntryKind = 'allocation' | 'move' | 'adjust';

/** Movimiento interno de un sobre (no es ingreso ni gasto). */
export interface EnvelopeEntry {
  id: string;
  envelopeId: string;
  date: ISODate;
  /** Positivo = entra al sobre, negativo = sale. */
  amount: Cents;
  kind: EnvelopeEntryKind;
  budgetId: string | null;
  moveId: string | null;
  note: string;
  createdAt: string;
}

export type AccountType = 'checking' | 'savings' | 'cash' | 'investment' | 'credit';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: Cents;
  archived: boolean;
  createdAt: string;
}

export type TxType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'debt_payment'
  | 'advance_received'
  | 'advance_repaid'
  | 'fee'
  | 'contribution';

export interface Transaction {
  id: string;
  date: ISODate;
  type: TxType;
  /** Siempre positivo; el tipo determina el signo. */
  amount: Cents;
  accountId: string;
  toAccountId: string | null;
  /** Sobre del que sale el dinero (gastos, pagos, aportaciones a inversión). */
  envelopeId: string | null;
  category: string;
  description: string;
  debtId: string | null;
  budgetId: string | null;
  /** Gasto del trabajo de delivery (se lista aparte en Trabajo y millas). */
  isBusiness: boolean;
  /** Pago de factura: avanza el vencimiento del sobre. */
  isBillPayment: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DebtKind = 'debt' | 'advance';

export interface Debt {
  id: string;
  name: string;
  kind: DebtKind;
  originalAmount: Cents;
  weeklyPayment: Cents;
  dueDate: ISODate | null;
  /** Transacción de adelanto que originó la deuda (si aplica). */
  sourceTxId: string | null;
  closed: boolean;
  notes: string;
  createdAt: string;
}

export type BudgetMode = 'survival' | 'stability' | 'growth';

export interface BudgetLine {
  key: string;
  envelopeId: string;
  debtId: string | null;
  label: string;
  tier: Tier;
  /** Lo que el sobre necesitaría completo esta semana. */
  need: Cents;
  /** Lo que recomienda el organizador. */
  recommended: Cents;
  /** Lo que el usuario decidió apartar. */
  amount: Cents;
  reason: string;
  /** El usuario confirmó que movió el dinero en su banco. */
  transferred: boolean;
  transferredAt: string | null;
}

export interface WeeklyBudget {
  id: string;
  /** Lunes de la semana (clave única: impide presupuestos duplicados). */
  weekKey: ISODate;
  payDate: ISODate;
  income: Cents;
  mode: BudgetMode;
  lines: BudgetLine[];
  unassigned: Cents;
  deficit: Cents;
  accountId: string;
  incomeTxId: string;
  note: string;
  createdAt: string;
  confirmedAt: string;
  updatedAt: string;
}

export type GoalType = 'envelope' | 'networth';

export interface Goal {
  id: string;
  name: string;
  target: Cents;
  priority: number;
  type: GoalType;
  envelopeIds: string[];
  deadline: ISODate | null;
  archived: boolean;
  createdAt: string;
}

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly' | 'unknown';
export type SubscriptionStatus = 'active' | 'pending_cancel' | 'cancelled' | 'paused';

export interface Subscription {
  id: string;
  name: string;
  price: Cents;
  frequency: SubscriptionFrequency;
  renewalDate: ISODate | null;
  status: SubscriptionStatus;
  paymentMethod: string;
  reminderDays: number;
  notes: string;
  cancelledAt: ISODate | null;
  createdAt: string;
}

export interface MileageLog {
  id: string;
  date: ISODate;
  /** Millas como string decimal ("12.4"). */
  miles: string;
  purpose: string;
  notes: string;
  createdAt: string;
}

export type Horizon = 'long' | 'short';

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  horizon: Horizon;
  accountId: string;
  archived: boolean;
  createdAt: string;
}

export type TradeType = 'buy' | 'sell' | 'valuation';

export interface Trade {
  id: string;
  holdingId: string;
  date: ISODate;
  type: TradeType;
  /** Acciones como string decimal (admite fracciones). */
  shares: string;
  /** Precio por acción en dólares, string decimal. */
  price: string;
  fees: Cents;
  note: string;
  createdAt: string;
}

export interface Settings {
  id: 'main';
  currency: 'USD';
  /** 5 = viernes */
  paydayWeekday: number;
  lowSeasonMin: Cents;
  lowSeasonMax: Cents;
  highSeasonMax: Cents;
  /** Ingreso semanal a partir del cual se considera temporada alta. */
  highSeasonThreshold: Cents;
  /** Porción del excedente que va a ahorro en modo Estabilidad. */
  surplusToSavingsRate: string;
  /** Porción del excedente que va a inversiones en modo Crecimiento. */
  surplusToInvestRate: string;
  /** Aviso si el sobre de mantenimiento baja de este saldo. */
  vehicleMinBalance: Cents;
  defaultAccountId: string;
  onboarded: boolean;
  createdAt: string;
}

export const TIER_LABELS: Record<Tier, string> = {
  essential: 'Esenciales',
  work: 'Trabajo y vehículo',
  debt: 'Pagos pendientes',
  living: 'Vida diaria',
  savings: 'Ahorro',
  investment: 'Inversión'
};

export const MODE_LABELS: Record<BudgetMode, string> = {
  survival: 'Supervivencia',
  stability: 'Estabilidad',
  growth: 'Crecimiento'
};

export const TX_TYPE_LABELS: Record<TxType, string> = {
  income: 'Ingreso laboral',
  expense: 'Gasto',
  transfer: 'Transferencia propia',
  debt_payment: 'Pago de deuda',
  advance_received: 'Adelanto recibido',
  advance_repaid: 'Devolución de adelanto',
  fee: 'Comisión',
  contribution: 'Aportación ahorro/inversión'
};

export const CATEGORIES = [
  'Vivienda',
  'Servicios',
  'Teléfono',
  'Seguro',
  'Gasolina',
  'Peajes',
  'Mantenimiento vehículo',
  'Reparación vehículo',
  'Comida',
  'Supermercado',
  'Pareja',
  'Salud',
  'Entretenimiento',
  'Suscripciones',
  'Trabajo delivery',
  'Comisiones',
  'Deudas',
  'Ahorro',
  'Inversión',
  'Otros'
] as const;

export const VEHICLE_CATEGORIES = ['Gasolina', 'Peajes', 'Mantenimiento vehículo', 'Reparación vehículo', 'Seguro', 'Trabajo delivery'];
