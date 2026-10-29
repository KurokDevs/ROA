import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { RoaDB } from '@/db/database';
import { envelopeBalances } from '@/engine/ledger';

describe('migración v2: se elimina la reserva de impuestos', () => {
  it('quita el sobre de impuestos y devuelve ese dinero al saldo libre', async () => {
    const name = `roa-mig-${Math.random().toString(36).slice(2)}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      settings: 'id', accounts: 'id, type', envelopes: 'id, tier, system', entries: 'id, envelopeId, date, budgetId, moveId',
      transactions: 'id, date, type, accountId, envelopeId, debtId, budgetId, category', budgets: 'id, &weekKey, payDate',
      debts: 'id, kind', goals: 'id', subscriptions: 'id, status', mileage: 'id, date', holdings: 'id', trades: 'id, holdingId, date'
    });
    await v1.open();
    await v1.table('settings').put({ id: 'main', taxMode: '1099', taxRate: '0.25', paydayWeekday: 5 });
    await v1.table('envelopes').bulkPut([{ id: 'env_tax', tier: 'tax' }, { id: 'env_rent', tier: 'essential' }]);
    await v1.table('entries').bulkPut([
      { id: 'e1', envelopeId: 'env_tax', amount: 20000, budgetId: 'b1', date: '2026-10-23' },
      { id: 'e2', envelopeId: 'env_rent', amount: 10000, budgetId: 'b1', date: '2026-10-23' }
    ]);
    await v1.table('budgets').put({
      id: 'b1', weekKey: '2026-10-19', payDate: '2026-10-23', income: 80000, unassigned: 50000, taxMode: '1099', taxRate: '0.25',
      lines: [{ key: 'env_tax', envelopeId: 'env_tax', amount: 20000 }, { key: 'env_rent', envelopeId: 'env_rent', amount: 10000 }]
    });
    v1.close();

    const db = new RoaDB(name);
    await db.open();
    expect(await db.envelopes.get('env_tax')).toBeUndefined();
    const b = (await db.budgets.get('b1'))!;
    expect(b.lines.map((l) => l.key)).toEqual(['env_rent']);
    expect(b.unassigned).toBe(70000);
    expect('taxMode' in b).toBe(false);
    expect('taxRate' in (await db.settings.get('main'))!).toBe(false);
    const bal = envelopeBalances(await db.entries.toArray(), []);
    expect(bal.get('env_tax')).toBeUndefined();
    expect(bal.get('env_rent')).toBe(10000);
    // v3 añade el sobre de peajes a quien ya tenía datos
    expect((await db.envelopes.get('env_tolls'))?.weeklyAmount).toBe(1500);
    db.close();
  });
});
