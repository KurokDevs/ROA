import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatMoney, type Cents } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Cambio frente a la semana anterior. `goodWhenUp=false` para gastos. */
export function Delta({ current, previous, goodWhenUp = true, className }: { current: Cents; previous: Cents | null; goodWhenUp?: boolean; className?: string }) {
  if (previous === null) return <span className={cn('block text-xs text-muted-foreground', className)}>Sin semana anterior</span>;
  const diff = current - previous;
  if (diff === 0)
    return (
      <span className={cn('flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground', className)}>
        <Minus className="size-3" /> igual que la semana pasada
      </span>
    );
  const up = diff > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const pct = previous !== 0 ? Math.round((Math.abs(diff) / Math.abs(previous)) * 100) : null;
  return (
    <span className={cn('flex flex-wrap items-center gap-0.5 text-xs font-medium', good ? 'text-success' : 'text-destructive', className)}>
      <Icon className="size-3.5" />
      {formatMoney(Math.abs(diff))}
      {pct !== null && <span className="font-normal opacity-80">({pct}%)</span>}
      <span className="font-normal text-muted-foreground">vs. semana pasada</span>
    </span>
  );
}
