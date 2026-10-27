import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HandCoins, Pencil, Plus, Wallet } from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Field } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { TransactionDialog } from '@/components/forms/TransactionDialog';
import { centsToInput, progressRatio, sumCents, toCents } from '@/lib/money';
import { formatDateShort } from '@/lib/dates';
import { saveDebt, type TxDraft } from '@/services/transactionService';
import type { Debt } from '@/models/types';

export function DebtsPage() {
  const f = useFinance();
  const [form, setForm] = useState<{ open: boolean; debt?: Debt }>({ open: false });
  const [tx, setTx] = useState<{ open: boolean; initial?: Partial<TxDraft>; title?: string }>({ open: false });
  const open = f.debts.filter((d) => !d.closed);
  const closed = f.debts.filter((d) => d.closed);
  const totalOpen = sumCents(open.map((d) => f.debtBalances.get(d.id) ?? 0));
  const reserved = f.balances.get('env_debts') ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deudas y adelantos"
        subtitle="Pagos pendientes que el organizador cubre antes de ahorrar"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTx({ open: true, initial: { type: 'advance_received' }, title: 'Registrar adelanto recibido' })}>
              <Wallet /> <span className="hidden sm:inline">Adelanto</span>
            </Button>
            <Button onClick={() => setForm({ open: true })}>
              <Plus /> <span className="hidden sm:inline">Deuda</span>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total pendiente</div>
          <Money cents={totalOpen} className="text-xl font-semibold" />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Apartado en «Pagos pendientes»</div>
          <Money cents={reserved} className="text-xl font-semibold" />
        </Card>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        Un adelanto entra en tu cuenta pero no es ingreso: se registra como deuda. Sus devoluciones y los pagos de deudas reducen el saldo pendiente y no cuentan como gasto.
      </p>

      {open.length === 0 ? (
        <EmptyState icon={HandCoins} title="Sin deudas pendientes" description="Si recibes un adelanto o tienes un pago pendiente, regístralo aquí y el organizador lo incluirá cada semana." />
      ) : (
        <div className="space-y-3">
          {open.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              balance={f.debtBalances.get(d.id) ?? 0}
              payments={f.transactions.filter((t) => t.debtId === d.id && (t.type === 'debt_payment' || t.type === 'advance_repaid')).length}
              onPay={() =>
                setTx({
                  open: true,
                  title: `Pagar ${d.name}`,
                  initial: { type: d.kind === 'advance' ? 'advance_repaid' : 'debt_payment', debtId: d.id, amount: Math.min(d.weeklyPayment || (f.debtBalances.get(d.id) ?? 0), f.debtBalances.get(d.id) ?? 0), envelopeId: 'env_debts' }
                })
              }
              onEdit={() => setForm({ open: true, debt: d })}
            />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Saldadas</h2>
          <Card className="divide-y">
            {closed.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-4 text-sm">
                <span>{d.name}</span>
                <Badge variant="success">Pagada · <Money cents={d.originalAmount} /></Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      <DebtForm open={form.open} debt={form.debt} onOpenChange={(o) => setForm((s) => ({ ...s, open: o }))} />
      <TransactionDialog open={tx.open} onOpenChange={(o) => setTx((s) => ({ ...s, open: o }))} initial={tx.initial} title={tx.title} />
    </div>
  );
}

function DebtCard({ debt, balance, payments, onPay, onEdit }: { debt: Debt; balance: number; payments: number; onPay: () => void; onEdit: () => void }) {
  const paid = debt.originalAmount - balance;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{debt.name}</span>
            <Badge variant={debt.kind === 'advance' ? 'warning' : 'destructive'}>{debt.kind === 'advance' ? 'Adelanto' : 'Deuda'}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pago semanal {debt.weeklyPayment > 0 ? <Money cents={debt.weeklyPayment} /> : 'todo de una vez'}
            {debt.dueDate && ` · vence ${formatDateShort(debt.dueDate)}`} · {payments} pago(s)
          </p>
        </div>
        <div className="text-right">
          <Money cents={balance} className="text-lg font-semibold" />
          <div className="text-xs text-muted-foreground">
            de <Money cents={debt.originalAmount} />
          </div>
        </div>
      </div>
      <Progress className="mt-3" value={progressRatio(paid, debt.originalAmount) * 100} indicatorClassName="bg-success" />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil /> Editar
        </Button>
        <Button size="sm" onClick={onPay}>
          <HandCoins /> Registrar pago
        </Button>
      </div>
    </Card>
  );
}

function DebtForm({ open, debt, onOpenChange }: { open: boolean; debt?: Debt; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [weekly, setWeekly] = useState('');
  const [due, setDue] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(debt?.name ?? '');
    setAmount(debt ? centsToInput(debt.originalAmount) : '');
    setWeekly(debt?.weeklyPayment ? centsToInput(debt.weeklyPayment) : '');
    setDue(debt?.dueDate ?? '');
  }, [open, debt]);
  const isAdvanceFromTx = !!debt?.sourceTxId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveDebt(db, { id: debt?.id, name, kind: debt?.kind ?? 'debt', originalAmount: toCents(amount), weeklyPayment: toCents(weekly), dueDate: due || null, notes: debt?.notes ?? '' });
      toast.success('Guardado');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{debt ? 'Editar' : 'Nueva deuda'}</DialogTitle>
          <DialogDescription>Una deuda existente que reduce tu patrimonio. Para dinero que te adelantaron hoy, usa «Adelanto».</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Nombre" htmlFor="d-name">
            <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej.: préstamo de un amigo" />
          </Field>
          <Field label="Importe total" htmlFor="d-amount" hint={isAdvanceFromTx ? 'Para cambiar el importe de un adelanto, edita su movimiento.' : undefined}>
            <MoneyInput id="d-amount" value={amount} onValueChange={setAmount} disabled={isAdvanceFromTx} />
          </Field>
          <Field label="Pago semanal pactado" htmlFor="d-weekly" hint="0 = pagar todo cuando sea posible">
            <MoneyInput id="d-weekly" value={weekly} onValueChange={setWeekly} />
          </Field>
          <Field label="Fecha límite (opcional)" htmlFor="d-due" hint="La semana del vencimiento el organizador intentará cubrir todo el saldo.">
            <Input id="d-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
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
