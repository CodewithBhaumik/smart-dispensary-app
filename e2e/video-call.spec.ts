import { expect, test } from '@playwright/test';
import { apiToken, IDS, signInWithToken } from './helpers';

/**
 * Two browser windows (student + doctor) chat and hold a WebRTC video call.
 * Chrome's fake camera/microphone is enabled in playwright.config.ts.
 */
test('chat message and video call between student and doctor', async ({ browser, request }) => {
  const studentCtx = await browser.newContext();
  const doctorCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  const doctor = await doctorCtx.newPage();

  await signInWithToken(student, await apiToken(request, IDS.student), `/student/messages?with=${IDS.doctor}`);
  await signInWithToken(doctor, await apiToken(request, IDS.doctor), `/doctor/messages?with=${IDS.student}`);

  // Live chat.
  const text = `Hello doctor, quick question about my medicines (${Date.now()})`;
  await student.getByPlaceholder(/message/i).fill(text);
  await student.getByRole('button', { name: 'Send message' }).click();
  await expect(doctor.getByText(text)).toBeVisible();

  // Doctor calls, student accepts.
  await doctor.getByRole('button', { name: /video call/i }).first().click();
  await student.getByRole('button', { name: 'Accept call' }).click();

  const hasRemoteVideo = (page: typeof student) =>
    page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('video')).some(
          (v) => !v.muted && (v as HTMLVideoElement).videoWidth > 0,
        ),
      undefined,
      { timeout: 30_000 },
    );
  await Promise.all([hasRemoteVideo(student), hasRemoteVideo(doctor)]);

  await doctor.getByRole('button', { name: /End call|Hang up/i }).first().click();
  await expect(student.getByText(/Video call ·/).first()).toBeVisible({ timeout: 15_000 });

  await studentCtx.close();
  await doctorCtx.close();
});
