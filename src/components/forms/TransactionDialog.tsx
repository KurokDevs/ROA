import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Field } from '@/components/common/Field';
import { MoneyInput } from '@/components/common/MoneyInput';
import { centsToInput, formatMoney, toCents } from '@/lib/money';
import { todayISO } from '@/lib/dates';
import { CATEGORIES, TX_TYPE_LABELS, type Transaction, type TxType } from '@/models/types';
import { saveTransaction, type TxDraft } from '@/services/transactionService';

const TYPES: TxType[] = ['expense', 'income', 'transfer', 'debt_payment', 'advance_received', 'advance_repaid', 'fee', 'contribution'];

const TYPE_HINT: Record<TxType, string> = {
  income: 'Ingreso laboral fuera del presupuesto semanal (p. ej. un pago extra). El cobro del viernes regístralo en Mi Semana.',
  expense: 'Dinero que sale realmente. Si eliges un sobre, se descuenta de lo apartado.',
  transfer: 'Mover dinero entre tus propias cuentas. No cuenta como ingreso ni gasto.',
  debt_payment: 'Pago de una deuda. Reduce su saldo; no cuenta como gasto.',
  advance_received: 'Dinero adelantado que tendrás que devolver. Entra en tu cuenta pero NO es ingreso: se crea una deuda.',
  advance_repaid: 'Devolución de un adelanto. Reduce la deuda; no cuenta como gasto.',
  fee: 'Comisiones bancarias o de plataformas. Cuentan como gasto.',
  contribution: 'Aportación a tu cuenta de ahorro o inversión. Es un movimiento entre cuentas propias.'
};

export interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<TxDraft>;
  editing?: Transaction;
  title?: string;
}

export function TransactionDialog({ open, onOpenChange, initial, editing, title }: TransactionDialogProps) {
  const f = useFinance();
  const settings = f.settings;
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [envelopeId, setEnvelopeId] = useState('');
  const [category, setCategory] = useState('Otros');
  const [description, setDescription] = useState('');
  const [debtId, setDebtId] = useState('');
  const [isBusiness, setIsBusiness] = useState(false);
  const [isBillPayment, setIsBillPayment] = useState(false);
  const [advanceName, setAdvanceName] = useState('');
  const [advanceWeekly, setAdvanceWeekly] = useState('');
  const [advanceDue, setAdvanceDue] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const src = editing ?? initial ?? {};
    const debt = editing?.debtId ? f.debts.find((d) => d.id === editing.debtId) : undefined;
    setType(src.type ?? 'expense');
    setAmount(src.amount ? centsToInput(src.amount) : '');
    setDate(src.date ?? todayISO());
    setAccountId(src.accountId ?? settings?.defaultAccountId ?? 'acc_main');
    setToAccountId(src.toAccountId ?? '');
    setEnvelopeId(src.envelopeId ?? '');
    setCategory(src.category ?? (src.type === 'income' ? 'Trabajo delivery' : 'Otros'));
    setDescription(src.description ?? '');
    setDebtId(src.debtId ?? '');
    setIsBusiness(src.isBusiness ?? false);
    setIsBillPayment(src.isBillPayment ?? false);
    setAdvanceName(debt?.name ?? initial?.advanceName ?? '');
    setAdvanceWeekly(debt?.weeklyPayment ? centsToInput(debt.weeklyPayment) : '');
    setAdvanceDue(debt?.dueDate ?? '');
  }, [open, editing, initial]);

  const accounts = f.accounts.filter((a) => !a.archived);
  const envelopes = f.envelopes.filter((e) => !e.archived);
  const env = envelopes.find((e) => e.id === envelopeId);
  const usesEnvelope = ['expense', 'fee', 'debt_payment', 'advance_repaid', 'contribution'].includes(type);
  const usesCategory = type === 'expense' || type === 'fee' || type === 'income';
  const needsDebt = type === 'debt_payment' || type === 'advance_repaid';
  const debts = f.debts.filter((d) => (type === 'advance_repaid' ? d.kind === 'advance' : d.kind === 'debt') && (!d.closed || d.id === debtId));
  const lockedType = !!editing && (editing.type === 'advance_received');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const draft: TxDraft = {
        date,
        type,
        amount: toCents(amount),
        accountId,
        toAccountId: toAccountId || null,
        envelopeId: usesEnvelope ? envelopeId || null : null,
        category: usesCategory ? category : undefined,
        description,
        debtId: needsDebt ? debtId || null : null,
        isBusiness: (type === 'expense' || type === 'fee') && isBusiness,
        isBillPayment: type === 'expense' && isBillPayment,
        advanceName: advanceName.trim() || undefined,
        advanceWeeklyPayment: toCents(advanceWeekly),
        advanceDueDate: advanceDue || null
      };
      const { warnings } = await saveTransaction(db, draft, editing?.id);
      toast.success(editing ? 'Movimiento actualizado' : 'Movimiento guardado', { description: `${TX_TYPE_LABELS[type]} · ${formatMoney(draft.amount)}` });
      warnings.forEach((w) => toast.warning(w));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? (editing ? 'Editar movimiento' : 'Nuevo movimiento')}</DialogTitle>
          <DialogDescription>{TYPE_HINT[type]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="tx-type">
              <NativeSelect id="tx-type" value={type} onChange={(e) => setType(e.target.value as TxType)} disabled={lockedType}>
                {TYPES.filter((t) => !editing || editing.type === 'advance_received' || t !== 'advance_received').map((t) => (
                  <option key={t} value={t}>
                    {TX_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Importe" htmlFor="tx-amount">
              <MoneyInput id="tx-amount" value={amount} onValueChange={setAmount} placeholder="0.00" required />
            </Field>
            <Field label="Fecha" htmlFor="tx-date">
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label={type === 'transfer' || type === 'contribution' ? 'Desde la cuenta' : 'Cuenta'} htmlFor="tx-account">
              <NativeSelect id="tx-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {(type === 'transfer' || type === 'contribution') && (
              <Field label="Hacia la cuenta" htmlFor="tx-to">
                <NativeSelect id="tx-to" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                  <option value="">Elegir…</option>
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            )}
            {usesEnvelope && (
              <Field
                label="Sale del sobre"
                htmlFor="tx-env"
                hint={env ? `Saldo del sobre: ${formatMoney(f.balances.get(env.id) ?? 0)}` : type === 'contribution' ? 'Para inversiones, elige el sobre Inversiones.' : 'Sin sobre: se descuenta del saldo disponible.'}
              >
                <NativeSelect id="tx-env" value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)}>
                  <option value="">{needsDebt ? 'Pagos pendientes (predeterminado)' : 'Ninguno (saldo disponible)'}</option>
                  {envelopes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {usesCategory && (
              <Field label="Categoría" htmlFor="tx-cat">
                <NativeSelect id="tx-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {needsDebt && (
              <Field label={type === 'advance_repaid' ? 'Adelanto que devuelves' : 'Deuda que pagas'} htmlFor="tx-debt" hint={debts.length === 0 ? 'No hay deudas abiertas de este tipo. Créalas en Deudas y adelantos.' : undefined}>
                <NativeSelect id="tx-debt" value={debtId} onChange={(e) => setDebtId(e.target.value)} required>
                  <option value="">Elegir…</option>
                  {debts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · pendiente {formatMoney(f.debtBalances.get(d.id) ?? 0)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {type === 'advance_received' && (
              <>
                <Field label="¿Quién te lo adelantó?" htmlFor="tx-adv-name">
                  <Input id="tx-adv-name" value={advanceName} onChange={(e) => setAdvanceName(e.target.value)} placeholder="Ej.: adelanto de la app" />
                </Field>
                <Field label="Devolución semanal pactada" htmlFor="tx-adv-weekly" hint="0 = devolver todo de una vez">
                  <MoneyInput id="tx-adv-weekly" value={advanceWeekly} onValueChange={setAdvanceWeekly} placeholder="0.00" />
                </Field>
                <Field label="Fecha límite (opcional)" htmlFor="tx-adv-due">
                  <Input id="tx-adv-due" type="date" value={advanceDue} onChange={(e) => setAdvanceDue(e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Descripción" htmlFor="tx-desc" className="sm:col-span-2">
              <Input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" maxLength={140} />
            </Field>
          </div>

          {type === 'expense' && env?.method === 'bill' && !editing && (
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm">
              <span>
                <span className="font-medium">Es el pago de la factura</span>
                <span className="block text-xs text-muted-foreground">Avanza la fecha de vencimiento del sobre «{env.name}».</span>
              </span>
              <Switch checked={isBillPayment} onCheckedChange={setIsBillPayment} />
            </label>
          )}
          {(type === 'expense' || type === 'fee') && (
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm">
              <span>
                <span className="font-medium">Gasto profesional</span>
                <span className="block text-xs text-muted-foreground">Se guarda aparte en Trabajo y millas.</span>
              </span>
              <Switch checked={isBusiness} onCheckedChange={setIsBusiness} />
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || toCents(amount) <= 0}>
              {saving && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
