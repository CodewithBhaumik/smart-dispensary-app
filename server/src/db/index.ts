import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of the `server/` folder. */
export const SERVER_ROOT = path.resolve(here, '../..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SERVER_ROOT, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const configuredPath = process.env.DB_PATH ?? path.join(DATA_DIR, 'smart-dispensary.db');
const isMemory = configuredPath === ':memory:';
const dbFile = isMemory ? ':memory:' : path.resolve(configuredPath);

if (!isMemory) fs.mkdirSync(path.dirname(dbFile), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(dbFile);
if (!isMemory) db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/** Creates all tables / indexes (idempotent). */
export function initSchema(): void {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  db.exec(sql);
}

/** Runs `fn` inside a single SQLite transaction (rolled back if it throws). */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export function isDatabaseEmpty(): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c === 0;
}

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}
