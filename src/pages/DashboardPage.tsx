import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  HandCoins,
  Layers,
  PiggyBank,
  Receipt,
  Repeat,
  Route,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  Wrench
} from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Money } from '@/components/common/Money';
import { Delta } from '@/components/common/Delta';
import { DistributionBar } from '@/components/common/DistributionBar';
import { ModeBadge } from '@/components/common/ModeBadge';
import { EnvelopeIcon } from '@/components/common/icons';
import { LogoMark } from '@/components/layout/Logo';
import { addDays, diffDays, formatDateShort, formatWeekRange, formatWeekdayLong, lastPayday, weekStart } from '@/lib/dates';
import { formatMoney, progressRatio, sumCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { summarizeLines, effectiveDueDate } from '@/engine/allocation';
import { flowTotals } from '@/engine/ledger';
import { holdingSummary } from '@/engine/investments';
import { needsReminder, summarizeSubscriptions } from '@/engine/subscriptions';
import { goalCurrent } from '@/engine/goals';

export function DashboardPage() {
  const f = useFinance();
  const settings = f.settings;

  const data = useMemo(() => {
    // Periodo de cobro: del último día de cobro a los 6 días siguientes (p. ej. viernes → jueves).
    const payday = lastPayday(f.today, settings?.paydayWeekday ?? 5);
    const thisWeek = weekStart(payday);
    const inPeriod = (start: string) => f.transactions.filter((t) => t.date >= start && t.date <= addDays(start, 6));
    const flowsNow = flowTotals(inPeriod(payday));
    const flowsPrev = flowTotals(inPeriod(addDays(payday, -7)));
    const hasPrev = f.transactions.some((t) => t.date < payday);
    const budget = f.budgets.find((b) => b.weekKey === thisWeek);
    const lastBudget = budget ?? [...f.budgets].sort((a, b) => b.weekKey.localeCompare(a.weekKey))[0];
    const summary = lastBudget ? summarizeLines(lastBudget.income, lastBudget.lines) : null;
    const spendTiers = ['essential', 'work', 'living', 'debt'] as const;
    const budgeted = budget ? sumCents(budget.lines.filter((l) => (spendTiers as readonly string[]).includes(l.tier)).map((l) => l.amount)) : 0;

    const savingsEnvs = f.envelopes.filter((e) => e.tier === 'savings' && !e.archived);
    const savings = sumCents(savingsEnvs.map((e) => f.balances.get(e.id) ?? 0));
    const savingsThisWeek = budget ? sumCents(budget.lines.filter((l) => l.tier === 'savings').map((l) => l.amount)) : 0;

    const holdingValue = sumCents(f.holdings.map((h) => holdingSummary(f.trades.filter((t) => t.holdingId === h.id)).marketValue));
    const holdingCost = sumCents(f.holdings.map((h) => holdingSummary(f.trades.filter((t) => t.holdingId === h.id)).costBasis));
    const investEnv = f.envelopes.find((e) => e.system === 'investment');
    const toInvest = investEnv ? f.balances.get(investEnv.id) ?? 0 : 0;

    const goal = [...f.goals].filter((g) => !g.archived).sort((a, b) => a.priority - b.priority).find((g) => goalCurrent(g, f.balances, f.worth.netWorth) < g.target);

    // Facturas próximas (21 días)
    const bills = f.envelopes
      .filter((e) => !e.archived && e.method === 'bill')
      .map((e) => ({ env: e, due: effectiveDueDate(e, f.today), balance: f.balances.get(e.id) ?? 0 }))
      .filter((b) => b.due && diffDays(b.due, f.today) <= 21)
      .sort((a, b) => a.due!.localeCompare(b.due!));

    const alerts: { icon: LucideIcon; text: string; to: string; tone: 'warning' | 'destructive' | 'info' }[] = [];
    const maint = f.envelopes.find((e) => e.system === 'vehicle_maint' && !e.archived);
    if (maint && settings && (f.balances.get(maint.id) ?? 0) < settings.vehicleMinBalance && f.budgets.length > 0) {
      alerts.push({ icon: Wrench, tone: 'warning', to: '/sobres', text: `Fondo de mantenimiento insuficiente: ${formatMoney(f.balances.get(maint.id) ?? 0)} de ${formatMoney(settings.vehicleMinBalance)} recomendados. El carro es tu herramienta de trabajo.` });
    }
    const vehicleMisuse = f.transactions.filter((t) => {
      const env = t.envelopeId ? f.envelopes.find((e) => e.id === t.envelopeId) : undefined;
      return env?.isVehicle && (t.type === 'expense' || t.type === 'fee') && !['Gasolina', 'Mantenimiento vehículo', 'Reparación vehículo', 'Seguro', 'Trabajo delivery'].includes(t.category) && diffDays(f.today, t.date) <= 30;
    });
    if (vehicleMisuse.length > 0) alerts.push({ icon: AlertTriangle, tone: 'destructive', to: '/movimientos', text: `Usaste fondos del vehículo para ${vehicleMisuse.length} gasto(s) personal(es) en los últimos 30 días.` });
    if (f.available < 0) alerts.push({ icon: AlertTriangle, tone: 'destructive', to: '/sobres', text: `Has apartado ${formatMoney(-f.available)} más de lo que tienes en tus cuentas. Revisa los sobres o registra tu saldo inicial.` });
    const subs = summarizeSubscriptions(f.subscriptions);
    for (const s of f.subscriptions.filter((x) => needsReminder(x, f.today))) alerts.push({ icon: Bell, tone: 'info', to: '/suscripciones', text: `${s.name} se renueva pronto.` });
    if (subs.pendingCount > 0) alerts.push({ icon: Repeat, tone: 'info', to: '/suscripciones', text: `${subs.pendingCount} suscripciones pendientes de cancelar (${formatMoney(subs.monthlySavingsPotential)}/mes confirmados).` });
    const openDebts = f.debts.filter((d) => !d.closed && (f.debtBalances.get(d.id) ?? 0) > 0);
    if (openDebts.length) alerts.push({ icon: HandCoins, tone: 'info', to: '/deudas', text: `${openDebts.length} deuda(s) o adelanto(s) pendiente(s): ${formatMoney(sumCents(openDebts.map((d) => f.debtBalances.get(d.id) ?? 0)))}.` });

    return { payday, flowsNow, flowsPrev, hasPrev, budget, lastBudget, summary, budgeted, savings, savingsThisWeek, holdingValue, holdingCost, toInvest, goal, bills, alerts };
  }, [f, settings]);

  if (!f.ready || !settings) return null;
  const { budget, summary, lastBudget } = data;
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  })();

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between animate-fade-up">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{formatWeekdayLong(f.today)}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}</h1>
        </div>
        <LogoMark className="size-10 lg:hidden" />
      </header>

      {!settings.onboarded && f.budgets.length === 0 && (
        <Card className="border-primary/30 bg-primary/5 animate-fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" /> Bienvenido a ROA Finance
            </CardTitle>
            <CardDescription>
              Ya cargué tus obligaciones (alquiler, teléfono, seguro, gasolina, personal y pareja = $410/semana), tus metas y tus suscripciones pendientes de cancelar. Todo es editable. Tus datos se guardan
              <strong> solo en este dispositivo</strong> y no se sincronizan solos: haz copias de seguridad desde Ajustes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/semana" onClick={() => db.settings.update('main', { onboarded: true })}>
                Registrar mi primer cobro <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/sobres">Revisar mis sobres</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Resumen financiero + CTA semanal */}
      <Card className="relative overflow-hidden animate-fade-up">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-tier-essential/10 blur-3xl" />
        <div className="relative p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Saldo disponible</p>
              <Money cents={f.available} className={cn('mt-1 block text-4xl font-semibold tracking-tight sm:text-5xl', f.available < 0 && 'text-destructive')} />
              <p className="mt-1 text-xs text-muted-foreground">
                Dinero libre después de apartar compromisos · en cuentas <Money cents={f.liquid} /> · apartado <Money cents={f.reserved} />
              </p>
            </div>
            {lastBudget && <ModeBadge mode={lastBudget.mode} />}
          </div>

          {summary && lastBudget ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Distribución {budget ? 'de esta semana' : `de la semana ${formatWeekRange(lastBudget.weekKey)}`}</span>
                <Money cents={lastBudget.income} className="font-medium text-foreground" />
              </div>
              <DistributionBar byTier={summary.byTier} unassigned={summary.unassigned} total={lastBudget.income} />
            </div>
          ) : null}

          {!budget && (
            <Link
              to="/semana"
              className="group mt-6 flex items-center gap-4 rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-[0.99]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
                <CalendarDays className="size-6" />
              </span>
              <span className="flex-1">
                <span className="block text-base font-semibold">¿Cuánto cobraste esta semana?</span>
                <span className="block text-sm opacity-85">Calcula en segundos qué apartar para cada cosa</span>
              </span>
              <ArrowRight className="size-5 transition group-hover:translate-x-1" />
            </Link>
          )}
        </div>
      </Card>

      {/* Tarjetas principales */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={Wallet} title="Ingreso semanal" tone="essential" to="/semana">
          <Money cents={data.flowsNow.income} className="text-2xl font-semibold" />
          <Delta current={data.flowsNow.income} previous={data.hasPrev ? data.flowsPrev.income : null} className="mt-1" />
        </StatCard>

        <StatCard icon={Receipt} title="Gastos" tone="living" to="/movimientos">
          <div className="flex items-baseline gap-1.5">
            <Money cents={data.flowsNow.expenses} className="text-2xl font-semibold" />
            <span className="text-sm text-muted-foreground">
              de <Money cents={data.budgeted} /> presupuestado
            </span>
          </div>
          <Progress
            className="mt-2"
            value={progressRatio(data.flowsNow.expenses, data.budgeted || 1) * 100}
            indicatorClassName={data.flowsNow.expenses > data.budgeted && data.budgeted > 0 ? 'bg-destructive' : 'bg-tier-living'}
          />
          <Delta current={data.flowsNow.expenses} previous={data.hasPrev ? data.flowsPrev.expenses : null} goodWhenUp={false} className="mt-1.5" />
        </StatCard>

        <StatCard icon={Layers} title="Apartado en sobres" tone="essential" to="/sobres">
          <Money cents={f.reserved} className="text-2xl font-semibold" />
          <p className="text-xs text-muted-foreground">Dinero reservado para facturas, gasolina, gastos y ahorro</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Esta semana <Money cents={summary && budget ? summary.totalAllocated : 0} sign />
          </p>
        </StatCard>

        <StatCard icon={PiggyBank} title="Ahorros" tone="savings" to="/metas">
          <Money cents={data.savings} className="text-2xl font-semibold" />
          {data.goal ? (
            <>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span className="truncate">{data.goal.name}</span>
                <span className="tabular">{Math.round(progressRatio(goalCurrent(data.goal, f.balances, f.worth.netWorth), data.goal.target) * 100)}%</span>
              </div>
              <Progress className="mt-1" value={progressRatio(goalCurrent(data.goal, f.balances, f.worth.netWorth), data.goal.target) * 100} indicatorClassName="bg-tier-savings" />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Todas las metas cumplidas</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            Esta semana <Money cents={data.savingsThisWeek} sign />
          </p>
        </StatCard>

        <StatCard icon={TrendingUp} title="Inversiones" tone="investment" to="/inversiones">
          <Money cents={data.holdingValue} className="text-2xl font-semibold" />
          <p className="text-xs text-muted-foreground">
            Aportado <Money cents={data.holdingCost} /> · rendimiento <Money cents={data.holdingValue - data.holdingCost} colored sign />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reservado para invertir <Money cents={data.toInvest} />
          </p>
        </StatCard>

        <StatCard icon={ShieldCheck} title="Patrimonio neto" tone="free" to="/estadisticas">
          <Money cents={f.worth.netWorth} className="text-2xl font-semibold" />
          <p className="text-xs text-muted-foreground">
            Cuentas <Money cents={f.worth.cash} /> + inversiones <Money cents={f.worth.investments} /> − deudas <Money cents={f.worth.debts} />
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">Los sobres ya están dentro del efectivo: no se suman dos veces.</p>
        </StatCard>
      </div>

      {data.alerts.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Avisos</h2>
          <Card className="divide-y">
            {data.alerts.map((a, i) => (
              <Link key={i} to={a.to} className="flex items-start gap-3 p-4 text-sm transition hover:bg-accent/50">
                <a.icon className={cn('mt-0.5 size-4 shrink-0', a.tone === 'destructive' ? 'text-destructive' : a.tone === 'warning' ? 'text-warning' : 'text-primary')} />
                <span className="flex-1">{a.text}</span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-muted-foreground">Facturas próximas</h2>
          <Link to="/sobres" className="text-xs font-medium text-primary">
            Ver sobres
          </Link>
        </div>
        {data.bills.length === 0 ? (
          <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <CalendarClock className="size-5" /> Sin vencimientos en las próximas 3 semanas. Añade el día de vencimiento a tus facturas para un cálculo más preciso.
          </Card>
        ) : (
          <Card className="divide-y">
            {data.bills.map(({ env, due, balance }) => {
              const covered = balance >= env.billAmount;
              const days = diffDays(due!, f.today);
              return (
                <div key={env.id} className="flex items-center gap-3 p-4">
                  <EnvelopeIcon icon={env.icon} tier={env.tier} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{env.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {days < 0 ? 'Vencida' : days === 0 ? 'Vence hoy' : `Vence el ${formatDateShort(due!)} · en ${days} días`}
                    </div>
                    <Progress className="mt-1.5 h-1.5" value={progressRatio(balance, env.billAmount) * 100} indicatorClassName={covered ? 'bg-success' : 'bg-tier-essential'} />
                  </div>
                  <div className="text-right">
                    <Money cents={env.billAmount} className="text-sm font-semibold" />
                    <div className={cn('text-xs', covered ? 'text-success' : 'text-muted-foreground')}>{covered ? 'Cubierta' : `faltan ${formatMoney(env.billAmount - balance)}`}</div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section className="space-y-2 lg:hidden">
        <h2 className="px-1 text-sm font-semibold text-muted-foreground">Herramientas</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { to: '/sobres', label: 'Sobres', icon: Layers },
            { to: '/suscripciones', label: 'Suscripciones', icon: Repeat },
            { to: '/deudas', label: 'Deudas', icon: HandCoins },
            { to: '/trabajo', label: 'Millas', icon: Route },
            { to: '/inversiones', label: 'Inversiones', icon: TrendingUp },
            { to: '/estadisticas', label: 'Estadísticas', icon: ChartColumn }
          ].map((q) => (
            <Link key={q.to} to={q.to} className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-xs font-medium transition active:scale-95">
              <q.icon className="size-5 text-primary" />
              {q.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  tone,
  to,
  badge,
  children
}: {
  icon: LucideIcon;
  title: string;
  tone: 'essential' | 'work' | 'debt' | 'living' | 'savings' | 'investment' | 'free';
  to: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className="group block animate-fade-up">
      <Card className="h-full p-4 transition group-hover:border-primary/30 group-active:scale-[0.99] sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `hsl(var(--tier-${tone}) / 0.15)`, color: `hsl(var(--tier-${tone}))` }}>
            <Icon className="size-4" />
          </span>
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          {badge && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{badge}</span>}
        </div>
        {children}
      </Card>
    </Link>
  );
}

