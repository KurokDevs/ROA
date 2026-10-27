import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CalendarCheck, CheckCircle2, Info, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Field } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { centsToInput, formatMoney, sumCents, toCents } from '@/lib/money';
import { formatDateLong } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { goalProgress, weeklyInflow, type GoalProgress } from '@/engine/goals';
import { saveGoal } from '@/services/crudService';
import type { Goal, GoalType } from '@/models/types';

export function GoalsPage() {
  const f = useFinance();
  const [form, setForm] = useState<{ open: boolean; goal?: Goal }>({ open: false });

  const progress: GoalProgress[] = useMemo(() => {
    // Ritmo semanal: para metas de sobre, lo que entra a esos sobres; para patrimonio,
    // lo que entra a sobres de ahorro e inversión (proxy del aumento de patrimonio).
    const savingsIds = f.envelopes.filter((e) => e.tier === 'savings' || e.tier === 'investment').map((e) => e.id);
    return f.goals
      .filter((g) => !g.archived)
      .sort((a, b) => a.priority - b.priority)
      .map((goal) =>
        goalProgress({
          goal,
          envelopeBalances: f.balances,
          netWorth: f.worth.netWorth,
          weeklyRate: weeklyInflow(goal.type === 'envelope' ? goal.envelopeIds : savingsIds, f.entries, f.today),
          today: f.today
        })
      );
  }, [f]);

  const move = async (g: Goal, dir: -1 | 1) => {
    const list = f.goals.filter((x) => !x.archived).sort((a, b) => a.priority - b.priority);
    const i = list.findIndex((x) => x.id === g.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    await db.transaction('rw', db.goals, async () => {
      for (const [idx, item] of reordered.entries()) await db.goals.update(item.id, { priority: idx + 1 });
    });
  };

  const remove = async (g: Goal) => {
    await db.goals.update(g.id, { archived: true });
    toast.success('Meta archivada', { action: { label: 'Deshacer', onClick: () => db.goals.update(g.id, { archived: false }) } });
  };

  if (!f.ready) return null;
  const totalSavings = sumCents(f.envelopes.filter((e) => e.tier === 'savings').map((e) => f.balances.get(e.id) ?? 0));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Metas"
        subtitle="Progreso, fechas estimadas y prioridades"
        action={
          <Button onClick={() => setForm({ open: true })}>
            <Plus /> <span className="hidden sm:inline">Nueva meta</span>
          </Button>
        }
      />

      <Card className="grid grid-cols-2 gap-3 p-4">
        <div>
          <div className="text-xs text-muted-foreground">Ahorro en sobres</div>
          <Money cents={totalSavings} className="text-xl font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Patrimonio neto</div>
          <Money cents={f.worth.netWorth} className="text-xl font-semibold" />
        </div>
        <p className="col-span-2 flex gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          El patrimonio ya incluye el dinero de los sobres (está en tus cuentas), así que las reservas nunca se cuentan dos veces.
        </p>
      </Card>

      {progress.length === 0 ? (
        <EmptyState icon={Target} title="Sin metas" description="Crea una meta para ver tu progreso y la fecha estimada." action={<Button onClick={() => setForm({ open: true })}>Crear meta</Button>} />
      ) : (
        <div className="space-y-3">
          {progress.map((p, i) => (
            <Card key={p.goal.id} className={cn('p-4 sm:p-5 animate-fade-up', p.completed && 'border-success/40')} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start gap-3">
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold', p.completed ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary')}>
                  {p.completed ? <CheckCircle2 className="size-5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{p.goal.name}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {p.goal.type === 'networth' ? 'Patrimonio' : p.goal.envelopeIds.map((id) => f.envelopes.find((e) => e.id === id)?.name).filter(Boolean).join(' + ')}
                    </span>
                    {p.shortTerm && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">Corto plazo · no invertir en bolsa</span>}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5 text-sm">
                    <Money cents={p.current} className="text-lg font-semibold" />
                    <span className="text-muted-foreground">
                      de <Money cents={p.goal.target} />
                    </span>
                    <span className="tabular ml-auto text-sm font-medium">{Math.round(p.ratio * 100)}%</span>
                  </div>
                  <Progress className="mt-2 h-2.5" value={p.ratio * 100} indicatorClassName={p.completed ? 'bg-success' : 'bg-tier-savings'} />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {p.completed ? (
                      <span className="font-medium text-success">¡Meta alcanzada!</span>
                    ) : (
                      <>
                        <span>
                          Faltan <Money cents={p.remaining} />
                        </span>
                        <span>
                          Aportación media <Money cents={p.weeklyRate} />
                          /semana
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarCheck className="size-3.5" />
                          {p.estimatedDate ? `Estimado: ${formatDateLong(p.estimatedDate)}` : 'Sin aportaciones recientes para estimar'}
                        </span>
                      </>
                    )}
                    {p.goal.deadline && <span>Fecha límite: {formatDateLong(p.goal.deadline)}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-1 border-t pt-3">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => move(p.goal, -1)} disabled={i === 0} aria-label="Subir prioridad">
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => move(p.goal, 1)} disabled={i === progress.length - 1} aria-label="Bajar prioridad">
                  <ArrowDown className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, goal: p.goal })}>
                  <Pencil /> Editar
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => remove(p.goal)}>
                  <Trash2 /> Archivar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <GoalFormDialog open={form.open} goal={form.goal} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} nextPriority={f.goals.length + 1} />
    </div>
  );
}

function GoalFormDialog({ open, goal, onOpenChange, nextPriority }: { open: boolean; goal?: Goal; onOpenChange: (o: boolean) => void; nextPriority: number }) {
  const f = useFinance();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState<GoalType>('envelope');
  const [envelopeIds, setEnvelopeIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? '');
    setTarget(goal ? centsToInput(goal.target) : '');
    setType(goal?.type ?? 'envelope');
    setEnvelopeIds(goal?.envelopeIds ?? ['env_goals']);
    setDeadline(goal?.deadline ?? '');
  }, [open, goal]);

  const savingsEnvs = f.envelopes.filter((e) => !e.archived && (e.tier === 'savings' || e.tier === 'investment'));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveGoal(db, { id: goal?.id, name, target: toCents(target), type, envelopeIds: type === 'envelope' ? envelopeIds : [], deadline: deadline || null, priority: goal?.priority ?? nextPriority });
      toast.success(goal ? 'Meta actualizada' : 'Meta creada', { description: `${name} · ${formatMoney(toCents(target))}` });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? 'Editar meta' : 'Nueva meta'}</DialogTitle>
          <DialogDescription>Una meta mide el saldo de uno o varios sobres, o tu patrimonio neto total.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Nombre" htmlFor="g-name">
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} placeholder="Ej.: Laptop nueva" />
          </Field>
          <Field label="Importe objetivo" htmlFor="g-target">
            <MoneyInput id="g-target" value={target} onValueChange={setTarget} placeholder="0.00" />
          </Field>
          <Field label="Tipo" htmlFor="g-type">
            <NativeSelect id="g-type" value={type} onChange={(e) => setType(e.target.value as GoalType)}>
              <option value="envelope">Saldo de sobres</option>
              <option value="networth">Patrimonio neto</option>
            </NativeSelect>
          </Field>
          {type === 'envelope' && (
            <Field label="Sobres que cuentan para la meta" hint="Puedes crear un sobre específico en Sobres para cada meta.">
              <div className="grid gap-1.5 rounded-xl border p-2">
                {savingsEnvs.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50">
                    <input
                      type="checkbox"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={envelopeIds.includes(e.id)}
                      onChange={(ev) => setEnvelopeIds((ids) => (ev.target.checked ? [...ids, e.id] : ids.filter((x) => x !== e.id)))}
                    />
                    <span className="flex-1">{e.name}</span>
                    <Money cents={f.balances.get(e.id) ?? 0} className="text-xs text-muted-foreground" />
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Field label="Fecha límite (opcional)" htmlFor="g-deadline" hint="Si es en menos de 2 años, es dinero de corto plazo: mejor en ahorro, no en bolsa.">
            <Input id="g-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
