import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { Briefcase, Info, Landmark, Plus, Route, Trash2 } from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { Field } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { TransactionDialog } from '@/components/forms/TransactionDialog';
import { sumCents } from '@/lib/money';
import { formatDateShort } from '@/lib/dates';
import { updateSettings, saveMileage } from '@/services/crudService';
import type { TaxMode } from '@/models/types';

export function TaxesPage() {
  const f = useFinance();
  const settings = f.settings;
  const years = useMemo(() => {
    const set = new Set([f.today.slice(0, 4), ...f.transactions.map((t) => t.date.slice(0, 4)), ...f.mileage.map((m) => m.date.slice(0, 4))]);
    return [...set].sort().reverse();
  }, [f]);
  const [year, setYear] = useState(f.today.slice(0, 4));
  const [taxTx, setTaxTx] = useState(false);
  const [bizTx, setBizTx] = useState(false);
  const [rate, setRate] = useState(settings ? new Decimal(settings.taxRate).times(100).toString() : '25');
  const [mDate, setMDate] = useState(f.today);
  const [mMiles, setMMiles] = useState('');
  const [mPurpose, setMPurpose] = useState('Entregas');

  if (!settings) return null;
  const inYear = (d: string) => d.startsWith(year);
  const taxBalance = f.balances.get('env_tax') ?? 0;
  const reservedYear = sumCents(f.entries.filter((e) => e.envelopeId === 'env_tax' && inYear(e.date) && e.amount > 0).map((e) => e.amount));
  const paidYear = sumCents(f.transactions.filter((t) => t.envelopeId === 'env_tax' && inYear(t.date) && t.type === 'expense').map((t) => t.amount));
  const incomeYear = sumCents(f.transactions.filter((t) => t.type === 'income' && inYear(t.date)).map((t) => t.amount));
  const yearBudgets = f.budgets.filter((b) => inYear(b.payDate));
  const grossYear = sumCents(yearBudgets.map((b) => b.grossIncome ?? 0));
  const withheldYear = sumCents(yearBudgets.map((b) => b.withholdings ?? 0));
  const business = f.transactions.filter((t) => t.isBusiness && inYear(t.date)).sort((a, b) => b.date.localeCompare(a.date));
  const businessTotal = sumCents(business.map((t) => t.amount));
  const miles = f.mileage.filter((m) => inYear(m.date)).sort((a, b) => b.date.localeCompare(a.date));
  const milesTotal = miles.reduce((s, m) => s.plus(m.miles), new Decimal(0));

  const setMode = async (mode: TaxMode) => {
    await updateSettings(db, { taxMode: mode });
    toast.success(mode === '1099' ? 'Modo contratista 1099' : 'Modo empleado W-2');
  };
  const saveRate = async () => {
    try {
      const r = new Decimal(rate || 0).dividedBy(100).toString();
      await updateSettings(db, { taxRate: r });
      toast.success(`Reserva fiscal provisional: ${rate}%`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Valor no válido');
    }
  };
  const addMiles = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMileage(db, { date: mDate, miles: mMiles, purpose: mPurpose, notes: '' });
      toast.success(`${mMiles} millas registradas`);
      setMMiles('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Impuestos y millas" subtitle="Reserva fiscal provisional y registros para tu futura declaración" action={
        <NativeSelect value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año" className="h-10 w-28">
          {years.map((y) => <option key={y}>{y}</option>)}
        </NativeSelect>
      } />

      <div className="flex gap-2 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="text-muted-foreground">
          ROA <strong className="text-foreground">no calcula impuestos definitivos ni deducciones</strong>. La reserva es una estimación provisional para que no te falte dinero. Las reglas dependen de tu
          situación: confirma con un profesional o con las guías oficiales del IRS y de tu estado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tipo de trabajo</CardTitle>
          <CardDescription>Define si el organizador aparta impuestos de cada cobro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['1099', 'w2'] as TaxMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-2xl border p-4 text-left transition ${settings.taxMode === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent/40'}`}
              >
                <div className="font-semibold">{m === '1099' ? 'Contratista 1099' : 'Empleado W-2'}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{m === '1099' ? 'Nadie retiene impuestos: ROA aparta una reserva.' : 'Tu empleador retiene: introduces el neto.'}</div>
              </button>
            ))}
          </div>
          {settings.taxMode === '1099' && (
            <div className="flex items-end gap-2">
              <Field label="Reserva provisional (%)" htmlFor="tax-rate" hint="Estimación inicial editable (25 % por defecto). No es el impuesto definitivo." className="flex-1">
                <Input id="tax-rate" type="number" inputMode="decimal" min={0} max={60} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
              <Button onClick={saveRate} variant="secondary">
                Guardar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{settings.taxMode === '1099' ? 'Reserva pendiente (sobre)' : 'Sobre de impuestos'}</div>
          <Money cents={taxBalance} className="text-xl font-semibold" />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Apartado en {year}</div>
          <Money cents={reservedYear} className="text-xl font-semibold" />
          <div className="text-xs text-muted-foreground">
            Pagado <Money cents={paidYear} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Ingresos registrados {year}</div>
          <Money cents={incomeYear} className="text-xl font-semibold" />
          {settings.taxMode === 'w2' && (
            <div className="text-xs text-muted-foreground">
              Bruto <Money cents={grossYear} /> · retenido <Money cents={withheldYear} />
            </div>
          )}
        </Card>
      </div>
      <Button variant="outline" onClick={() => setTaxTx(true)}>
        <Landmark /> Registrar pago de impuestos
      </Button>

      <Tabs defaultValue="miles">
        <TabsList>
          <TabsTrigger value="miles">Millas de trabajo</TabsTrigger>
          <TabsTrigger value="biz">Gastos profesionales</TabsTrigger>
        </TabsList>
        <TabsContent value="miles" className="space-y-3">
          <Card className="p-4">
            <form onSubmit={addMiles} className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
              <Field label="Fecha" htmlFor="m-date">
                <Input id="m-date" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
              </Field>
              <Field label="Millas" htmlFor="m-miles">
                <Input id="m-miles" inputMode="decimal" value={mMiles} onChange={(e) => setMMiles(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} placeholder="0.0" />
              </Field>
              <Field label="Motivo" htmlFor="m-purpose">
                <Input id="m-purpose" value={mPurpose} onChange={(e) => setMPurpose(e.target.value)} />
              </Field>
              <Button type="submit" disabled={!mMiles}>
                <Plus /> Añadir
              </Button>
            </form>
          </Card>
          <Card className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Total {year}</span>
            <span className="tabular text-lg font-semibold">{milesTotal.toFixed(1)} mi</span>
          </Card>
          {miles.length === 0 ? (
            <EmptyState icon={Route} title="Sin millas registradas" description="Anota las millas de cada jornada de delivery. Se guardan aparte para una posible declaración; ROA no calcula la deducción." />
          ) : (
            <Card className="divide-y">
              {miles.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="w-16 text-xs text-muted-foreground">{formatDateShort(m.date)}</span>
                  <span className="flex-1">{m.purpose}</span>
                  <span className="tabular font-medium">{new Decimal(m.miles).toFixed(1)} mi</span>
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => db.mileage.delete(m.id)} aria-label="Eliminar">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </TabsContent>
        <TabsContent value="biz" className="space-y-3">
          <Card className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Gastos marcados como profesionales en {year}</span>
            <Money cents={businessTotal} className="text-lg font-semibold" />
          </Card>
          <Button variant="outline" onClick={() => setBizTx(true)}>
            <Briefcase /> Registrar gasto profesional
          </Button>
          {business.length === 0 ? (
            <EmptyState icon={Briefcase} title="Sin gastos profesionales" description="Marca como «gasto profesional» los gastos del trabajo (bolsa térmica, soporte de teléfono, peajes…)." />
          ) : (
            <Card className="divide-y">
              {business.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="w-16 text-xs text-muted-foreground">{formatDateShort(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{t.description || t.category}</span>
                  <Money cents={t.amount} className="font-medium" />
                </div>
              ))}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <TransactionDialog open={taxTx} onOpenChange={setTaxTx} title="Pago de impuestos" initial={{ type: 'expense', envelopeId: 'env_tax', category: 'Impuestos', description: 'Pago estimado de impuestos' }} />
      <TransactionDialog open={bizTx} onOpenChange={setBizTx} title="Gasto profesional" initial={{ type: 'expense', category: 'Trabajo delivery', isBusiness: true }} />
    </div>
  );
}
