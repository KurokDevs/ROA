import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { Briefcase, Info, Plus, Route, Trash2 } from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { saveMileage } from '@/services/crudService';

export function WorkPage() {
  const f = useFinance();
  const settings = f.settings;
  const years = useMemo(() => {
    const set = new Set([f.today.slice(0, 4), ...f.transactions.map((t) => t.date.slice(0, 4)), ...f.mileage.map((m) => m.date.slice(0, 4))]);
    return [...set].sort().reverse();
  }, [f]);
  const [year, setYear] = useState(f.today.slice(0, 4));
  const [bizTx, setBizTx] = useState(false);
  const [mDate, setMDate] = useState(f.today);
  const [mMiles, setMMiles] = useState('');
  const [mPurpose, setMPurpose] = useState('Entregas');

  if (!settings) return null;
  const inYear = (d: string) => d.startsWith(year);
  const business = f.transactions.filter((t) => t.isBusiness && inYear(t.date)).sort((a, b) => b.date.localeCompare(a.date));
  const businessTotal = sumCents(business.map((t) => t.amount));
  const miles = f.mileage.filter((m) => inYear(m.date)).sort((a, b) => b.date.localeCompare(a.date));
  const milesTotal = miles.reduce((s, m) => s.plus(m.miles), new Decimal(0));

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
      <PageHeader title="Trabajo y millas" subtitle="Millas recorridas y gastos de tu trabajo de delivery" action={
        <NativeSelect value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año" className="h-10 w-28">
          {years.map((y) => <option key={y}>{y}</option>)}
        </NativeSelect>
      } />

      <div className="flex gap-2 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>Registra las millas de cada jornada y los gastos del trabajo (bolsa térmica, soporte del teléfono, peajes…). Se guardan aparte para que tengas el historial cuando lo necesites.</p>
      </div>

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
            <EmptyState icon={Route} title="Sin millas registradas" description="Anota las millas de cada jornada de delivery. Así tendrás el total de millas de trabajo de cada año." />
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

      <TransactionDialog open={bizTx} onOpenChange={setBizTx} title="Gasto profesional" initial={{ type: 'expense', category: 'Trabajo delivery', isBusiness: true }} />
    </div>
  );
}
