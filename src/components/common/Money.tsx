import { cn } from '@/lib/utils';
import { formatMoney, type Cents } from '@/lib/money';

export function Money({ cents, className, sign, compact, colored }: { cents: Cents; className?: string; sign?: boolean; compact?: boolean; colored?: boolean }) {
  return (
    <span className={cn('tabular whitespace-nowrap', colored && (cents < 0 ? 'text-destructive' : cents > 0 ? 'text-success' : ''), className)}>
      {formatMoney(cents, { sign, compact })}
    </span>
  );
}
