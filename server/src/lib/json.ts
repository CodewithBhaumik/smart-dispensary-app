export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export const toJson = (value: unknown): string => JSON.stringify(value ?? null);

/** SQLite stores booleans as 0/1. */
export const bool = (v: unknown): boolean => v === 1 || v === true || v === '1';
