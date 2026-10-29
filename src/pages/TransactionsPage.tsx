import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Download,
  HandCoins,
  Inbox,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Trash2,
  type LucideIcon
} from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { Money } from '@/components/common/Money';
import { TransactionDialog } from '@/components/forms/TransactionDialog';
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
import { addDays, addMonths, formatDateLong, formatMonth, formatWeekRange, monthKey, weekStart } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import { flowTotals } from '@/engine/ledger';
import { CATEGORIES, TX_TYPE_LABELS, type Transaction, type TxType } from '@/models/types';
import { deleteTransaction } from '@/services/transactionService';
import { downloadFile, transactionsToCSV } from '@/services/backupService';

type Period = 'week' | 'month' | 'all';

const TYPE_ICON: Record<TxType, LucideIcon> = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowLeftRight,
  debt_payment: HandCoins,
  advance_received: HandCoins,
  advance_repaid: HandCoins,
  fee: Receipt,
  contribution: PiggyBank
};

/** Signo visual desde el punto de vista del patrimonio: transferencias = neutras. */
function signOf(t: Transaction): 1 | -1 | 0 {
  if (t.type === 'income' || t.type === 'advance_received') return 1;
  if (t.type === 'transfer' || t.type === 'contribution') return 0;
  return -1;
}

export function TransactionsPage() {
  const f = useFinance();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(f.today);
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<TxType | ''>('');
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Transaction }>({ open: false });
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  const range = useMemo(() => {
    if (period === 'week') {
      const start = weekStart(anchor);
      return { from: start, to: addDays(start, 6), label: formatWeekRange(start) };
    }
    if (period === 'month') {
      const m = monthKey(anchor);
      return { from: `${m}-01`, to: addDays(addMonths(`${m}-01`, 1), -1), label: formatMonth(m) };
    }
    return { from: '0000-01-01', to: '9999-12-31', label: 'Todo el historial' };
  }, [period, anchor]);

  const filtered = useMemo(
    () =>
      f.transactions
        .filter((t) => t.date >= range.from && t.date <= range.to)
        .filter((t) => !category || t.category === category)
        .filter((t) => !accountId || t.accountId === accountId || t.toAccountId === accountId)
        .filter((t) => !type || t.type === type)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [f.transactions, range, category, accountId, type]
  );
  const totals = flowTotals(filtered);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [filtered]);

  const shift = (dir: 1 | -1) => setAnchor((a) => (period === 'week' ? addDays(a, dir * 7) : addMonths(a, dir)));
  const accName = (id: string | null) => f.accounts.find((a) => a.id === id)?.name ?? '';
  const envName = (id: string | null) => f.envelopes.find((e) => e.id === id)?.name;

  const exportCsv = () => {
    const csv = transactionsToCSV(filtered, f.accounts, f.envelopes);
    downloadFile(`roa-movimientos-${f.today}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    toast.success(`Exportados ${filtered.length} movimientos`);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteTransaction(db, toDelete.id);
      toast.success('Movimiento eliminado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movimientos"
        subtitle="Ingresos, gastos, transferencias, deudas y adelantos"
        action={
          <Button onClick={() => setDialog({ open: true })}>
            <Plus /> <span className="hidden sm:inline">Nuevo</span>
          </Button>
        }
      />

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-[3px]">
            {(['week', 'month', 'all'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn('rounded-md px-3 py-1 text-sm font-medium transition', period === p ? 'bg-background shadow-sm dark:bg-input/30' : 'text-muted-foreground')}
              >
                {p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Todo'}
              </button>
            ))}
          </div>
          {period !== 'all' && (
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Anterior">
                <ChevronLeft />
              </Button>
              <span className="min-w-28 text-center text-sm font-medium first-letter:uppercase">{range.label}</span>
              <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Siguiente">
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría" className="h-10 text-sm">
            <option value="">Categorías</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
          <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta" className="h-10 text-sm">
            <option value="">Cuentas</option>
            {f.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={type} onChange={(e) => setType(e.target.value as TxType | '')} aria-label="Tipo" className="h-10 text-sm">
            <option value="">Tipos</option>
            {(Object.keys(TX_TYPE_LABELS) as TxType[]).map((t) => (
              <option key={t} value={t}>
                {TX_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ingresos</div>
          <Money cents={totals.income} className="font-semibold text-success" />
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Gastos</div>
          <Money cents={totals.expenses} className="font-semibold" />
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Neto</div>
          <Money cents={totals.income - totals.expenses} colored className="font-semibold" />
        </Card>
      </div>
      <p className="-mt-2 px-1 text-xs text-muted-foreground">
        Las transferencias internas ({<Money cents={totals.transfers + totals.contributions} />}), adelantos y pagos de deudas no se cuentan como ingreso ni gasto.
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Sin movimientos en este periodo"
          description="Registra un gasto, una transferencia o un adelanto. Tu cobro semanal se registra automáticamente al confirmar Mi Semana."
          action={
            <Button onClick={() => setDialog({ open: true })}>
              <Plus /> Registrar movimiento
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Patrón del bloque transaction-history-01 de Creative Tim UI */}
          <Card className="p-4 sm:p-6">
            <div>
              <h2 className="font-semibold">Historial de movimientos</h2>
              <p className="text-sm text-muted-foreground">Sigue y controla tu actividad financiera.</p>
            </div>
            <div className="mt-6">
              {groups.map(([date, txs]) => (
                <div key={date} className="mb-6 last:mb-0">
                  <p className="mb-2 ml-2.5 font-semibold text-muted-foreground first-letter:uppercase">{formatDateLong(date)}</p>
                  <div className="space-y-2">
                    {txs.map((t) => {
                      const Icon = t.isBusiness ? Briefcase : TYPE_ICON[t.type];
                      const sign = signOf(t);
                      return (
                        <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3 sm:gap-4 sm:p-4">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-card-foreground shadow-sm sm:size-12">
                            <Icon className={cn('size-5', sign > 0 ? 'text-green-600 dark:text-green-500' : sign < 0 ? 'text-red-600 dark:text-red-500' : 'text-foreground')} />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5 sm:mx-2">
                            <p className="truncate font-semibold">{t.description || t.category || TX_TYPE_LABELS[t.type]}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {TX_TYPE_LABELS[t.type]} · {accName(t.accountId)}
                              {t.toAccountId && ` → ${accName(t.toAccountId)}`}
                              {envName(t.envelopeId) && ` · sobre ${envName(t.envelopeId)}`}
                              {t.budgetId && ' · presupuesto semanal'}
                            </p>
                          </div>
                          <p
                            className={cn(
                              'tabular ml-auto whitespace-nowrap text-sm font-semibold',
                              sign > 0 ? 'text-green-600 dark:text-green-500' : sign < 0 ? 'text-red-600 dark:text-red-500' : 'text-muted-foreground'
                            )}
                          >
                            {sign > 0 ? '+ ' : sign < 0 ? '- ' : ''}
                            {formatMoney(t.amount)}
                          </p>
                          {!t.budgetId && (
                            <div className="flex">
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => setDialog({ open: true, editing: t })} aria-label="Editar">
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setToDelete(t)} aria-label="Eliminar">
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Button variant="outline" className="w-full" onClick={exportCsv}>
            <Download /> Exportar CSV ({filtered.length})
          </Button>
        </div>
      )}

      <TransactionDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} editing={dialog.editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>Se recalcularán los saldos de cuentas y sobres. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
