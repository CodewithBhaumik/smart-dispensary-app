-- Smart Dispensary - SQLite schema
-- Conventions: snake_case columns, INTEGER booleans (0/1),
-- timestamps as ISO-8601 TEXT (UTC, e.g. 2026-11-25T09:30:00.000Z),
-- calendar dates as 'YYYY-MM-DD' and clock times as 'HH:MM' (local time).
-- JSON arrays/objects stored as TEXT (e.g. allergies '["Penicillin"]').

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------------
-- Users & profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  role           TEXT NOT NULL CHECK (role IN ('student','doctor','staff','admin')),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  phone          TEXT,
  title          TEXT,                       -- designation shown under the name
  avatar_color   TEXT NOT NULL DEFAULT '#0d9488',
  is_active      INTEGER NOT NULL DEFAULT 1,
  is_demo        INTEGER NOT NULL DEFAULT 0, -- primary demo identity for its role (protected)
  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,              -- sha256 of the bearer token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id                     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  roll_no                     TEXT NOT NULL UNIQUE,
  department                  TEXT NOT NULL,
  program                     TEXT NOT NULL,
  year                        INTEGER NOT NULL,
  gender                      TEXT,
  date_of_birth               TEXT,
  blood_group                 TEXT,
  hostel                      TEXT,
  room                        TEXT,
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,
  allergies                   TEXT NOT NULL DEFAULT '[]',
  conditions                  TEXT NOT NULL DEFAULT '[]',
  medications                 TEXT NOT NULL DEFAULT '[]',
  height_cm                   REAL,
  weight_kg                   REAL
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialty           TEXT NOT NULL,
  qualifications      TEXT NOT NULL,
  experience_years    REAL,
  bio                 TEXT,
  languages           TEXT NOT NULL DEFAULT '[]',
  room                TEXT,
  slot_minutes        INTEGER NOT NULL DEFAULT 15,
  is_accepting        INTEGER NOT NULL DEFAULT 1,
  is_visiting         INTEGER NOT NULL DEFAULT 0,
  consultation_modes  TEXT NOT NULL DEFAULT '["in_person","video"]'
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  designation       TEXT NOT NULL,
  qualifications    TEXT,
  experience_years  REAL,
  shift             TEXT
);

-- Weekly OPD timetable (multiple blocks per weekday allowed, e.g. split shifts)
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_doctor ON doctor_schedules(doctor_id, weekday);

CREATE TABLE IF NOT EXISTS doctor_leaves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  reason     TEXT,
  UNIQUE (doctor_id, date)
);

-- ---------------------------------------------------------------------------
-- Appointments & consultations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE,
  student_id         INTEGER NOT NULL REFERENCES users(id),
  doctor_id          INTEGER NOT NULL REFERENCES users(id),
  date               TEXT NOT NULL,
  start_time         TEXT NOT NULL,
  end_time           TEXT NOT NULL,
  mode               TEXT NOT NULL DEFAULT 'in_person' CHECK (mode IN ('in_person','video')),
  reason             TEXT NOT NULL,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','checked_in','in_progress','completed','cancelled')),
  token_no           INTEGER,
  checked_in_at      TEXT,
  started_at         TEXT,
  completed_at       TEXT,
  cancelled_at       TEXT,
  cancel_reason      TEXT,
  cancelled_by_role  TEXT,
  rescheduled_count  INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_student ON appointments(student_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_doctor ON appointments(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
-- A doctor's slot can only be held by one non-cancelled appointment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_appt_doctor_slot
  ON appointments(doctor_id, date, start_time) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS consultations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id   INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  student_id       INTEGER NOT NULL REFERENCES users(id),
  doctor_id        INTEGER NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed')),
  symptoms         TEXT NOT NULL DEFAULT '[]',
  vitals           TEXT NOT NULL DEFAULT '{}',
  clinical_notes   TEXT,
  observations     TEXT,
  diagnosis        TEXT,
  advice           TEXT,
  follow_up_date   TEXT,
  follow_up_notes  TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_consult_student ON consultations(student_id);

-- ---------------------------------------------------------------------------
-- Medicines & inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medicines (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  name                   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  generic_name           TEXT,
  category               TEXT NOT NULL,
  form                   TEXT NOT NULL,
  strength               TEXT,
  unit                   TEXT NOT NULL,
  description            TEXT,
  usage_instructions     TEXT,
  requires_prescription  INTEGER NOT NULL DEFAULT 0,
  stock_quantity         INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock              INTEGER NOT NULL DEFAULT 10,
  batch_no               TEXT,
  expiry_date            TEXT,
  manufacturer           TEXT,
  unit_price             REAL NOT NULL DEFAULT 0,
  is_active              INTEGER NOT NULL DEFAULT 1,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);

CREATE TABLE IF NOT EXISTS stock_movements (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id      INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('initial','restock','dispense','adjustment','expired_removal')),
  quantity_change  INTEGER NOT NULL,
  balance_after    INTEGER NOT NULL CHECK (balance_after >= 0),
  reason           TEXT,
  reference        TEXT,
  request_id       INTEGER REFERENCES medicine_requests(id) ON DELETE SET NULL,
  performed_by     INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_medicine ON stock_movements(medicine_id, created_at);
-- Guarantees a request can never deduct stock for the same medicine twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dispense_once
  ON stock_movements(request_id, medicine_id) WHERE type = 'dispense';

-- ---------------------------------------------------------------------------
-- Prescriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE,
  appointment_id   INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  consultation_id  INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  student_id       INTEGER NOT NULL REFERENCES users(id),
  doctor_id        INTEGER NOT NULL REFERENCES users(id),
  diagnosis        TEXT,
  notes            TEXT,
  valid_until      TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rx_student ON prescriptions(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rx_doctor ON prescriptions(doctor_id, created_at);
-- One prescription per appointment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rx_appointment ON prescriptions(appointment_id) WHERE appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS prescription_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id  INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id      INTEGER NOT NULL REFERENCES medicines(id),
  medicine_name    TEXT NOT NULL,
  dosage           TEXT NOT NULL,
  frequency        TEXT NOT NULL,
  duration_days    INTEGER NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  instructions     TEXT,
  notes            TEXT
);

-- ---------------------------------------------------------------------------
-- Medicine requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medicine_requests (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE,
  student_id         INTEGER NOT NULL REFERENCES users(id),
  prescription_id    INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
  fulfilment         TEXT NOT NULL CHECK (fulfilment IN ('pickup','delivery')),
  delivery_location  TEXT,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted','approved','preparing','ready_for_pickup','out_for_delivery','fulfilled','rejected','cancelled')),
  rejection_reason   TEXT,
  staff_notes        TEXT,
  handled_by         INTEGER REFERENCES users(id),
  approved_at        TEXT,
  preparing_at       TEXT,
  ready_at           TEXT,
  dispatched_at      TEXT,
  fulfilled_at       TEXT,
  rejected_at        TEXT,
  cancelled_at       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_student ON medicine_requests(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_status ON medicine_requests(status);

CREATE TABLE IF NOT EXISTS medicine_request_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id     INTEGER NOT NULL REFERENCES medicine_requests(id) ON DELETE CASCADE,
  medicine_id    INTEGER NOT NULL REFERENCES medicines(id),
  medicine_name  TEXT NOT NULL,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (request_id, medicine_id)
);

-- ---------------------------------------------------------------------------
-- Emergencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emergencies (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE,
  student_id         INTEGER NOT NULL REFERENCES users(id),
  category           TEXT NOT NULL,
  severity           TEXT NOT NULL CHECK (severity IN ('critical','high','moderate')),
  description        TEXT NOT NULL,
  location           TEXT NOT NULL,
  contact_phone      TEXT NOT NULL,
  emergency_contact  TEXT,
  additional_info    TEXT,
  status             TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted','acknowledged','responder_assigned','resolved')),
  responder_name     TEXT,
  responder_phone    TEXT,
  resolution_notes   TEXT,
  handled_by         INTEGER REFERENCES users(id),
  acknowledged_at    TEXT,
  assigned_at        TEXT,
  resolved_at        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emergencies_status ON emergencies(status, created_at);

-- ---------------------------------------------------------------------------
-- Generic status timeline for appointments / requests / emergencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS status_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('appointment','medicine_request','emergency')),
  entity_id    INTEGER NOT NULL,
  status       TEXT NOT NULL,
  note         TEXT,
  actor_id     INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_events_entity ON status_events(entity_type, entity_id, created_at);

-- ---------------------------------------------------------------------------
-- Medical records (visit summaries + uploaded documents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category         TEXT NOT NULL CHECK (category IN ('visit_summary','lab_report','imaging','vaccination','certificate','prescription','other')),
  title            TEXT NOT NULL,
  description      TEXT,
  record_date      TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('consultation','upload')),
  doctor_id        INTEGER REFERENCES users(id),
  consultation_id  INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  appointment_id   INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  prescription_id  INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
  file_name        TEXT,
  file_path        TEXT,      -- stored file name inside data/uploads
  file_size        INTEGER,
  mime_type        TEXT,
  uploaded_by      INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_student ON medical_records(student_id, record_date);

-- ---------------------------------------------------------------------------
-- Notifications & activity log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS activity_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  category     TEXT NOT NULL,
  description  TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    INTEGER,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_logs(category, created_at);

-- ---------------------------------------------------------------------------
-- Chat & video calls
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       TEXT NOT NULL,
  last_message_at  TEXT NOT NULL,
  UNIQUE (student_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind             TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','system','call')),
  body             TEXT NOT NULL,
  meta             TEXT,      -- JSON
  created_at       TEXT NOT NULL,
  read_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS calls (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  appointment_id   INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  caller_id        INTEGER NOT NULL REFERENCES users(id),
  callee_id        INTEGER NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL CHECK (status IN ('ringing','active','completed','missed','declined','cancelled')),
  started_at       TEXT NOT NULL,
  answered_at      TEXT,
  ended_at         TEXT,
  duration_sec     INTEGER
);
