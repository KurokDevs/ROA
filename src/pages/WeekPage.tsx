import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  History,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  Wallet
} from 'lucide-react';
import { db } from '@/db';
import { useFinance, type FinanceData } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Money } from '@/components/common/Money';
import { Field } from '@/components/common/Field';
import { DistributionBar } from '@/components/common/DistributionBar';
import { ModeBadge, modeDescription } from '@/components/common/ModeBadge';
import { EnvelopeIcon } from '@/components/common/icons';
import { EmptyState } from '@/components/common/EmptyState';
import { centsToInput, formatMoney, toCents, type Cents } from '@/lib/money';
import { formatDateLong, formatWeekRange, formatWeekdayLong, isValidISO, lastPayday, weekStart, WEEKDAY_NAMES, type ISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { summarizeLines, validateLines, type PlanResult } from '@/engine/allocation';
import { confirmBudget, deleteBudget, proposePlan, setLineTransferred } from '@/services/budgetService';
import { DuplicateBudgetError } from '@/services/errors';
import { TIER_LABELS, TIER_ORDER, type BudgetLine, type Tier, type WeeklyBudget } from '@/models/types';

export function WeekPage() {
  const f = useFinance();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const settings = f.settings;

  const defaultDate = settings ? lastPayday(f.today, settings.paydayWeekday) : f.today;
  const fromUrl = params.get('fecha');
  const payDate = fromUrl && isValidISO(fromUrl) ? fromUrl : defaultDate;
  const weekKey = weekStart(payDate);
  const budget = f.budgets.find((b) => b.weekKey === weekKey);

  useEffect(() => setEditing(false), [weekKey]);

  const setPayDate = (d: string) => {
    if (!isValidISO(d)) return;
    const next = new URLSearchParams(params);
    next.set('fecha', d);
    setParams(next, { replace: true });
  };

  if (!f.ready || !settings) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Semana ${formatWeekRange(weekKey)}`}
        title="Mi Semana"
        subtitle={budget && !editing ? `Presupuesto confirmado · cobro del ${formatWeekdayLong(budget.payDate)}` : `Día de cobro: ${WEEKDAY_NAMES[settings.paydayWeekday]}`}
      />

      {budget && !editing ? (
        <ConfirmedBudget budget={budget} finance={f} onEdit={() => setEditing(true)} />
      ) : (
        <Organizer key={editing && budget ? budget.id : 'new'} finance={f} payDate={payDate} onDateChange={setPayDate} existing={editing ? budget : undefined} onDone={() => setEditing(false)} />
      )}

      <BudgetHistory budgets={f.budgets} current={weekKey} onSelect={(d) => setPayDate(d)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Organizador: cobro → distribución → edición → confirmación          */
/* ------------------------------------------------------------------ */

function Organizer({
  finance,
  payDate,
  onDateChange,
  existing,
  onDone
}: {
  finance: FinanceData;
  payDate: ISODate;
  onDateChange: (d: string) => void;
  existing?: WeeklyBudget;
  onDone: () => void;
}) {
  const settings = finance.settings!;
  const [incomeStr, setIncomeStr] = useState(existing ? centsToInput(existing.income) : '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? settings.defaultAccountId);
  const [note, setNote] = useState(existing?.note ?? '');
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [lines, setLines] = useState<BudgetLine[]>(existing?.lines ?? []);
  const [lineStrs, setLineStrs] = useState<Record<string, string>>(() => Object.fromEntries((existing?.lines ?? []).map((l) => [l.key, centsToInput(l.amount)])));
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const income = toCents(incomeStr);
  const firstDate = useRef(payDate);
  useEffect(() => {
    // Cambiar la fecha invalida la propuesta: los saldos y vencimientos dependen de ella.
    if (payDate === firstDate.current) return;
    firstDate.current = payDate;
    setPlan(null);
    if (!existing) setLines([]);
  }, [payDate, existing]);
  const reviewing = plan !== null || (existing !== undefined && lines.length > 0);

  const accounts = finance.accounts.filter((a) => !a.archived && a.type !== 'investment' && a.type !== 'credit');
  const clash = !existing && finance.budgets.find((b) => b.weekKey === weekStart(payDate));

  const calculate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (income <= 0) {
      toast.error('Escribe cuánto cobraste esta semana.');
      return;
    }
    setCalculating(true);
    try {
      const p = await proposePlan(db, income, payDate, existing?.id);
      setPlan(p);
      setLines(p.lines);
      setLineStrs(Object.fromEntries(p.lines.map((l) => [l.key, centsToInput(l.amount)])));
      requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo calcular.');
    } finally {
      setCalculating(false);
    }
  };

  const setLineAmount = (key: string, v: string) => {
    setLineStrs((s) => ({ ...s, [key]: v }));
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, amount: toCents(v) } : l)));
  };
  const resetLine = (l: BudgetLine) => setLineAmount(l.key, centsToInput(l.recommended));
  const resetAll = () => {
    setLines((ls) => ls.map((l) => ({ ...l, amount: l.recommended })));
    setLineStrs(Object.fromEntries(lines.map((l) => [l.key, centsToInput(l.recommended)])));
  };

  const summary = summarizeLines(income, lines);
  const validation = reviewing ? validateLines(income, lines) : null;
  const edited = lines.some((l) => l.amount !== l.recommended);
  const mode = plan?.mode ?? existing?.mode ?? 'stability';
  const deficit = plan?.deficit ?? existing?.deficit ?? 0;
  const incomeChanged = existing && !plan && income !== existing.income;

  const confirm = async () => {
    if (savingRef.current) return; // evita dobles toques
    if (validation) {
      toast.error(validation);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await confirmBudget(db, {
        id: existing?.id,
        payDate,
        income,
        lines,
        mode,
        deficit,
        accountId,
        note: note.trim()
      });
      toast.success(existing ? 'Presupuesto actualizado' : 'Presupuesto confirmado', {
        description: `${formatMoney(summary.totalAllocated)} apartados en sobres · ${formatMoney(summary.unassigned)} libres`
      });
      onDone();
    } catch (err) {
      if (err instanceof DuplicateBudgetError) toast.error('Ya confirmaste esta semana', { description: 'Abre el presupuesto existente para editarlo.' });
      else toast.error(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const grouped = useMemo(() => TIER_ORDER.map((tier) => ({ tier, lines: lines.filter((l) => l.tier === tier) })).filter((g) => g.lines.length > 0), [lines]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden animate-fade-up">
        <div className="relative">
          <form onSubmit={calculate} className="relative space-y-5 p-5 sm:p-7">
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{existing ? 'Editar el cobro de esta semana' : '¿Cuánto cobraste esta semana?'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Introduce el total que recibiste. ROA calcula cuánto apartar para cada cosa.
              </p>
            </div>
            <MoneyInput size="xl" value={incomeStr} onValueChange={setIncomeStr} placeholder="0" aria-label="Ingreso de la semana" autoFocus={!existing} />
            <div className="flex flex-wrap gap-2">
              {[50000, 60000, 80000, 110000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setIncomeStr(centsToInput(v))}
                  className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground active:scale-95"
                >
                  {formatMoney(v, { compact: true })}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha de cobro" htmlFor="paydate">
                <Input id="paydate" type="date" value={payDate} onChange={(e) => onDateChange(e.target.value)} disabled={!!existing} />
              </Field>
              <Field label="Cuenta donde lo recibiste" htmlFor="account">
                <NativeSelect id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Nota (opcional)" htmlFor="note" className="sm:col-span-2">
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: semana con propinas altas" maxLength={120} />
              </Field>
            </div>
            {clash && (
              <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Ya existe un presupuesto para esta semana.
              </div>
            )}
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={calculating || income <= 0 || !!clash}>
              {calculating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {existing || plan ? 'Recalcular recomendación' : 'Calcular distribución'}
            </Button>
          </form>
        </div>
      </Card>

      {reviewing && (
        <div ref={reviewRef} className="scroll-mt-4 space-y-4 animate-fade-up">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Distribución propuesta</CardTitle>
                <ModeBadge mode={mode} />
              </div>
              <CardDescription>{modeDescription(mode)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DistributionBar byTier={summary.byTier} unassigned={Math.max(0, summary.unassigned)} total={income} />
              {incomeChanged && (
                <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
                  <Info className="mt-0.5 size-4 shrink-0" /> Cambiaste el ingreso: pulsa «Recalcular recomendación» o ajusta las líneas a mano.
                </div>
              )}
              {deficit > 0 && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-destructive">
                    <AlertTriangle className="size-4" /> Déficit de {formatMoney(deficit)}
                  </div>
                  {plan && plan.shortfalls.length > 0 && (
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {plan.shortfalls.map((s) => (
                        <li key={s.key} className="flex justify-between gap-2">
                          <span>{s.label}</span>
                          <span className="tabular text-destructive">−{formatMoney(s.missing)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {plan && (
                <details className="group rounded-xl bg-muted/50 p-3 text-sm">
                  <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2">
                      <Info className="size-4 text-muted-foreground" /> Cómo se calculó
                    </span>
                  </summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                    {plan.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </details>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">Ajusta cualquier importe antes de confirmar</h3>
            {edited && (
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <RotateCcw /> Restaurar todo
              </Button>
            )}
          </div>

          {grouped.map((g) => (
            <section key={g.tier} className="space-y-2">
              <TierHeading tier={g.tier} amount={summary.byTier[g.tier]} />
              <Card className="divide-y">
                {g.lines.map((l) => (
                  <LineEditor key={l.key} line={l} value={lineStrs[l.key] ?? ''} onChange={(v) => setLineAmount(l.key, v)} onReset={() => resetLine(l)} finance={finance} />
                ))}
              </Card>
            </section>
          ))}

          <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
            <Card className="border-primary/20 bg-card/95 shadow-xl backdrop-blur">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="grid flex-1 grid-cols-3 gap-2 text-center sm:text-left">
                  <Stat label="Ingreso" value={income} />
                  <Stat label="Asignado" value={summary.totalAllocated} />
                  <Stat label={summary.unassigned < 0 ? 'Te pasas' : 'Sin asignar'} value={summary.unassigned} danger={summary.unassigned < 0} />
                </div>
                <Button size="lg" onClick={confirm} disabled={saving || !!validation || !!clash} className="sm:min-w-52">
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  {existing ? 'Guardar cambios' : 'Confirmar presupuesto'}
                </Button>
              </div>
              {validation && <p className="px-4 pb-3 text-xs text-destructive">{validation}</p>}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: Cents; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <Money cents={Math.abs(value)} className={cn('text-sm font-semibold sm:text-base', danger && 'text-destructive')} />
    </div>
  );
}

function TierHeading({ tier, amount }: { tier: Tier; amount: Cents }) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="size-2 rounded-full" style={{ backgroundColor: `hsl(var(--tier-${tier}))` }} />
        {TIER_LABELS[tier]}
      </span>
      <Money cents={amount} className="text-xs font-medium text-muted-foreground" />
    </div>
  );
}

function LineEditor({ line, value, onChange, onReset, finance }: { line: BudgetLine; value: string; onChange: (v: string) => void; onReset: () => void; finance: FinanceData }) {
  const env = finance.envelopes.find((e) => e.id === line.envelopeId);
  const balance = finance.balances.get(line.envelopeId) ?? 0;
  const changed = line.amount !== line.recommended;
  const short = line.need - line.amount;
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <EnvelopeIcon icon={env?.icon ?? 'wallet'} tier={line.tier} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{line.label}</span>
          {short > 0 && line.tier !== 'investment' && <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">faltan {formatMoney(short)}</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">{line.reason}</p>
        <p className="text-[11px] text-muted-foreground/80">
          Saldo actual <Money cents={balance} />
          {changed && (
            <>
              {' · '}recomendado <Money cents={line.recommended} />
              <button type="button" onClick={onReset} className="ml-1 font-medium text-primary">
                restaurar
              </button>
            </>
          )}
        </p>
      </div>
      <div className="w-28 shrink-0 sm:w-32">
        <MoneyInput value={value} onValueChange={onChange} aria-label={`Importe para ${line.label}`} className={cn('h-10 text-right', changed && 'border-primary/60')} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presupuesto confirmado: plan ≠ transferencia ejecutada               */
/* ------------------------------------------------------------------ */

function ConfirmedBudget({ budget, finance, onEdit }: { budget: WeeklyBudget; finance: FinanceData; onEdit: () => void }) {
  const summary = summarizeLines(budget.income, budget.lines);
  const toMove = budget.lines.filter((l) => l.amount > 0);
  const done = toMove.filter((l) => l.transferred).length;
  const account = finance.accounts.find((a) => a.id === budget.accountId);

  const toggle = async (l: BudgetLine) => {
    try {
      await setLineTransferred(db, budget.id, l.key, !l.transferred);
      if (!l.transferred) toast.success(`Marcado como transferido: ${l.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const remove = async () => {
    await deleteBudget(db, budget.id);
    toast.success('Presupuesto eliminado', { description: 'Se revirtieron el ingreso y las reservas de esa semana.' });
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <Card className="overflow-hidden">
        <div className="relative p-5 sm:p-7">
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleCheck className="size-4 text-success" /> Confirmado · {formatDateLong(budget.payDate)}
              </div>
              <Money cents={budget.income} className="mt-1 block text-4xl font-semibold tracking-tight sm:text-5xl" />
              <p className="mt-1 text-sm text-muted-foreground">Recibido en {account?.name ?? 'cuenta'}{budget.note ? ` · ${budget.note}` : ''}</p>
            </div>
            <ModeBadge mode={budget.mode} />
          </div>
          <DistributionBar className="relative mt-5" byTier={summary.byTier} unassigned={summary.unassigned} total={budget.income} />
          <div className="relative mt-5 grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Apartado</div>
              <Money cents={summary.totalAllocated} className="font-semibold" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Libre</div>
              <Money cents={summary.unassigned} className="font-semibold text-success" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Déficit</div>
              <Money cents={budget.deficit} className={cn('font-semibold', budget.deficit > 0 && 'text-destructive')} />
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={onEdit}>
              <Pencil /> Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive">
                  <Trash2 /> Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar el presupuesto de esta semana?</AlertDialogTitle>
                  <AlertDialogDescription>Se borrarán el ingreso registrado y todas las reservas de esta semana en los sobres. Los gastos que registraste se mantienen.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Transferencias en tu banco</CardTitle>
            <span className="tabular text-sm text-muted-foreground">
              {done}/{toMove.length}
            </span>
          </div>
          <CardDescription>El presupuesto es el plan. Marca cada reserva cuando muevas el dinero de verdad (a tu cuenta de ahorro, efectivo, etc.).</CardDescription>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${toMove.length ? (done / toMove.length) * 100 : 0}%` }} />
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <ul className="divide-y">
            {toMove.map((l) => {
              const env = finance.envelopes.find((e) => e.id === l.envelopeId);
              return (
                <li key={l.key}>
                  <button type="button" onClick={() => toggle(l)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/50 active:bg-accent sm:px-5" aria-pressed={l.transferred}>
                    <EnvelopeIcon icon={env?.icon ?? 'wallet'} tier={l.tier} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate text-sm font-medium', l.transferred && 'text-muted-foreground line-through')}>{l.label}</div>
                      <div className="text-xs text-muted-foreground">{TIER_LABELS[l.tier]}{l.amount !== l.recommended && ' · editado'}</div>
                    </div>
                    <Money cents={l.amount} className="text-sm font-semibold" />
                    <span className={cn('flex size-6 items-center justify-center rounded-full border-2 transition', l.transferred ? 'border-success bg-success text-success-foreground' : 'border-input')}>
                      {l.transferred && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {summary.unassigned > 0 && (
            <div className="flex items-center gap-3 border-t px-4 py-3 text-sm sm:px-5">
              <Wallet className="size-4 text-muted-foreground" />
              <span className="flex-1 text-muted-foreground">Sin asignar: queda como saldo disponible</span>
              <Money cents={summary.unassigned} className="font-semibold" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="secondary" className="justify-between">
          <Link to="/sobres">
            Ver sobres <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="secondary" className="justify-between">
          <Link to="/movimientos">
            Registrar un gasto <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function BudgetHistory({ budgets, current, onSelect }: { budgets: WeeklyBudget[]; current: ISODate; onSelect: (d: ISODate) => void }) {
  const sorted = [...budgets].sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  return (
    <section className="space-y-3 pt-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <History className="size-4" /> Semanas anteriores
      </h2>
      {sorted.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Aún no hay semanas confirmadas" description="Cuando confirmes tu primer presupuesto aparecerá aquí, y podrás abrirlo o editarlo cuando quieras." />
      ) : (
        <Card className="divide-y">
          {sorted.slice(0, 26).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect(b.payDate)}
              className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/50', b.weekKey === current && 'bg-primary/5')}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{formatWeekRange(b.weekKey)}</div>
                <div className="text-xs text-muted-foreground">
                  Libre <Money cents={b.unassigned} />
                  {b.deficit > 0 && (
                    <span className="text-destructive">
                      {' '}
                      · déficit <Money cents={b.deficit} />
                    </span>
                  )}
                </div>
              </div>
              <ModeBadge mode={b.mode} />
              <Money cents={b.income} className="w-24 text-right text-sm font-semibold" />
            </button>
          ))}
        </Card>
      )}
    </section>
  );
}
