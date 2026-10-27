import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { NAV_ITEMS } from './nav';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { UpdatePrompt } from './UpdatePrompt';

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AppShell() {
  const location = useLocation();
  const online = useOnline();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card/60 px-3 py-5 backdrop-blur-xl lg:flex">
        <div className="mb-6 px-3">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="px-3 text-[11px] leading-relaxed text-muted-foreground">
          Datos guardados solo en este dispositivo. Haz copias de seguridad desde Ajustes.
        </p>
      </aside>

      <div className="lg:pl-64">
        {!online && (
          <div className="pt-safe sticky top-0 z-40 bg-warning/15 text-warning backdrop-blur">
            <div className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium">
              <WifiOff className="size-3.5" /> Sin conexión: todo sigue funcionando y guardándose en tu dispositivo
            </div>
          </div>
        )}
        <main className="pt-safe pl-safe pr-safe mx-auto w-full max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pb-12">
          <div className="pt-4 sm:pt-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Navegación inferior (móvil) */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-card/80 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
        aria-label="Principal"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV_ITEMS.filter((i) => i.primary).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] font-medium transition-colors active:scale-95',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-primary/10')}>
                    <item.icon className="size-[21px]" strokeWidth={isActive ? 2.3 : 1.9} />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <UpdatePrompt />
    </div>
  );
}
