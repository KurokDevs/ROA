import type { Account, Envelope, Goal, Settings, Subscription } from '@/models/types';

/**
 * Configuración inicial de ROA Finance (todo editable desde la app).
 * IDs estables para que las copias de seguridad sean predecibles.
 */
export function defaultSettings(createdAt: string): Settings {
  return {
    id: 'main',
    currency: 'USD',
    paydayWeekday: 5,
    taxMode: '1099',
    taxRate: '0.25',
    lowSeasonMin: 50000,
    lowSeasonMax: 60000,
    highSeasonMax: 110000,
    highSeasonThreshold: 80000,
    surplusToSavingsRate: '0.5',
    surplusToInvestRate: '0.5',
    vehicleMinBalance: 15000,
    defaultAccountId: 'acc_main',
    onboarded: false,
    createdAt
  };
}

export function defaultAccounts(createdAt: string): Account[] {
  return [
    { id: 'acc_main', name: 'Cuenta principal', type: 'checking', openingBalance: 0, archived: false, createdAt },
    { id: 'acc_savings', name: 'Cuenta de ahorro', type: 'savings', openingBalance: 0, archived: false, createdAt },
    { id: 'acc_cash', name: 'Efectivo', type: 'cash', openingBalance: 0, archived: false, createdAt },
    { id: 'acc_broker', name: 'Bróker (inversiones)', type: 'investment', openingBalance: 0, archived: false, createdAt }
  ];
}

type EnvSeed = Partial<Envelope> & Pick<Envelope, 'id' | 'name' | 'icon' | 'tier' | 'method'>;

function env(seed: EnvSeed, createdAt: string): Envelope {
  return {
    weeklyAmount: 0,
    billAmount: 0,
    billFrequency: 'monthly',
    dueDay: null,
    nextDueDate: null,
    targetAmount: 0,
    minBeforeInvest: 0,
    isVehicle: false,
    system: null,
    priority: 10,
    archived: false,
    createdAt,
    ...seed
  };
}

export function defaultEnvelopes(createdAt: string): Envelope[] {
  const list: EnvSeed[] = [
    { id: 'env_tax', name: 'Impuestos', icon: 'landmark', tier: 'tax', method: 'tax', system: 'tax', priority: 0 },
    { id: 'env_rent', name: 'Alquiler', icon: 'home', tier: 'essential', method: 'bill', billAmount: 40000, weeklyAmount: 10000, priority: 1 },
    { id: 'env_phone', name: 'Teléfono', icon: 'smartphone', tier: 'essential', method: 'bill', billAmount: 12000, weeklyAmount: 3000, priority: 2 },
    { id: 'env_insurance', name: 'Seguro del carro', icon: 'shield-check', tier: 'essential', method: 'bill', billAmount: 12000, weeklyAmount: 3000, isVehicle: true, priority: 3 },
    { id: 'env_gas', name: 'Gasolina', icon: 'fuel', tier: 'work', method: 'topup', weeklyAmount: 15000, isVehicle: true, priority: 1 },
    { id: 'env_maint', name: 'Mantenimiento del carro', icon: 'wrench', tier: 'work', method: 'fixed', weeklyAmount: 1000, targetAmount: 30000, isVehicle: true, system: 'vehicle_maint', priority: 2 },
    { id: 'env_debts', name: 'Pagos pendientes', icon: 'receipt', tier: 'debt', method: 'debts', system: 'debts', priority: 1 },
    { id: 'env_personal', name: 'Personal', icon: 'user', tier: 'living', method: 'topup', weeklyAmount: 5000, priority: 1 },
    { id: 'env_couple', name: 'Pareja', icon: 'heart', tier: 'living', method: 'topup', weeklyAmount: 5000, priority: 2 },
    { id: 'env_subs', name: 'Suscripciones', icon: 'repeat', tier: 'living', method: 'subscriptions', system: 'subscriptions', priority: 3 },
    { id: 'env_emergency', name: 'Fondo de emergencia', icon: 'life-buoy', tier: 'savings', method: 'fixed', weeklyAmount: 4000, targetAmount: 200000, minBeforeInvest: 50000, system: 'emergency', priority: 1 },
    { id: 'env_car_fund', name: 'Fondo del carro', icon: 'car', tier: 'savings', method: 'fixed', weeklyAmount: 2000, targetAmount: 100000, isVehicle: true, system: 'vehicle_fund', priority: 2 },
    { id: 'env_goals', name: 'Objetivos', icon: 'target', tier: 'savings', method: 'fixed', weeklyAmount: 0, priority: 5 },
    { id: 'env_invest', name: 'Inversiones', icon: 'trending-up', tier: 'investment', method: 'investment', system: 'investment', priority: 1 }
  ];
  return list.map((s) => env(s, createdAt));
}

export function defaultGoals(createdAt: string): Goal[] {
  const base = { archived: false, createdAt, deadline: null };
  return [
    { ...base, id: 'goal_immediate', name: 'Fondo inmediato', target: 50000, priority: 1, type: 'envelope', envelopeIds: ['env_emergency'] },
    { ...base, id: 'goal_emergency', name: 'Reserva de emergencia total', target: 200000, priority: 2, type: 'envelope', envelopeIds: ['env_emergency'] },
    { ...base, id: 'goal_car', name: 'Fondo independiente del carro', target: 100000, priority: 3, type: 'envelope', envelopeIds: ['env_car_fund'] },
    { ...base, id: 'goal_nw5', name: 'Patrimonio de $5,000', target: 500000, priority: 4, type: 'networth', envelopeIds: [] },
    { ...base, id: 'goal_nw10', name: 'Patrimonio de $10,000', target: 1000000, priority: 5, type: 'networth', envelopeIds: [] }
  ];
}

export function defaultSubscriptions(createdAt: string): Subscription[] {
  const base = { renewalDate: null, paymentMethod: 'Tarjeta', reminderDays: 3, cancelledAt: null, createdAt, status: 'pending_cancel' as const };
  return [
    { ...base, id: 'sub_jagex', name: 'RuneScape / Jagex', price: 1623, frequency: 'monthly', notes: 'Pendiente de cancelación. Verifica la periodicidad.' },
    { ...base, id: 'sub_crunch', name: 'Crunch Fitness', price: 3446, frequency: 'monthly', notes: 'Pendiente de cancelación.' },
    { ...base, id: 'sub_tinder', name: 'Tinder', price: 2024, frequency: 'unknown', notes: 'Cargos de $20.24. Frecuencia pendiente de verificar.' },
    { ...base, id: 'sub_google_one', name: 'Google One', price: 999, frequency: 'monthly', notes: 'Pendiente de cancelación.' }
  ];
}
