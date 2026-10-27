import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, type TooltipProps } from 'recharts';
import { ChartColumn, FlaskConical, Snowflake, Sun, Trophy } from 'lucide-react';
import { useFinance } from '@/hooks/useFinance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { Field } from '@/components/common/Field';
import { centsToDecimal, formatMoney, sumCents } from '@/lib/money';
import { addDays, formatDateShort, formatWeekRange } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { categoryTotals, netWorthSeries, savingsSeries, seasonComparison, topWeeks, weekKeys, weeklySeries } from '@/engine/stats';
import { simulate } from '@/engine/simulation';
import { goalProgress, weeklyInflow } from '@/engine/goals';
import { holdingSummary } from '@/engine/investments';

const RANGES = [8, 12, 26, 52] as const;
const axisMoney = (v: number) => `$${Math.round(v).toLocaleString('es-US')}`;
const tickStyle = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-foreground">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey as string} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span>{p.name}</span>
          <span className="tabular ml-auto pl-3 font-medium text-foreground">{formatMoney(Math.round((p.value ?? 0) * 100))}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const f = useFinance();
  const [range, setRange] = useState<(typeof RANGES)[number]>(12);
  const [simReturn, setSimReturn] = useState('0');

  const d = useMemo(() => {
    const keys = weekKeys(f.today, range);
    const label = (k: string) => formatDateShort(k);
    const weekly = weeklySeries(f.transactions, f.budgets, keys).map((p) => ({
      label: label(p.weekKey),
      Ingresos: centsToDecimal(p.income).toNumber(),
      Gastos: centsToDecimal(p.expenses).toNumber()
    }));
    const inRange = f.transactions.filter((t) => t.date >= keys[0] && t.date <= addDays(keys[keys.length - 1], 6));
    const cats = categoryTotals(inRange).map((c) => ({ ...c, value: centsToDecimal(c.amount).toNumber() }));
    const savings = savingsSeries(f.envelopes, f.entries, f.transactions, keys).map((p) => ({ label: label(p.weekKey), Ahorro: centsToDecimal(p.balance).toNumber() }));
    const worth = netWorthSeries({ accounts: f.accounts, txs: f.transactions, debts: f.debts, holdings: f.holdings, trades: f.trades, keys }).map((p) => ({
      label: label(p.weekKey),
      Patrimonio: centsToDecimal(p.netWorth).toNumber()
    }));
    const season = f.settings ? seasonComparison(f.budgets, f.settings.highSeasonThreshold) : null;
    const top = topWeeks(f.budgets, 5);

    // Aportes semanales medios de las últimas 8 semanas (base de la simulación)
    const recent = f.budgets.filter((b) => b.weekKey >= addDays(keys[keys.length - 1], -7 * 7));
    const n = Math.max(1, recent.length);
    const weeklySavings = Math.round(sumCents(recent.flatMap((b) => b.lines.filter((l) => l.tier === 'savings').map((l) => l.amount))) / n);
    const weeklyInvest = Math.round(sumCents(recent.flatMap((b) => b.lines.filter((l) => l.tier === 'investment').map((l) => l.amount))) / n);
    const startSavings = sumCents(f.envelopes.filter((e) => e.tier === 'savings').map((e) => f.balances.get(e.id) ?? 0));
    const startInvest = sumCents(f.holdings.map((h) => holdingSummary(f.trades.filter((t) => t.holdingId === h.id)).marketValue)) + (f.balances.get('env_invest') ?? 0);

    const savingsIds = f.envelopes.filter((e) => e.tier === 'savings' || e.tier === 'investment').map((e) => e.id);
    const goals = f.goals
      .filter((g) => !g.archived)
      .sort((a, b) => a.priority - b.priority)
      .map((goal) => goalProgress({ goal, envelopeBalances: f.balances, netWorth: f.worth.netWorth, weeklyRate: weeklyInflow(goal.type === 'envelope' ? goal.envelopeIds : savingsIds, f.entries, f.today), today: f.today }));

    return { weekly, cats, savings, worth, season, top, weeklySavings, weeklyInvest, startSavings, startInvest, goals, hasData: f.transactions.length > 0 };
  }, [f, range]);

  const sims = useMemo(() => {
    let r = '0';
    try {
      r = String(Math.min(30, Math.max(-30, Number(simReturn) || 0)) / 100);
    } catch {
      r = '0';
    }
    return [3, 6, 12, 24].map((months) => ({
      months,
      ...simulate({ months, weeklySavings: d.weeklySavings, weeklyInvestment: d.weeklyInvest, startSavings: d.startSavings, startInvestments: d.startInvest, hypotheticalAnnualReturn: r })
    }));
  }, [d, simReturn]);
  const longSim = sims[3].points.filter((_, i) => i % 4 === 0).map((p) => ({
    label: `S${p.week}`,
    'Total hipotético': centsToDecimal(p.total).toNumber(),
    'Solo aportes': centsToDecimal(d.startSavings + d.startInvest + p.contributed).toNumber()
  }));

  if (!f.ready) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Estadísticas"
        subtitle="Tus semanas, gastos, ahorro y patrimonio"
        action={
          <div className="flex rounded-xl bg-muted p-1">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className={cn('rounded-lg px-2.5 py-1 text-xs font-medium transition', range === r ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                {r}s
              </button>
            ))}
          </div>
        }
      />

      {!d.hasData && (
        <EmptyState icon={ChartColumn} title="Aún no hay datos para graficar" description="Confirma tu primer cobro semanal en Mi Semana y aquí verás la evolución de ingresos, gastos y ahorro." />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingresos y gastos semanales</CardTitle>
            <CardDescription>Últimas {range} semanas. Transferencias internas excluidas.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.weekly} barGap={2} margin={{ left: -8, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={tickStyle} tickLine={false} axisLine={false} tickFormatter={axisMoney} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ingresos" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="Gastos" fill="var(--viz-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>Mismo periodo</CardDescription>
          </CardHeader>
          <CardContent>
            {d.cats.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin gastos registrados en este periodo.</p>
            ) : (
              <ul className="space-y-2.5">
                {d.cats.slice(0, 8).map((c) => (
                  <li key={c.category} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{c.category}</span>
                      <Money cents={c.amount} className="font-medium" />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full origin-left animate-grow-x rounded-full" style={{ width: `${(c.amount / d.cats[0].amount) * 100}%`, backgroundColor: 'var(--viz-2)' }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ahorro acumulado</CardTitle>
            <CardDescription>Saldo total de sobres de ahorro al cierre de cada semana</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.savings} margin={{ left: -8, right: 4 }}>
                <defs>
                  <linearGradient id="g-sav" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--viz-3)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--viz-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={tickStyle} tickLine={false} axisLine={false} tickFormatter={axisMoney} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Ahorro" stroke="var(--viz-3)" strokeWidth={2} fill="url(#g-sav)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Patrimonio neto</CardTitle>
            <CardDescription>Cuentas + inversiones − deudas (sin contar los sobres dos veces)</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.worth} margin={{ left: -8, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={tickStyle} tickLine={false} axisLine={false} tickFormatter={axisMoney} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="linear" dataKey="Patrimonio" stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-tier-investment" /> Semanas de mayor ingreso
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin semanas confirmadas.</p>
            ) : (
              <ol className="space-y-2">
                {d.top.map((b, i) => (
                  <li key={b.id} className="flex items-center gap-3 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <span className="flex-1">{formatWeekRange(b.weekKey)}</span>
                    <Money cents={b.income} className="font-semibold" />
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Temporada baja vs. alta</CardTitle>
            <CardDescription>Temporada alta: semanas desde {formatMoney(f.settings?.highSeasonThreshold ?? 0, { compact: true })} (editable en Ajustes)</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {d.season &&
              [
                { key: 'low', label: 'Baja', icon: Snowflake, data: d.season.low },
                { key: 'high', label: 'Alta', icon: Sun, data: d.season.high }
              ].map((s) => (
                <div key={s.key} className="rounded-2xl bg-muted/50 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <s.icon className="size-3.5" /> {s.label} · {s.data.weeks} sem.
                  </div>
                  <Money cents={s.data.average} className="mt-1 block text-xl font-semibold" />
                  <div className="text-xs text-muted-foreground">
                    media semanal · total <Money cents={s.data.total} compact />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Avance de metas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.goals.map((g) => (
            <div key={g.goal.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{g.goal.name}</span>
                <span className="tabular text-muted-foreground">
                  <Money cents={g.current} /> / <Money cents={g.goal.target} compact />
                </span>
              </div>
              <Progress value={g.ratio * 100} indicatorClassName={g.completed ? 'bg-success' : 'bg-tier-savings'} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" /> Simulación hipotética
          </CardTitle>
          <CardDescription>
            Proyección si mantienes tus aportes medios recientes: <Money cents={d.weeklySavings} /> a ahorro y <Money cents={d.weeklyInvest} /> a inversión por semana.{' '}
            <strong>No es una predicción ni una promesa de rendimiento.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Rendimiento anual hipotético sobre inversiones (%)" htmlFor="sim-r" hint="Por defecto 0 %: solo suma tus aportes. Puedes probar escenarios negativos.">
            <Input id="sim-r" type="number" inputMode="decimal" step="0.5" min={-30} max={30} value={simReturn} onChange={(e) => setSimReturn(e.target.value)} className="max-w-32" />
          </Field>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {sims.map((s) => (
              <div key={s.months} className="rounded-2xl bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">{s.months} meses · hipotético</div>
                <Money cents={s.final.total} className="block text-lg font-semibold" />
                <div className="text-[11px] text-muted-foreground">
                  aportes <Money cents={s.totalContributed} compact />
                  {s.hypotheticalGrowth !== 0 && (
                    <>
                      {' '}
                      · var. <Money cents={s.hypotheticalGrowth} compact sign />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={longSim} margin={{ left: -8, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tick={tickStyle} tickLine={false} axisLine={false} tickFormatter={axisMoney} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Total hipotético" stroke="var(--viz-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Solo aportes" stroke="var(--viz-2)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
