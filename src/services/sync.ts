/**
 * Punto de extensión para sincronización futura (p. ej. Supabase).
 *
 * La versión 1 es 100 % local: los datos viven en IndexedDB de este dispositivo
 * y NO se sincronizan automáticamente. Para añadir sincronización bastará con
 * implementar este contrato y registrarlo en el arranque de la app, sin tocar
 * el motor de cálculo ni las pantallas.
 */
import type { Backup } from './backupService';

export interface SyncAdapter {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  /** Sube una instantánea completa (estrategia simple "último en escribir gana"). */
  push(snapshot: Backup): Promise<void>;
  /** Descarga la instantánea más reciente, si existe. */
  pull(): Promise<Backup | null>;
}

export const localOnlyAdapter: SyncAdapter = {
  name: 'local',
  isAvailable: async () => false,
  push: async () => undefined,
  pull: async () => null
};
