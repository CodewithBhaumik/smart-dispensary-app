/** Error type understood by the global error handler → `{ error: { code, message, fields? } }`. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, fields?: Record<string, string>, code = 'BAD_REQUEST') =>
  new AppError(400, code, message, fields);

export const unauthorized = (message = 'Please sign in to continue.') => new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have permission to do that.', code = 'FORBIDDEN') =>
  new AppError(403, code, message);

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);

export const conflict = (code: string, message: string) => new AppError(409, code, message);
