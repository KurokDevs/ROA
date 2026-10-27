import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { db, ensureSeeded } from '@/db';
import { DashboardPage } from '@/pages/DashboardPage';
import { WeekPage } from '@/pages/WeekPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { GoalsPage } from '@/pages/GoalsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { EnvelopesPage } from '@/pages/EnvelopesPage';
import { SubscriptionsPage } from '@/pages/SubscriptionsPage';
import { DebtsPage } from '@/pages/DebtsPage';
import { TaxesPage } from '@/pages/TaxesPage';
import { InvestmentsPage } from '@/pages/InvestmentsPage';
import { LogoMark } from '@/components/layout/Logo';

// Recharts solo se carga al abrir Estadísticas.
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })));

export function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    ensureSeeded(db)
      .then(() => setState('ready'))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      });
  }, []);

  if (state !== 'ready') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <LogoMark className="size-14 animate-pulse" />
        {state === 'error' ? (
          <div className="max-w-sm">
            <p className="font-semibold">No se pudo abrir la base de datos local</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error}. Si usas navegación privada, ábrela en una pestaña normal: IndexedDB es necesario para guardar tus datos.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        )}
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="semana" element={<WeekPage />} />
          <Route path="movimientos" element={<TransactionsPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="ajustes" element={<SettingsPage />} />
          <Route path="sobres" element={<EnvelopesPage />} />
          <Route path="suscripciones" element={<SubscriptionsPage />} />
          <Route path="deudas" element={<DebtsPage />} />
          <Route path="impuestos" element={<TaxesPage />} />
          <Route path="inversiones" element={<InvestmentsPage />} />
          <Route
            path="estadisticas"
            element={
              <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Cargando gráficos…</p>}>
                <StatsPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
