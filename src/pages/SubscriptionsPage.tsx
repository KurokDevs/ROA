import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Ban, Bell, Pencil, Plus, Repeat, Undo2 } from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Field } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { centsToInput, toCents } from '@/lib/money';
import { formatDateShort } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { monthlyEquivalent, needsReminder, nextRenewal, summarizeSubscriptions, yearlyEquivalent } from '@/engine/subscriptions';
import { markSubscriptionCancelled, saveSubscription } from '@/services/crudService';
import type { Subscription, SubscriptionFrequency, SubscriptionStatus } from '@/models/types';

const FREQ: Record<SubscriptionFrequency, string> = { weekly: 'Semanal', monthly: 'Mensual', yearly: 'Anual', unknown: 'Sin verificar' };
const STATUS: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  active: { label: 'Activa', variant: 'success' },
  pending_cancel: { label: 'Pendiente de cancelar', variant: 'warning' },
  paused: { label: 'Pausada', variant: 'secondary' },
  cancelled: { label: 'Cancelada', variant: 'secondary' }
};

export function SubscriptionsPage() {
  const f = useFinance();
  const [form, setForm] = useState<{ open: boolean; sub?: Subscription }>({ open: false });
  const [cancelling, setCancelling] = useState<Subscription | null>(null);
  const summary = summarizeSubscriptions(f.subscriptions);
  const order: SubscriptionStatus[] = ['pending_cancel', 'active', 'paused', 'cancelled'];
  const sorted = [...f.subscriptions].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.name.localeCompare(b.name));

  const doCancel = async () => {
    if (!cancelling) return;
    await markSubscriptionCancelled(db, cancelling.id, f.today);
    toast.success(`${cancelling.name} marcada como cancelada`, { description: 'Desde el próximo cálculo semanal se deja de apartar dinero para ella.' });
    setCancelling(null);
  };
  const reactivate = async (s: Subscription) => {
    await saveSubscription(db, { ...s, status: 'active' });
    toast.success(`${s.name} reactivada`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Suscripciones"
        subtitle="Controla cargos recurrentes y lo que ahorras al cancelarlos"
        action={
          <Button onClick={() => setForm({ open: true })}>
            <Plus /> <span className="hidden sm:inline">Añadir</span>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Gasto mensual que sigue cobrando</div>
          <Money cents={summary.monthlyCharging} className="text-xl font-semibold" />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Ahorro posible si cancelas las pendientes</div>
          <Money cents={summary.monthlySavingsPotential} className="text-xl font-semibold text-warning" />
          <span className="text-xs text-muted-foreground"> /mes</span>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Ahorro confirmado (canceladas)</div>
          <Money cents={summary.monthlySavedConfirmed} className="text-xl font-semibold text-success" />
          <span className="text-xs text-muted-foreground"> /mes</span>
        </Card>
      </div>
      {summary.unverified.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {summary.unverified.map((s) => s.name).join(', ')}: frecuencia sin verificar. No se incluye en los ahorros estimados hasta que la confirmes.
        </p>
      )}
      <p className="px-1 text-xs text-muted-foreground">Las suscripciones nunca se cancelan automáticamente: márcalas como canceladas solo cuando lo hayas hecho en el servicio.</p>

      {sorted.length === 0 ? (
        <EmptyState icon={Repeat} title="Sin suscripciones" description="Añade Netflix, Spotify, el gimnasio… para ver cuánto pagas al mes." />
      ) : (
        <Card className="divide-y">
          {sorted.map((s) => {
            const monthly = monthlyEquivalent(s.price, s.frequency);
            const yearly = yearlyEquivalent(s.price, s.frequency);
            const next = nextRenewal(s, f.today);
            const remind = needsReminder(s, f.today);
            return (
              <div key={s.id} className={cn('flex flex-wrap items-center gap-3 p-4', s.status === 'cancelled' && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    <Badge variant={STATUS[s.status].variant}>{STATUS[s.status].label}</Badge>
                    {remind && (
                      <Badge variant="default">
                        <Bell className="size-3" /> Renueva pronto
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <Money cents={s.price} /> · {FREQ[s.frequency]}
                    {monthly !== null && s.frequency !== 'monthly' && (
                      <>
                        {' '}
                        (≈ <Money cents={monthly} />
                        /mes)
                      </>
                    )}
                    {yearly !== null && (
                      <>
                        {' '}
                        · <Money cents={yearly} />
                        /año
                      </>
                    )}
                    {next && ` · renueva ${formatDateShort(next)}`}
                    {s.paymentMethod && ` · ${s.paymentMethod}`}
                    {s.status === 'cancelled' && s.cancelledAt && ` · cancelada ${formatDateShort(s.cancelledAt)}`}
                  </div>
                  {s.notes && <p className="mt-1 text-xs text-muted-foreground/80">{s.notes}</p>}
                </div>
                <div className="flex gap-1">
                  {s.status === 'cancelled' ? (
                    <Button size="sm" variant="ghost" onClick={() => reactivate(s)}>
                      <Undo2 /> Reactivar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setCancelling(s)}>
                      <Ban /> Ya la cancelé
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="size-9" onClick={() => setForm({ open: true, sub: s })} aria-label="Editar">
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <SubscriptionForm open={form.open} sub={form.sub} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmas que cancelaste {cancelling?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Márcala solo si ya la cancelaste en el servicio. ROA dejará de reservar dinero para ella y la contará como ahorro confirmado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Todavía no</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel}>Sí, ya está cancelada</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SubscriptionForm({ open, sub, onOpenChange }: { open: boolean; sub?: Subscription; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('monthly');
  const [renewalDate, setRenewalDate] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reminderDays, setReminderDays] = useState(3);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(sub?.name ?? '');
    setPrice(sub ? centsToInput(sub.price) : '');
    setFrequency(sub?.frequency ?? 'monthly');
    setRenewalDate(sub?.renewalDate ?? '');
    setStatus(sub?.status ?? 'active');
    setPaymentMethod(sub?.paymentMethod ?? '');
    setReminderDays(sub?.reminderDays ?? 3);
    setNotes(sub?.notes ?? '');
  }, [open, sub]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSubscription(db, { id: sub?.id, name, price: toCents(price), frequency, renewalDate: renewalDate || null, status, paymentMethod, reminderDays, notes, cancelledAt: sub?.cancelledAt ?? null });
      toast.success('Suscripción guardada');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sub ? 'Editar suscripción' : 'Nueva suscripción'}</DialogTitle>
          <DialogDescription>Si no sabes cada cuánto te cobra, deja «Sin verificar»: no se usará para calcular ahorros.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Servicio" htmlFor="s-name" className="sm:col-span-2">
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} />
          </Field>
          <Field label="Precio" htmlFor="s-price">
            <MoneyInput id="s-price" value={price} onValueChange={setPrice} placeholder="0.00" />
          </Field>
          <Field label="Frecuencia" htmlFor="s-freq">
            <NativeSelect id="s-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as SubscriptionFrequency)}>
              {Object.entries(FREQ).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fecha de renovación" htmlFor="s-renew">
            <Input id="s-renew" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
          </Field>
          <Field label="Estado" htmlFor="s-status">
            <NativeSelect id="s-status" value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Método de pago" htmlFor="s-pay">
            <Input id="s-pay" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Tarjeta, PayPal…" />
          </Field>
          <Field label="Recordatorio (días antes)" htmlFor="s-rem">
            <Input id="s-rem" type="number" inputMode="numeric" min={0} max={30} value={reminderDays} onChange={(e) => setReminderDays(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Notas" htmlFor="s-notes" className="sm:col-span-2">
            <Textarea id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
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
