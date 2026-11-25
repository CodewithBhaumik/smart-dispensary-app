# Smart Dispensary — API reference

All endpoints are served under `/api`, exchange JSON and use `Authorization: Bearer <token>` (obtained from
`POST /api/auth/login`). Response shapes are the TypeScript types in [`shared/types.ts`](../shared/types.ts);
statuses, labels and workflow transitions are in [`shared/constants.ts`](../shared/constants.ts).
Errors always look like `{ "error": { "code": "SLOT_TAKEN", "message": "…", "fields": { … } } }`.

Role abbreviations: **S** student, **D** doctor, **T** dispensary staff, **A** admin.

## 1. Business rules
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

## 2. REST API (prefix `/api`, JSON, Bearer token auth)
Role abbreviations: S student, D doctor, T staff, A admin. Responses use `shared/types.ts`.

### Core: auth, doctors, appointments, consultations, prescriptions, records, dashboards, users
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

### Pharmacy & operations: medicines, inventory, medicine requests, emergencies, notifications, activity
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

### Communication: chat and calls
| Method & path | Roles | Body / query | Response |
|---|---|---|---|
| GET /conversations | S, D | – | `Conversation[]` (by last message desc) |
| POST /conversations | S, D | `{participantId}` (S→doctor id, D→student id; get-or-create) | `Conversation` |
| GET /conversations/:id/messages | participants | `before (message id), limit (50)` | `ChatMessage[]` ascending |
| POST /conversations/:id/messages | participants | `{body}` (1..2000 chars) | `ChatMessage` 201 |
| PATCH /conversations/:id/read | participants | – | `{ok:true}` |
| GET /calls | any | `limit` | `CallLog[]` (own) |

## 3. Realtime events (Socket.IO, same origin, path `/socket.io`)
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
