import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const IDS = { student: 1, doctor: 2, staff: 3, admin: 4 } as const;

export async function apiToken(request: APIRequestContext, userId: number): Promise<string> {
  const res = await request.post('/api/auth/demo-login', { data: { userId } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token as string;
}

export async function api<T = unknown>(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(`/api${path}`, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fresh demo data, and make sure Dr. Ritu Bassi has bookable slots today at any hour. */
export async function prepareDemoData(request: APIRequestContext): Promise<void> {
  const admin = await apiToken(request, IDS.admin);
  await api(request, admin, 'POST', '/demo/reset');
  const student = await apiToken(request, IDS.student);
  const slots = await api<{ available: boolean }[]>(request, student, 'GET', `/doctors/${IDS.doctor}/slots?date=${todayStr()}`);
  if (slots.filter((s) => s.available).length >= 2) return;
  const doctor = await apiToken(request, IDS.doctor);
  const current = await api<{ slotMinutes: number; consultationModes: string[] }>(request, doctor, 'GET', '/doctor/schedule');
  await api(request, doctor, 'PUT', '/doctor/schedule', {
    slotMinutes: current.slotMinutes,
    consultationModes: current.consultationModes,
    schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '00:00', endTime: '23:59' })),
  });
}

/** Closes any open drawer/dialog (they make the rest of the page inert). */
export async function closeOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3 && (await page.getByRole('dialog').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

/** Instant identity switch through the Demo menu in the top bar. */
export async function switchTo(page: Page, role: keyof typeof IDS): Promise<void> {
  await closeOverlays(page);
  await page.getByTestId('role-switcher').click();
  await page.getByTestId(`switch-${role}-${IDS[role]}`).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

/** Signs a page in by injecting a session token (used for the second window in call tests). */
export async function signInWithToken(page: Page, token: string, path: string): Promise<void> {
  await page.goto('/login');
  await page.evaluate((t) => {
    sessionStorage.setItem('sd.token', t);
    localStorage.setItem('sd.token', t);
  }, token);
  await page.goto(path);
}
