import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Aviso cuando hay una versión nueva de la app lista para usarse. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md animate-fade-up rounded-2xl border bg-card p-4 shadow-2xl lg:bottom-6">
      <div className="flex items-center gap-3">
        <RefreshCw className="size-5 text-primary" />
        <p className="flex-1 text-sm">Hay una nueva versión de ROA Finance.</p>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
          Luego
        </Button>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </Button>
      </div>
    </div>
  );
}
