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
          toast: 'rounded-2xl border bg-card text-card-foreground shadow-xl',
          description: 'text-muted-foreground'
        }
      }}
    />
  );
}
