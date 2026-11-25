import base from './playwright.config';
import { defineConfig } from '@playwright/test';

/** Same tests against an already-running dev stack (npm run dev) — no rebuild. */
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
  webServer: undefined,
  reporter: [['list']],
});
