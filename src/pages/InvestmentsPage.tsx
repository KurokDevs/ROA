import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { Info, LineChart, Plus, Trash2 } from 'lucide-react';
import { db } from '@/db';
import { useFinance } from '@/hooks/useFinance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Field } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { TransactionDialog } from '@/components/forms/TransactionDialog';
import { sumCents, toCents } from '@/lib/money';
import { formatDateShort } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { holdingSummary } from '@/engine/investments';
import { saveHolding, saveTrade } from '@/services/crudService';
import type { Holding, Horizon, TradeType } from '@/models/types';

const TRADE_LABEL: Record<TradeType, string> = { buy: 'Compra', sell: 'Venta', valuation: 'Valoración' };

export function InvestmentsPage() {
  const f = useFinance();
  const [holdingForm, setHoldingForm] = useState(false);
  const [tradeFor, setTradeFor] = useState<Holding | null>(null);
  const [contrib, setContrib] = useState(false);

  const rows = useMemo(
    () => f.holdings.filter((h) => !h.archived).map((h) => ({ h, s: holdingSummary(f.trades.filter((t) => t.holdingId === h.id)), trades: f.trades.filter((t) => t.holdingId === h.id).sort((a, b) => b.date.localeCompare(a.date)) })),
    [f.holdings, f.trades]
  );
  const value = sumCents(rows.map((r) => r.s.marketValue));
  const cost = sumCents(rows.map((r) => r.s.costBasis));
  const realized = sumCents(rows.map((r) => r.s.realizedPL));
  const contributions = sumCents(f.transactions.filter((t) => t.type === 'contribution' && f.accounts.find((a) => a.id === t.toAccountId)?.type === 'investment').map((t) => t.amount));
  const toInvest = f.balances.get('env_invest') ?? 0;
  const brokerCash = sumCents(f.accounts.filter((a) => a.type === 'investment').map((a) => f.accountBalances.get(a.id) ?? 0));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inversiones"
        subtitle="Seguimiento manual: ROA no ejecuta operaciones reales"
        action={
          <Button onClick={() => setHoldingForm(true)}>
            <Plus /> <span className="hidden sm:inline">Activo</span>
          </Button>
        }
      />

      <div className="flex gap-2 rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Los valores son los que tú registras. No hay promesas de rendimiento: las inversiones pueden perder valor. El dinero que necesitarás en los próximos 1–2 años (facturas, emergencias, el carro)
          debe quedarse en sobres de ahorro, no en bolsa.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Valor registrado</div>
          <Money cents={value} className="text-xl font-semibold" />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Capital aportado (coste)</div>
          <Money cents={cost} className="text-xl font-semibold" />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Rendimiento no realizado</div>
          <Money cents={value - cost} colored sign className="text-xl font-semibold" />
          {cost > 0 && <div className={cn('text-xs', value - cost < 0 ? 'text-destructive' : 'text-success')}>{new Decimal(value - cost).dividedBy(cost).times(100).toFixed(2)}%</div>}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Ganancia/pérdida realizada</div>
          <Money cents={realized} colored sign className="text-xl font-semibold" />
        </Card>
      </div>

      <Card className="grid grid-cols-3 gap-3 p-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Sobre «Inversiones»</div>
          <Money cents={toInvest} className="font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Aportado al bróker</div>
          <Money cents={contributions} className="font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Efectivo sin invertir</div>
          <Money cents={brokerCash} className="font-semibold" />
        </div>
        <Button variant="outline" size="sm" className="col-span-3" onClick={() => setContrib(true)}>
          Registrar aportación al bróker
        </Button>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Sin activos registrados"
          description="Añade VOO, VTI, Nvidia u otro activo y registra tus compras y valoraciones."
          action={<Button onClick={() => setHoldingForm(true)}>Añadir activo</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ h, s, trades }) => (
            <Card key={h.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{h.symbol}</span>
                    <Badge variant={h.horizon === 'long' ? 'success' : 'warning'}>{h.horizon === 'long' ? 'Largo plazo' : 'Corto plazo'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.name} · {new Decimal(s.shares).toDecimalPlaces(6).toString()} acciones
                    {s.lastPrice && ` · último precio $${new Decimal(s.lastPrice).toFixed(2)} (${formatDateShort(s.lastPriceDate!)})`}
                  </div>
                </div>
                <div className="text-right">
                  <Money cents={s.marketValue} className="text-lg font-semibold" />
                  <div className="text-xs">
                    <Money cents={s.unrealizedPL} colored sign />
                    {s.returnRate !== null && <span className={cn('ml-1', s.returnRate < 0 ? 'text-destructive' : 'text-success')}>({(s.returnRate * 100).toFixed(2)}%)</span>}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Coste <Money cents={s.costBasis} /> · invertido total <Money cents={s.totalInvested} />
              </div>
              {trades.length > 0 && (
                <ul className="mt-3 divide-y rounded-xl border text-sm">
                  {trades.slice(0, 6).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-14 text-xs text-muted-foreground">{formatDateShort(t.date)}</span>
                      <span className="flex-1">
                        {TRADE_LABEL[t.type]} {t.type !== 'valuation' && `${t.shares} × `}${new Decimal(t.price).toFixed(2)}
                      </span>
                      <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => db.trades.delete(t.id)} aria-label="Eliminar">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => db.holdings.update(h.id, { archived: true })}>
                  Archivar
                </Button>
                <Button size="sm" onClick={() => setTradeFor(h)}>
                  <Plus /> Operación / valoración
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <HoldingForm open={holdingForm} onOpenChange={setHoldingForm} />
      <TradeForm holding={tradeFor} onClose={() => setTradeFor(null)} />
      <TransactionDialog
        open={contrib}
        onOpenChange={setContrib}
        title="Aportación al bróker"
        initial={{ type: 'contribution', toAccountId: f.accounts.find((a) => a.type === 'investment')?.id, envelopeId: 'env_invest', category: 'Inversión' }}
      />
    </div>
  );
}

function HoldingForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const f = useFinance();
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('long');
  const brokers = f.accounts.filter((a) => a.type === 'investment');
  const [accountId, setAccountId] = useState('');
  useEffect(() => {
    if (open) {
      setSymbol('');
      setName('');
      setHorizon('long');
      setAccountId(brokers[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const presets = [
    { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF' },
    { symbol: 'NVDA', name: 'Nvidia' }
  ];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveHolding(db, { symbol, name: name || symbol, horizon, accountId: accountId || 'acc_broker' });
      toast.success(`${symbol.toUpperCase()} añadido`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo activo</DialogTitle>
          <DialogDescription>Solo para seguimiento. ROA no se conecta a ningún bróker.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.symbol} type="button" className="rounded-full border px-3 py-1 text-xs font-medium hover:border-primary/50" onClick={() => (setSymbol(p.symbol), setName(p.name))}>
              {p.symbol}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Símbolo" htmlFor="h-symbol">
            <Input id="h-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} required maxLength={10} autoCapitalize="characters" />
          </Field>
          <Field label="Nombre" htmlFor="h-name">
            <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Horizonte" htmlFor="h-horizon" hint="Corto plazo = lo podrías necesitar en 1–2 años (no recomendado en bolsa).">
            <NativeSelect id="h-horizon" value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
              <option value="long">Largo plazo (5+ años)</option>
              <option value="short">Corto plazo</option>
            </NativeSelect>
          </Field>
          <Field label="Cuenta de inversión" htmlFor="h-acc">
            <NativeSelect id="h-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {brokers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Añadir</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TradeForm({ holding, onClose }: { holding: Holding | null; onClose: () => void }) {
  const f = useFinance();
  const [type, setType] = useState<TradeType>('buy');
  const [date, setDate] = useState(f.today);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');
  useEffect(() => {
    if (holding) {
      setType('buy');
      setDate(f.today);
      setShares('');
      setPrice('');
      setFees('');
    }
  }, [holding, f.today]);
  const total = (() => {
    try {
      return new Decimal(shares || 0).times(price || 0).toFixed(2);
    } catch {
      return '0.00';
    }
  })();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holding) return;
    try {
      await saveTrade(db, { holdingId: holding.id, date, type, shares: type === 'valuation' ? '0' : shares, price, fees: toCents(fees), note: '' });
      toast.success(`${TRADE_LABEL[type]} registrada`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };
  const dec = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '');
  return (
    <Dialog open={!!holding} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{holding?.symbol}: nueva operación</DialogTitle>
          <DialogDescription>Una valoración solo actualiza el precio actual (no mueve dinero).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="t-type">
            <NativeSelect id="t-type" value={type} onChange={(e) => setType(e.target.value as TradeType)}>
              {Object.entries(TRADE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fecha" htmlFor="t-date">
            <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {type !== 'valuation' && (
            <Field label="Acciones" htmlFor="t-shares" hint="Admite fracciones (0.25)">
              <Input id="t-shares" inputMode="decimal" value={shares} onChange={(e) => setShares(dec(e.target.value))} required />
            </Field>
          )}
          <Field label="Precio por acción ($)" htmlFor="t-price">
            <Input id="t-price" inputMode="decimal" value={price} onChange={(e) => setPrice(dec(e.target.value))} required />
          </Field>
          {type !== 'valuation' && (
            <>
              <Field label="Comisiones" htmlFor="t-fees">
                <MoneyInput id="t-fees" value={fees} onValueChange={setFees} placeholder="0.00" />
              </Field>
              <div className="flex items-end text-sm text-muted-foreground">Total: ${total}</div>
            </>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
