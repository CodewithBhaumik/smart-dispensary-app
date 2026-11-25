import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATA_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/sd-core-appt-${process.pid}`;
});

import { db } from '../src/db';
import { api, freezeTime, loginAs, seedCoreFixtures, TODAY, TOMORROW, type FixtureIds } from './core-fixtures';

let ids: FixtureIds;

afterAll(() => {
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
});
let aarav: string;
let priya: string;
let rohan: string;
let ritu: string;
let ajay: string;
let staff: string;
let admin: string;

beforeAll(async () => {
  freezeTime();
  ids = seedCoreFixtures();
  [aarav, priya, rohan, ritu, ajay, staff, admin] = await Promise.all([
    loginAs('aarav.mehta@smartdispensary.in'),
    loginAs('priya.sharma@smartdispensary.in'),
    loginAs('rohan.verma@smartdispensary.in'),
    loginAs('ritu.bassi@smartdispensary.in'),
    loginAs('ajay.gupta@smartdispensary.in'),
    loginAs('abhishek.bhardwaj@smartdispensary.in'),
    loginAs('vishal.srivastava@smartdispensary.in'),
  ]);
});

const book = (token: string, body: Record<string, unknown>) =>
  api.post(token, '/api/appointments', { mode: 'in_person', reason: 'Fever / cold / flu', ...body });

describe('doctors & slots', () => {
  it('lists doctors with availability info', async () => {
    const res = await api.get(aarav, '/api/doctors');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const ritu = res.body.find((d: { id: number }) => d.id === ids.ritu);
    expect(ritu).toMatchObject({ specialty: 'General Medicine', isAccepting: true, slotMinutes: 15 });
    expect(ritu.nextAvailable).toEqual({ date: TODAY, time: '09:15' });
    expect(ritu.todayFreeSlots).toBe(31); // 09:15-12:45 (15) + 14:00-17:45 (16)
    expect(ritu.schedule.length).toBe(12);
    const pooja = res.body.find((d: { id: number }) => d.id === ids.pooja);
    expect(pooja.nextAvailable).toBeNull(); // not accepting
  });

  it('filters by specialty, search and availability', async () => {
    expect((await api.get(aarav, '/api/doctors?specialty=Dental%20Surgery')).body).toHaveLength(1);
    expect((await api.get(aarav, '/api/doctors?search=ajay')).body[0].id).toBe(ids.ajay);
    const avail = await api.get(aarav, '/api/doctors?availableToday=1');
    expect(avail.body.map((d: { id: number }) => d.id).sort()).toEqual([ids.ritu, ids.ajay].sort());
    const specs = await api.get(aarav, '/api/doctors/specialties');
    expect(specs.body).toContain('Paediatrics & Adolescent Health');
  });

  it('returns doctor detail, availability and slots', async () => {
    const detail = await api.get(aarav, `/api/doctors/${ids.ritu}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toHaveProperty('leaves');
    expect(detail.body).toHaveProperty('completedConsultations', 0);
    const days = await api.get(aarav, `/api/doctors/${ids.ritu}/availability?days=7`);
    expect(days.body).toHaveLength(7);
    expect(days.body[0]).toMatchObject({ date: TODAY, totalSlots: 32, freeSlots: 31, onLeave: false });
    const slots = await api.get(aarav, `/api/doctors/${ids.ritu}/slots?date=${TODAY}`);
    expect(slots.body[0]).toEqual({ time: '09:00', endTime: '09:15', available: false, reason: 'past' });
    expect(slots.body[1]).toMatchObject({ time: '09:15', available: true, reason: null });
    expect((await api.get(aarav, `/api/doctors/9999`)).status).toBe(404);
  });
});

describe('booking rules', () => {
  let firstId: number;

  it('books an appointment and notifies both parties', async () => {
    const res = await book(aarav, { doctorId: ids.ritu, date: TODAY, startTime: '10:00', notes: 'Sore throat since 2 days' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'scheduled', startTime: '10:00', endTime: '10:15', mode: 'in_person' });
    expect(res.body.code).toMatch(/^APT-[A-Z0-9]{6}$/);
    expect(res.body.student.id).toBe(ids.aarav);
    expect(res.body.doctor.name).toBe('Dr. Ritu Bassi');
    firstId = res.body.id;
    const titles = (db.prepare('SELECT user_id, title FROM notifications').all() as { user_id: number; title: string }[]);
    expect(titles).toContainEqual({ user_id: ids.aarav, title: 'Appointment confirmed' });
    expect(titles).toContainEqual({ user_id: ids.ritu, title: 'New appointment booked' });
    const log = db.prepare(`SELECT description FROM activity_logs WHERE action = 'appointment.booked'`).get() as { description: string };
    expect(log.description).toContain('Aarav Mehta booked an appointment with Dr. Ritu Bassi');
  });

  it('marks booked / own-conflict slots', async () => {
    const forPriya = await api.get(priya, `/api/doctors/${ids.ritu}/slots?date=${TODAY}`);
    expect(forPriya.body.find((s: { time: string }) => s.time === '10:00')).toMatchObject({ available: false, reason: 'booked' });
    const ajaySlotsForAarav = await api.get(aarav, `/api/doctors/${ids.ajay}/slots?date=${TODAY}`);
    expect(ajaySlotsForAarav.body.find((s: { time: string }) => s.time === '10:00')).toMatchObject({ reason: 'own_conflict' });
  });

  it('rejects a taken slot (SLOT_TAKEN)', async () => {
    const res = await book(priya, { doctorId: ids.ritu, date: TODAY, startTime: '10:00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
  });

  it('rejects an overlapping booking with another doctor (STUDENT_CONFLICT)', async () => {
    const res = await book(aarav, { doctorId: ids.ajay, date: TODAY, startTime: '10:00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STUDENT_CONFLICT');
  });

  it('rejects a second booking with the same doctor that day (DUPLICATE_BOOKING)', async () => {
    const res = await book(aarav, { doctorId: ids.ritu, date: TODAY, startTime: '11:00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_BOOKING');
  });

  it('rejects past, invalid, out-of-window, unavailable and unsupported-mode bookings', async () => {
    const past = await book(priya, { doctorId: ids.ritu, date: TODAY, startTime: '09:00' });
    expect([past.status, past.body.error.code]).toEqual([400, 'PAST_SLOT']);
    const yesterday = await book(priya, { doctorId: ids.ritu, date: '2026-11-24', startTime: '10:00' });
    expect([yesterday.status, yesterday.body.error.code]).toEqual([400, 'PAST_SLOT']);
    const odd = await book(priya, { doctorId: ids.ritu, date: TODAY, startTime: '10:07' });
    expect([odd.status, odd.body.error.code]).toEqual([400, 'INVALID_SLOT']);
    const far = await book(priya, { doctorId: ids.ritu, date: '2026-12-20', startTime: '10:00' });
    expect([far.status, far.body.error.code]).toEqual([400, 'OUTSIDE_WINDOW']);
    const notAccepting = await book(priya, { doctorId: ids.pooja, date: TODAY, startTime: '10:00' });
    expect([notAccepting.status, notAccepting.body.error.code]).toEqual([409, 'DOCTOR_UNAVAILABLE']);
    const video = await book(priya, { doctorId: ids.ajay, date: TODAY, startTime: '10:30', mode: 'video' });
    expect([video.status, video.body.error.code]).toEqual([400, 'MODE_NOT_OFFERED']);
    const invalid = await api.post(priya, '/api/appointments', { doctorId: ids.ritu, date: 'tomorrow', startTime: '10:00' });
    expect([invalid.status, invalid.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    const asDoctor = await book(ritu, { doctorId: ids.ajay, date: TODAY, startTime: '10:30' });
    expect(asDoctor.status).toBe(403);
  });

  it('lists appointments by scope for each role', async () => {
    const mine = await api.get(aarav, '/api/appointments?scope=upcoming');
    expect(mine.body.map((a: { id: number }) => a.id)).toEqual([firstId]);
    const docToday = await api.get(ritu, '/api/appointments?scope=today');
    expect(docToday.body).toHaveLength(1);
    expect((await api.get(ajay, '/api/appointments')).body).toHaveLength(0);
    const all = await api.get(admin, `/api/appointments?search=Aarav`);
    expect(all.body).toHaveLength(1);
    expect((await api.get(staff, '/api/appointments?status=scheduled')).body).toHaveLength(1);
  });

  it('reschedules (same rules, excluding itself) and blocks non-scheduled reschedules', async () => {
    const same = await api.patch(aarav, `/api/appointments/${firstId}/reschedule`, { date: TODAY, startTime: '10:00' });
    expect(same.status).toBe(400);
    const res = await api.patch(aarav, `/api/appointments/${firstId}/reschedule`, { date: TOMORROW, startTime: '10:30' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: TOMORROW, startTime: '10:30', rescheduledCount: 1, status: 'scheduled' });
    const other = await api.patch(priya, `/api/appointments/${firstId}/reschedule`, { date: TOMORROW, startTime: '11:00' });
    expect(other.status).toBe(404);
    const detail = await api.get(aarav, `/api/appointments/${firstId}`);
    expect(detail.body.timeline.map((e: { note: string }) => e.note)).toContain(
      'Rescheduled from Wed, 25 Nov at 10:00 AM to Thu, 26 Nov at 10:30 AM',
    );
  });

  it('refuses check-in on a different day (NOT_TODAY)', async () => {
    const res = await api.patch(ritu, `/api/appointments/${firstId}/check-in`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_TODAY');
    expect(res.body.error.message).toBe('Check-in opens on Thu, 26 Nov.');
  });

  it('cancels (student) and blocks further changes', async () => {
    const res = await api.patch(aarav, `/api/appointments/${firstId}/cancel`, { reason: 'Feeling better' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', cancelReason: 'Feeling better', cancelledByRole: 'student' });
    const again = await api.patch(aarav, `/api/appointments/${firstId}/cancel`, {});
    expect(again.status).toBe(409);
    const resched = await api.patch(aarav, `/api/appointments/${firstId}/reschedule`, { date: TOMORROW, startTime: '11:00' });
    expect(resched.body.error.code).toBe('INVALID_STATUS');
    // slot is free again
    const rebook = await book(priya, { doctorId: ids.ritu, date: TOMORROW, startTime: '10:30' });
    expect(rebook.status).toBe(201);
  });
});

describe('consultation flow', () => {
  let apptId: number;
  let apptCode: string;

  it('books → checks in → starts → saves draft → completes with prescription', async () => {
    const booked = await book(aarav, { doctorId: ids.ritu, date: TODAY, startTime: '11:30', reason: 'Fever / cold / flu' });
    expect(booked.status).toBe(201);
    apptId = booked.body.id;
    apptCode = booked.body.code;

    const studentCheckIn = await api.patch(aarav, `/api/appointments/${apptId}/check-in`);
    expect(studentCheckIn.status).toBe(403);
    const early = await api.patch(ritu, `/api/appointments/${apptId}/start`);
    expect(early.body.error.code).toBe('NOT_CHECKED_IN');

    const checkedIn = await api.patch(ritu, `/api/appointments/${apptId}/check-in`);
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body).toMatchObject({ status: 'checked_in', tokenNo: 1 });

    const started = await api.patch(ritu, `/api/appointments/${apptId}/start`);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');
    expect(started.body.consultation).toMatchObject({ status: 'draft', symptoms: [] });
    expect(started.body.patient).toMatchObject({ allergies: ['Penicillin'], bloodGroup: 'B+', age: 21 });

    const draft = await api.put(ritu, `/api/appointments/${apptId}/consultation`, {
      symptoms: ['Fever', 'Sore throat'],
      vitals: { temperature: '100.4 °F', pulse: '92' },
      clinicalNotes: 'Throat congested, no exudate.',
    });
    expect(draft.status).toBe(200);
    expect(draft.body).toMatchObject({ status: 'draft', symptoms: ['Fever', 'Sore throat'], vitals: { temperature: '100.4 °F', pulse: '92' } });

    const bad = await api.post(ritu, `/api/appointments/${apptId}/complete`, {
      consultation: { symptoms: [], clinicalNotes: '' },
    });
    expect(bad.status).toBe(400);

    const badRx = await api.post(ritu, `/api/appointments/${apptId}/complete`, {
      consultation: { symptoms: ['Fever'], diagnosis: 'Acute pharyngitis' },
      prescription: { items: [{ medicineId: ids.cetirizine, dosage: '1 tablet', frequency: 'OD', durationDays: 3, quantity: 3 }] },
    });
    expect(badRx.status).toBe(400); // inactive medicine

    const done = await api.post(ritu, `/api/appointments/${apptId}/complete`, {
      consultation: {
        symptoms: ['Fever', 'Sore throat'],
        vitals: { temperature: '100.4 °F' },
        clinicalNotes: 'Throat congested.',
        diagnosis: 'Acute pharyngitis',
        advice: 'Warm saline gargles, plenty of fluids.',
        followUpDate: '2026-11-30',
      },
      prescription: {
        notes: 'Return if fever persists beyond 3 days.',
        items: [
          { medicineId: ids.paracetamol, dosage: '1 tablet', frequency: 'TDS', durationDays: 3, quantity: 9, instructions: 'After food' },
          { medicineId: ids.amoxicillin, dosage: '1 capsule', frequency: 'BD', durationDays: 5, quantity: 10 },
        ],
      },
    });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(done.body.consultation).toMatchObject({ status: 'completed', diagnosis: 'Acute pharyngitis', followUpDate: '2026-11-30' });
    expect(done.body.prescription.items).toHaveLength(2);
    expect(done.body.prescription.items[1]).toMatchObject({ medicineName: 'Amoxicillin 500 mg', requiresPrescription: true, form: 'Capsule' });
    expect(done.body.prescription.code).toMatch(/^RX-/);
    expect(done.body.prescription.validUntil).toBe('2026-12-25');
    expect(done.body.timeline.map((e: { status: string }) => e.status)).toEqual(['scheduled', 'checked_in', 'in_progress', 'completed']);
  });

  it('student sees the prescription, visit summary and notifications', async () => {
    const rx = await api.get(aarav, '/api/prescriptions');
    expect(rx.body).toHaveLength(1);
    expect(rx.body[0]).toMatchObject({ diagnosis: 'Acute pharyngitis', latestRequest: null });
    expect(rx.body[0].doctor.name).toBe('Dr. Ritu Bassi');
    const single = await api.get(aarav, `/api/prescriptions/${rx.body[0].id}`);
    expect(single.status).toBe(200);
    expect((await api.get(priya, `/api/prescriptions/${rx.body[0].id}`)).status).toBe(404);
    expect((await api.get(staff, `/api/prescriptions/${rx.body[0].id}`)).status).toBe(200);

    const records = await api.get(aarav, '/api/records');
    expect(records.body[0]).toMatchObject({ category: 'visit_summary', source: 'consultation', title: 'Visit summary — Acute pharyngitis' });
    expect(records.body[0].prescriptionId).toBe(rx.body[0].id);

    const notes = db.prepare('SELECT title FROM notifications WHERE user_id = ? ORDER BY id').all(ids.aarav) as { title: string }[];
    const titles = notes.map((n) => n.title);
    expect(titles).toContain("You're checked in — token #1");
    expect(titles).toContain('Consultation completed');
    expect(titles).toContain('New prescription issued');

    const actions = (db.prepare('SELECT action FROM activity_logs').all() as { action: string }[]).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['consultation.started', 'consultation.completed', 'prescription.created']));
  });

  it('rejects a second prescription for the same appointment', async () => {
    const res = await api.post(ritu, '/api/prescriptions', {
      appointmentId: apptId,
      items: [{ medicineId: ids.paracetamol, dosage: '1 tablet', frequency: 'SOS', durationDays: 2, quantity: 4 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRESCRIPTION_EXISTS');
  });

  it('starts a video consultation without check-in and prescribes after completion', async () => {
    const booked = await book(priya, { doctorId: ids.ritu, date: TODAY, startTime: '12:00', mode: 'video', reason: 'Allergy' });
    expect(booked.status).toBe(201);
    const id = booked.body.id;
    const started = await api.patch(ritu, `/api/appointments/${id}/start`);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');
    const done = await api.post(ritu, `/api/appointments/${id}/complete`, {
      consultation: { symptoms: ['Itching'], diagnosis: 'Allergic rhinitis' },
    });
    expect(done.status).toBe(200);
    expect(done.body.prescription).toBeNull();
    const other = await api.post(ajay, '/api/prescriptions', {
      appointmentId: id,
      items: [{ medicineId: ids.paracetamol, dosage: '1 tablet', frequency: 'OD', durationDays: 3, quantity: 3 }],
    });
    expect(other.status).toBe(403);
    const rx = await api.post(ritu, '/api/prescriptions', {
      appointmentId: id,
      notes: 'Avoid dust exposure.',
      items: [{ medicineId: ids.paracetamol, dosage: '1 tablet', frequency: 'OD', durationDays: 3, quantity: 3 }],
    });
    expect(rx.status).toBe(201);
    expect(rx.body).toMatchObject({ appointmentId: id, diagnosis: 'Allergic rhinitis', notes: 'Avoid dust exposure.' });
    const summary = db
      .prepare(`SELECT prescription_id FROM medical_records WHERE appointment_id = ? AND category = 'visit_summary'`)
      .get(id) as { prescription_id: number };
    expect(summary.prescription_id).toBe(rx.body.id);
    const doctorList = await api.get(ritu, '/api/prescriptions');
    expect(doctorList.body).toHaveLength(2);
    const search = await api.get(ritu, '/api/prescriptions?search=pharyngitis');
    expect(search.body).toHaveLength(1);
  });

  it('checks in by code and enforces ownership', async () => {
    const booked = await book(rohan, { doctorId: ids.ajay, date: TODAY, startTime: '09:45' });
    expect(booked.status).toBe(201);
    const wrongDoctor = await api.post(ritu, '/api/appointments/check-in-by-code', { code: booked.body.code });
    expect(wrongDoctor.status).toBe(403);
    const unknown = await api.post(staff, '/api/appointments/check-in-by-code', { code: 'APT-ZZZZZZ' });
    expect(unknown.status).toBe(404);
    const ok = await api.post(staff, '/api/appointments/check-in-by-code', { code: booked.body.code.toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'checked_in', tokenNo: 1 });
    const again = await api.post(staff, '/api/appointments/check-in-by-code', { code: booked.body.code });
    expect(again.status).toBe(409);
    expect((await api.get(ritu, `/api/appointments/${booked.body.id}`)).status).toBe(404);
    // doctor cancels a checked-in appointment
    const cancelled = await api.patch(ajay, `/api/appointments/${booked.body.id}/cancel`, { reason: 'Referred to hospital' });
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancelledByRole: 'doctor' });
    expect(apptCode).toBeTruthy();
  });
});

describe('doctor availability management', () => {
  it('reads and updates the weekly schedule with validation', async () => {
    const state = await api.get(ajay, '/api/doctor/schedule');
    expect(state.body).toMatchObject({ slotMinutes: 15, isAccepting: true, consultationModes: ['in_person'] });
    expect(state.body.schedule).toHaveLength(7);
    const overlap = await api.put(ajay, '/api/doctor/schedule', {
      slotMinutes: 15,
      consultationModes: ['in_person'],
      schedule: [
        { weekday: 1, startTime: '09:00', endTime: '12:00' },
        { weekday: 1, startTime: '11:00', endTime: '13:00' },
      ],
    });
    expect(overlap.status).toBe(400);
    const ok = await api.put(ajay, '/api/doctor/schedule', {
      slotMinutes: 20,
      consultationModes: ['in_person', 'video'],
      schedule: [
        { weekday: 3, startTime: '09:00', endTime: '13:00' },
        { weekday: 4, startTime: '14:00', endTime: '17:00' },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ slotMinutes: 20, consultationModes: ['in_person', 'video'] });
    const slots = await api.get(aarav, `/api/doctors/${ids.ajay}/slots?date=${TOMORROW}`);
    expect(slots.body[0]).toMatchObject({ time: '14:00', endTime: '14:20' });
    expect((await api.get(aarav, '/api/doctor/schedule')).status).toBe(403);
  });

  it('toggles accepting and manages leave', async () => {
    const off = await api.patch(ajay, '/api/doctor/accepting', { isAccepting: false });
    expect(off.body).toEqual({ isAccepting: false });
    const blocked = await book(priya, { doctorId: ids.ajay, date: TOMORROW, startTime: '14:20' });
    expect(blocked.body.error.code).toBe('DOCTOR_UNAVAILABLE');
    await api.patch(ajay, '/api/doctor/accepting', { isAccepting: true });

    const leaveBusy = await api.post(ritu, '/api/doctor/leaves', { date: TOMORROW, reason: 'Conference' });
    expect(leaveBusy.status).toBe(409);
    expect(leaveBusy.body.error.code).toBe('HAS_APPOINTMENTS');

    const leave = await api.post(ritu, '/api/doctor/leaves', { date: '2026-11-27', reason: 'Medical camp' });
    expect(leave.status).toBe(201);
    const slots = await api.get(aarav, `/api/doctors/${ids.ritu}/slots?date=2026-11-27`);
    expect(slots.body.every((s: { reason: string }) => s.reason === 'leave')).toBe(true);
    const onLeave = await book(rohan, { doctorId: ids.ritu, date: '2026-11-27', startTime: '10:00' });
    expect([onLeave.status, onLeave.body.error.code]).toEqual([400, 'DOCTOR_ON_LEAVE']);
    const dup = await api.post(ritu, '/api/doctor/leaves', { date: '2026-11-27' });
    expect(dup.status).toBe(409);
    expect((await api.del(ritu, `/api/doctor/leaves/${leave.body.id}`)).body).toEqual({ ok: true });
    expect((await book(rohan, { doctorId: ids.ritu, date: '2026-11-27', startTime: '10:00' })).status).toBe(201);
  });
});
