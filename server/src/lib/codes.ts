import crypto from 'node:crypto';
import { db } from '../db';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion when read aloud
const TABLES = new Set(['appointments', 'prescriptions', 'medicine_requests', 'emergencies']);

export function randomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

/** Generates a unique human-friendly reference such as "APT-7K3Q9M". */
export function generateCode(prefix: 'APT' | 'RX' | 'MR' | 'EMG', table: string, length = 6): string {
  if (!TABLES.has(table)) throw new Error(`generateCode: unsupported table ${table}`);
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE code = ?`);
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = `${prefix}-${randomCode(length)}`;
    if (!exists.get(code)) return code;
  }
  throw new Error('Could not generate a unique reference code');
}
