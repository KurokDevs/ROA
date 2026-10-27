import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Campo de importe en USD. Trabaja con strings para no perder precisión;
 * la conversión a centavos se hace con toCents() (decimal.js).
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> & { value: string; onValueChange: (v: string) => void; size?: 'default' | 'lg' | 'xl' }
>(({ value, onValueChange, className, size = 'default', ...props }, ref) => {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
    const parts = v.split('.');
    if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join('')}`;
    const [int, dec] = v.split('.');
    if (dec !== undefined) v = `${int}.${dec.slice(0, 2)}`;
    if (int && int.length > 9) return;
    onValueChange(v);
  };
  const sizes = {
    default: 'h-11 text-base pl-7',
    lg: 'h-14 text-2xl font-semibold pl-9',
    xl: 'h-20 text-5xl font-semibold tracking-tight pl-12'
  };
  const prefix = { default: 'left-3 text-base', lg: 'left-3.5 text-2xl', xl: 'left-4 text-4xl' };
  return (
    <div className="relative">
      <span className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground', prefix[size])}>$</span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        onChange={handle}
        className={cn(
          'tabular flex w-full rounded-xl border border-input bg-background pr-3 shadow-sm transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          sizes[size],
          className
        )}
        {...props}
      />
    </div>
  );
});
MoneyInput.displayName = 'MoneyInput';
