import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { ChevronRight, Database, Download, FileSpreadsheet, Monitor, Moon, Plus, Share, Smartphone, SquarePlus, Sun, TriangleAlert, Upload } from 'lucide-react';
import { db, ensureSeeded } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { useTheme, type ThemePref } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Field } from '@/components/common/Field';
import { NAV_ITEMS } from '@/components/layout/nav';
import { centsToInput, toCents } from '@/lib/money';
import { WEEKDAY_NAMES } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { saveAccount, updateSettings } from '@/services/crudService';
import { downloadFile, exportBackup, importBackup, parseBackup, resetAllData, transactionsToCSV, type Backup } from '@/services/backupService';
import type { Account, AccountType } from '@/models/types';

const ACCOUNT_TYPES: Record<AccountType, string> = { checking: 'Corriente', savings: 'Ahorro', cash: 'Efectivo', investment: 'Inversión (bróker)', credit: 'Tarjeta de crédito' };

export function SettingsPage() {
  const f = useFinance();
  const { pref, setPref } = useTheme();
  const s = f.settings;
  const [form, setForm] = useState({ low: '', lowMax: '', high: '', threshold: '', savingsPct: '', investPct: '', vehicleMin: '' });
  const [accountForm, setAccountForm] = useState<{ open: boolean; account?: Account }>({ open: false });
  const [pendingImport, setPendingImport] = useState<Backup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!s) return;
    setForm({
      low: centsToInput(s.lowSeasonMin),
      lowMax: centsToInput(s.lowSeasonMax),
      high: centsToInput(s.highSeasonMax),
      threshold: centsToInput(s.highSeasonThreshold),
      savingsPct: new Decimal(s.surplusToSavingsRate).times(100).toString(),
      investPct: new Decimal(s.surplusToInvestRate).times(100).toString(),
      vehicleMin: centsToInput(s.vehicleMinBalance)
    });
  }, [s]);

  if (!s) return null;

  const saveFinance = async () => {
    try {
      await updateSettings(db, {
        lowSeasonMin: toCents(form.low),
        lowSeasonMax: toCents(form.lowMax),
        highSeasonMax: toCents(form.high),
        highSeasonThreshold: toCents(form.threshold),
        surplusToSavingsRate: new Decimal(form.savingsPct || 0).dividedBy(100).toString(),
        surplusToInvestRate: new Decimal(form.investPct || 0).dividedBy(100).toString(),
        vehicleMinBalance: toCents(form.vehicleMin)
      });
      toast.success('Ajustes guardados');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Valores no válidos');
    }
  };

  const doExport = async () => {
    const backup = await exportBackup(db);
    downloadFile(`roa-finance-copia-${f.today}.json`, JSON.stringify(backup, null, 2), 'application/json');
    toast.success('Copia de seguridad descargada', { description: 'Guárdala en Archivos, iCloud Drive o envíatela por correo.' });
  };
  const doCsv = () => {
    downloadFile(`roa-movimientos-${f.today}.csv`, '﻿' + transactionsToCSV(f.transactions, f.accounts, f.envelopes), 'text/csv;charset=utf-8');
    toast.success(`CSV con ${f.transactions.length} movimientos`);
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPendingImport(parseBackup(await file.text()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archivo no válido');
    }
  };
  const confirmImport = async () => {
    if (!pendingImport) return;
    try {
      await importBackup(db, pendingImport);
      toast.success('Copia restaurada', { description: `Datos del ${new Date(pendingImport.exportedAt).toLocaleString('es-US')}` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar');
    }
    setPendingImport(null);
  };
  const doReset = async () => {
    await resetAllData(db);
    await ensureSeeded(db);
    toast.success('Datos borrados. Se cargó la configuración inicial.');
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Ajustes" subtitle="Preferencias, cuentas y copias de seguridad" />

      {/* Más secciones (en móvil no caben en la barra inferior) */}
      <Card className="divide-y lg:hidden">
        {NAV_ITEMS.filter((i) => !i.primary).map((i) => (
          <Link key={i.to} to={i.to} className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition active:bg-accent">
            <i.icon className="size-[18px] text-primary" />
            <span className="flex-1">{i.label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apariencia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { v: 'light', label: 'Claro', icon: Sun },
                { v: 'dark', label: 'Oscuro', icon: Moon },
                { v: 'system', label: 'Sistema', icon: Monitor }
              ] as { v: ThemePref; label: string; icon: typeof Sun }[]
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setPref(o.v)}
                className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition', pref === o.v ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'hover:bg-accent/40')}
              >
                <o.icon className="size-5" /> {o.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingresos y organizador</CardTitle>
          <CardDescription>Los impuestos (1099/W-2 y %) se configuran en Impuestos y millas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Día de cobro" htmlFor="st-payday">
            <NativeSelect id="st-payday" value={s.paydayWeekday} onChange={(e) => updateSettings(db, { paydayWeekday: Number(e.target.value) }).then(() => toast.success('Día de cobro actualizado'))}>
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={d} value={i} className="capitalize">
                  {d}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Moneda" htmlFor="st-cur">
            <Input id="st-cur" value="USD — dólar estadounidense" disabled />
          </Field>
          <Field label="Temporada baja: desde" htmlFor="st-low">
            <MoneyInput id="st-low" value={form.low} onValueChange={(v) => setForm((x) => ({ ...x, low: v }))} />
          </Field>
          <Field label="Temporada baja: hasta" htmlFor="st-lowmax">
            <MoneyInput id="st-lowmax" value={form.lowMax} onValueChange={(v) => setForm((x) => ({ ...x, lowMax: v }))} />
          </Field>
          <Field label="Temporada alta: hasta" htmlFor="st-high">
            <MoneyInput id="st-high" value={form.high} onValueChange={(v) => setForm((x) => ({ ...x, high: v }))} />
          </Field>
          <Field label="Umbral de temporada alta" htmlFor="st-thr" hint="Semanas con este ingreso o más cuentan como temporada alta.">
            <MoneyInput id="st-thr" value={form.threshold} onValueChange={(v) => setForm((x) => ({ ...x, threshold: v }))} />
          </Field>
          <Field label="Excedente a ahorro en Estabilidad (%)" htmlFor="st-sav" hint="El resto queda libre.">
            <Input id="st-sav" type="number" inputMode="decimal" min={0} max={100} value={form.savingsPct} onChange={(e) => setForm((x) => ({ ...x, savingsPct: e.target.value }))} />
          </Field>
          <Field label="Excedente a inversión en Crecimiento (%)" htmlFor="st-inv">
            <Input id="st-inv" type="number" inputMode="decimal" min={0} max={100} value={form.investPct} onChange={(e) => setForm((x) => ({ ...x, investPct: e.target.value }))} />
          </Field>
          <Field label="Mínimo del fondo de mantenimiento" htmlFor="st-veh" hint="Aviso si el sobre de mantenimiento baja de aquí.">
            <MoneyInput id="st-veh" value={form.vehicleMin} onValueChange={(v) => setForm((x) => ({ ...x, vehicleMin: v }))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={saveFinance} className="w-full sm:w-auto">
              Guardar ajustes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Cuentas</CardTitle>
            <CardDescription>Indica el saldo inicial para que el saldo disponible sea exacto.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAccountForm({ open: true })}>
            <Plus /> Cuenta
          </Button>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <ul className="divide-y border-t">
            {f.accounts.map((a) => (
              <li key={a.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent/40 sm:px-5" onClick={() => setAccountForm({ open: true, account: a })}>
                  <span className="flex-1">
                    <span className={cn('font-medium', a.archived && 'line-through opacity-60')}>{a.name}</span>
                    <span className="block text-xs text-muted-foreground">{ACCOUNT_TYPES[a.type]}</span>
                  </span>
                  <Money cents={f.accountBalances.get(a.id) ?? 0} className="font-semibold" />
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-5 text-primary" /> Tus datos
          </CardTitle>
          <CardDescription>
            Todo se guarda en IndexedDB <strong>solo en este dispositivo y navegador</strong>. No se sincroniza automáticamente entre tu iPhone y tu PC. Para pasar datos de uno a otro, exporta una copia aquí e
            impórtala en el otro dispositivo. Si borras los datos de Safari o desinstalas la app, se pierden: exporta copias con frecuencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Button onClick={doExport}>
            <Download /> Exportar copia (JSON)
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Importar copia
          </Button>
          <Button variant="outline" onClick={doCsv}>
            <FileSpreadsheet /> Movimientos (CSV)
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" /> Instalar en iPhone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              1. Abre ROA Finance en <strong className="text-foreground">Safari</strong>.
            </li>
            <li className="flex flex-wrap items-center gap-1">
              2. Toca <Share className="inline size-4 text-foreground" /> <strong className="text-foreground">Compartir</strong>.
            </li>
            <li className="flex flex-wrap items-center gap-1">
              3. Elige <SquarePlus className="inline size-4 text-foreground" /> <strong className="text-foreground">Añadir a pantalla de inicio</strong> y confirma.
            </li>
            <li>4. Ábrela desde el icono: se abre a pantalla completa y funciona sin conexión.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">Nota: la app instalada tiene su propio almacenamiento, distinto del de la pestaña de Safari. Si ya registraste datos en Safari, expórtalos e impórtalos en la app instalada.</p>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-5" /> Zona de peligro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-destructive/40 text-destructive hover:text-destructive">
                Borrar todos los datos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Borrar todo?</AlertDialogTitle>
                <AlertDialogDescription>Se eliminarán presupuestos, movimientos, sobres, metas e inversiones de este dispositivo. Exporta una copia antes si la quieres conservar.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doReset}>
                  Borrar todo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <p className="pb-4 text-center text-xs text-muted-foreground">ROA Finance v1.0 · offline-first · sin cuentas ni servidores</p>

      <AccountForm open={accountForm.open} account={accountForm.account} onOpenChange={(o) => setAccountForm((x) => ({ ...x, open: o }))} />

      <AlertDialog open={!!pendingImport} onOpenChange={(o) => !o && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar esta copia?</AlertDialogTitle>
            <AlertDialogDescription>
              Copia del {pendingImport ? new Date(pendingImport.exportedAt).toLocaleString('es-US') : ''} con {pendingImport?.data.transactions?.length ?? 0} movimientos y {pendingImport?.data.budgets?.length ?? 0} semanas. Reemplazará
              todos los datos actuales de este dispositivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccountForm({ open, account, onOpenChange }: { open: boolean; account?: Account; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [opening, setOpening] = useState('');
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setType(account?.type ?? 'checking');
    setOpening(account ? centsToInput(account.openingBalance) : '');
    setArchived(account?.archived ?? false);
  }, [open, account]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const negative = type === 'credit' ? -Math.abs(toCents(opening)) : toCents(opening);
      await saveAccount(db, { id: account?.id, name, type, openingBalance: negative, archived });
      toast.success('Cuenta guardada');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
          <DialogDescription>El saldo inicial es lo que había en la cuenta antes de empezar a usar ROA.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Nombre" htmlFor="ac-name">
            <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Tipo" htmlFor="ac-type">
            <NativeSelect id="ac-type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {Object.entries(ACCOUNT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={type === 'credit' ? 'Deuda inicial de la tarjeta' : 'Saldo inicial'} htmlFor="ac-open">
            <MoneyInput id="ac-open" value={opening.replace('-', '')} onValueChange={setOpening} />
          </Field>
          {account && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archivar cuenta
            </label>
          )}
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
