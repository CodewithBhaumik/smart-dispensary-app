import { z } from 'zod';
import { AppError } from './errors';

/**
 * Parses `data` with a zod schema. On failure throws a 400 VALIDATION_ERROR whose
 * `fields` map contains the first message per field path (e.g. { "items.0.quantity": "..." }).
 */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = result.error.issues[0];
  const message = first ? first.message : 'Invalid input.';
  throw new AppError(400, 'VALIDATION_ERROR', message, fields);
}

// Reusable schema pieces -------------------------------------------------------
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD.');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the time format HH:MM.');
export const zId = z.coerce.number().int().positive();
export const zTrimmed = (max = 500) => z.string().trim().max(max);
export const zOptionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
