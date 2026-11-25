import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityLog, Notification, Paginated } from '@shared/types';
import { logActivity } from '../src/services/activity';
import { notify } from '../src/services/notify';
import { auth, bootstrap, createUser, type TestUser } from './ops-helpers';

let app: ReturnType<typeof bootstrap>;
let student: TestUser;
let staff: TestUser;
let admin: TestUser;
let doctor: TestUser;

beforeAll(() => {
  app = bootstrap();
  student = createUser('student');
  staff = createUser('staff');
  admin = createUser('admin');
  doctor = createUser('doctor');
  for (let i = 1; i <= 3; i++) {
    notify(student.id, { type: 'appointment', title: `Student note ${i}`, body: `Body ${i}`, link: '/student/appointments' });
  }
  notify(staff.id, { type: 'inventory', title: 'Staff note', body: 'Low stock' });

  for (let i = 0; i < 30; i++) {
    logActivity({ actorId: staff.id, action: 'inventory.restocked', category: 'inventory', description: `Restocked batch ${i}` });
  }
  for (let i = 0; i < 5; i++) {
    logActivity({ actorId: admin.id, action: 'user.updated', category: 'user', description: `Updated user profile ${i}` });
  }
  for (let i = 0; i < 3; i++) {
    logActivity({ actorId: student.id, action: 'emergency.submitted', category: 'emergency', description: `Emergency raised ${i}` });
  }
});

describe('notifications', () => {
  it('lists the caller\'s notifications newest first with unread counts', async () => {
    const list = (await request(app).get('/api/notifications').set(auth(student.token)).expect(200)).body as Notification[];
    expect(list.map((n) => n.title)).toEqual(['Student note 3', 'Student note 2', 'Student note 1']);
    expect(list.every((n) => n.isRead === false)).toBe(true);
    const limited = await request(app).get('/api/notifications').query({ limit: 1 }).set(auth(student.token)).expect(200);
    expect(limited.body).toHaveLength(1);
    const count = await request(app).get('/api/notifications/unread-count').set(auth(student.token)).expect(200);
    expect(count.body).toEqual({ count: 3 });
    await request(app).get('/api/notifications').expect(401);
  });

  it('marks one as read and protects other users\' notifications', async () => {
    const list = (await request(app).get('/api/notifications').set(auth(student.token))).body as Notification[];
    await request(app).patch(`/api/notifications/${list[0].id}/read`).set(auth(staff.token)).expect(404);
    await request(app).delete(`/api/notifications/${list[0].id}`).set(auth(staff.token)).expect(404);
    await request(app).patch(`/api/notifications/${list[0].id}/read`).set(auth(student.token)).expect(200);
    const unread = (await request(app).get('/api/notifications').query({ filter: 'unread' }).set(auth(student.token)))
      .body as Notification[];
    expect(unread).toHaveLength(2);
    const count = await request(app).get('/api/notifications/unread-count').set(auth(student.token));
    expect(count.body.count).toBe(2);
  });

  it('deletes, marks all read and clears read notifications', async () => {
    const list = (await request(app).get('/api/notifications').set(auth(student.token))).body as Notification[];
    await request(app).delete(`/api/notifications/${list[2].id}`).set(auth(student.token)).expect(200);
    await request(app).patch('/api/notifications/read-all').set(auth(student.token)).expect(200);
    const count = await request(app).get('/api/notifications/unread-count').set(auth(student.token));
    expect(count.body.count).toBe(0);
    const cleared = await request(app).delete('/api/notifications').query({ scope: 'read' }).set(auth(student.token)).expect(200);
    expect(cleared.body).toEqual({ ok: true, deleted: 2 });
    const remaining = await request(app).get('/api/notifications').set(auth(student.token));
    expect(remaining.body).toHaveLength(0);
    // other users untouched
    const staffCount = await request(app).get('/api/notifications/unread-count').set(auth(staff.token));
    expect(staffCount.body.count).toBe(1);
  });
});

describe('activity log', () => {
  const get = (user: TestUser, query: Record<string, string | number> = {}) =>
    request(app).get('/api/activity').query(query).set(auth(user.token));

  it('paginates for admins', async () => {
    const page1 = (await get(admin, { limit: 10 }).expect(200)).body as Paginated<ActivityLog>;
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBe(38);
    const page2 = (await get(admin, { limit: 10, offset: 10 }).expect(200)).body as Paginated<ActivityLog>;
    expect(page2.items).toHaveLength(10);
    const overlap = page1.items.filter((x) => page2.items.some((y) => y.id === x.id));
    expect(overlap).toHaveLength(0);
    expect(page1.items[0].actor).toMatchObject({ id: student.id, role: 'student' }); // newest first
  });

  it('filters by category, role and search', async () => {
    const users = (await get(admin, { category: 'user' })).body as Paginated<ActivityLog>;
    expect(users.total).toBe(5);
    expect(users.items.every((i) => i.category === 'user')).toBe(true);
    const byStaff = (await get(admin, { role: 'staff', limit: 100 })).body as Paginated<ActivityLog>;
    expect(byStaff.total).toBe(30);
    const search = (await get(admin, { search: 'batch 7' })).body as Paginated<ActivityLog>;
    expect(search.total).toBe(1);
    await get(admin, { category: 'not-a-category' }).expect(400);
  });

  it('restricts staff to dispensary categories', async () => {
    const all = (await get(staff, { limit: 100 }).expect(200)).body as Paginated<ActivityLog>;
    expect(all.total).toBe(33);
    expect(all.items.every((i) => ['inventory', 'medicine_request', 'emergency'].includes(i.category))).toBe(true);
    const users = (await get(staff, { category: 'user' }).expect(200)).body as Paginated<ActivityLog>;
    expect(users).toEqual({ items: [], total: 0 });
  });

  it('is not available to students or doctors', async () => {
    await get(student).expect(403);
    await get(doctor).expect(403);
  });
});
