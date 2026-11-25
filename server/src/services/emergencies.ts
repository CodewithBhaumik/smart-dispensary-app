/**
 * Emergency assistance workflow: submitted → acknowledged → responder_assigned → resolved.
 * This is a request/coordination workflow — nothing is dispatched automatically.
 */
import { z } from 'zod';
import {
  EMERGENCY_SEVERITIES,
  EMERGENCY_SEVERITY_LABELS,
  EMERGENCY_STATUSES,
  EMERGENCY_STATUS_LABELS,
  NATIONAL_AMBULANCE_NUMBER,
  allowedEmergencyTransitions,
  type EmergencySeverity,
  type EmergencyStatus,
  type Role,
} from '@shared/constants';
import type { Emergency, Responder } from '@shared/types';
import { db, tx } from '../db';
import { generateCode } from '../lib/codes';
import { badRequest, conflict, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { nowIso } from '../lib/time';
import { zOptionalText } from '../lib/validate';
import { emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import { activeUserIds, getStudentMini, getStudentProfileRow, getUserMini, getUserRow } from './minis';
import { notify } from './notify';
import { addStatusEvent, getTimeline } from './status-events';

export interface EmergencyRow {
  id: number;
  code: string;
  student_id: number;
  category: string;
  severity: EmergencySeverity;
  description: string;
  location: string;
  contact_phone: string;
  emergency_contact: string | null;
  additional_info: string | null;
  status: EmergencyStatus;
  responder_name: string | null;
  responder_phone: string | null;
  resolution_notes: string | null;
  handled_by: number | null;
  acknowledged_at: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toEmergency(row: EmergencyRow): Emergency {
  const profile = getStudentProfileRow(row.student_id);
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    severity: row.severity,
    description: row.description,
    location: row.location,
    contactPhone: row.contact_phone,
    emergencyContact: row.emergency_contact,
    additionalInfo: row.additional_info,
    status: row.status,
    responderName: row.responder_name,
    responderPhone: row.responder_phone,
    resolutionNotes: row.resolution_notes,
    acknowledgedAt: row.acknowledged_at,
    assignedAt: row.assigned_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    student: {
      ...getStudentMini(row.student_id),
      bloodGroup: profile?.blood_group ?? null,
      allergies: parseJson<string[]>(profile?.allergies, []),
      conditions: parseJson<string[]>(profile?.conditions, []),
    },
    handledBy: getUserMini(row.handled_by),
    timeline: getTimeline('emergency', row.id),
  };
}

export function getEmergencyRow(id: number): EmergencyRow | null {
  return (db.prepare('SELECT * FROM emergencies WHERE id = ?').get(id) as EmergencyRow | undefined) ?? null;
}

export function getEmergency(id: number): Emergency | null {
  const row = getEmergencyRow(id);
  return row ? toEmergency(row) : null;
}

const SEVERITY_RANK: Record<EmergencySeverity, number> = { critical: 0, high: 1, moderate: 2 };

/** Active first (critical → moderate, then oldest first); resolved afterwards, newest first. */
export function sortEmergencies<T extends { status: EmergencyStatus; severity: EmergencySeverity; createdAt: string }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const aResolved = a.status === 'resolved' ? 1 : 0;
    const bResolved = b.status === 'resolved' ? 1 : 0;
    if (aResolved !== bResolved) return aResolved - bResolved;
    if (!aResolved) {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return a.createdAt.localeCompare(b.createdAt);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export const emergencyListQuery = z.object({
  status: z.string().trim().max(200).optional(),
  scope: z.enum(['active', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type EmergencyListQuery = z.output<typeof emergencyListQuery>;

export function listEmergencies(query: EmergencyListQuery & { studentId?: number }): Emergency[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.studentId) {
    where.push('student_id = ?');
    params.push(query.studentId);
  }
  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is EmergencyStatus => (EMERGENCY_STATUSES as readonly string[]).includes(s));
    if (statuses.length === 0) return [];
    where.push(`status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (query.scope === 'active') where.push("status <> 'resolved'");
  const rows = db
    .prepare(`SELECT * FROM emergencies ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`)
    .all(...params) as EmergencyRow[];
  const sorted = sortEmergencies(rows.map(toEmergency));
  return query.limit ? sorted.slice(0, query.limit) : sorted;
}

/** Unresolved emergencies, most urgent first. */
export function listActiveEmergencies(limit = 20): Emergency[] {
  return listEmergencies({ scope: 'active', limit });
}

export function listResponders(): Responder[] {
  const rows = db
    .prepare(
      `SELECT id, name, title, role, phone, avatar_color FROM users
        WHERE is_active = 1 AND role IN ('staff', 'doctor')
        ORDER BY CASE role WHEN 'staff' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
    )
    .all() as { id: number; name: string; title: string | null; role: Role; phone: string | null; avatar_color: string }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    title: r.title,
    role: r.role,
    phone: r.phone,
    avatarColor: r.avatar_color,
  }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export const createEmergencySchema = z.object({
  category: z.string().trim().min(1, 'Choose the type of emergency.').max(80),
  severity: z.enum(EMERGENCY_SEVERITIES, { message: 'Choose a severity.' }),
  description: z
    .string()
    .trim()
    .min(5, 'Describe what is happening (at least a few words).')
    .max(1000, 'Keep the description under 1000 characters.'),
  location: z.string().trim().min(2, 'Enter where you are on campus.').max(200),
  contactPhone: z
    .string()
    .trim()
    .min(7, 'Enter a phone number we can reach you on.')
    .max(20)
    .regex(/^[+()\d\s-]+$/, 'Enter a valid phone number.'),
  emergencyContact: zOptionalText(200),
  additionalInfo: zOptionalText(1000),
});
export type CreateEmergencyInput = z.output<typeof createEmergencySchema>;

const EMERGENCY_KEYS = ['emergencies', 'emergency', 'dashboard', 'notifications', 'activity'];

export function createEmergency(studentId: number, input: CreateEmergencyInput): Emergency {
  const active = db
    .prepare("SELECT code FROM emergencies WHERE student_id = ? AND status <> 'resolved' LIMIT 1")
    .get(studentId) as { code: string } | undefined;
  if (active) {
    throw conflict(
      'ACTIVE_EMERGENCY',
      `You already have an active emergency request (${active.code}). The health centre team is handling it.`,
    );
  }
  const now = nowIso();
  const student = getUserRow(studentId)!;
  const id = tx(() => {
    const code = generateCode('EMG', 'emergencies', 4);
    const info = db
      .prepare(
        `INSERT INTO emergencies
           (code, student_id, category, severity, description, location, contact_phone, emergency_contact,
            additional_info, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`,
      )
      .run(
        code,
        studentId,
        input.category,
        input.severity,
        input.description,
        input.location,
        input.contactPhone,
        input.emergencyContact,
        input.additionalInfo,
        now,
        now,
      );
    const emergencyId = Number(info.lastInsertRowid);
    addStatusEvent('emergency', emergencyId, 'submitted', null, studentId, now);
    logActivity({
      actorId: studentId,
      action: 'emergency.submitted',
      category: 'emergency',
      description: `${student.name} raised emergency ${code} (${input.category}, ${EMERGENCY_SEVERITY_LABELS[input.severity].toLowerCase()} severity) at ${input.location}`,
      entityType: 'emergency',
      entityId: emergencyId,
      createdAt: now,
    });
    const title = `Emergency: ${input.category}`;
    const body = `${student.name} · ${input.location} · ${EMERGENCY_SEVERITY_LABELS[input.severity]} severity. ${input.description}`.slice(
      0,
      400,
    );
    notify(activeUserIds('staff'), { type: 'emergency', title, body, link: `/staff/emergencies?open=${emergencyId}` });
    notify(activeUserIds('doctor'), { type: 'emergency', title, body, link: `/doctor/emergencies?open=${emergencyId}` });
    notify(activeUserIds('admin'), { type: 'emergency', title, body, link: `/admin/emergencies?open=${emergencyId}` });
    notify(studentId, {
      type: 'emergency',
      title: 'Emergency request sent',
      body: `Request ${code} was sent to the health centre team. Stay where you are and keep your phone reachable. For life-threatening emergencies call ${NATIONAL_AMBULANCE_NUMBER} immediately.`,
      link: '/student/emergency',
    });
    return emergencyId;
  });
  emitInvalidate(EMERGENCY_KEYS);
  return getEmergency(id)!;
}

// ---------------------------------------------------------------------------
// Status updates (doctor / staff / admin)
// ---------------------------------------------------------------------------
export const updateEmergencyStatusSchema = z.object({
  status: z.enum(EMERGENCY_STATUSES, { message: 'Choose a valid status.' }),
  responderName: zOptionalText(120),
  responderPhone: zOptionalText(20),
  note: zOptionalText(500),
  resolutionNotes: zOptionalText(1000),
});
export type UpdateEmergencyStatusInput = z.output<typeof updateEmergencyStatusSchema>;

export function updateEmergencyStatus(id: number, actorId: number, input: UpdateEmergencyStatusInput): Emergency {
  const row = getEmergencyRow(id);
  if (!row) throw notFound('Emergency request');
  const to = input.status;
  if (!allowedEmergencyTransitions(row.status).includes(to)) {
    throw conflict(
      'INVALID_TRANSITION',
      `Cannot change ${row.code} from ${EMERGENCY_STATUS_LABELS[row.status]} to ${EMERGENCY_STATUS_LABELS[to]}.`,
    );
  }
  if (to === 'responder_assigned' && !input.responderName) {
    throw badRequest('Enter the name of the responder being sent.', { responderName: 'Enter the responder name.' });
  }

  const now = nowIso();
  const actor = getUserRow(actorId)!;
  const student = getUserRow(row.student_id)!;
  tx(() => {
    const sets = ['status = ?', 'handled_by = ?', 'updated_at = ?'];
    const params: unknown[] = [to, actorId, now];
    if (to === 'acknowledged' || (to !== 'resolved' && !row.acknowledged_at)) {
      sets.push('acknowledged_at = COALESCE(acknowledged_at, ?)');
      params.push(now);
    }
    if (to === 'responder_assigned') {
      sets.push('assigned_at = ?', 'responder_name = ?', 'responder_phone = ?');
      params.push(now, input.responderName, input.responderPhone);
    }
    if (to === 'resolved') {
      sets.push('resolved_at = ?', 'resolution_notes = ?');
      params.push(now, input.resolutionNotes ?? input.note);
    }
    const res = db
      .prepare(`UPDATE emergencies SET ${sets.join(', ')} WHERE id = ? AND status = ?`)
      .run(...params, id, row.status);
    if (res.changes === 0) {
      throw conflict('INVALID_TRANSITION', `${row.code} was just updated by someone else. Refresh and try again.`);
    }

    const note =
      to === 'responder_assigned'
        ? `Responder: ${input.responderName}${input.responderPhone ? ` (${input.responderPhone})` : ''}${input.note ? ` — ${input.note}` : ''}`
        : to === 'resolved'
          ? input.resolutionNotes ?? input.note
          : input.note;
    addStatusEvent('emergency', id, to, note, actorId, now);

    const description =
      to === 'acknowledged'
        ? `${actor.name} acknowledged emergency ${row.code} for ${student.name}`
        : to === 'responder_assigned'
          ? `${actor.name} assigned ${input.responderName} to emergency ${row.code} for ${student.name}`
          : `${actor.name} marked emergency ${row.code} for ${student.name} as resolved`;
    logActivity({
      actorId,
      action: `emergency.${to}`,
      category: 'emergency',
      description,
      entityType: 'emergency',
      entityId: id,
      createdAt: now,
    });

    const message =
      to === 'acknowledged'
        ? {
            title: 'Emergency acknowledged',
            body: `The health centre team has acknowledged request ${row.code} and is arranging help. Keep your phone reachable.`,
          }
        : to === 'responder_assigned'
          ? {
              title: 'Help is on the way',
              body: `${input.responderName} has been assigned to request ${row.code}${
                input.responderPhone ? ` and can be reached on ${input.responderPhone}` : ''
              }. Stay where you are if it is safe.`,
            }
          : {
              title: 'Emergency resolved',
              body: `Request ${row.code} has been marked resolved.${
                input.resolutionNotes ?? input.note ? ` Notes: ${input.resolutionNotes ?? input.note}` : ''
              }`,
            };
    notify(row.student_id, { type: 'emergency', ...message, link: '/student/emergency' });
  });
  emitInvalidate(EMERGENCY_KEYS);
  return getEmergency(id)!;
}
