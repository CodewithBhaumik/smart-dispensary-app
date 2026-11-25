import type { Request } from 'express';
import { notFound } from '../lib/errors';

/** Parses a positive integer route param (default `:id`); unknown ids → 404. */
export function idParam(req: Request, name = 'id', what = 'Resource'): number {
  const raw = req.params[name];
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw notFound(what);
  return id;
}

/** RFC 6266 inline Content-Disposition with a UTF-8 filename. */
export function inlineDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, "'");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
