import { Rocket, ShieldAlert, Sprout } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MODE_LABELS, type BudgetMode } from '@/models/types';

const MODE_STYLE: Record<BudgetMode, { variant: 'destructive' | 'warning' | 'success'; icon: typeof Rocket; text: string }> = {
  survival: { variant: 'destructive', icon: ShieldAlert, text: 'Ingresos insuficientes: se protegen los gastos esenciales.' },
  stability: { variant: 'warning', icon: Sprout, text: 'Gastos cubiertos; las reservas aún están incompletas. Se prioriza el ahorro.' },
  growth: { variant: 'success', icon: Rocket, text: 'Obligaciones y reservas cubiertas. Puedes aportar a inversiones.' }
};

export function ModeBadge({ mode }: { mode: BudgetMode }) {
  const s = MODE_STYLE[mode];
  return (
    <Badge variant={s.variant} className="px-2.5 py-1">
      <s.icon className="size-3.5" />
      {MODE_LABELS[mode]}
    </Badge>
  );
}

export const modeDescription = (mode: BudgetMode) => MODE_STYLE[mode].text;
