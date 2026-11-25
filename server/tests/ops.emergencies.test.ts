import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Emergency, Responder } from '@shared/types';
import { auth, bootstrap, createUser, latestNotification, notificationCount, type TestUser } from './ops-helpers';

let app: ReturnType<typeof bootstrap>;
let a: TestUser;
let b: TestUser;
let c: TestUser;
let staff: TestUser;
let doctor: TestUser;
let admin: TestUser;

beforeAll(() => {
  app = bootstrap();
  a = createUser('student', 'Aarav Emergency');
  b = createUser('student', 'Bhavya Emergency');
  c = createUser('student', 'Charvi Emergency');
  staff = createUser('staff', 'Nurse On Duty');
  doctor = createUser('doctor', 'Dr. On Call');
  admin = createUser('admin', 'Admin On Call');
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  category: 'Injury / accident',
  severity: 'high',
  description: 'Twisted ankle badly near the sports complex, cannot walk.',
  location: 'Sports complex, basketball court',
  contactPhone: '+91 98765 43210',
  emergencyContact: 'Rajesh Mehta (Father) +91 98140 22110',
  additionalInfo: 'Allergic to penicillin',
  ...overrides,
});
const create = (user: TestUser, body = payload()) =>
  request(app).post('/api/emergencies').set(auth(user.token)).send(body);
const setStatus = (id: number, body: Record<string, unknown>, user: TestUser = staff) =>
  request(app).patch(`/api/emergencies/${id}/status`).set(auth(user.token)).send(body);

describe('emergency requests', () => {
  let firstId: number;

  it('submits a request and alerts staff, doctors and admins', async () => {
    const before = [staff, doctor, admin, a].map((u) => notificationCount(u.id));
    const res = await create(a).expect(201);
    const e = res.body as Emergency;
    firstId = e.id;
    expect(e.code).toMatch(/^EMG-[A-Z0-9]{4}$/);
    expect(e.status).toBe('submitted');
    expect(e.student).toMatchObject({ id: a.id, bloodGroup: 'B+', allergies: ['Penicillin'], conditions: ['Mild asthma'] });
    expect(e.timeline.map((t) => t.status)).toEqual(['submitted']);
    const after = [staff, doctor, admin, a].map((u) => notificationCount(u.id));
    expect(after).toEqual(before.map((n) => n + 1));
    expect(latestNotification(staff.id)?.title).toBe('Emergency: Injury / accident');
    expect(latestNotification(staff.id)?.link).toBe(`/staff/emergencies?open=${e.id}`);
    expect(latestNotification(admin.id)?.link).toBe(`/admin/emergencies?open=${e.id}`);
    expect(latestNotification(a.id)?.body).toContain('108');
  });

  it('allows only one active emergency per student', async () => {
    const res = await create(a).expect(409);
    expect(res.body.error.code).toBe('ACTIVE_EMERGENCY');
  });

  it('validates input and role', async () => {
    const bad = await create(b, payload({ description: '' })).expect(400);
    expect(bad.body.error.fields).toHaveProperty('description');
    await create(b, payload({ severity: 'apocalyptic' })).expect(400);
    await create(b, payload({ contactPhone: 'call me' })).expect(400);
    await create(staff).expect(403);
  });

  it('lists responders for staff, doctors and admins only', async () => {
    const res = await request(app).get('/api/emergencies/responders').set(auth(doctor.token)).expect(200);
    const ids = (res.body as Responder[]).map((r) => r.id);
    expect(ids).toContain(staff.id);
    expect(ids).toContain(doctor.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(admin.id);
    await request(app).get('/api/emergencies/responders').set(auth(a.token)).expect(403);
  });

  it('progresses acknowledged → responder assigned → resolved and keeps the student informed', async () => {
    const before = notificationCount(a.id);
    await setStatus(firstId, { status: 'acknowledged' }, a).expect(403);
    const ack = (await setStatus(firstId, { status: 'acknowledged' }).expect(200)).body as Emergency;
    expect(ack.acknowledgedAt).toBeTruthy();
    expect(ack.handledBy?.id).toBe(staff.id);

    const missing = await setStatus(firstId, { status: 'responder_assigned' }).expect(400);
    expect(missing.body.error.fields).toHaveProperty('responderName');
    const assigned = (
      await setStatus(firstId, { status: 'responder_assigned', responderName: 'Nurse On Duty', responderPhone: '+91 90000 11111' }).expect(200)
    ).body as Emergency;
    expect(assigned).toMatchObject({ status: 'responder_assigned', responderName: 'Nurse On Duty', responderPhone: '+91 90000 11111' });
    expect(latestNotification(a.id)?.title).toBe('Help is on the way');
    expect(latestNotification(a.id)?.body).not.toMatch(/ambulance (has been|was) dispatched/i);

    const resolved = (
      await setStatus(firstId, { status: 'resolved', resolutionNotes: 'Ankle strapped, ice pack given.' }, doctor).expect(200)
    ).body as Emergency;
    expect(resolved).toMatchObject({ status: 'resolved', resolutionNotes: 'Ankle strapped, ice pack given.' });
    expect(resolved.resolvedAt).toBeTruthy();
    expect(resolved.timeline.map((t) => t.status)).toEqual(['submitted', 'acknowledged', 'responder_assigned', 'resolved']);
    expect(notificationCount(a.id)).toBe(before + 3);

    const reopen = await setStatus(firstId, { status: 'acknowledged' }).expect(409);
    expect(reopen.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('lets a student raise a new request once the previous one is resolved', async () => {
    await create(a, payload({ severity: 'high', category: 'High fever' })).expect(201);
  });

  it('sorts active requests by severity and hides other students\' requests', async () => {
    const moderate = (await create(b, payload({ severity: 'moderate', category: 'Other' })).expect(201)).body as Emergency;
    const critical = (await create(c, payload({ severity: 'critical', category: 'Breathing difficulty' })).expect(201))
      .body as Emergency;
    const active = (await request(app).get('/api/emergencies').query({ scope: 'active' }).set(auth(admin.token)).expect(200))
      .body as Emergency[];
    expect(active.map((e) => e.severity)).toEqual(['critical', 'high', 'moderate']);
    expect(active[0].id).toBe(critical.id);
    const all = (await request(app).get('/api/emergencies').set(auth(staff.token)).expect(200)).body as Emergency[];
    expect(all[all.length - 1].status).toBe('resolved');

    const mine = (await request(app).get('/api/emergencies').set(auth(b.token)).expect(200)).body as Emergency[];
    expect(mine.map((e) => e.id)).toEqual([moderate.id]);
    await request(app).get(`/api/emergencies/${critical.id}`).set(auth(b.token)).expect(404);
    await request(app).get(`/api/emergencies/${critical.id}`).set(auth(c.token)).expect(200);

    const resolvedOnly = (await request(app).get('/api/emergencies').query({ status: 'resolved' }).set(auth(staff.token)))
      .body as Emergency[];
    expect(resolvedOnly).toHaveLength(1);
  });

  it('records acknowledgement when assigning a responder directly', async () => {
    const list = (await request(app).get('/api/emergencies').query({ scope: 'active' }).set(auth(staff.token))).body as Emergency[];
    const target = list.find((e) => e.severity === 'moderate')!;
    const res = (await setStatus(target.id, { status: 'responder_assigned', responderName: 'Dr. On Call' }, doctor).expect(200))
      .body as Emergency;
    expect(res.acknowledgedAt).toBeTruthy();
    expect(res.assignedAt).toBeTruthy();
  });
});
