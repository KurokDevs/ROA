import { ArrowLeftRight, ChartColumn, CalendarDays, House, Landmark, Layers, Repeat, Settings, Target, TrendingUp, HandCoins, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Aparece en la barra inferior del móvil. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, primary: true },
  { to: '/semana', label: 'Mi Semana', icon: CalendarDays, primary: true },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight, primary: true },
  { to: '/metas', label: 'Metas', icon: Target, primary: true },
  { to: '/sobres', label: 'Sobres', icon: Layers },
  { to: '/suscripciones', label: 'Suscripciones', icon: Repeat },
  { to: '/deudas', label: 'Deudas y adelantos', icon: HandCoins },
  { to: '/impuestos', label: 'Impuestos y millas', icon: Landmark },
  { to: '/inversiones', label: 'Inversiones', icon: TrendingUp },
  { to: '/estadisticas', label: 'Estadísticas', icon: ChartColumn },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, primary: true }
];
