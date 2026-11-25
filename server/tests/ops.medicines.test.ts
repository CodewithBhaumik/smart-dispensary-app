import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Medicine, StockMovement } from '@shared/types';
import { addDaysStr, todayStr } from '../src/lib/time';
import { auth, bootstrap, createMed, createUser, notificationCount, stockOf, type TestUser } from './ops-helpers';

let app: ReturnType<typeof bootstrap>;
let student: TestUser;
let staff: TestUser;
let admin: TestUser;
const ids: Record<string, number> = {};

beforeAll(() => {
  app = bootstrap();
  student = createUser('student');
  staff = createUser('staff');
  admin = createUser('admin');
  createUser('doctor');
  const t = todayStr();
  ids.normal = createMed({ name: 'Zeta Normal 500 mg', stock: 100, min: 10, expiry: addDaysStr(t, 400) });
  ids.low = createMed({ name: 'Zeta Low Syrup', stock: 5, min: 10, category: 'Cough & Respiratory' });
  ids.out = createMed({ name: 'Zeta Out Cream', stock: 0, min: 5, category: 'Skin Care' });
  ids.expiring = createMed({ name: 'Zeta Expiring Drops', stock: 40, min: 5, expiry: addDaysStr(t, 30), category: 'Eye & Ear' });
  ids.expired = createMed({ name: 'Zeta Expired Tabs', stock: 20, min: 5, expiry: addDaysStr(t, -5) });
  ids.rx = createMed({ name: 'Zeta Rx Capsule', stock: 50, min: 10, rx: true, category: 'Antibiotics' });
  ids.inactive = createMed({ name: 'Zeta Inactive Gel', stock: 30, min: 5, active: false, category: 'Skin Care' });
});

const names = (list: Medicine[]) => list.map((m) => m.name).sort();

describe('medicine catalogue', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/medicines').expect(401);
  });

  it('computes stock and expiry status', async () => {
    const res = await request(app).get('/api/medicines').query({ search: 'Zeta' }).set(auth(student.token)).expect(200);
    const list = res.body as Medicine[];
    expect(list).toHaveLength(6); // inactive hidden from students
    const byName = Object.fromEntries(list.map((m) => [m.name, m]));
    expect(byName['Zeta Normal 500 mg'].stockStatus).toBe('in_stock');
    expect(byName['Zeta Normal 500 mg'].expiryStatus).toBe('ok');
    expect(byName['Zeta Low Syrup'].stockStatus).toBe('low_stock');
    expect(byName['Zeta Out Cream'].stockStatus).toBe('out_of_stock');
    expect(byName['Zeta Expiring Drops'].expiryStatus).toBe('expiring');
    expect(byName['Zeta Expiring Drops'].daysToExpiry).toBe(30);
    expect(byName['Zeta Expired Tabs'].expiryStatus).toBe('expired');
    expect(byName['Zeta Rx Capsule'].requiresPrescription).toBe(true);
    expect(typeof byName['Zeta Normal 500 mg'].unitPrice).toBe('number');
  });

  it('filters by stock, expiry, prescription and category', async () => {
    const get = (query: Record<string, string>) =>
      request(app)
        .get('/api/medicines')
        .query({ search: 'Zeta', ...query })
        .set(auth(staff.token))
        .then((r) => names(r.body as Medicine[]));
    expect(await get({ stock: 'low_stock' })).toEqual(['Zeta Low Syrup']);
    expect(await get({ stock: 'out_of_stock' })).toEqual(['Zeta Out Cream']);
    expect(await get({ stock: 'in_stock' })).toEqual(
      ['Zeta Expired Tabs', 'Zeta Expiring Drops', 'Zeta Normal 500 mg', 'Zeta Rx Capsule'].sort(),
    );
    expect(await get({ expiry: 'expiring' })).toEqual(['Zeta Expiring Drops']);
    expect(await get({ expiry: 'expired' })).toEqual(['Zeta Expired Tabs']);
    expect(await get({ rx: 'rx' })).toEqual(['Zeta Rx Capsule']);
    expect(await get({ rx: 'otc' })).not.toContain('Zeta Rx Capsule');
    expect(await get({ category: 'Skin Care' })).toEqual(['Zeta Out Cream']);
    expect(await get({ category: 'Skin Care', includeInactive: '1' })).toEqual(['Zeta Inactive Gel', 'Zeta Out Cream']);
  });

  it('sorts by stock (lowest first)', async () => {
    const res = await request(app)
      .get('/api/medicines')
      .query({ search: 'Zeta', sort: 'stock' })
      .set(auth(staff.token))
      .expect(200);
    expect((res.body as Medicine[])[0].name).toBe('Zeta Out Cream');
  });

  it('never shows inactive medicines to students', async () => {
    const list = await request(app)
      .get('/api/medicines')
      .query({ search: 'Zeta', includeInactive: '1' })
      .set(auth(student.token))
      .expect(200);
    expect(names(list.body)).not.toContain('Zeta Inactive Gel');
    await request(app).get(`/api/medicines/${ids.inactive}`).set(auth(student.token)).expect(404);
    const staffView = await request(app).get(`/api/medicines/${ids.inactive}`).set(auth(staff.token)).expect(200);
    expect(staffView.body.isActive).toBe(false);
  });

  it('lists categories with counts', async () => {
    const res = await request(app).get('/api/medicines/categories').set(auth(student.token)).expect(200);
    const skin = (res.body as { category: string; count: number }[]).find((c) => c.category === 'Skin Care');
    expect(skin?.count).toBe(1); // inactive gel not counted
  });
});

describe('inventory management', () => {
  it('creates a medicine with an opening-stock movement', async () => {
    const res = await request(app)
      .post('/api/medicines')
      .set(auth(staff.token))
      .send({
        name: 'Zeta Created Tablet',
        genericName: 'Zetamol',
        category: 'Pain & Fever',
        form: 'Tablet',
        strength: '250 mg',
        unit: 'strip of 10',
        requiresPrescription: false,
        stockQuantity: 60,
        minStock: 15,
        batchNo: 'ZC-01',
        expiryDate: addDaysStr(todayStr(), 300),
        manufacturer: 'Zeta Labs',
        unitPrice: 18,
      })
      .expect(201);
    const med = res.body as Medicine;
    expect(med.stockQuantity).toBe(60);
    expect(med.stockStatus).toBe('in_stock');
    ids.created = med.id;
    const moves = await request(app).get(`/api/medicines/${med.id}/movements`).set(auth(staff.token)).expect(200);
    expect(moves.body).toHaveLength(1);
    expect((moves.body as StockMovement[])[0]).toMatchObject({ type: 'initial', quantityChange: 60, balanceAfter: 60 });
  });

  it('rejects duplicate names (case-insensitive) and invalid input', async () => {
    const dup = await request(app)
      .post('/api/medicines')
      .set(auth(staff.token))
      .send({ name: 'zeta created tablet', category: 'Pain & Fever', form: 'Tablet', unit: 'strip of 10' })
      .expect(409);
    expect(dup.body.error.code).toBe('NAME_TAKEN');
    const bad = await request(app).post('/api/medicines').set(auth(admin.token)).send({ category: 'x' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.fields).toHaveProperty('name');
  });

  it('forbids students from managing inventory', async () => {
    await request(app)
      .post('/api/medicines')
      .set(auth(student.token))
      .send({ name: 'Nope', category: 'Pain & Fever', form: 'Tablet', unit: 'strip' })
      .expect(403);
    await request(app)
      .post(`/api/medicines/${ids.normal}/adjust`)
      .set(auth(student.token))
      .send({ type: 'restock', quantity: 5 })
      .expect(403);
    await request(app).get(`/api/medicines/${ids.normal}/movements`).set(auth(student.token)).expect(403);
    await request(app).get('/api/inventory/movements').set(auth(student.token)).expect(403);
  });

  it('updates details without touching stock or unsent fields', async () => {
    const res = await request(app)
      .put(`/api/medicines/${ids.created}`)
      .set(auth(staff.token))
      .send({ minStock: 20, description: 'Pain relief', stockQuantity: 999 })
      .expect(200);
    expect(res.body).toMatchObject({ minStock: 20, description: 'Pain relief', stockQuantity: 60, genericName: 'Zetamol' });
    const conflict = await request(app)
      .put(`/api/medicines/${ids.created}`)
      .set(auth(staff.token))
      .send({ name: 'Zeta Normal 500 mg' })
      .expect(409);
    expect(conflict.body.error.code).toBe('NAME_TAKEN');
  });

  it('adjusts stock with an audit trail and never goes negative', async () => {
    const id = ids.created;
    const restock = await request(app)
      .post(`/api/medicines/${id}/adjust`)
      .set(auth(staff.token))
      .send({ type: 'restock', quantity: 50, batchNo: 'ZC-02', expiryDate: addDaysStr(todayStr(), 500) })
      .expect(200);
    expect(restock.body.medicine.stockQuantity).toBe(110);
    expect(restock.body.medicine.batchNo).toBe('ZC-02');
    expect(restock.body.movement).toMatchObject({ type: 'restock', quantityChange: 50, balanceAfter: 110 });

    await request(app)
      .post(`/api/medicines/${id}/adjust`)
      .set(auth(staff.token))
      .send({ type: 'adjustment', quantity: -10, reason: 'Damaged strips' })
      .expect(200);
    await request(app)
      .post(`/api/medicines/${id}/adjust`)
      .set(auth(admin.token))
      .send({ type: 'expired_removal', quantity: 5 })
      .expect(200);
    expect(stockOf(id)).toBe(95);

    const tooMuch = await request(app)
      .post(`/api/medicines/${id}/adjust`)
      .set(auth(staff.token))
      .send({ type: 'adjustment', quantity: -96 })
      .expect(409);
    expect(tooMuch.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(stockOf(id)).toBe(95);

    await request(app).post(`/api/medicines/${id}/adjust`).set(auth(staff.token)).send({ type: 'adjustment', quantity: 0 }).expect(400);
    await request(app).post(`/api/medicines/${id}/adjust`).set(auth(staff.token)).send({ type: 'restock', quantity: -3 }).expect(400);
    await request(app).post(`/api/medicines/${id}/adjust`).set(auth(staff.token)).send({ type: 'bogus', quantity: 3 }).expect(400);

    const moves = (await request(app).get(`/api/medicines/${id}/movements`).set(auth(staff.token)).expect(200))
      .body as StockMovement[];
    expect(moves.map((m) => m.type)).toEqual(['expired_removal', 'adjustment', 'restock', 'initial']);
    expect(moves.map((m) => m.balanceAfter)).toEqual([95, 100, 110, 60]);
    expect(moves[1].reason).toBe('Damaged strips');
    expect(moves[0].performedBy?.id).toBe(admin.id);

    const recent = await request(app).get('/api/inventory/movements').query({ limit: 2 }).set(auth(staff.token)).expect(200);
    expect(recent.body).toHaveLength(2);
  });

  it('alerts staff and admins only when stock crosses the minimum', async () => {
    const id = createMed({ name: 'Zeta Threshold Tabs', stock: 20, min: 10 });
    const staffBefore = notificationCount(staff.id);
    const adminBefore = notificationCount(admin.id);
    const adjust = (quantity: number) =>
      request(app).post(`/api/medicines/${id}/adjust`).set(auth(staff.token)).send({ type: 'adjustment', quantity }).expect(200);

    await adjust(-9); // 11 — still above minimum
    expect(notificationCount(staff.id)).toBe(staffBefore);
    await adjust(-2); // 9 — crosses into low stock
    expect(notificationCount(staff.id)).toBe(staffBefore + 1);
    expect(notificationCount(admin.id)).toBe(adminBefore + 1);
    await adjust(-1); // 8 — already low, no repeat alert
    expect(notificationCount(staff.id)).toBe(staffBefore + 1);
  });
});
