import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, closeOverlays, IDS, prepareDemoData, switchTo } from './helpers';

/**
 * The complete live-presentation flow (Demos 1–6) in one browser window,
 * switching identities through the Demo menu exactly like the presenter will.
 */
test.describe.configure({ mode: 'serial' });

let page: Page;
let appointmentCode = '';
let requestCode = '';

test.beforeAll(async ({ browser, request }) => {
  await prepareDemoData(request);
  const context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
});

test.afterAll(async () => {
  await page.context().close();
});

test('Demo 1 · student browses doctors and books an appointment', async () => {
  await page.goto('/login');
  await page.getByTestId('demo-login-student').click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: /Aarav/ })).toBeVisible();

  await page.getByRole('link', { name: 'Find a Doctor' }).click();
  await expect(page.getByText('Dr. Ritu Bassi').first()).toBeVisible();
  await page.locator(`a[href="/student/book?doctorId=${IDS.doctor}"]`).first().click();
  await expect(page).toHaveURL(/\/student\/book/);

  // Step 2: first free slot on the auto-selected (earliest available) date.
  const slot = page.locator('button[aria-pressed]:not([disabled])').first();
  await expect(slot).toBeVisible();
  await slot.click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: details.
  await page.locator('#reason').click();
  await page.getByRole('option', { name: 'Fever / cold / flu' }).click();
  await page.locator('#notes').fill('Fever and sore throat since last night.');
  await page.getByRole('button', { name: 'Confirm appointment' }).first().click();

  const code = page.getByText(/APT-[A-Z0-9]{6}/).first();
  await expect(code).toBeVisible();
  appointmentCode = ((await code.textContent()) ?? '').match(/APT-[A-Z0-9]{6}/)![0];

  await page.getByRole('link', { name: /View my appointments/ }).click();
  await expect(page).toHaveURL(/\/student\/appointments/);
  await expect(page.getByText(appointmentCode).first()).toBeVisible();
  // The new appointment opens in a detail drawer — close it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByTestId('notification-bell').click();
  await expect(page.getByText('Appointment confirmed').first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Demo 2 · doctor checks in, consults and prescribes', async () => {
  await switchTo(page, 'doctor');
  await expect(page.getByText('Aarav Mehta').first()).toBeVisible();

  // Check in using the code from the student's pass.
  await page.getByRole('button', { name: /Check in by code/ }).click();
  await page.locator('#checkin-code').fill(appointmentCode);
  await page.getByRole('dialog').getByRole('button', { name: /Check in/ }).last().click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Open the appointment and start the consultation.
  await page.getByRole('link', { name: 'Appointments' }).first().click();
  await expect(page).toHaveURL(/\/doctor\/appointments/);
  await page.getByPlaceholder(/Patient, roll no/).first().fill('Aarav');
  await page.getByText('Aarav Mehta').first().click();
  await page.getByRole('button', { name: 'Start consultation' }).last().click();
  await expect(page).toHaveURL(/\/doctor\/consultation\/\d+/);

  // Consultation notes.
  const symptoms = page.getByPlaceholder('Type a symptom and press Enter');
  await symptoms.fill('Fever');
  await symptoms.press('Enter');
  // The chip input keeps focus (its placeholder disappears once a chip exists).
  await page.keyboard.type('Sore throat');
  await page.keyboard.press('Enter');
  await page.locator('#clinical-notes').fill('Fever for one day with throat pain. No breathlessness.');
  await page.locator('#observations').fill('Temp 100.4 °F, mild pharyngeal congestion.');
  await page.locator('#diagnosis').fill('Viral upper respiratory tract infection');
  await page.locator('#advice').fill('Rest, warm fluids, steam inhalation. Return if fever persists beyond 3 days.');

  // Prescription.
  for (const query of ['Paracetamol 650', 'Cetirizine']) {
    await page.getByRole('button', { name: 'Add medicine' }).first().click();
    await page.getByPlaceholder(/Search formulary/).fill(query);
    await page.getByRole('option').first().click();
  }

  await page.getByRole('button', { name: 'Complete consultation' }).first().click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: /Complete/ }).click();
  await expect(page).toHaveURL(/\/doctor\/appointments\?open=\d+/);
  await expect(page.getByText(/RX-[A-Z0-9]{6}/).first()).toBeVisible();
});

test('Demo 3 · student sees the prescription and requests medicines', async ({ request }) => {
  await switchTo(page, 'student');
  await page.getByRole('link', { name: 'Appointments' }).first().click();
  await page.getByRole('tab', { name: /Past/ }).click();
  await expect(page.getByText(appointmentCode).first()).toBeVisible();
  await expect(page.getByText('Completed').first()).toBeVisible();

  await page.getByRole('link', { name: 'Prescriptions' }).first().click();
  await expect(page.getByText('Viral upper respiratory tract infection').first()).toBeVisible();
  await page.getByText('Viral upper respiratory tract infection').first().click();
  await page.getByRole('link', { name: /Request these medicines/ }).or(page.getByRole('button', { name: /Request these medicines/ })).first().click();
  await expect(page).toHaveURL(/\/student\/medicines\?prescription=\d+/);

  await page.locator('#fulfil-pickup').click();
  await page.getByRole('button', { name: 'Submit request' }).click();
  const code = page.getByText(/MR-[A-Z0-9]{6}/).first();
  await expect(code).toBeVisible();
  requestCode = ((await code.textContent()) ?? '').match(/MR-[A-Z0-9]{6}/)![0];

  // Request exists and is linked to the prescription.
  const token = await apiToken(request, IDS.student);
  const mine = await api<{ code: string; status: string }[]>(request, token, 'GET', '/medicine-requests');
  expect(mine.find((r) => r.code === requestCode)?.status).toBe('submitted');
});

test('Demo 4 · staff processes the request and inventory decreases once', async ({ request }) => {
  const staffToken = await apiToken(request, IDS.staff);
  const req = (await api<{ code: string; id: number; items: { medicineId: number; quantity: number }[] }[]>(
    request,
    staffToken,
    'GET',
    '/medicine-requests',
  )).find((r) => r.code === requestCode)!;
  const before = await Promise.all(
    req.items.map((i) => api<{ stockQuantity: number }>(request, staffToken, 'GET', `/medicines/${i.medicineId}`)),
  );

  await switchTo(page, 'staff');
  await page.getByRole('link', { name: 'Medicine Requests' }).first().click();
  await page.getByText(requestCode).first().click();
  for (const label of ['Approve request', 'Start preparing', 'Mark ready for pickup']) {
    await page.getByRole('button', { name: label }).last().click();
    await expect(page.getByRole('button', { name: label })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Mark fulfilled' }).last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: /fulfil/i }).last().click();
  await expect(page.getByRole('button', { name: 'Mark fulfilled' })).toHaveCount(0);

  const after = await Promise.all(
    req.items.map((i) => api<{ stockQuantity: number }>(request, staffToken, 'GET', `/medicines/${i.medicineId}`)),
  );
  req.items.forEach((item, idx) => {
    expect(after[idx].stockQuantity).toBe(before[idx].stockQuantity - item.quantity);
  });

  await closeOverlays(page);
  await page.getByRole('link', { name: 'Inventory' }).first().click();
  await expect(page.getByText(/Low stock/i).first()).toBeVisible();
});

test('Demo 5 · admin analytics, users and activity log', async () => {
  await switchTo(page, 'admin');
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  expect(await page.locator('.recharts-surface').count()).toBeGreaterThanOrEqual(4);

  await closeOverlays(page);
  await page.getByRole('link', { name: 'Users' }).first().click();
  await expect(page.getByText('Aarav Mehta').first()).toBeVisible();

  await closeOverlays(page);
  await page.getByRole('link', { name: 'Activity Log' }).first().click();
  await expect(page.getByText(/fulfilled/i).first()).toBeVisible();
  await expect(page.getByText(/Aarav Mehta booked an appointment/i).first()).toBeVisible();
});

test('Demo 6 · emergency request is raised, handled and resolved', async () => {
  await switchTo(page, 'student');
  await page.getByRole('link', { name: 'Emergency' }).first().click();
  await expect(page).toHaveURL(/\/student\/emergency/);
  await page.getByRole('button', { name: /High fever/ }).first().click();
  await page.locator('#emg-description').fill('Very high fever with shivering since the evening, feeling dizzy.');
  const location = page.locator('#emg-location');
  if ((await location.count()) && !(await location.inputValue())) await location.fill('Hostel J, Room 214');
  await page.getByRole('button', { name: /Send emergency alert/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Send alert' }).click();
  await expect(page.getByText(/EMG-[A-Z0-9]{4}/).first()).toBeVisible();

  await switchTo(page, 'staff');
  await page.getByRole('link', { name: 'Emergencies' }).first().click();
  await page.getByText('Aarav Mehta').first().click();
  await page.getByRole('button', { name: 'Acknowledge' }).last().click();
  await page.getByRole('button', { name: /Assign responder/ }).last().click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('button', { name: /Assign/ }).last().click();
  await page.getByRole('button', { name: /Resolve/ }).last().click();
  const resolve = page.getByRole('dialog', { name: 'Resolve emergency' });
  await resolve.locator('textarea').first().fill('Paracetamol given, temperature settling, advised rest and fluids.');
  await resolve.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(resolve).toBeHidden();

  await switchTo(page, 'student');
  await page.getByRole('link', { name: 'Emergency' }).first().click();
  await expect(page.getByText('Resolved').first()).toBeVisible();
});
