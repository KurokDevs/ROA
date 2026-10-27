import { RoaDB } from './database';

export const db = new RoaDB();
export { RoaDB, ensureSeeded, ALL_TABLES } from './database';
