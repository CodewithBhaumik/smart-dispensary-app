import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/sd-core-records-${process.pid}`;
});

import request from 'supertest';
import { DATA_DIR, db, UPLOADS_DIR } from '../src/db';
import { api, app, bearer, freezeTime, loginAs, seedCoreFixtures, TODAY, type FixtureIds } from './core-fixtures';

let ids: FixtureIds;
let aarav: string;
let priya: string;
let ritu: string;
let staff: string;
let admin: string;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n');

beforeAll(async () => {
  freezeTime();
  ids = seedCoreFixtures();
  [aarav, priya, ritu, staff, admin] = await Promise.all([
    loginAs('aarav.mehta@smartdispensary.in'),
    loginAs('priya.sharma@smartdispensary.in'),
    loginAs('ritu.bassi@smartdispensary.in'),
    loginAs('abhishek.bhardwaj@smartdispensary.in'),
    loginAs('vishal.srivastava@smartdispensary.in'),
  ]);
  // Relationship: Aarav has an appointment with Dr. Ritu Bassi today.
  const res = await api.post(aarav, '/api/appointments', {
    doctorId: ids.ritu,
    date: TODAY,
    startTime: '10:00',
    mode: 'in_person',
    reason: 'General consultation',
  });
  expect(res.status).toBe(201);
});

afterAll(() => {
  db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

const upload = (token: string, fields: Record<string, string>, file?: { buf: Buffer; name: string; type: string }) => {
  const req = request(app()).post('/api/records').set(bearer(token));
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  if (file) req.attach('file', file.buf, { filename: file.name, contentType: file.type });
  return req;
};

describe('medical records', () => {
  let recordId: number;

  it('student uploads, lists and downloads a document', async () => {
    const res = await upload(
      aarav,
      { category: 'lab_report', title: 'CBC blood test', recordDate: '2026-11-20', description: 'Routine check' },
      { buf: PDF, name: 'cbc-report.pdf', type: 'application/pdf' },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      category: 'lab_report',
      source: 'upload',
      title: 'CBC blood test',
      file: { name: 'cbc-report.pdf', mimeType: 'application/pdf', size: PDF.length },
    });
    expect(res.body.uploadedBy.id).toBe(ids.aarav);
    recordId = res.body.id;

    const list = await api.get(aarav, '/api/records');
    expect(list.body.map((r: { id: number }) => r.id)).toContain(recordId);
    const filtered = await api.get(aarav, '/api/records?category=vaccination');
    expect(filtered.body).toHaveLength(0);

    const file = await request(app())
      .get(`/api/records/${recordId}/file`)
      .set(bearer(aarav))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.headers['content-disposition']).toContain('inline; filename="cbc-report.pdf"');
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
    expect((await api.get(priya, `/api/records/${recordId}/file`)).status).toBe(404);
  });

  it('validates uploads', async () => {
    const noFile = await upload(aarav, { category: 'lab_report', title: 'Missing', recordDate: '2026-11-20' });
    expect(noFile.status).toBe(400);
    const badType = await upload(
      aarav,
      { category: 'lab_report', title: 'Notes', recordDate: '2026-11-20' },
      { buf: Buffer.from('hello'), name: 'notes.txt', type: 'text/plain' },
    );
    expect([badType.status, badType.body.error.code]).toEqual([400, 'UNSUPPORTED_FILE']);
    const future = await upload(
      aarav,
      { category: 'lab_report', title: 'Future', recordDate: '2026-12-30' },
      { buf: PDF, name: 'f.pdf', type: 'application/pdf' },
    );
    expect(future.status).toBe(400);
    const summary = await upload(
      aarav,
      { category: 'visit_summary', title: 'Fake summary', recordDate: '2026-11-20' },
      { buf: PDF, name: 's.pdf', type: 'application/pdf' },
    );
    expect(summary.status).toBe(400);
    // rejected files are not left on disk
    const stored = (db.prepare('SELECT file_path FROM medical_records').all() as { file_path: string }[]).map((r) => r.file_path);
    expect(fs.readdirSync(UPLOADS_DIR).filter((f) => !stored.includes(f))).toEqual([]);
  });

  it('doctor can view and add records only for own patients', async () => {
    expect((await api.get(ritu, '/api/records')).status).toBe(400);
    const list = await api.get(ritu, `/api/records?studentId=${ids.aarav}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect((await api.get(ritu, `/api/records?studentId=${ids.priya}`)).status).toBe(403);
    const added = await upload(
      ritu,
      { category: 'certificate', title: 'Fitness certificate', recordDate: TODAY, studentId: String(ids.aarav) },
      { buf: PDF, name: 'fitness.pdf', type: 'application/pdf' },
    );
    expect(added.status).toBe(201);
    expect(added.body.doctor.id).toBe(ids.ritu);
    const note = db
      .prepare(`SELECT title FROM notifications WHERE user_id = ? AND title = 'New document in your records'`)
      .get(ids.aarav);
    expect(note).toBeTruthy();
    expect((await api.get(staff, '/api/records')).status).toBe(403);
    // the student cannot delete the doctor's upload
    expect((await api.del(aarav, `/api/records/${added.body.id}`)).status).toBe(403);
  });

  it('deletes own upload and removes the file', async () => {
    const row = db.prepare('SELECT file_path FROM medical_records WHERE id = ?').get(recordId) as { file_path: string };
    expect((await api.del(priya, `/api/records/${recordId}`)).status).toBe(404);
    const res = await api.del(aarav, `/api/records/${recordId}`);
    expect(res.body).toEqual({ ok: true });
    expect(fs.existsSync(path.join(UPLOADS_DIR, row.file_path))).toBe(false);
  });
});

describe('patients', () => {
  it('doctor sees own patients and their history', async () => {
    const list = await api.get(ritu, '/api/patients');
    expect(list.status).toBe(200);
    expect(list.body.map((p: { id: number }) => p.id)).toEqual([ids.aarav]);
    expect(list.body[0]).toMatchObject({ allergies: ['Penicillin'], conditions: ['Mild asthma'], totalVisits: 0 });
    expect((await api.get(ritu, '/api/patients?search=zzz')).body).toHaveLength(0);
    const detail = await api.get(ritu, `/api/patients/${ids.aarav}`);
    expect(detail.status).toBe(200);
    expect(detail.body.appointments).toHaveLength(1);
    expect(detail.body).toHaveProperty('records');
    expect((await api.get(ritu, `/api/patients/${ids.priya}`)).status).toBe(403);
    expect((await api.get(admin, '/api/patients')).body).toHaveLength(3);
    expect((await api.get(admin, `/api/patients/${ids.ritu}`)).status).toBe(404);
  });
});

describe('dashboards', () => {
  it('student dashboard', async () => {
    const res = await api.get(aarav, '/api/dashboard/student');
    expect(res.status).toBe(200);
    expect(res.body.nextAppointment).toMatchObject({ startTime: '10:00', status: 'scheduled' });
    expect(res.body.stats).toMatchObject({ upcomingAppointments: 1, visitsThisYear: 0, requestsInProgress: 0 });
    expect(res.body.stats.unreadNotifications).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('recentPrescriptions');
    expect(res.body).toHaveProperty('activeRequests');
    expect(res.body.activeEmergency).toBeNull();
    expect(res.body.profileCompletion).toBeGreaterThan(50);
  });

  it('doctor dashboard', async () => {
    const res = await api.get(ritu, '/api/dashboard/doctor');
    expect(res.status).toBe(200);
    expect(res.body.isAccepting).toBe(true);
    expect(res.body.stats).toMatchObject({ todayTotal: 1, waiting: 0, completedToday: 0 });
    expect(res.body.todayQueue).toHaveLength(1);
    expect(res.body.nextPatient.student.id).toBe(ids.aarav);
    expect(res.body.weeklyConsultations).toHaveLength(7);
    expect(res.body.todaySchedule).toHaveLength(2);
  });

  it('staff dashboard (staff and admin)', async () => {
    const res = await api.get(staff, '/api/dashboard/staff');
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({ totalItems: 2, expiringSoon: 1, lowStock: 0, pendingRequests: 0 });
    expect(res.body.expiringItems[0].name).toBe('Amoxicillin 500 mg');
    expect(res.body.dispensedLast7Days).toHaveLength(7);
    expect((await api.get(admin, '/api/dashboard/staff')).status).toBe(200);
    expect((await api.get(aarav, '/api/dashboard/staff')).status).toBe(403);
  });

  it('admin dashboard', async () => {
    const res = await api.get(admin, '/api/dashboard/admin');
    expect(res.status).toBe(200);
    expect(res.body.kpis).toMatchObject({
      students: 3,
      doctors: 3,
      staff: 1,
      appointmentsTotal: 1,
      appointmentsPending: 1,
      appointmentsToday: 1,
      inventoryItems: 2,
      inventoryUnits: 150,
      inventoryValue: 100 * 12 + 50 * 65,
    });
    expect(res.body.appointmentsOverTime).toHaveLength(30);
    expect(res.body.appointmentsOverTime[29]).toMatchObject({ date: TODAY, scheduled: 1 });
    expect(res.body.statusDistribution).toHaveLength(5);
    expect(res.body.requestsByWeek).toHaveLength(8);
    expect(res.body.requestsByWeek[7].week).toBe('23 Nov');
    expect(res.body.peakHours).toHaveLength(15);
    expect(res.body.peakHours.find((h: { hour: string }) => h.hour === '10:00').count).toBe(1);
    expect(res.body.specialtyDemand[0]).toEqual({ specialty: 'General Medicine', count: 1 });
    expect(res.body.recentActivity.length).toBeGreaterThan(0);
  });
});

describe('user management', () => {
  let newStudentId: number;

  it('lists users with summaries and filters', async () => {
    const res = await api.get(admin, '/api/users');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    const a = res.body.find((u: { id: number }) => u.id === ids.aarav);
    expect(a.summary).toBe('102303147 · Computer Science & Engineering · Year 3');
    expect((await api.get(admin, '/api/users?role=doctor')).body).toHaveLength(3);
    const search = await api.get(admin, '/api/users?search=pharmacist');
    expect(search.body.map((u: { id: number }) => u.id)).toEqual([ids.abhishek]);
    expect((await api.get(admin, '/api/users?status=inactive')).body).toHaveLength(0);
  });

  it('creates users with validation', async () => {
    const created = await api.post(admin, '/api/users', {
      role: 'student',
      name: 'Simran Kaur',
      email: 'simran.kaur@smartdispensary.in',
      phone: '+91 98765 11111',
      student: { rollNo: '102303999', department: 'Biotechnology', program: 'B.Tech', year: 2, hostel: 'Hostel M', allergies: ['Sulfa drugs'] },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ role: 'student', title: 'B.Tech · Year 2', isActive: true, isDemo: false });
    expect(created.body.student).toMatchObject({ rollNo: '102303999', allergies: ['Sulfa drugs'] });
    newStudentId = created.body.id;

    const dupEmail = await api.post(admin, '/api/users', {
      role: 'student',
      name: 'Dup',
      email: 'SIMRAN.KAUR@smartdispensary.in',
      student: { rollNo: '102309876', department: 'Biotechnology', program: 'B.Tech', year: 2 },
    });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');
    const dupRoll = await api.post(admin, '/api/users', {
      role: 'student',
      name: 'Dup Roll',
      email: 'dup.roll@smartdispensary.in',
      student: { rollNo: '102303999', department: 'Biotechnology', program: 'B.Tech', year: 2 },
    });
    expect(dupRoll.body.error.code).toBe('ROLL_NO_TAKEN');
    const missing = await api.post(admin, '/api/users', { role: 'doctor', name: 'Dr. X', email: 'x@smartdispensary.in' });
    expect(missing.status).toBe(400);

    const doctor = await api.post(admin, '/api/users', {
      role: 'doctor',
      name: 'Dr. Arvind Sethi',
      email: 'arvind.sethi@smartdispensary.in',
      title: 'Visiting Consultant',
      doctor: { specialty: 'Dermatology', qualifications: 'M.B.B.S, M.D (Dermatology)', experienceYears: 12, isVisiting: true },
    });
    expect(doctor.status).toBe(201);
    expect(doctor.body.doctor).toMatchObject({ specialty: 'Dermatology', isVisiting: true, slotMinutes: 15 });
    const docs = await api.get(aarav, '/api/doctors?specialty=Dermatology');
    expect(docs.body[0].schedule).toHaveLength(5);

    const staffUser = await api.post(admin, '/api/users', {
      role: 'staff',
      name: 'Jasmine',
      email: 'jasmine@smartdispensary.in',
      staff: { designation: 'Staff Nurse', qualifications: 'DMLT, GNM', experienceYears: 14 },
    });
    expect(staffUser.status).toBe(201);
    expect(staffUser.body).toMatchObject({ title: 'Staff Nurse', summary: 'Staff Nurse' });
    expect((await api.post(staff, '/api/users', {})).status).toBe(403);
  });

  it('updates users', async () => {
    const res = await api.put(admin, `/api/users/${newStudentId}`, {
      phone: '+91 90000 22222',
      student: { year: 3, room: '412' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+91 90000 22222', title: 'B.Tech · Year 3' });
    expect(res.body.student).toMatchObject({ year: 3, room: '412', hostel: 'Hostel M', allergies: ['Sulfa drugs'] });
    const clash = await api.put(admin, `/api/users/${newStudentId}`, { email: 'aarav.mehta@smartdispensary.in' });
    expect(clash.status).toBe(409);
  });

  it('activates / deactivates accounts with protections', async () => {
    const protectedRes = await api.patch(admin, `/api/users/${ids.aarav}/status`, { isActive: false });
    expect([protectedRes.status, protectedRes.body.error.code]).toEqual([403, 'PROTECTED_ACCOUNT']);
    const self = await api.patch(admin, `/api/users/${ids.vishal}/status`, { isActive: false });
    expect(self.body.error.code).toBe('PROTECTED_ACCOUNT');

    const token = await loginAs('simran.kaur@smartdispensary.in');
    const off = await api.patch(admin, `/api/users/${newStudentId}/status`, { isActive: false });
    expect(off.body.isActive).toBe(false);
    expect((await api.get(token, '/api/auth/me')).status).toBe(401);
    const login = await request(app()).post('/api/auth/login').send({ email: 'simran.kaur@smartdispensary.in', password: 'demo1234' });
    expect([login.status, login.body.error.code]).toEqual([403, 'ACCOUNT_INACTIVE']);
    expect((await api.get(admin, '/api/users?status=inactive')).body).toHaveLength(1);
    const on = await api.patch(admin, `/api/users/${newStudentId}/status`, { isActive: true });
    expect(on.body.isActive).toBe(true);
    await loginAs('simran.kaur@smartdispensary.in');
    const actions = (db.prepare(`SELECT action FROM activity_logs WHERE category = 'user'`).all() as { action: string }[]).map(
      (r) => r.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['user.created', 'user.updated', 'user.deactivated', 'user.activated']));
  });
});

describe('demo reset', () => {
  it('reseeds and returns a fresh session for the caller', async () => {
    const res = await api.post(priya, '/api/demo/reset');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe('student');
    const me = await api.get(res.body.token, '/api/auth/me');
    expect(me.status).toBe(200);
  });
});
