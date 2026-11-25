/** Demo conveniences (demo accounts on the login page, instant role switching, reset). On by default. */
export const DEMO_MODE = process.env.DEMO_MODE !== 'false';
export const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
export const SESSION_DAYS = 7;
