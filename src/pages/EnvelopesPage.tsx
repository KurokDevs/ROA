import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRight, Archive, CalendarClock, Car, Layers, Pencil, Plus, Receipt, Scale } from 'lucide-react';
import { db } from '@/db';
import { useFinance, type FinanceData } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Field } from '@/components/common/Field';
import { EnvelopeIcon, ENVELOPE_ICONS } from '@/components/common/icons';
import { EmptyState } from '@/components/common/EmptyState';
import { TransactionDialog } from '@/components/forms/TransactionDialog';
import { centsToInput, formatMoney, progressRatio, toCents, type Cents } from '@/lib/money';
import { diffDays, formatDateLong, formatDateShort } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { billNeed, effectiveDueDate } from '@/engine/allocation';
import { ENVELOPE_SPENDING_TYPES } from '@/engine/ledger';
import { TIER_LABELS, TIER_ORDER, TX_TYPE_LABELS, type BillFrequency, type Envelope, type FundingMethod, type Tier } from '@/models/types';
import { archiveEnvelope, moveFunds, newEnvelope, saveEnvelope, setEnvelopeBalance } from '@/services/envelopeService';
import type { TxDraft } from '@/services/transactionService';

const METHOD_LABELS: Partial<Record<FundingMethod, string>> = {
  bill: 'Factura (mensual/anual)',
  topup: 'Presupuesto semanal (rellenar)',
  fixed: 'Aportación fija hasta objetivo'
};

const TEMPLATES: { label: string; env: Partial<Envelope> & Pick<Envelope, 'name' | 'tier' | 'method'> }[] = [
  { label: 'Electricidad', env: { name: 'Electricidad', icon: 'zap', tier: 'essential', method: 'bill', billAmount: 8000, weeklyAmount: 2000 } },
  { label: 'Internet', env: { name: 'Internet', icon: 'wifi', tier: 'essential', method: 'bill', billAmount: 6000, weeklyAmount: 1500 } },
  { label: 'Supermercado', env: { name: 'Supermercado', icon: 'cart', tier: 'living', method: 'topup', weeklyAmount: 6000 } },
  { label: 'Reparaciones del vehículo', env: { name: 'Reparaciones del vehículo', icon: 'hammer', tier: 'savings', method: 'fixed', weeklyAmount: 1500, targetAmount: 50000, isVehicle: true } },
  { label: 'Imprevistos laborales', env: { name: 'Imprevistos laborales', icon: 'briefcase', tier: 'savings', method: 'fixed', weeklyAmount: 1000, targetAmount: 30000 } },
  { label: 'Registro / placas (anual)', env: { name: 'Registro del carro', icon: 'car', tier: 'work', method: 'bill', billFrequency: 'yearly', billAmount: 15000, isVehicle: true } },
  { label: 'Sobre en blanco', env: { name: '', tier: 'living', method: 'topup' } }
];

export function EnvelopesPage() {
  const f = useFinance();
  const [selected, setSelected] = useState<Envelope | null>(null);
  const [form, setForm] = useState<{ open: boolean; env?: Envelope; isNew?: boolean }>({ open: false });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [move, setMove] = useState<{ open: boolean; fromId?: string }>({ open: false });
  const [tx, setTx] = useState<{ open: boolean; initial?: Partial<TxDraft>; title?: string }>({ open: false });
  const [showArchived, setShowArchived] = useState(false);

  const envelopes = f.envelopes.filter((e) => showArchived || !e.archived);
  const groups = TIER_ORDER.map((tier) => ({ tier, items: envelopes.filter((e) => e.tier === tier).sort((a, b) => a.priority - b.priority) })).filter((g) => g.items.length > 0);
  const live = selected ? f.envelopes.find((e) => e.id === selected.id) ?? null : null;

  if (!f.ready || !f.settings) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sobres"
        subtitle="Dinero apartado para cada propósito. Mover entre sobres no es ingreso ni gasto."
        action={
          <Button onClick={() => setTemplateOpen(true)}>
            <Plus /> <span className="hidden sm:inline">Nuevo sobre</span>
          </Button>
        }
      />

      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Total apartado</div>
          <Money cents={f.reserved} className="text-xl font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Saldo disponible</div>
          <Money cents={f.available} className={cn('text-xl font-semibold', f.available < 0 && 'text-destructive')} />
        </div>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:justify-end">
          <Button variant="outline" size="sm" onClick={() => setMove({ open: true })}>
            <ArrowLeftRight /> Mover fondos
          </Button>
        </div>
      </Card>

      {groups.map((g) => (
        <section key={g.tier} className="space-y-2">
          <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: `hsl(var(--tier-${g.tier}))` }} />
            {TIER_LABELS[g.tier]}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.items.map((e) => (
              <EnvelopeCard key={e.id} env={e} f={f} onClick={() => setSelected(e)} />
            ))}
          </div>
        </section>
      ))}

      <label className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Mostrar sobres archivados
      </label>

      {/* Detalle de sobre */}
      <Dialog open={!!live} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-xl">
          {live && (
            <EnvelopeDetail
              env={live}
              f={f}
              onEdit={() => setForm({ open: true, env: live })}
              onMove={() => setMove({ open: true, fromId: live.id })}
              onSpend={(bill) =>
                setTx({
                  open: true,
                  title: bill ? `Pagar ${live.name}` : `Gasto desde ${live.name}`,
                  initial: { type: 'expense', envelopeId: live.id, amount: bill ? live.billAmount : undefined, isBillPayment: bill, category: guessCategory(live), description: bill ? `Pago ${live.name}` : '' }
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Plantillas */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo sobre</DialogTitle>
            <DialogDescription>Elige una plantilla para facturas o reservas que aún no tienes (electricidad, suscripciones, imprevistos…).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                className="flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition hover:border-primary/40 hover:bg-accent/40"
                onClick={() => {
                  setTemplateOpen(false);
                  setForm({ open: true, env: newEnvelope(t.env), isNew: true });
                }}
              >
                <EnvelopeIcon icon={t.env.icon ?? 'wallet'} tier={t.env.tier} size="sm" />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{TIER_LABELS[t.env.tier]}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <EnvelopeFormDialog open={form.open} env={form.env} isNew={form.isNew} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
      <MoveFundsDialog open={move.open} fromId={move.fromId} f={f} onOpenChange={(open) => setMove((s) => ({ ...s, open }))} />
      <TransactionDialog open={tx.open} onOpenChange={(open) => setTx((s) => ({ ...s, open }))} initial={tx.initial} title={tx.title} />
      {f.envelopes.length === 0 && <EmptyState icon={Layers} title="Sin sobres" description="Crea tu primer sobre." />}
    </div>
  );
}

function guessCategory(env: Envelope): string {
  const map: Record<string, string> = {
    env_rent: 'Vivienda',
    env_phone: 'Teléfono',
    env_insurance: 'Seguro',
    env_gas: 'Gasolina',
    env_tolls: 'Peajes',
    env_maint: 'Mantenimiento vehículo',
    env_car_fund: 'Reparación vehículo',
    env_personal: 'Comida',
    env_couple: 'Pareja',
    env_subs: 'Suscripciones'
  };
  return map[env.id] ?? (env.isVehicle ? 'Mantenimiento vehículo' : env.tier === 'essential' ? 'Servicios' : 'Otros');
}

/** Objetivo visual del sobre según su método. */
function envelopeTarget(env: Envelope): Cents {
  if (env.method === 'bill') return env.billAmount;
  if (env.method === 'topup') return env.weeklyAmount;
  return env.targetAmount;
}

function recommended(env: Envelope, balance: Cents, f: FinanceData): Cents | null {
  const s = f.settings!;
  if (env.method === 'bill') return billNeed(env, balance, f.today, s.paydayWeekday).need;
  if (env.method === 'topup') return Math.max(0, env.weeklyAmount - balance);
  if (env.method === 'fixed') return env.targetAmount > 0 ? Math.min(env.weeklyAmount, Math.max(0, env.targetAmount - balance)) : env.weeklyAmount;
  return null;
}

function EnvelopeCard({ env, f, onClick }: { env: Envelope; f: FinanceData; onClick: () => void }) {
  const balance = f.balances.get(env.id) ?? 0;
  const target = envelopeTarget(env);
  const due = env.method === 'bill' ? effectiveDueDate(env, f.today) : null;
  const rec = recommended(env, balance, f);
  const low = env.system === 'vehicle_maint' && balance < (f.settings?.vehicleMinBalance ?? 0);
  return (
    <button onClick={onClick} className={cn('block text-left transition active:scale-[0.99]', env.archived && 'opacity-50')}>
      <Card className="h-full p-4 transition hover:border-primary/30">
        <div className="flex items-start gap-3">
          <EnvelopeIcon icon={env.icon} tier={env.tier} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{env.name}</span>
              {env.isVehicle && <Car className="size-3.5 shrink-0 text-tier-work" aria-label="Vehículo" />}
            </div>
            <div className="text-xs text-muted-foreground">
              {env.method === 'bill' && (due ? `Vence ${formatDateShort(due)}` : 'Sin fecha de vencimiento')}
              {env.method === 'topup' && `Semanal ${formatMoney(env.weeklyAmount)}`}
              {env.method === 'fixed' && (env.targetAmount > 0 ? `Objetivo ${formatMoney(env.targetAmount, { compact: true })}` : `Aporte ${formatMoney(env.weeklyAmount)}`)}
              {env.method === 'debts' && 'Pagos de deudas y adelantos'}
              {env.method === 'subscriptions' && 'Suscripciones activas'}
              {env.method === 'investment' && 'Solo en modo Crecimiento'}
            </div>
          </div>
          <Money cents={balance} className={cn('font-semibold', balance < 0 && 'text-destructive')} />
        </div>
        {target > 0 && (
          <Progress className="mt-3 h-1.5" value={progressRatio(balance, target) * 100} indicatorStyle={{ backgroundColor: low ? 'hsl(var(--warning))' : `hsl(var(--tier-${env.tier}))` }} />
        )}
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>{rec !== null ? `Recomendado esta semana: ${formatMoney(rec)}` : ' '}</span>
          {target > 0 && <span className="tabular">{Math.round(progressRatio(balance, target) * 100)}%</span>}
        </div>
        {low && <p className="mt-1 text-[11px] font-medium text-warning">Fondo de mantenimiento por debajo de {formatMoney(f.settings!.vehicleMinBalance)}</p>}
      </Card>
    </button>
  );
}

function EnvelopeDetail({ env, f, onEdit, onMove, onSpend }: { env: Envelope; f: FinanceData; onEdit: () => void; onMove: () => void; onSpend: (bill: boolean) => void }) {
  const balance = f.balances.get(env.id) ?? 0;
  const [adjust, setAdjust] = useState(false);
  const [newBal, setNewBal] = useState(centsToInput(balance));
  const history = useMemo(() => {
    const items = [
      ...f.entries.filter((e) => e.envelopeId === env.id).map((e) => ({ id: e.id, date: e.date, amount: e.amount, label: e.kind === 'allocation' ? 'Reserva semanal' : e.kind === 'move' ? `Movimiento: ${e.note}` : e.note || 'Ajuste', created: e.createdAt })),
      ...f.transactions
        .filter((t) => t.envelopeId === env.id && ENVELOPE_SPENDING_TYPES.includes(t.type))
        .map((t) => ({ id: t.id, date: t.date, amount: -t.amount, label: `${t.isBillPayment ? 'Pago de factura' : TX_TYPE_LABELS[t.type]}${t.description ? ` · ${t.description}` : ''}`, created: t.createdAt }))
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  }, [f, env.id]);
  const due = env.method === 'bill' ? effectiveDueDate(env, f.today) : null;
  const rec = recommended(env, balance, f);

  const saveAdjust = async () => {
    await setEnvelopeBalance(db, env.id, toCents(newBal), f.today, 'Ajuste manual de saldo');
    toast.success('Saldo actualizado');
    setAdjust(false);
  };

  const archive = async () => {
    try {
      await archiveEnvelope(db, env.id, !env.archived);
      toast.success(env.archived ? 'Sobre restaurado' : 'Sobre archivado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <EnvelopeIcon icon={env.icon} tier={env.tier} size="lg" />
          <div>
            <DialogTitle>{env.name}</DialogTitle>
            <DialogDescription>
              {TIER_LABELS[env.tier]}
              {env.isVehicle && ' · vehículo'}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
        <div>
          <div className="text-[11px] text-muted-foreground">Saldo reservado</div>
          <Money cents={balance} className="font-semibold" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">{env.method === 'bill' ? 'Factura' : 'Objetivo'}</div>
          <Money cents={envelopeTarget(env)} className="font-semibold" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Recomendado</div>
          {rec !== null ? <Money cents={rec} className="font-semibold" /> : <span className="text-sm">—</span>}
        </div>
      </div>
      {due && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4" /> Próximo uso: {formatDateLong(due)} ({diffDays(due, f.today)} días)
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {env.method === 'bill' && (
          <Button size="sm" onClick={() => onSpend(true)}>
            <Receipt /> Pagar factura
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => onSpend(false)}>
          <Receipt /> Gasto
        </Button>
        <Button size="sm" variant="secondary" onClick={onMove}>
          <ArrowLeftRight /> Mover
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAdjust((a) => !a)}>
          <Scale /> Ajustar
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil /> Editar
        </Button>
        {!['debts', 'investment', 'subscriptions'].includes(env.system ?? '') && (
          <Button size="sm" variant="ghost" onClick={archive}>
            <Archive /> {env.archived ? 'Restaurar' : 'Archivar'}
          </Button>
        )}
      </div>
      {adjust && (
        <div className="flex items-end gap-2 rounded-xl border p-3">
          <Field label="Saldo real del sobre" className="flex-1" hint="Útil para registrar lo que ya tenías apartado al empezar.">
            <MoneyInput value={newBal} onValueChange={setNewBal} />
          </Field>
          <Button onClick={saveAdjust}>Guardar</Button>
        </div>
      )}
      <div>
        <h4 className="mb-2 text-sm font-semibold">Historial de movimientos</h4>
        {history.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">Sin movimientos todavía. Se llenará al confirmar tu primer presupuesto semanal.</p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-xl border">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDateShort(h.date)}</span>
                <span className="min-w-0 flex-1 truncate">{h.label}</span>
                <Money cents={h.amount} sign colored className="font-medium" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function EnvelopeFormDialog({ open, env, isNew, onOpenChange }: { open: boolean; env?: Envelope; isNew?: boolean; onOpenChange: (o: boolean) => void }) {
  const [draft, setDraft] = useState<Envelope | null>(null);
  const [money, setMoney] = useState({ weekly: '', bill: '', target: '', minInvest: '' });
  useEffect(() => {
    if (open && env) {
      setDraft(env);
      setMoney({
        weekly: env.weeklyAmount ? centsToInput(env.weeklyAmount) : '',
        bill: env.billAmount ? centsToInput(env.billAmount) : '',
        target: env.targetAmount ? centsToInput(env.targetAmount) : '',
        minInvest: env.minBeforeInvest ? centsToInput(env.minBeforeInvest) : ''
      });
    }
  }, [open, env]);
  if (!draft) return null;
  const set = <K extends keyof Envelope>(k: K, v: Envelope[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const isSystemMethod = ['debts', 'subscriptions', 'investment'].includes(draft.method);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveEnvelope(db, {
        ...draft,
        weeklyAmount: toCents(money.weekly),
        billAmount: toCents(money.bill),
        targetAmount: toCents(money.target),
        minBeforeInvest: toCents(money.minInvest)
      });
      toast.success('Sobre guardado');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Nuevo sobre' : 'Editar sobre'}</DialogTitle>
          <DialogDescription>Los cambios se aplican desde el próximo cálculo semanal. Los presupuestos confirmados no cambian.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="env-name">
            <Input id="env-name" value={draft.name} onChange={(e) => set('name', e.target.value)} required maxLength={40} />
          </Field>
          <Field label="Icono" htmlFor="env-icon">
            <NativeSelect id="env-icon" value={draft.icon} onChange={(e) => set('icon', e.target.value)}>
              {Object.keys(ENVELOPE_ICONS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {!isSystemMethod && (
            <>
              <Field label="Prioridad" htmlFor="env-tier" hint="Nivel en el orden del organizador">
                <NativeSelect id="env-tier" value={draft.tier} onChange={(e) => set('tier', e.target.value as Tier)}>
                  {(['essential', 'work', 'living', 'savings'] as Tier[]).map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Cómo se calcula" htmlFor="env-method">
                <NativeSelect id="env-method" value={draft.method} onChange={(e) => set('method', e.target.value as FundingMethod)}>
                  {Object.entries(METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </>
          )}
          {draft.method === 'bill' && (
            <>
              <Field label="Costo real de la factura" htmlFor="env-bill">
                <MoneyInput id="env-bill" value={money.bill} onValueChange={(v) => setMoney((m) => ({ ...m, bill: v }))} />
              </Field>
              <Field label="Frecuencia" htmlFor="env-freq">
                <NativeSelect id="env-freq" value={draft.billFrequency} onChange={(e) => set('billFrequency', e.target.value as BillFrequency)}>
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </NativeSelect>
              </Field>
              {draft.billFrequency === 'monthly' ? (
                <Field label="Día de vencimiento (1–31)" htmlFor="env-due" hint="Con fecha, ROA reparte lo que falta entre los viernes restantes (meses de 4 o 5 viernes).">
                  <Input id="env-due" type="number" inputMode="numeric" min={1} max={31} value={draft.dueDay ?? ''} onChange={(e) => set('dueDay', e.target.value ? Number(e.target.value) : null)} />
                </Field>
              ) : (
                <Field label="Próximo vencimiento" htmlFor="env-next">
                  <Input id="env-next" type="date" value={draft.nextDueDate ?? ''} onChange={(e) => set('nextDueDate', e.target.value || null)} />
                </Field>
              )}
              <Field label="Reserva semanal de referencia" htmlFor="env-weekly" hint="Se usa si la factura no tiene fecha de vencimiento.">
                <MoneyInput id="env-weekly" value={money.weekly} onValueChange={(v) => setMoney((m) => ({ ...m, weekly: v }))} />
              </Field>
            </>
          )}
          {(draft.method === 'topup' || draft.method === 'fixed') && (
            <Field label={draft.method === 'topup' ? 'Presupuesto semanal' : 'Aportación semanal'} htmlFor="env-weekly2">
              <MoneyInput id="env-weekly2" value={money.weekly} onValueChange={(v) => setMoney((m) => ({ ...m, weekly: v }))} />
            </Field>
          )}
          {draft.method === 'fixed' && (
            <Field label="Cantidad objetivo" htmlFor="env-target" hint="0 = sin tope">
              <MoneyInput id="env-target" value={money.target} onValueChange={(v) => setMoney((m) => ({ ...m, target: v }))} />
            </Field>
          )}
          {draft.tier === 'savings' && (
            <Field label="Reserva mínima antes de invertir" htmlFor="env-min" hint="Mientras no se alcance, no se recomiendan inversiones.">
              <MoneyInput id="env-min" value={money.minInvest} onValueChange={(v) => setMoney((m) => ({ ...m, minInvest: v }))} />
            </Field>
          )}
          <Field label="Orden dentro del nivel" htmlFor="env-prio" hint="1 = primero">
            <Input id="env-prio" type="number" inputMode="numeric" min={0} max={99} value={draft.priority} onChange={(e) => set('priority', Number(e.target.value) || 0)} />
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm sm:col-span-2">
            <span>
              <span className="font-medium">Sobre del vehículo</span>
              <span className="block text-xs text-muted-foreground">Te avisa si lo usas para gastos personales.</span>
            </span>
            <Switch checked={draft.isVehicle} onCheckedChange={(v) => set('isVehicle', v)} />
          </label>
          <DialogFooter className="sm:col-span-2">
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

function MoveFundsDialog({ open, fromId, f, onOpenChange }: { open: boolean; fromId?: string; f: FinanceData; onOpenChange: (o: boolean) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setFrom(fromId ?? '');
      setTo('');
      setAmount('');
      setNote('');
    }
  }, [open, fromId]);
  const envs = f.envelopes.filter((e) => !e.archived);
  const fromEnv = envs.find((e) => e.id === from);
  const toEnv = envs.find((e) => e.id === to);
  const vehicleOut = fromEnv?.isVehicle && toEnv && !toEnv.isVehicle;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await moveFunds(db, { fromId: from, toId: to, amount: toCents(amount), date: f.today, note });
      toast.success('Fondos movidos', { description: `${formatMoney(toCents(amount))}: ${fromEnv?.name} → ${toEnv?.name}` });
      if (vehicleOut) toast.warning('Sacaste dinero de un fondo del vehículo hacia un gasto no relacionado con el carro.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover fondos entre sobres</DialogTitle>
          <DialogDescription>Reasigna dinero ya apartado. No cuenta como ingreso ni como gasto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Desde" htmlFor="mv-from">
            <NativeSelect id="mv-from" value={from} onChange={(e) => setFrom(e.target.value)} required>
              <option value="">Elegir sobre…</option>
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {formatMoney(f.balances.get(e.id) ?? 0)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Hacia" htmlFor="mv-to">
            <NativeSelect id="mv-to" value={to} onChange={(e) => setTo(e.target.value)} required>
              <option value="">Elegir sobre…</option>
              {envs
                .filter((e) => e.id !== from)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {formatMoney(f.balances.get(e.id) ?? 0)}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Importe" htmlFor="mv-amount">
            <MoneyInput id="mv-amount" value={amount} onValueChange={setAmount} placeholder="0.00" />
          </Field>
          <Field label="Nota" htmlFor="mv-note">
            <Input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
          </Field>
          {vehicleOut && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Atención: estás sacando dinero del fondo del vehículo, que es tu herramienta de trabajo.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !from || !to || toCents(amount) <= 0}>
              Mover
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
