import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MedicineRequest } from '@shared/types';
import { db } from '../src/db';
import { addDaysStr, todayStr } from '../src/lib/time';
import {
  auth,
  bootstrap,
  createMed,
  createPrescription,
  createUser,
  dispenseCount,
  latestNotification,
  notificationCount,
  stockOf,
  type TestUser,
} from './ops-helpers';

let app: ReturnType<typeof bootstrap>;
let studentA: TestUser;
let studentB: TestUser;
let staff: TestUser;
let admin: TestUser;
let doctor: TestUser;
const med: Record<string, number> = {};
let rxA: { id: number; code: string };
let expiredRx: { id: number; code: string };

beforeAll(() => {
  app = bootstrap();
  studentA = createUser('student', 'Aarav Test');
  studentB = createUser('student', 'Diya Test');
  staff = createUser('staff', 'Pharmacist Test');
  admin = createUser('admin');
  doctor = createUser('doctor', 'Dr. Test');
  med.otc1 = createMed({ name: 'Req Paracetamol', stock: 100, min: 10 });
  med.otc2 = createMed({ name: 'Req ORS Sachet', stock: 50, min: 5, unit: 'sachet' });
  med.rx1 = createMed({ name: 'Req Amoxicillin', stock: 40, min: 10, rx: true });
  med.low = createMed({ name: 'Req Low Lozenge', stock: 3, min: 2 });
  med.out = createMed({ name: 'Req Out Gel', stock: 0, min: 2 });
  med.inactive = createMed({ name: 'Req Inactive', stock: 30, active: false });
  rxA = createPrescription(studentA.id, doctor.id, [
    { medicineId: med.rx1, quantity: 10 },
    { medicineId: med.otc1, quantity: 10 },
  ]);
  expiredRx = createPrescription(studentA.id, doctor.id, [{ medicineId: med.rx1, quantity: 5 }], addDaysStr(todayStr(), -1));
});

const create = (user: TestUser, body: Record<string, unknown>) =>
  request(app).post('/api/medicine-requests').set(auth(user.token)).send(body);
const setStatus = (id: number, body: Record<string, unknown>, user: TestUser = staff) =>
  request(app).patch(`/api/medicine-requests/${id}/status`).set(auth(user.token)).send(body);

describe('creating medicine requests', () => {
  it('enforces the OTC quantity limit', async () => {
    const res = await create(studentA, { items: [{ medicineId: med.otc1, quantity: 6 }], fulfilment: 'pickup' }).expect(400);
    expect(res.body.error.code).toBe('QUANTITY_LIMIT');
  });

  it('requires a prescription for Rx medicines', async () => {
    const res = await create(studentA, { items: [{ medicineId: med.rx1, quantity: 1 }], fulfilment: 'pickup' }).expect(409);
    expect(res.body.error.code).toBe('PRESCRIPTION_REQUIRED');
  });

  it('rejects out-of-stock and over-stock quantities', async () => {
    const out = await create(studentA, { items: [{ medicineId: med.out, quantity: 1 }], fulfilment: 'pickup' }).expect(409);
    expect(out.body.error.code).toBe('OUT_OF_STOCK');
    const over = await create(studentA, { items: [{ medicineId: med.low, quantity: 4 }], fulfilment: 'pickup' }).expect(409);
    expect(over.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('validates items, delivery location and availability', async () => {
    await create(studentA, { items: [], fulfilment: 'pickup' }).expect(400);
    await create(studentA, {
      items: [
        { medicineId: med.otc1, quantity: 1 },
        { medicineId: med.otc1, quantity: 2 },
      ],
      fulfilment: 'pickup',
    }).expect(400);
    const delivery = await create(studentA, { items: [{ medicineId: med.otc1, quantity: 1 }], fulfilment: 'delivery' }).expect(400);
    expect(delivery.body.error.fields).toHaveProperty('deliveryLocation');
    await create(studentA, { items: [{ medicineId: med.inactive, quantity: 1 }], fulfilment: 'pickup' }).expect(400);
    await create(studentA, { items: [{ medicineId: med.otc1, quantity: 1 }], fulfilment: 'teleport' }).expect(400);
  });

  it('checks prescription ownership, expiry and prescribed quantity', async () => {
    const expired = await create(studentA, {
      items: [{ medicineId: med.rx1, quantity: 1 }],
      prescriptionId: expiredRx.id,
      fulfilment: 'pickup',
    }).expect(409);
    expect(expired.body.error.code).toBe('PRESCRIPTION_EXPIRED');
    const tooMany = await create(studentA, {
      items: [{ medicineId: med.rx1, quantity: 11 }],
      prescriptionId: rxA.id,
      fulfilment: 'pickup',
    }).expect(400);
    expect(tooMany.body.error.code).toBe('QUANTITY_EXCEEDS_PRESCRIPTION');
    await create(studentB, {
      items: [{ medicineId: med.rx1, quantity: 1 }],
      prescriptionId: rxA.id,
      fulfilment: 'pickup',
    }).expect(404);
  });

  it('only lets students submit requests', async () => {
    await create(staff, { items: [{ medicineId: med.otc1, quantity: 1 }], fulfilment: 'pickup' }).expect(403);
  });
});

describe('pickup workflow', () => {
  let requestId: number;

  it('submits a prescription request and alerts staff', async () => {
    const staffBefore = notificationCount(staff.id);
    const res = await create(studentA, {
      items: [
        { medicineId: med.rx1, quantity: 10 },
        { medicineId: med.otc1, quantity: 10 }, // allowed above the OTC limit because it was prescribed
      ],
      prescriptionId: rxA.id,
      fulfilment: 'pickup',
      notes: 'Will collect after class',
    }).expect(201);
    const body = res.body as MedicineRequest;
    requestId = body.id;
    expect(body.code).toMatch(/^MR-[A-Z0-9]{6}$/);
    expect(body.status).toBe('submitted');
    expect(body.totalUnits).toBe(20);
    expect(body.prescription).toEqual({ id: rxA.id, code: rxA.code, doctorName: 'Dr. Test' });
    expect(body.items.map((i) => i.medicineName).sort()).toEqual(['Req Amoxicillin', 'Req Paracetamol']);
    expect(body.items.find((i) => i.medicineId === med.rx1)?.stockAvailable).toBe(40);
    expect(body.timeline).toHaveLength(1);
    expect(notificationCount(staff.id)).toBe(staffBefore + 1);
    expect(latestNotification(studentA.id)?.title).toBe('Medicine request submitted');
  });

  it('blocks a second open request for the same prescription', async () => {
    const res = await create(studentA, {
      items: [{ medicineId: med.rx1, quantity: 1 }],
      prescriptionId: rxA.id,
      fulfilment: 'pickup',
    }).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  it('rejects invalid transitions', async () => {
    const res = await setStatus(requestId, { status: 'fulfilled' }).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    await setStatus(requestId, { status: 'approved' }, studentA).expect(403);
  });

  it('moves through approval, preparation and pickup, deducting stock exactly once', async () => {
    const studentBefore = notificationCount(studentA.id);
    const approved = (await setStatus(requestId, { status: 'approved' }).expect(200)).body as MedicineRequest;
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.handledBy?.id).toBe(staff.id);

    await setStatus(requestId, { status: 'preparing', note: 'Packing now' }).expect(200);
    const wrongBranch = await setStatus(requestId, { status: 'out_for_delivery' }).expect(409);
    expect(wrongBranch.body.error.code).toBe('INVALID_TRANSITION');
    const ready = (await setStatus(requestId, { status: 'ready_for_pickup' }).expect(200)).body as MedicineRequest;
    expect(ready.readyAt).toBeTruthy();
    expect(latestNotification(studentA.id)?.body).toContain(ready.code);
    expect(stockOf(med.rx1)).toBe(40); // nothing deducted before fulfilment
    expect(stockOf(med.otc1)).toBe(100);

    const fulfilled = (await setStatus(requestId, { status: 'fulfilled' }).expect(200)).body as MedicineRequest;
    expect(fulfilled.status).toBe('fulfilled');
    expect(fulfilled.fulfilledAt).toBeTruthy();
    expect(stockOf(med.rx1)).toBe(30);
    expect(stockOf(med.otc1)).toBe(90);
    expect(dispenseCount(requestId)).toBe(2);
    expect(fulfilled.timeline.map((e) => e.status)).toEqual([
      'submitted',
      'approved',
      'preparing',
      'ready_for_pickup',
      'fulfilled',
    ]);
    expect(notificationCount(studentA.id)).toBe(studentBefore + 4);
    expect(latestNotification(studentA.id)?.title).toBe('Medicine request fulfilled');

    const movements = db
      .prepare("SELECT reference, quantity_change, balance_after FROM stock_movements WHERE request_id = ? ORDER BY medicine_id")
      .all(requestId) as { reference: string; quantity_change: number; balance_after: number }[];
    expect(movements.every((m) => m.reference === fulfilled.code)).toBe(true);
    expect(movements.map((m) => m.quantity_change).sort()).toEqual([-10, -10]);
  });

  it('cannot fulfil twice', async () => {
    const again = await setStatus(requestId, { status: 'fulfilled' }).expect(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
    expect(stockOf(med.rx1)).toBe(30);
    expect(stockOf(med.otc1)).toBe(90);
    expect(dispenseCount(requestId)).toBe(2);
  });
});

describe('stock safety', () => {
  let requestId: number;

  it('refuses approval when stock no longer covers the request', async () => {
    const res = await create(studentB, { items: [{ medicineId: med.otc2, quantity: 5 }], fulfilment: 'pickup' }).expect(201);
    requestId = res.body.id;
    await request(app)
      .post(`/api/medicines/${med.otc2}/adjust`)
      .set(auth(staff.token))
      .send({ type: 'adjustment', quantity: -47, reason: 'Water damage' })
      .expect(200);
    expect(stockOf(med.otc2)).toBe(3);
    const approve = await setStatus(requestId, { status: 'approved' }).expect(409);
    expect(approve.body.error.code).toBe('INSUFFICIENT_STOCK');
    const after = await request(app).get(`/api/medicine-requests/${requestId}`).set(auth(staff.token)).expect(200);
    expect(after.body.status).toBe('submitted');
  });

  it('refuses fulfilment (changing nothing) when stock dropped after approval', async () => {
    await request(app).post(`/api/medicines/${med.otc2}/adjust`).set(auth(staff.token)).send({ type: 'restock', quantity: 10 }).expect(200);
    await setStatus(requestId, { status: 'approved' }).expect(200);
    await setStatus(requestId, { status: 'preparing' }).expect(200);
    await setStatus(requestId, { status: 'ready_for_pickup' }).expect(200);
    await request(app)
      .post(`/api/medicines/${med.otc2}/adjust`)
      .set(auth(staff.token))
      .send({ type: 'adjustment', quantity: -11 })
      .expect(200);
    expect(stockOf(med.otc2)).toBe(2);
    const res = await setStatus(requestId, { status: 'fulfilled' }).expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(stockOf(med.otc2)).toBe(2);
    expect(dispenseCount(requestId)).toBe(0);
    const after = await request(app).get(`/api/medicine-requests/${requestId}`).set(auth(staff.token)).expect(200);
    expect(after.body.status).toBe('ready_for_pickup');
  });
});

describe('rejection, cancellation and delivery', () => {
  it('requires a reason to reject and notifies the student', async () => {
    const created = await create(studentB, { items: [{ medicineId: med.otc1, quantity: 2 }], fulfilment: 'pickup' }).expect(201);
    const noReason = await setStatus(created.body.id, { status: 'rejected' }).expect(400);
    expect(noReason.body.error.fields).toHaveProperty('rejectionReason');
    const rejected = await setStatus(created.body.id, {
      status: 'rejected',
      rejectionReason: 'Please consult a doctor first',
    }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'rejected', rejectionReason: 'Please consult a doctor first' });
    expect(rejected.body.rejectedAt).toBeTruthy();
    expect(latestNotification(studentB.id)?.title).toBe('Medicine request rejected');
  });

  it('lets students cancel only their own early-stage requests', async () => {
    const first = await create(studentB, { items: [{ medicineId: med.otc1, quantity: 1 }], fulfilment: 'pickup' }).expect(201);
    await request(app).patch(`/api/medicine-requests/${first.body.id}/cancel`).set(auth(studentA.token)).send({}).expect(404);
    await request(app).patch(`/api/medicine-requests/${first.body.id}/cancel`).set(auth(staff.token)).send({}).expect(403);
    const cancelled = await request(app)
      .patch(`/api/medicine-requests/${first.body.id}/cancel`)
      .set(auth(studentB.token))
      .send({ reason: 'Feeling better' })
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.cancelledAt).toBeTruthy();

    const second = await create(studentB, { items: [{ medicineId: med.otc1, quantity: 1 }], fulfilment: 'pickup' }).expect(201);
    await setStatus(second.body.id, { status: 'approved' }).expect(200);
    await setStatus(second.body.id, { status: 'preparing' }).expect(200);
    const late = await request(app)
      .patch(`/api/medicine-requests/${second.body.id}/cancel`)
      .set(auth(studentB.token))
      .send({})
      .expect(409);
    expect(late.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('runs the campus delivery branch', async () => {
    const before = stockOf(med.otc1);
    const created = await create(studentA, {
      items: [{ medicineId: med.otc1, quantity: 3 }],
      fulfilment: 'delivery',
      deliveryLocation: 'Hostel J, Room 214',
    }).expect(201);
    const id = created.body.id;
    expect(created.body.deliveryLocation).toBe('Hostel J, Room 214');
    await setStatus(id, { status: 'approved' }, admin).expect(200);
    await setStatus(id, { status: 'preparing' }).expect(200);
    await setStatus(id, { status: 'ready_for_pickup' }).expect(409);
    const out = await setStatus(id, { status: 'out_for_delivery' }).expect(200);
    expect(out.body.dispatchedAt).toBeTruthy();
    expect(latestNotification(studentA.id)?.body).toContain('Hostel J, Room 214');
    await setStatus(id, { status: 'fulfilled' }).expect(200);
    expect(stockOf(med.otc1)).toBe(before - 3);
  });
});

describe('listing and access', () => {
  it('scopes lists by role', async () => {
    const mine = (await request(app).get('/api/medicine-requests').set(auth(studentA.token)).expect(200))
      .body as MedicineRequest[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.student.id === studentA.id)).toBe(true);
    const all = (await request(app).get('/api/medicine-requests').set(auth(staff.token)).expect(200)).body as MedicineRequest[];
    expect(all.some((r) => r.student.id === studentB.id)).toBe(true);
    expect(all.length).toBeGreaterThan(mine.length);
    // newest first
    const times = all.map((r) => r.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    await request(app).get('/api/medicine-requests').set(auth(doctor.token)).expect(403);
  });

  it('filters by search, scope and status', async () => {
    const all = (await request(app).get('/api/medicine-requests').set(auth(staff.token))).body as MedicineRequest[];
    const target = all[0];
    const byCode = (await request(app).get('/api/medicine-requests').query({ search: target.code }).set(auth(staff.token)))
      .body as MedicineRequest[];
    expect(byCode.map((r) => r.id)).toEqual([target.id]);
    const byMedicine = (await request(app).get('/api/medicine-requests').query({ search: 'Amoxicillin' }).set(auth(staff.token)))
      .body as MedicineRequest[];
    expect(byMedicine.length).toBe(1);
    const open = (await request(app).get('/api/medicine-requests').query({ scope: 'open' }).set(auth(staff.token)))
      .body as MedicineRequest[];
    expect(open.every((r) => !['fulfilled', 'rejected', 'cancelled'].includes(r.status))).toBe(true);
    const closed = (await request(app).get('/api/medicine-requests').query({ scope: 'closed' }).set(auth(staff.token)))
      .body as MedicineRequest[];
    expect(closed.every((r) => ['fulfilled', 'rejected', 'cancelled'].includes(r.status))).toBe(true);
    expect(open.length + closed.length).toBe(all.length);
    const fulfilled = (await request(app).get('/api/medicine-requests').query({ status: 'fulfilled' }).set(auth(staff.token)))
      .body as MedicineRequest[];
    expect(fulfilled.length).toBe(2);
  });

  it('hides other students\' requests', async () => {
    const theirs = (await request(app).get('/api/medicine-requests').set(auth(studentB.token))).body as MedicineRequest[];
    await request(app).get(`/api/medicine-requests/${theirs[0].id}`).set(auth(studentA.token)).expect(404);
    await request(app).get(`/api/medicine-requests/${theirs[0].id}`).set(auth(studentB.token)).expect(200);
    await request(app).get(`/api/medicine-requests/${theirs[0].id}`).set(auth(admin.token)).expect(200);
    await request(app).get('/api/medicine-requests/999999').set(auth(admin.token)).expect(404);
  });
});
