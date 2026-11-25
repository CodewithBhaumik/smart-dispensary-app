#!/usr/bin/env node
/**
 * Dev helper: signs in as a demo role and screenshots a page with the system Chrome.
 * Usage:
 *   node scripts/shot.mjs --base http://localhost:5173 --role student --path /student --out shot.png [--width 1440] [--height 900] [--full] [--wait 1200]
 * Prints JSON with the screenshot path and any console errors.
 */
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true;
  else {
    args[key] = next;
    i++;
  }
}

const base = args.base ?? 'http://localhost:5173';
const role = args.role ?? 'student';
const path = args.path ?? `/${role}`;
const out = args.out ?? `shot-${role}.png`;

const accounts = await (await fetch(`${base}/api/auth/demo-accounts`)).json();
const account =
  (args.userId && accounts.find((a) => String(a.id) === String(args.userId))) ??
  accounts.find((a) => a.role === role && a.isPrimary) ??
  accounts.find((a) => a.role === role);
if (!account) throw new Error(`No demo account for role ${role}`);
const session = await (
  await fetch(`${base}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: account.id }),
  })
).json();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: Number(args.width ?? 1440), height: Number(args.height ?? 900) },
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${base}/login`);
await page.evaluate((t) => {
  sessionStorage.setItem('sd.token', t);
  localStorage.setItem('sd.token', t);
}, session.token);
await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(args.wait ?? 1000));
await page.screenshot({ path: out, fullPage: Boolean(args.full) });
console.log(JSON.stringify({ saved: out, as: account.name, consoleErrors: errors }, null, 2));
await browser.close();
