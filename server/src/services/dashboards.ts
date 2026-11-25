/**
 * Role dashboards (student / doctor / staff / admin) with KPI and chart series.
 */
import { format } from 'date-fns';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  APPOINTMENT_STATUSES,
  OPEN_REQUEST_STATUSES,
  type AppointmentStatus,
  type FulfilmentMethod,
  type RequestStatus,
} from '@shared/constants';
import type { AdminDashboard, DoctorDashboard, StaffDashboard, StudentDashboard } from '@shared/types';
import { db } from '../db';
import { bool } from '../lib/json';
import { addDaysStr, currentTime, localIso, parseDateStr, todayStr, toMinutes, weekdayOf } from '../lib/time';
import { recentActivity } from './activity';
import { queryAppointments } from './appointments';
import {
  activeEmergencies,
  toMedicineDto,
  toMedicineRequestDto,
  type MedicineRow,
  type RequestRow,
} from './dashboard-dto';
import { getSchedule } from './doctors';
import { getDoctorProfileRow, getStudentProfileRow, getUserRow } from './minis';
import { toNotification, type NotificationRow } from './notify';
import { toPrescription, type PrescriptionRow } from './prescriptions';

const ACTIVE_LIST = ACTIVE_APPOINTMENT_STATUSES.map((s) => `'${s}'`).join(',');
const OPEN_LIST = OPEN_REQUEST_STATUSES.map((s) => `'${s}'`).join(',');

const count = (sql: string, ...params: unknown[]): number => (db.prepare(sql).get(...params) as { c: number }).c ?? 0;

/** [start, end) ISO bounds of a local calendar day. */
const dayBounds = (date: string): [string, string] => [localIso(date, '00:00'), localIso(addDaysStr(date, 1), '00:00')];

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------
export function studentDashboard(studentId: number): StudentDashboard {
  const today = todayStr();
  const upcoming = queryAppointments(
    `a.student_id = ? AND a.date >= ? AND a.status IN (${ACTIVE_LIST})`,
    [studentId, today],
    'a.date ASC, a.start_time ASC',
    5,
  );
  const nextAppointment =
    upcoming.find((a) => a.status === 'in_progress') ?? upcoming.find((a) => a.status === 'checked_in') ?? upcoming[0] ?? null;

  const recentPrescriptions = (
    db
      .prepare('SELECT * FROM prescriptions WHERE student_id = ? ORDER BY created_at DESC, id DESC LIMIT 3')
      .all(studentId) as PrescriptionRow[]
  ).map(toPrescription);

  const activeRequests = (
    db
      .prepare(`SELECT * FROM medicine_requests WHERE student_id = ? AND status IN (${OPEN_LIST}) ORDER BY created_at DESC`)
      .all(studentId) as RequestRow[]
  ).map(toMedicineRequestDto);

  const recentNotifications = (
    db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 5')
      .all(studentId) as NotificationRow[]
  ).map(toNotification);

  const emergencies = activeEmergencies(studentId);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const user = getUserRow(studentId);
  const p = getStudentProfileRow(studentId);
  const fields = [
    user?.phone,
    p?.gender,
    p?.date_of_birth,
    p?.blood_group,
    p?.hostel,
    p?.room,
    p?.emergency_contact_name,
    p?.emergency_contact_phone,
    p?.emergency_contact_relation,
    p?.height_cm,
    p?.weight_kg,
  ];
  const filled = fields.filter((v) => v !== null && v !== undefined && v !== '').length;

  return {
    nextAppointment,
    upcomingAppointments: upcoming,
    recentPrescriptions,
    activeRequests,
    recentNotifications,
    activeEmergency: [...emergencies].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    stats: {
      upcomingAppointments: count(
        `SELECT COUNT(*) AS c FROM appointments WHERE student_id = ? AND date >= ? AND status IN (${ACTIVE_LIST})`,
        studentId,
        today,
      ),
      visitsThisYear: count(
        `SELECT COUNT(*) AS c FROM appointments WHERE student_id = ? AND status = 'completed' AND date >= ? AND date <= ?`,
        studentId,
        yearStart,
        today,
      ),
      activePrescriptions: count(
        'SELECT COUNT(*) AS c FROM prescriptions WHERE student_id = ? AND valid_until >= ?',
        studentId,
        today,
      ),
      requestsInProgress: activeRequests.length,
      unreadNotifications: count('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', studentId),
    },
    profileCompletion: Math.round((filled / fields.length) * 100),
  };
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------
export function doctorDashboard(doctorId: number): DoctorDashboard {
  const today = todayStr();
  const todayQueue = queryAppointments(
    `a.doctor_id = ? AND a.date = ? AND a.status <> 'cancelled'`,
    [doctorId, today],
    'a.start_time ASC',
    200,
  );
  const nowMin = toMinutes(currentTime());
  const waitingByToken = todayQueue
    .filter((a) => a.status === 'checked_in')
    .sort((a, b) => (a.tokenNo ?? 999) - (b.tokenNo ?? 999));
  const nextPatient =
    todayQueue.find((a) => a.status === 'in_progress') ??
    waitingByToken[0] ??
    todayQueue.find((a) => a.status === 'scheduled' && toMinutes(a.startTime) >= nowMin) ??
    todayQueue.find((a) => a.status === 'scheduled') ??
    null;

  const weekEnd = addDaysStr(today, 7);
  const monthStart = `${today.slice(0, 7)}-01`;

  const weeklyConsultations = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysStr(today, i - 6);
    return {
      date,
      completed: count(
        `SELECT COUNT(*) AS c FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'completed'`,
        doctorId,
        date,
      ),
      cancelled: count(
        `SELECT COUNT(*) AS c FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'cancelled'`,
        doctorId,
        date,
      ),
    };
  });

  const profile = getDoctorProfileRow(doctorId);
  const weekday = weekdayOf(today);

  return {
    isAccepting: bool(profile?.is_accepting),
    stats: {
      todayTotal: todayQueue.length,
      waiting: todayQueue.filter((a) => a.status === 'checked_in').length,
      inProgress: todayQueue.filter((a) => a.status === 'in_progress').length,
      completedToday: todayQueue.filter((a) => a.status === 'completed').length,
      upcomingWeek: count(
        `SELECT COUNT(*) AS c FROM appointments WHERE doctor_id = ? AND date > ? AND date <= ? AND status IN (${ACTIVE_LIST})`,
        doctorId,
        today,
        weekEnd,
      ),
      patientsThisMonth: count(
        `SELECT COUNT(DISTINCT student_id) AS c FROM appointments
          WHERE doctor_id = ? AND status = 'completed' AND date >= ? AND date <= ?`,
        doctorId,
        monthStart,
        today,
      ),
    },
    todayQueue,
    nextPatient,
    upcoming: queryAppointments(
      `a.doctor_id = ? AND a.date > ? AND a.date <= ? AND a.status IN (${ACTIVE_LIST})`,
      [doctorId, today, weekEnd],
      'a.date ASC, a.start_time ASC',
      10,
    ),
    weeklyConsultations,
    recentPrescriptions: (
      db
        .prepare('SELECT * FROM prescriptions WHERE doctor_id = ? ORDER BY created_at DESC, id DESC LIMIT 5')
        .all(doctorId) as PrescriptionRow[]
    ).map(toPrescription),
    todaySchedule: getSchedule(doctorId).filter((b) => b.weekday === weekday),
  };
}

// ---------------------------------------------------------------------------
// Staff (dispensary)
// ---------------------------------------------------------------------------
function requestStatusCounts(): Record<RequestStatus, number> {
  const rows = db.prepare('SELECT status, COUNT(*) AS c FROM medicine_requests GROUP BY status').all() as {
    status: RequestStatus;
    c: number;
  }[];
  const out = {} as Record<RequestStatus, number>;
  for (const r of rows) out[r.status] = r.c;
  return out;
}

function activeMedicines() {
  return (db.prepare('SELECT * FROM medicines WHERE is_active = 1 ORDER BY name').all() as MedicineRow[]).map(toMedicineDto);
}

export function staffDashboard(): StaffDashboard {
  const today = todayStr();
  const byStatus = requestStatusCounts();
  const meds = activeMedicines();
  const [todayStart] = dayBounds(today);
  const emergencies = activeEmergencies();

  const dispensedLast7Days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysStr(today, i - 6);
    const [start, end] = dayBounds(date);
    const units = (
      db
        .prepare(
          `SELECT COALESCE(-SUM(quantity_change), 0) AS u FROM stock_movements
            WHERE type = 'dispense' AND created_at >= ? AND created_at < ?`,
        )
        .get(start, end) as { u: number }
    ).u;
    return {
      date,
      units,
      requests: count(
        `SELECT COUNT(*) AS c FROM medicine_requests WHERE status = 'fulfilled' AND fulfilled_at >= ? AND fulfilled_at < ?`,
        start,
        end,
      ),
    };
  });

  return {
    stats: {
      pendingRequests: byStatus.submitted ?? 0,
      inProgress: (byStatus.approved ?? 0) + (byStatus.preparing ?? 0),
      readyForPickup: byStatus.ready_for_pickup ?? 0,
      outForDelivery: byStatus.out_for_delivery ?? 0,
      fulfilledToday: count(
        `SELECT COUNT(*) AS c FROM medicine_requests WHERE status = 'fulfilled' AND fulfilled_at >= ?`,
        todayStart,
      ),
      totalItems: meds.length,
      lowStock: meds.filter((m) => m.stockStatus === 'low_stock').length,
      outOfStock: meds.filter((m) => m.stockStatus === 'out_of_stock').length,
      expiringSoon: meds.filter((m) => m.expiryStatus === 'expiring').length,
      expired: meds.filter((m) => m.expiryStatus === 'expired').length,
      activeEmergencies: emergencies.length,
    },
    actionQueue: (
      db
        .prepare(`SELECT * FROM medicine_requests WHERE status IN (${OPEN_LIST}) ORDER BY created_at ASC LIMIT 8`)
        .all() as RequestRow[]
    ).map(toMedicineRequestDto),
    lowStockItems: meds
      .filter((m) => m.stockStatus !== 'in_stock')
      .sort((a, b) => a.stockQuantity / Math.max(a.minStock, 1) - b.stockQuantity / Math.max(b.minStock, 1))
      .slice(0, 6),
    expiringItems: meds
      .filter((m) => m.expiryStatus !== 'ok')
      .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
      .slice(0, 6),
    recentActivity: recentActivity(8, ['inventory', 'medicine_request', 'emergency']),
    dispensedLast7Days,
    activeEmergencies: emergencies,
  };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export function adminDashboard(): AdminDashboard {
  const today = todayStr();
  const meds = activeMedicines();
  const byStatus = requestStatusCounts();
  const emergencies = activeEmergencies();

  const apptStatus = db.prepare('SELECT status, COUNT(*) AS c FROM appointments GROUP BY status').all() as {
    status: AppointmentStatus;
    c: number;
  }[];
  const apptCount = (s: AppointmentStatus) => apptStatus.find((r) => r.status === s)?.c ?? 0;

  // Appointments over the last 30 days
  const from = addDaysStr(today, -29);
  const overRows = db
    .prepare('SELECT date, status, COUNT(*) AS c FROM appointments WHERE date >= ? AND date <= ? GROUP BY date, status')
    .all(from, today) as { date: string; status: AppointmentStatus; c: number }[];
  const appointmentsOverTime = Array.from({ length: 30 }, (_, i) => {
    const date = addDaysStr(from, i);
    const rows = overRows.filter((r) => r.date === date);
    const sum = (statuses: AppointmentStatus[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + r.c, 0);
    return {
      date,
      completed: sum(['completed']),
      cancelled: sum(['cancelled']),
      scheduled: sum(['scheduled', 'checked_in', 'in_progress']),
    };
  });

  // Medicine requests per week (8 weeks, weeks start Monday)
  const todayDate = parseDateStr(today);
  const mondayOffset = (todayDate.getDay() + 6) % 7;
  const thisMonday = addDaysStr(today, -mondayOffset);
  const requestsByWeek = Array.from({ length: 8 }, (_, i) => {
    const weekStart = addDaysStr(thisMonday, (i - 7) * 7);
    const start = localIso(weekStart, '00:00');
    const end = localIso(addDaysStr(weekStart, 7), '00:00');
    const rows = db
      .prepare(
        'SELECT fulfilment, COUNT(*) AS c FROM medicine_requests WHERE created_at >= ? AND created_at < ? GROUP BY fulfilment',
      )
      .all(start, end) as { fulfilment: FulfilmentMethod; c: number }[];
    return {
      week: format(parseDateStr(weekStart), 'd MMM'),
      pickup: rows.find((r) => r.fulfilment === 'pickup')?.c ?? 0,
      delivery: rows.find((r) => r.fulfilment === 'delivery')?.c ?? 0,
    };
  });

  const inventoryByCategory = db
    .prepare(
      `SELECT category, COUNT(*) AS items, COALESCE(SUM(stock_quantity), 0) AS units
         FROM medicines WHERE is_active = 1 GROUP BY category ORDER BY items DESC, category ASC`,
    )
    .all() as { category: string; items: number; units: number }[];

  const specialtyDemand = db
    .prepare(
      `SELECT p.specialty AS specialty, COUNT(*) AS count
         FROM appointments a JOIN doctor_profiles p ON p.user_id = a.doctor_id
        WHERE a.status <> 'cancelled'
        GROUP BY p.specialty ORDER BY count DESC`,
    )
    .all() as { specialty: string; count: number }[];

  const hourRows = db
    .prepare(
      `SELECT substr(start_time, 1, 2) AS h, COUNT(*) AS c FROM appointments WHERE status <> 'cancelled' GROUP BY h`,
    )
    .all() as { h: string; c: number }[];
  const peakHours = Array.from({ length: 15 }, (_, i) => {
    const hh = String(8 + i).padStart(2, '0');
    return { hour: `${hh}:00`, count: hourRows.find((r) => r.h === hh)?.c ?? 0 };
  });

  const inventoryValue = meds.reduce((sum, m) => sum + m.stockQuantity * m.unitPrice, 0);

  return {
    kpis: {
      students: count(`SELECT COUNT(*) AS c FROM users WHERE role = 'student'`),
      doctors: count(`SELECT COUNT(*) AS c FROM users WHERE role = 'doctor'`),
      staff: count(`SELECT COUNT(*) AS c FROM users WHERE role = 'staff'`),
      activeUsers: count('SELECT COUNT(*) AS c FROM users WHERE is_active = 1'),
      appointmentsTotal: apptStatus.reduce((s, r) => s + r.c, 0),
      appointmentsPending: apptCount('scheduled') + apptCount('checked_in') + apptCount('in_progress'),
      appointmentsCompleted: apptCount('completed'),
      appointmentsCancelled: apptCount('cancelled'),
      appointmentsToday: count(`SELECT COUNT(*) AS c FROM appointments WHERE date = ? AND status <> 'cancelled'`, today),
      prescriptionsTotal: count('SELECT COUNT(*) AS c FROM prescriptions'),
      requestsTotal: Object.values(byStatus).reduce((s, c) => s + c, 0),
      requestsOpen: OPEN_REQUEST_STATUSES.reduce((s, st) => s + (byStatus[st] ?? 0), 0),
      requestsFulfilled: byStatus.fulfilled ?? 0,
      inventoryItems: meds.length,
      inventoryUnits: meds.reduce((s, m) => s + m.stockQuantity, 0),
      inventoryValue: Math.round(inventoryValue),
      lowStock: meds.filter((m) => m.stockStatus !== 'in_stock').length,
      expiringSoon: meds.filter((m) => m.expiryStatus === 'expiring').length,
      emergenciesTotal: count('SELECT COUNT(*) AS c FROM emergencies'),
      emergenciesActive: emergencies.length,
    },
    appointmentsOverTime,
    statusDistribution: APPOINTMENT_STATUSES.map((status) => ({ status, count: apptCount(status) })),
    requestsByWeek,
    inventoryByCategory,
    specialtyDemand,
    peakHours,
    recentActivity: recentActivity(10),
    activeEmergencies: emergencies,
  };
}

