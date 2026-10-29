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
      {/* Barra lateral (escritorio) — patrón de sidebar de Creative Tim UI */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-2" aria-label="Principal">
          {[
            { label: 'Principal', items: NAV_ITEMS.filter((i) => i.primary && i.to !== '/ajustes') },
            { label: 'Herramientas', items: NAV_ITEMS.filter((i) => !i.primary) },
            { label: 'Cuenta', items: NAV_ITEMS.filter((i) => i.to === '/ajustes') }
          ].map((group) => (
            <div key={group.label}>
              <div className="flex h-8 items-center px-2 text-xs font-medium text-sidebar-foreground/70">{group.label}</div>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex h-9 items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4 [&>svg]:shrink-0',
                          isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        )
                      }
                    >
                      <item.icon />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="m-2 rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground shadow-sm">
          <span className="font-medium text-foreground">Datos locales.</span> Se guardan solo en este dispositivo. Haz copias desde Ajustes.
        </div>
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
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
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
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-md transition-colors', isActive && 'bg-accent')}>
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
