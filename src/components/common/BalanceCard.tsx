import { Wifi } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Money } from './Money';
import { MODE_LABELS, type BudgetMode } from '@/models/types';
import type { Cents } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Tarjeta de saldo disponible inspirada en el bloque card-display-01 de
 * Creative Tim UI (tarjeta oscura con chip y brillo al pasar el cursor).
 */
export function BalanceCard({ available, liquid, reserved, mode }: { available: Cents; liquid: Cents; reserved: Cents; mode?: BudgetMode }) {
  return (
    <Card className="group relative overflow-hidden border-neutral-800 bg-neutral-950 text-white shadow-lg transition-all duration-300 hover:shadow-2xl animate-fade-up dark:border-white/10 dark:bg-neutral-900">
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative flex items-center justify-between p-6 pb-2">
        <div className="rounded-lg bg-white/10 p-2">
          <Wifi className="size-6 rotate-90" />
        </div>
        {mode ? (
          <span className="rounded-md border border-white/30 bg-white/20 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">{MODE_LABELS[mode]}</span>
        ) : (
          <div className="h-10 w-14 rounded bg-gradient-to-br from-yellow-400 to-yellow-600">
            <div className="size-full rounded bg-gradient-to-tr from-transparent via-white/20 to-white/40" />
          </div>
        )}
      </div>

      <div className="relative px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Saldo disponible</p>
        <Money cents={available} className={cn('mt-1 block text-4xl font-bold tracking-tight sm:text-5xl', available < 0 && 'text-red-400')} />
        <p className="mt-1 text-xs text-neutral-400">Dinero realmente libre después de apartar compromisos</p>
      </div>

      <div className="relative flex items-end justify-between gap-6 p-6 pt-2">
        <div className="flex gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">En cuentas</p>
            <Money cents={liquid} className="text-sm font-bold" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Apartado</p>
            <Money cents={reserved} className="text-sm font-bold" />
          </div>
        </div>
        <span className="text-sm font-bold tracking-[0.2em] text-neutral-300">ROA</span>
      </div>
    </Card>
  );
}
