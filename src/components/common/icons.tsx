import {
  Baby,
  Briefcase,
  Car,
  Cloud,
  Dog,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  Heart,
  House,
  Landmark,
  LifeBuoy,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Stethoscope,
  Target,
  TrendingUp,
  Tv,
  User,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tier } from '@/models/types';

export const ENVELOPE_ICONS: Record<string, LucideIcon> = {
  home: House,
  smartphone: Smartphone,
  'shield-check': ShieldCheck,
  fuel: Fuel,
  wrench: Wrench,
  receipt: Receipt,
  user: User,
  heart: Heart,
  repeat: Repeat,
  'life-buoy': LifeBuoy,
  car: Car,
  target: Target,
  'trending-up': TrendingUp,
  landmark: Landmark,
  wallet: Wallet,
  zap: Zap,
  wifi: Wifi,
  tv: Tv,
  utensils: Utensils,
  cart: ShoppingCart,
  dumbbell: Dumbbell,
  gamepad: Gamepad2,
  cloud: Cloud,
  plane: Plane,
  school: GraduationCap,
  gift: Gift,
  baby: Baby,
  dog: Dog,
  health: Stethoscope,
  hammer: Hammer,
  briefcase: Briefcase,
  piggy: PiggyBank
};

export const TIER_COLOR: Record<Tier | 'free', string> = {
  tax: 'hsl(var(--tier-tax))',
  essential: 'hsl(var(--tier-essential))',
  work: 'hsl(var(--tier-work))',
  debt: 'hsl(var(--tier-debt))',
  living: 'hsl(var(--tier-living))',
  savings: 'hsl(var(--tier-savings))',
  investment: 'hsl(var(--tier-investment))',
  free: 'hsl(var(--tier-free))'
};

export function EnvelopeIcon({ icon, tier, className, size = 'md' }: { icon: string; tier: Tier; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = ENVELOPE_ICONS[icon] ?? Wallet;
  const dims = size === 'sm' ? 'size-8 rounded-lg' : size === 'lg' ? 'size-12 rounded-2xl' : 'size-10 rounded-xl';
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', dims, className)}
      style={{ backgroundColor: `hsl(var(--tier-${tier}) / 0.16)`, color: TIER_COLOR[tier] }}
      aria-hidden
    >
      <Icon className={size === 'lg' ? 'size-6' : 'size-[18px]'} />
    </span>
  );
}
