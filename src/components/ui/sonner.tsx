import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/hooks/useTheme';

export function Toaster() {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="top-center"
      offset="calc(env(safe-area-inset-top) + 12px)"
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border bg-popover text-popover-foreground shadow-lg',
          description: 'text-muted-foreground'
        }
      }}
    />
  );
}
