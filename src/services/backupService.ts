import type { RoaDB } from '@/db/database';
import { ALL_TABLES, type TableName } from '@/db/database';
import { centsToInput } from '@/lib/money';
import type { Account, Envelope, Transaction } from '@/models/types';
import { TX_TYPE_LABELS } from '@/models/types';
import { AppError } from './errors';

export const BACKUP_APP = 'roa-finance';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export async function exportBackup(db: RoaDB): Promise<Backup> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction('r', db.tables, async () => {
    for (const name of ALL_TABLES) data[name] = await db.table(name).toArray();
  });
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export function parseBackup(raw: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('El archivo no es un JSON válido.');
  }
  const b = parsed as Partial<Backup>;
  if (!b || b.app !== BACKUP_APP || typeof b.version !== 'number' || typeof b.data !== 'object' || b.data === null) {
    throw new AppError('El archivo no es una copia de seguridad de ROA Finance.');
  }
  if (b.version > BACKUP_VERSION) throw new AppError('La copia es de una versión más reciente de la app.');
  for (const name of ALL_TABLES) {
    const rows = (b.data as Record<string, unknown>)[name];
    if (rows !== undefined && !Array.isArray(rows)) throw new AppError(`Datos corruptos en "${name}".`);
    for (const r of (rows as unknown[]) ?? []) {
      if (!r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string') throw new AppError(`Registro inválido en "${name}".`);
    }
  }
  const settings = (b.data as Record<string, unknown[]>).settings;
  if (!settings || settings.length === 0) throw new AppError('La copia no contiene ajustes.');
  return b as Backup;
}

/** Reemplaza TODOS los datos locales por los de la copia (operación atómica). */
export async function importBackup(db: RoaDB, backup: Backup): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of ALL_TABLES) {
      const table = db.table(name);
      await table.clear();
      const rows = backup.data[name] ?? [];
      if (rows.length) await table.bulkAdd(rows);
    }
  });
}

export async function resetAllData(db: RoaDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
}

function csvCell(value: string): string {
  // Evita inyección de fórmulas en hojas de cálculo y escapa comillas.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function transactionsToCSV(txs: Transaction[], accounts: Account[], envelopes: Envelope[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const env = new Map(envelopes.map((e) => [e.id, e.name]));
  const header = ['Fecha', 'Tipo', 'Importe', 'Categoría', 'Cuenta', 'Cuenta destino', 'Sobre', 'Descripción', 'Gasto profesional'];
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((t) => [
      t.date,
      TX_TYPE_LABELS[t.type],
      centsToInput(t.amount),
      t.category,
      acc.get(t.accountId) ?? '',
      t.toAccountId ? acc.get(t.toAccountId) ?? '' : '',
      t.envelopeId ? env.get(t.envelopeId) ?? '' : '',
      t.description,
      t.isBusiness ? 'Sí' : 'No'
    ]);
  return [header, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(',')).join('\r\n');
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
