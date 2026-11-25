# Smart Dispensary — Build Spec (internal contract for all contributors)

This file is the single source of truth while the app is being built in parallel.
Read it fully before writing code. Do not change shared contracts silently: if you
must deviate, write it in your final report.

## 1. Product
Campus healthcare platform with 4 roles (student, doctor, staff = dispensary staff/pharmacist,
admin). Workflows: doctor discovery, appointment booking/reschedule/cancel with conflict
prevention, check-in + queue tokens, consultation records, prescriptions, medical records with
uploads, medicine catalog + medicine requests (pickup / campus delivery), inventory with stock
movements, low-stock & expiry alerts, emergency assistance requests, notifications,
activity log, admin analytics + user management, **real-time chat student↔doctor** and
**WebRTC video calls** (Socket.IO signaling). Login screen + instant demo role switcher.
Branding: "Smart Dispensary" only — never print an institute/campus name.
No AI features, no GPS, no payments, no SMS. Simulations must be honest (e.g. emergency =
request workflow, it does not auto-dispatch an ambulance).

## 2. Stack (installed — do NOT run npm install / add packages)
- Root: npm workspaces `client`, `server`. Node 22. TypeScript 7 (`tsc` native).
- Server: Express 5, better-sqlite3 (sync API), Socket.IO 4, zod 4, bcryptjs, multer 2, date-fns 4, tsx runtime. Vitest 5 + supertest for tests.
- Client: React 19, Vite 8, Tailwind CSS 4 (CSS-first `@theme`), shadcn-style components on `radix-ui`
  (unified package: `import { Dialog as DialogPrimitive } from "radix-ui"`), lucide-react, react-router 7
  (import everything from `"react-router"`), @tanstack/react-query 5, recharts 3, sonner (toasts),
  date-fns 4, react-hook-form + @hookform/resolvers (zod), qrcode.react, socket.io-client, cmdk.
- Shared code: `/shared/constants.ts`, `/shared/types.ts` — imported as `@shared/constants`, `@shared/types`
  from both client and server. All API payloads use the types in `shared/types.ts`.

## 3. Repository layout & ownership
Only edit files you own. Shared/foundation files are owned by the lead; if you need a change
there, do the minimum and mention it in your report.

```
shared/                      lead (types/constants contract)
server/src/index.ts          lead   (bootstrap)
server/src/app.ts            lead   (route mounting — all routers already mounted)
server/src/db/index.ts       lead   (db connection, initSchema, tx)
server/src/db/schema.sql     lead   (schema — read it, do not change without reporting)
server/src/db/reset.ts       lead
server/src/db/seed/**        SEED agent   (exports seedDatabase(), resetDatabase())
server/src/lib/**            lead   (errors, validate, time, codes, json)
server/src/middleware/**     lead   (auth)
server/src/services/notify.ts, activity.ts, status-events.ts, minis.ts   lead (shared helpers)
server/src/realtime/io.ts    lead   (socket bootstrap, emit helpers)
server/src/realtime/chat.ts, calls.ts   COMMS agent
server/src/routes/auth.ts, me.ts, meta.ts, doctors.ts, doctor-self.ts, appointments.ts,
  prescriptions.ts, patients.ts, records.ts, dashboard.ts, users.ts            CORE agent
server/src/services/<core-domain>*.ts (create as needed)                        CORE agent
server/src/routes/medicines.ts, medicine-requests.ts, emergencies.ts,
  notifications.ts, activity.ts                                                 OPS agent
server/src/services/<ops-domain>*.ts                                            OPS agent
server/src/routes/chat.ts                                                       COMMS agent
server/tests/core.*.test.ts  CORE   | server/tests/ops.*.test.ts OPS | server/tests/comms.*.test.ts COMMS
client/src/**  — see §9 for page ownership
e2e/**         lead
```

## 4. Server conventions
- Every router file default-exports an `express.Router()`; it is already mounted in `app.ts` (see §6 prefixes).
- `req.user` (set by `authenticate`) is `{ id, role, name }` or undefined. Use `requireAuth` and
  `requireRole('doctor', 'admin')` from `server/src/middleware/auth.ts`.
- Validate bodies/queries with zod via `parse(schema, req.body)` from `server/src/lib/validate.ts`
  (throws 400 `VALIDATION_ERROR` with `fields`).
- Throw `AppError` helpers from `server/src/lib/errors.ts`: `badRequest(msg, fields?)`, `notFound(what)`,
  `forbidden(msg?)`, `conflict(code, msg)`, `unauthorized()`. Express 5 forwards async throws to the error
  handler which responds `{ error: { code, message, fields? } }` (see `ApiErrorBody`).
- DB: `import { db, tx } from '../db'` (better-sqlite3, synchronous). Use prepared statements with
  named or positional params. Wrap multi-statement mutations in `tx(() => { ... })`.
  Rows are snake_case; responses are camelCase DTOs from `shared/types.ts`. JSON columns
  (allergies, symptoms, vitals, languages, consultation_modes, meta) via `parseJson()` from `lib/json.ts`.
- Time helpers `server/src/lib/time.ts`: `nowIso()`, `todayStr()`, `currentTime()`, `addDaysStr()`,
  `weekdayOf()`, `toMinutes()`, `fromMinutes()`, `daysBetween()`. Dates are LOCAL `YYYY-MM-DD`, times `HH:MM`.
- Codes: `generateCode('APT', 'appointments')` → `APT-7K3Q9M` (prefixes: APT, RX, MR, EMG).
- Shared helpers (use them for every meaningful event):
  - `notify(userIdOrIds, { type, title, body, link })`, `notifyRole(roleOrRoles, {...})`, `notifyAdminsAndStaff` (see notify.ts)
    — persists + pushes `notification:new` over Socket.IO.
  - `logActivity({ actorId, action, category, description, entityType?, entityId? })` (activity.ts).
  - `addStatusEvent(entityType, entityId, status, note, actorId)` / `getTimeline(entityType, id)` (status-events.ts).
  - `emitInvalidate(keys: string[], userIds?: number[])` (realtime/io.ts) after every mutation, so open
    browser windows refetch. Keys are React Query top-level keys (see §8.4). Omit userIds to broadcast.
  - `getUserMini(id)`, `getStudentMini(id)`, `getDoctorMini(id)`, `getPatientSummary(id)` (minis.ts).
- Notification `link`s are in-app routes: `/student/appointments?open=<id>`, `/doctor/appointments?open=<id>`,
  `/student/prescriptions?open=<id>`, `/student/requests?open=<id>`, `/staff/requests?open=<id>`,
  `/staff/inventory?open=<medicineId>`, `/student/emergency`, `/staff/emergencies?open=<id>`,
  `/admin/emergencies?open=<id>`, `/student/messages?c=<conversationId>`, `/doctor/messages?c=<id>`.
- Activity `action` naming: `<entity>.<verb>` e.g. `appointment.booked`, `appointment.cancelled`,
  `appointment.rescheduled`, `appointment.checked_in`, `consultation.started`, `consultation.completed`,
  `prescription.created`, `medicine_request.submitted|approved|rejected|preparing|ready_for_pickup|out_for_delivery|fulfilled|cancelled`,
  `inventory.medicine_added|medicine_updated|restocked|adjusted|expired_removed`, `emergency.submitted|acknowledged|responder_assigned|resolved`,
  `user.created|updated|activated|deactivated`, `record.uploaded|deleted`, `auth.login`, `profile.updated`,
  `availability.updated`, `call.completed`, `system.demo_reset`. Descriptions are full human sentences,
  e.g. "Aarav Mehta booked an appointment with Dr. Ritu Bassi for 26 Nov, 10:30 AM".
- Tests: in-memory DB (`DB_PATH=:memory:` is set by vitest config). In `beforeAll`, call
  `initSchema()` then `seedDatabase()`; build the app with `createApp()` from `server/src/app.ts` and use
  supertest. Login with seeded demo accounts (password `demo1234`). Never bind fixed ports in tests.
- Running a dev server for manual checks: `PORT=<your port> DB_PATH=data/<agent>.db npx tsx src/index.ts`
  from `server/` (ports: CORE 4101, OPS 4102, COMMS 4103, SEED 4104). Kill it when done.

## 5. Domain rules
### Appointments
- Statuses: scheduled → checked_in → in_progress → completed; scheduled|checked_in → cancelled.
  Video appointments may go scheduled → in_progress directly. Reschedule only while `scheduled`.
- Booking (student only): doctor active + `is_accepting`; mode allowed by doctor; date within today..today+14;
  not on a doctor leave; startTime must be a slot generated from the doctor's schedule for that weekday
  (slot length = slot_minutes, slots start at block start, last slot must end ≤ block end); not in the past
  (today: start > current time); doctor slot free (unique index); student has no other active appointment
  overlapping that time (any doctor) → 409 `STUDENT_CONFLICT`; student has no other active appointment with
  the same doctor that day → 409 `DUPLICATE_BOOKING`; taken slot → 409 `SLOT_TAKEN`.
- Check-in: only on the appointment date; assigns `token_no` = (max token for that doctor/date)+1.
- Start: doctor only, date == today. Creates a draft consultation if missing.
- Complete: doctor only, from in_progress. Saves consultation (status completed), creates a prescription
  when items are given, creates a `visit_summary` medical record, notifies student
  ("Consultation completed", plus "New prescription issued"), activity logs, status events.
- Prescription can also be created afterwards for a completed appointment without one (POST /api/prescriptions).
- `validUntil` = created date + PRESCRIPTION_VALIDITY_DAYS.
### Medicine requests
- Students: OTC items qty 1..MAX_OTC_QUANTITY. Rx items (`requires_prescription`) only when the request carries
  `prescriptionId` of the student's own, unexpired prescription containing that medicine; qty ≤ prescribed qty.
  1..10 distinct items. Delivery needs `deliveryLocation`. Item stock must cover qty at submission (409 `OUT_OF_STOCK`).
  One open request per prescription (409 `DUPLICATE_REQUEST`).
- Transitions: `allowedRequestTransitions()` in shared/constants. Student may cancel in submitted/approved.
  Approve requires current stock ≥ qty for all items (409 `INSUFFICIENT_STOCK`).
- **Stock is deducted exactly once, when status becomes `fulfilled`**, inside a transaction: re-check status,
  check stock for every item (409 `INSUFFICIENT_STOCK`, nothing changes), decrement `medicines.stock_quantity`,
  insert `stock_movements` row type `dispense` (unique index blocks duplicates). Then if stock ≤ min_stock,
  notify staff+admins "Low stock: <name>".
- Every status change: status event, student notification, activity log, invalidate
  `['requests','medicines','dashboard','notifications','activity']`.
### Emergencies
- Student submits → notify all active staff, doctors and admins (type `emergency`). One active (unresolved) emergency per
  student at a time (409 `ACTIVE_EMERGENCY`). Staff/doctor/admin progress via `allowedEmergencyTransitions()`;
  `responder_assigned` requires `responderName`. Student notified on every change.
### Inventory
- `stockStatus`: out_of_stock if qty = 0, low_stock if qty ≤ min_stock, else in_stock.
- `expiryStatus`: expired if expiry < today, expiring if ≤ EXPIRY_WARNING_DAYS days, else ok.
- Every stock change writes a `stock_movements` row with `balance_after`. Stock can never be negative.
### Users / demo
- Users with `is_demo = 1` are the primary demo identities (one per role) and cannot be deactivated. Admins cannot deactivate themselves.
- Deactivated users cannot log in; their sessions are deleted.

## 6. REST API contract (prefix `/api`, JSON, Bearer token auth)
Role abbreviations: S student, D doctor, T staff, A admin. Responses use `shared/types.ts`.

### CORE agent
| Method & path | Roles | Body / query | Response |
|---|---|---|---|
| POST /auth/login | public | `{email,password}` | `LoginResponse` (401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_INACTIVE`) |
| POST /auth/logout | any | – | `{ok:true}` |
| GET /auth/me | any | – | `AuthUser` |
| GET /auth/demo-accounts | public | – | `DemoAccount[]` (is_demo users first, then all other active doctors, then 2 more students) |
| POST /auth/demo-login | public (demo mode) | `{userId}` (must be in demo-accounts list) | `LoginResponse` |
| GET /meta | public | – | `AppMeta` |
| POST /demo/reset | any | – | `LoginResponse` (reseeds DB, re-logs caller as same email or primary demo user of same role; emits `invalidate` all + `demo:reset`) |
| PUT /me/profile | any | role-specific fields (student: everything in StudentProfile except rollNo; plus name, phone. doctor: name, phone, bio, languages, room, qualifications. staff/admin: name, phone, shift) | `AuthUser` |
| PUT /me/password | any | `{currentPassword,newPassword}` | `{ok:true}` |
| GET /doctors | any | `search, specialty, availableToday=1` | `DoctorListItem[]` (active doctors) |
| GET /doctors/specialties | any | – | `string[]` |
| GET /doctors/:id | any | – | `DoctorDetail` |
| GET /doctors/:id/availability | any | `days` (default 14) | `DayAvailability[]` starting today |
| GET /doctors/:id/slots | any | `date` | `Slot[]` (student caller: `own_conflict` when they have an overlapping active appointment) |
| GET /doctor/schedule | D | – | `{slotMinutes,isAccepting,consultationModes,schedule:ScheduleBlock[],leaves:DoctorLeave[]}` |
| PUT /doctor/schedule | D | `{slotMinutes,consultationModes,schedule}` (validate start<end, no overlaps, slotMinutes ∈ 10/15/20/30) | same as GET |
| PATCH /doctor/accepting | D | `{isAccepting}` | `{isAccepting}` |
| POST /doctor/leaves | D | `{date,reason?}` (409 `HAS_APPOINTMENTS` if active appointments that day) | `DoctorLeave` |
| DELETE /doctor/leaves/:id | D | – | `{ok:true}` |
| GET /appointments | any | `scope=upcoming|past|today|all, status, search, date, doctorId, studentId, limit` (S own, D own, T/A all; upcoming asc, others desc) | `Appointment[]` |
| POST /appointments | S | `{doctorId,date,startTime,mode,reason,notes?}` | `Appointment` 201 |
| GET /appointments/:id | owner S, its D, T, A | – | `AppointmentDetail` |
| PATCH /appointments/:id/reschedule | owner S, its D | `{date,startTime}` | `Appointment` |
| PATCH /appointments/:id/cancel | owner S (scheduled), its D, A | `{reason?}` | `Appointment` |
| PATCH /appointments/:id/check-in | its D, T, A | – | `Appointment` |
| POST /appointments/check-in-by-code | D (own), T, A | `{code}` | `Appointment` |
| PATCH /appointments/:id/start | its D | – | `AppointmentDetail` |
| PUT /appointments/:id/consultation | its D (in_progress) | consultation fields (symptoms, vitals, clinicalNotes, observations, diagnosis, advice, followUpDate, followUpNotes) | `Consultation` |
| POST /appointments/:id/complete | its D (in_progress) | `{consultation:{...}, prescription?:{notes?, items:[{medicineId,dosage,frequency,durationDays,quantity,instructions?,notes?}]}}` | `AppointmentDetail` |
| GET /prescriptions | any | `search, studentId` (S own, D own-issued or `studentId` of own patient, T/A all) | `Prescription[]` |
| GET /prescriptions/:id | owner S, D, T, A | – | `Prescription` |
| POST /prescriptions | D | `{appointmentId, notes?, items[]}` (appointment completed/in_progress, own, no existing Rx → 409 `PRESCRIPTION_EXISTS`) | `Prescription` 201 |
| GET /patients | D (own patients), A (all students) | `search` | `PatientSummary[]` |
| GET /patients/:id | D (must have appointment with student), A | – | `PatientDetail` |
| GET /records | S own; D with `studentId` (own patient); A | `studentId, category` | `MedicalRecord[]` |
| POST /records | S (own), D (for own patient via `studentId`) | multipart: `file` (pdf/png/jpg/webp ≤ 5MB), `category,title,recordDate,description?,studentId?` | `MedicalRecord` 201 |
| GET /records/:id/file | same access as record | – | file stream (inline) |
| DELETE /records/:id | uploader (source=upload) | – | `{ok:true}` |
| GET /dashboard/student | S | – | `StudentDashboard` |
| GET /dashboard/doctor | D | – | `DoctorDashboard` |
| GET /dashboard/staff | T, A | – | `StaffDashboard` |
| GET /dashboard/admin | A | – | `AdminDashboard` |
| GET /users | A | `role, search, status=active|inactive` | `UserListItem[]` |
| GET /users/:id | A | – | `UserListItem` |
| POST /users | A | `{role,name,email,phone?,title?,password?, student?, doctor?(+schedule?), staff?}` (409 `EMAIL_TAKEN`) | `UserListItem` 201 |
| PUT /users/:id | A | partial of the above | `UserListItem` |
| PATCH /users/:id/status | A | `{isActive}` (403 `PROTECTED_ACCOUNT` for is_demo or self) | `UserListItem` |

### OPS agent
| Method & path | Roles | Body / query | Response |
|---|---|---|---|
| GET /medicines | any | `search, category, stock=in_stock|low_stock|out_of_stock, expiry=expiring|expired, rx=otc|rx, includeInactive=1 (T/A), sort=name|stock|expiry` | `Medicine[]` |
| GET /medicines/categories | any | – | `{category:string,count:number}[]` |
| GET /medicines/:id | any | – | `Medicine` |
| POST /medicines | T, A | medicine fields + initial `stockQuantity` | `Medicine` 201 (409 `NAME_TAKEN`) |
| PUT /medicines/:id | T, A | medicine fields (not stockQuantity), `isActive` | `Medicine` |
| POST /medicines/:id/adjust | T, A | `{type:'restock'|'adjustment'|'expired_removal', quantity:int, reason?, batchNo?, expiryDate?}` (restock/expired_removal: positive amount; adjustment: signed ≠ 0) | `{medicine:Medicine, movement:StockMovement}` (409 `INSUFFICIENT_STOCK`) |
| GET /medicines/:id/movements | T, A | – | `StockMovement[]` newest first |
| GET /inventory/movements | T, A | `limit` | `StockMovement[]` |
| GET /medicine-requests | S own; T, A all | `status, search, scope=open|closed` | `MedicineRequest[]` newest first |
| GET /medicine-requests/:id | owner S, T, A | – | `MedicineRequest` |
| POST /medicine-requests | S | `{items:[{medicineId,quantity}], prescriptionId?, fulfilment, deliveryLocation?, notes?}` | `MedicineRequest` 201 |
| PATCH /medicine-requests/:id/status | T, A | `{status, note?, rejectionReason?}` | `MedicineRequest` (409 `INVALID_TRANSITION`/`INSUFFICIENT_STOCK`) |
| PATCH /medicine-requests/:id/cancel | owner S | `{reason?}` | `MedicineRequest` |
| GET /emergencies | S own; D, T, A all | `status, scope=active|all` | `Emergency[]` (active first: severity then oldest) |
| GET /emergencies/responders | D, T, A | – | `Responder[]` |
| GET /emergencies/:id | owner S, D, T, A | – | `Emergency` |
| POST /emergencies | S | `{category,severity,description,location,contactPhone,emergencyContact?,additionalInfo?}` | `Emergency` 201 |
| PATCH /emergencies/:id/status | D, T, A | `{status, responderName?, responderPhone?, note?, resolutionNotes?}` | `Emergency` |
| GET /notifications | any | `filter=all|unread, limit` (default 50) | `Notification[]` newest first |
| GET /notifications/unread-count | any | – | `{count:number}` |
| PATCH /notifications/:id/read | owner | – | `{ok:true}` |
| PATCH /notifications/read-all | any | – | `{ok:true}` |
| DELETE /notifications/:id | owner | – | `{ok:true}` |
| DELETE /notifications | any | `scope=read` (deletes the caller's read notifications) | `{ok:true, deleted:number}` |
| GET /activity | A (all); T (inventory, medicine_request, emergency only) | `search, category, role, limit (25), offset` | `Paginated<ActivityLog>` |

### COMMS agent
| Method & path | Roles | Body / query | Response |
|---|---|---|---|
| GET /conversations | S, D | – | `Conversation[]` (by last message desc) |
| POST /conversations | S, D | `{participantId}` (S→doctor id, D→student id; get-or-create) | `Conversation` |
| GET /conversations/:id/messages | participants | `before (message id), limit (50)` | `ChatMessage[]` ascending |
| POST /conversations/:id/messages | participants | `{body}` (1..2000 chars) | `ChatMessage` 201 |
| PATCH /conversations/:id/read | participants | – | `{ok:true}` |
| GET /calls | any | `limit` | `CallLog[]` (own) |

## 7. Realtime contract (Socket.IO, same origin, path `/socket.io`)
- Client connects with `io({ auth: { token } })`. Server (`realtime/io.ts`) authenticates, joins room
  `user:<id>`, tracks presence and calls `registerChatHandlers(io, socket)` and `registerCallHandlers(io, socket)`.
- Server → client events:
  - `notification:new` `Notification` — client shows a toast + refreshes notifications.
  - `invalidate` `{ keys: string[] }` — client invalidates React Query keys `[key]`.
  - `demo:reset` `{}` — data was reseeded; client clears cache (tokens may be invalid → back to login).
  - `presence` `{ userId, online }`.
  - `message:new` `ChatMessage`, `message:read` `{conversationId, readerId, readAt}`, `typing` `{conversationId, userId, isTyping}`.
  - `call:incoming` `{callId, caller: UserMini, appointmentId: number|null, appointmentCode: string|null}`,
    `call:ringing` `{callId, callee: UserMini}`, `call:accepted` `{callId}`, `call:declined` `{callId}`,
    `call:ended` `{callId, reason: 'hangup'|'timeout'|'cancelled'|'disconnected'}`, `call:signal` `{callId, data}`,
    `call:unavailable` `{reason:'offline'|'busy'|'forbidden'}`.
- Client → server: `typing` `{conversationId,isTyping}`; `call:invite` `{toUserId, appointmentId?}` with ack
  `({callId}|{error})`; `call:accept|call:decline|call:cancel|call:end` `{callId}`; `call:signal` `{callId, data}`
  where data is `{type:'offer'|'answer', sdp}` or `{type:'candidate', candidate}`.
- Calls are only allowed between a student and a doctor. Callee rings on all their open tabs; first accept wins.
  Ring timeout `CALL_RING_TIMEOUT_MS` → missed (notification to callee). Every finished call writes `calls` row and a
  `kind:'call'` message in the pair's conversation (body e.g. "Video call · 4m 12s" or "Missed video call").

## 8. Frontend conventions
### 8.1 Design system ("clinical premium")
- Canvas `bg-background` (#f4f6f9 soft gray), white cards (`bg-card`, `border`, `rounded-xl`, `shadow-xs`),
  deep navy sidebar (#0b1b33), primary teal (`bg-primary` #0d9488, hover #0f766e), emerald for success.
- Fonts: body `font-sans` (Inter Variable); headings `font-display` (Plus Jakarta Sans Variable, semibold,
  tight tracking). Numbers in stats: `tabular-nums`.
- Spacing: page padding handled by the shell; sections `space-y-6`; card padding `p-5`/`p-6`; grid gaps `gap-4`/`gap-6`.
- Status colours (use `StatusBadge`, never hand-roll): scheduled = blue, checked_in = amber, in_progress = violet,
  completed/fulfilled/resolved = emerald, cancelled/rejected = slate/rose, submitted = sky, approved = teal,
  preparing = amber, ready_for_pickup/out_for_delivery = indigo, critical = rose, low stock = amber, out of stock = rose.
- Icons: lucide-react only (no emoji). Icon buttons need `aria-label` or tooltip.
- Every mutation: disable button + spinner while pending, `toast.success()` on success, `toast.error(getErrorMessage(e))` on failure.
  Destructive actions use `ConfirmDialog`. Lists need empty states (`EmptyState`) and loading skeletons.
- Desktop-first (1280–1536 px) but must work down to 375 px: grids collapse, tables scroll horizontally inside their card.
- Never show raw JSON, ids, debug text or "lorem ipsum". Show codes like `APT-7K3Q9M` where users would reference them.

### 8.2 Shared client modules (lead-owned; import, don't fork)
- `@/components/ui/*` shadcn primitives: button (variants default|secondary|outline|ghost|destructive|link|soft; sizes default|sm|lg|icon|icon-sm),
  input, textarea, label, select, dialog, sheet, dropdown-menu, popover, tabs, badge, card, table, tooltip, switch,
  checkbox, separator, skeleton, alert-dialog, command, scroll-area, avatar, radio-group, progress.
- `@/components/app/*` (lead): `PageHeader`, `StatCard`, `StatusBadge`, `ToneBadge`, `EmptyState`, `ConfirmDialog`,
  `UserAvatar`, `SearchInput`, `FilterChips`, `Panel`, `DataTable`, `Timeline`, `ProgressSteps`, `QRPass`,
  `LoadingState`, `ErrorState`, `InfoRow`, `Field`, `TagInput`, `KeyValueGrid`. Signatures are in `client/src/components/app/index.ts`.
- `@/lib/api`: `api.get<T>(path, query?)`, `api.post<T>(path, body?)`, `api.put`, `api.patch`, `api.del`,
  `api.upload<T>(path, formData)`, `api.blob(path)`; throws `ApiError` (`status`, `code`, `message`, `fields`).
  Paths are relative to `/api` (e.g. `api.get<Appointment[]>('/appointments', { scope: 'upcoming' })`).
  `getErrorMessage(err)` for toasts.
- `@/lib/format`: `formatDate`, `formatDateLong`, `formatDayLabel` (Today/Tomorrow/Wed 27 Nov), `formatTime` ("2:30 PM"),
  `formatTimeRange`, `formatDateTime`, `timeAgo`, `formatINR`, `formatFileSize`, `initials`, `pluralize`.
- `@/lib/utils`: `cn()`.
- `@/hooks/use-auth`: `useAuth()` → `{ user: AuthUser, logout(), switchToAccount(id), refreshUser() }` (user is non-null inside the app shell).
- `@/lib/socket`: `getSocket()`, `useSocketEvent(event, handler)`.
- `@/features/calls/CallProvider` (COMMS): `useCall()` → `{ startCall(peer: UserMini, opts?: { appointmentId?: number }): void, status }`.
- Toasts: `import { toast } from 'sonner'`.
### 8.3 Data fetching
- React Query in feature-local hook files (e.g. `features/appointments/api.ts`). `staleTime` default 15s (global).
- After mutations: `queryClient.invalidateQueries({ queryKey: ['appointments'] })` etc. for affected keys.
### 8.4 Query keys (first element MUST be one of these — server `invalidate` events use them)
`me`, `meta`, `dashboard`, `doctors`, `doctor`, `slots`, `availability`, `schedule`, `appointments`, `appointment`,
`prescriptions`, `prescription`, `patients`, `patient`, `records`, `medicines`, `medicine`, `movements`,
`requests`, `request`, `emergencies`, `emergency`, `responders`, `notifications`, `activity`, `users`,
`conversations`, `messages`, `calls`.

## 9. Frontend routes & page ownership
Routes are already registered in `client/src/App.tsx` (lead). Each page file default-exports its component.
Pages render inside the AppShell (sidebar + topbar); start each page with `<PageHeader>`.
Deep links: `?open=<id>` opens that item's detail sheet/dialog.

| Route | File | Owner |
|---|---|---|
| /student | features/student/StudentDashboardPage.tsx | STUDENT-A |
| /student/doctors | features/doctors/DoctorDirectoryPage.tsx | STUDENT-A |
| /student/doctors/:id | features/doctors/DoctorProfilePage.tsx | STUDENT-A |
| /student/book (`?doctorId=&date=`) | features/appointments/BookAppointmentPage.tsx | STUDENT-A |
| /student/appointments (`?open=`) | features/appointments/StudentAppointmentsPage.tsx | STUDENT-A |
| /:role/profile | features/profile/ProfilePage.tsx (role-aware) | STUDENT-A |
| /student/prescriptions (`?open=`) | features/prescriptions/StudentPrescriptionsPage.tsx | STUDENT-B |
| /student/records | features/records/MedicalRecordsPage.tsx | STUDENT-B |
| /student/medicines (`?prescription=<id>`) | features/medicines/MedicineCatalogPage.tsx | STUDENT-B |
| /student/requests (`?open=`) | features/medicines/MyRequestsPage.tsx | STUDENT-B |
| /student/emergency | features/emergency/StudentEmergencyPage.tsx | STUDENT-B |
| /doctor | features/doctor/DoctorDashboardPage.tsx | DOCTOR |
| /doctor/appointments (`?open=`) | features/doctor/DoctorAppointmentsPage.tsx | DOCTOR |
| /doctor/consultation/:appointmentId | features/consultation/ConsultationPage.tsx | DOCTOR |
| /doctor/patients | features/doctor/PatientsPage.tsx | DOCTOR |
| /doctor/patients/:id | features/doctor/PatientDetailPage.tsx | DOCTOR |
| /doctor/prescriptions (`?open=`) | features/doctor/DoctorPrescriptionsPage.tsx | DOCTOR |
| /doctor/availability | features/doctor/AvailabilityPage.tsx | DOCTOR |
| /staff | features/staff/StaffDashboardPage.tsx | OPS-UI |
| /staff/requests, /admin/requests (`?open=`) | features/staff/RequestsManagementPage.tsx | OPS-UI |
| /staff/inventory, /admin/inventory (`?open=`) | features/inventory/InventoryPage.tsx | OPS-UI |
| /staff/emergencies, /admin/emergencies (`?open=`) | features/emergency/EmergencyManagementPage.tsx | OPS-UI |
| /admin | features/admin/AdminDashboardPage.tsx | OPS-UI |
| /admin/users | features/admin/UsersPage.tsx | OPS-UI |
| /admin/appointments | features/admin/AdminAppointmentsPage.tsx | OPS-UI |
| /admin/activity | features/admin/ActivityLogPage.tsx | OPS-UI |
| /student/messages, /doctor/messages (`?c=`) | features/chat/MessagesPage.tsx | COMMS |
| (global) call UI | features/calls/* (CallProvider, IncomingCallDialog, CallWindow) | COMMS |
| /:role/notifications | features/notifications/NotificationsPage.tsx | lead |
| /login | features/auth/LoginPage.tsx | lead |

Shared prescription view: STUDENT-B owns `features/prescriptions/PrescriptionView.tsx` (printable card used by student
and doctor pages; DOCTOR may import it). Shared appointment detail building blocks used by more than one owner
should live in the owner's folder and be imported, not copied.

## 10. Seed data (SEED agent) — summary
Real health-centre roster (public data) for doctors/staff/admin, fictional students. Emails `first.last@smartdispensary.in`.
All passwords `demo1234` (hash once, reuse). Dates relative to the seed day so dashboards always look current.
Primary demo identities (`is_demo=1`): student **Aarav Mehta**, doctor **Dr. Ritu Bassi**, staff **Abhishek Bhardwaj**,
admin **Dr. Vishal Srivastava** (Faculty-in-Charge, Health Centre). Full details in the SEED agent brief.
