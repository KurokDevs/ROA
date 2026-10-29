import { useMemo } from 'react';
import { TIER_COLOR } from './icons';
import { formatMoney, type Cents } from '@/lib/money';
import { TIER_LABELS, TIER_ORDER, type Tier } from '@/models/types';
import { cn } from '@/lib/utils';

export interface DistributionSegment {
  tier: Tier | 'free';
  amount: Cents;
}

/** Barra horizontal que muestra cómo se divide un pago. */
export function DistributionBar({ byTier, unassigned, total, showLegend = true, className }: { byTier: Partial<Record<Tier, Cents>>; unassigned: Cents; total: Cents; showLegend?: boolean; className?: string }) {
  const segments = useMemo(() => {
    const list: DistributionSegment[] = TIER_ORDER.map((t) => ({ tier: t, amount: byTier[t] ?? 0 })).filter((s) => s.amount > 0);
    if (unassigned > 0) list.push({ tier: 'free', amount: unassigned });
    return list;
  }, [byTier, unassigned]);
  const denom = Math.max(total, segments.reduce((s, x) => s + x.amount, 0), 1);

  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label="Distribución del ingreso">
        {segments.map((s, i) => (
          <div
            key={s.tier}
            className={cn('h-full origin-left animate-grow-x', i > 0 && 'border-l-2 border-card')}
            style={{ width: `${(s.amount / denom) * 100}%`, backgroundColor: TIER_COLOR[s.tier], animationDelay: `${i * 60}ms` }}
            title={`${s.tier === 'free' ? 'Sin asignar' : TIER_LABELS[s.tier]}: ${formatMoney(s.amount)}`}
          />
        ))}
      </div>
      {showLegend && segments.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
          {segments.map((s) => (
            <li key={s.tier} className="flex min-w-0 items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: TIER_COLOR[s.tier] }} />
              <span className="truncate text-muted-foreground">{s.tier === 'free' ? 'Sin asignar' : TIER_LABELS[s.tier]}</span>
              <span className="tabular ml-auto font-medium">{Math.round((s.amount / denom) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
