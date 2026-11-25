import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/sd-core-auth-${process.pid}`;
});

import request from 'supertest';
import { api, app, freezeTime, loginAs, seedCoreFixtures, TODAY, type FixtureIds } from './core-fixtures';

let ids: FixtureIds;

afterAll(() => {
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
});

beforeAll(() => {
  freezeTime();
  ids = seedCoreFixtures();
});

describe('auth', () => {
  it('logs in with valid credentials and returns the full user', async () => {
    const res = await request(app())
      .post('/api/auth/login')
      .send({ email: 'Aarav.Mehta@smartdispensary.in', password: 'demo1234' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ id: ids.aarav, role: 'student', name: 'Aarav Mehta', isDemo: true });
    expect(res.body.user.student).toMatchObject({ rollNo: '102303147', allergies: ['Penicillin'] });
    expect(res.body.user.doctor).toBeNull();
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const res = await request(app()).post('/api/auth/login').send({ email: 'aarav.mehta@smartdispensary.in', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates the login body', async () => {
    const res = await request(app()).post('/api/auth/login').send({ email: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns /me and invalidates the token on logout', async () => {
    const token = await loginAs('ritu.bassi@smartdispensary.in');
    const me = await api.get(token, '/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.doctor).toMatchObject({ specialty: 'General Medicine', slotMinutes: 15, isAccepting: true });
    const out = await api.post(token, '/api/auth/logout');
    expect(out.body).toEqual({ ok: true });
    const after = await api.get(token, '/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('lists demo accounts with primary identities first', async () => {
    const res = await request(app()).get('/api/auth/demo-accounts');
    expect(res.status).toBe(200);
    const roles = res.body.slice(0, 4).map((a: { role: string }) => a.role);
    expect(roles).toEqual(['student', 'doctor', 'staff', 'admin']);
    expect(res.body.slice(0, 4).every((a: { isPrimary: boolean }) => a.isPrimary)).toBe(true);
    const names = res.body.map((a: { name: string }) => a.name);
    expect(names).toContain('Dr. Ajay Gupta');
    expect(names).toContain('Priya Sharma');
  });

  it('demo-login signs in as a listed account', async () => {
    const res = await request(app()).post('/api/auth/demo-login').send({ userId: ids.abhishek });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('staff');
    expect(res.body.user.staff.designation).toBe('Associate (Pharmacist)');
  });

  it('blocks unauthenticated and unauthorised access', async () => {
    expect((await request(app()).get('/api/appointments')).status).toBe(401);
    const student = await loginAs('aarav.mehta@smartdispensary.in');
    const res = await api.get(student, '/api/dashboard/admin');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await api.get(student, '/api/users')).status).toBe(403);
    expect((await api.get(student, '/api/patients')).status).toBe(403);
  });

  it('serves app metadata', async () => {
    const res = await request(app()).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ appName: 'Smart Dispensary', demoMode: true, today: TODAY });
  });

  it('updates own profile and password', async () => {
    const token = await loginAs('priya.sharma@smartdispensary.in');
    const res = await api.put(token, '/api/me/profile', {
      phone: '+91 99887 76655',
      bloodGroup: 'O+',
      allergies: ['Dust', 'Pollen'],
      heightCm: 162,
      weightKg: 54,
      emergencyContactName: 'Sunita Sharma',
    });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+91 99887 76655');
    expect(res.body.student).toMatchObject({ allergies: ['Dust', 'Pollen'], heightCm: 162, rollNo: '102203588', hostel: 'Hostel E' });

    const bad = await api.put(token, '/api/me/password', { currentPassword: 'wrong', newPassword: 'newpass123' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('WRONG_PASSWORD');
    const ok = await api.put(token, '/api/me/password', { currentPassword: 'demo1234', newPassword: 'newpass123' });
    expect(ok.status).toBe(200);
    await loginAs('priya.sharma@smartdispensary.in', 'newpass123');
  });

  it('rejects invalid profile values', async () => {
    const token = await loginAs('rohan.verma@smartdispensary.in');
    const res = await api.put(token, '/api/me/profile', { year: 9 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.year).toBeTruthy();
  });
});
