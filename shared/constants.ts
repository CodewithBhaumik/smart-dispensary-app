/**
 * Shared domain constants used by both the client and the server.
 * Single source of truth for statuses, labels, categories and workflow rules.
 */

export const APP_NAME = 'Smart Dispensary';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export const ROLES = ['student', 'doctor', 'staff', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  doctor: 'Doctor',
  staff: 'Dispensary Staff',
  admin: 'Admin',
};

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
export const APPOINTMENT_STATUSES = ['scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  checked_in: 'Checked In',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Statuses that still occupy a doctor's slot / count as "active". */
export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ['scheduled', 'checked_in', 'in_progress'];

export const APPOINTMENT_MODES = ['in_person', 'video'] as const;
export type AppointmentMode = (typeof APPOINTMENT_MODES)[number];
export const APPOINTMENT_MODE_LABELS: Record<AppointmentMode, string> = {
  in_person: 'In-person',
  video: 'Video consultation',
};

export const APPOINTMENT_REASONS = [
  'General consultation',
  'Fever / cold / flu',
  'Headache / migraine',
  'Stomach ache / digestion',
  'Injury / sprain',
  'Skin concern',
  'Allergy',
  'Dental concern',
  'Mental wellbeing',
  'Follow-up visit',
  'Medical certificate',
  'Other',
] as const;

// ---------------------------------------------------------------------------
// Consultations & prescriptions
// ---------------------------------------------------------------------------
export const CONSULTATION_STATUSES = ['draft', 'completed'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export const COMMON_SYMPTOMS = [
  'Fever',
  'Cough',
  'Sore throat',
  'Runny nose',
  'Headache',
  'Body ache',
  'Fatigue',
  'Nausea',
  'Vomiting',
  'Loose motions',
  'Abdominal pain',
  'Acidity',
  'Skin rash',
  'Itching',
  'Dizziness',
  'Breathlessness',
  'Joint pain',
  'Sprain / swelling',
  'Insomnia',
  'Anxiety',
] as const;

export const FREQUENCIES = [
  { value: 'OD', label: 'Once daily (1-0-0)', perDay: 1 },
  { value: 'BD', label: 'Twice daily (1-0-1)', perDay: 2 },
  { value: 'TDS', label: 'Three times daily (1-1-1)', perDay: 3 },
  { value: 'QID', label: 'Four times daily', perDay: 4 },
  { value: 'HS', label: 'At bedtime (0-0-1)', perDay: 1 },
  { value: 'SOS', label: 'When required (SOS)', perDay: 1 },
  { value: 'STAT', label: 'Single dose now', perDay: 1 },
] as const;
export type FrequencyCode = (typeof FREQUENCIES)[number]['value'];

export const DOSE_INSTRUCTIONS = [
  'After food',
  'Before food',
  'With water',
  'At bedtime',
  'Apply locally',
  'Dissolve in 1 litre of water',
  'Shake well before use',
  'Do not drive after taking',
] as const;

export const PRESCRIPTION_VALIDITY_DAYS = 30;

// ---------------------------------------------------------------------------
// Medicines & inventory
// ---------------------------------------------------------------------------
export const MEDICINE_CATEGORIES = [
  'Pain & Fever',
  'Antibiotics',
  'Allergy & Cold',
  'Cough & Respiratory',
  'Digestive Care',
  'Skin Care',
  'Eye & Ear',
  'Vitamins & Supplements',
  'First Aid',
  'Antifungal',
  'Hydration',
  'Women\'s Health',
] as const;
export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number];

export const MEDICINE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Ointment',
  'Cream',
  'Gel',
  'Drops',
  'Inhaler',
  'Sachet',
  'Spray',
  'Lozenge',
  'Solution',
  'Dressing',
] as const;

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};

export type ExpiryStatus = 'ok' | 'expiring' | 'expired';
export const EXPIRY_STATUS_LABELS: Record<ExpiryStatus, string> = {
  ok: 'Valid',
  expiring: 'Expiring soon',
  expired: 'Expired',
};
/** A batch is "expiring soon" when it expires within this many days. */
export const EXPIRY_WARNING_DAYS = 60;

export const STOCK_MOVEMENT_TYPES = ['restock', 'dispense', 'adjustment', 'expired_removal', 'initial'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  initial: 'Opening stock',
  restock: 'Restock',
  dispense: 'Dispensed',
  adjustment: 'Manual adjustment',
  expired_removal: 'Expired stock removed',
};

/** Max quantity a student may request per OTC item in a single request. */
export const MAX_OTC_QUANTITY = 5;

// ---------------------------------------------------------------------------
// Medicine requests
// ---------------------------------------------------------------------------
export const REQUEST_STATUSES = [
  'submitted',
  'approved',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'fulfilled',
  'rejected',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  'submitted',
  'approved',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
];

export const FULFILMENT_METHODS = ['pickup', 'delivery'] as const;
export type FulfilmentMethod = (typeof FULFILMENT_METHODS)[number];
export const FULFILMENT_LABELS: Record<FulfilmentMethod, string> = {
  pickup: 'Pickup at dispensary',
  delivery: 'Campus delivery',
};

/**
 * Staff-driven status transitions. Students may only cancel
 * (see STUDENT_CANCELLABLE_REQUEST_STATUSES).
 */
export function allowedRequestTransitions(from: RequestStatus, fulfilment: FulfilmentMethod): RequestStatus[] {
  switch (from) {
    case 'submitted':
      return ['approved', 'rejected'];
    case 'approved':
      return ['preparing', 'rejected'];
    case 'preparing':
      return fulfilment === 'pickup' ? ['ready_for_pickup'] : ['out_for_delivery'];
    case 'ready_for_pickup':
    case 'out_for_delivery':
      return ['fulfilled'];
    default:
      return [];
  }
}
export const STUDENT_CANCELLABLE_REQUEST_STATUSES: RequestStatus[] = ['submitted', 'approved'];

/** Ordered happy-path steps used by progress trackers in the UI. */
export function requestProgressSteps(fulfilment: FulfilmentMethod): RequestStatus[] {
  return fulfilment === 'pickup'
    ? ['submitted', 'approved', 'preparing', 'ready_for_pickup', 'fulfilled']
    : ['submitted', 'approved', 'preparing', 'out_for_delivery', 'fulfilled'];
}

// ---------------------------------------------------------------------------
// Emergencies
// ---------------------------------------------------------------------------
export const EMERGENCY_STATUSES = ['submitted', 'acknowledged', 'responder_assigned', 'resolved'] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];
export const EMERGENCY_STATUS_LABELS: Record<EmergencyStatus, string> = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  responder_assigned: 'Responder Assigned',
  resolved: 'Resolved',
};

export function allowedEmergencyTransitions(from: EmergencyStatus): EmergencyStatus[] {
  switch (from) {
    case 'submitted':
      return ['acknowledged', 'responder_assigned', 'resolved'];
    case 'acknowledged':
      return ['responder_assigned', 'resolved'];
    case 'responder_assigned':
      return ['resolved'];
    default:
      return [];
  }
}

export const EMERGENCY_CATEGORIES = [
  'Medical emergency',
  'Injury / accident',
  'Breathing difficulty',
  'Severe allergic reaction',
  'Fainting / unconscious',
  'High fever',
  'Mental health crisis',
  'Other',
] as const;

export const EMERGENCY_SEVERITIES = ['critical', 'high', 'moderate'] as const;
export type EmergencySeverity = (typeof EMERGENCY_SEVERITIES)[number];
export const EMERGENCY_SEVERITY_LABELS: Record<EmergencySeverity, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
};

// ---------------------------------------------------------------------------
// Medical records
// ---------------------------------------------------------------------------
export const RECORD_CATEGORIES = [
  'visit_summary',
  'lab_report',
  'imaging',
  'vaccination',
  'certificate',
  'prescription',
  'other',
] as const;
export type RecordCategory = (typeof RECORD_CATEGORIES)[number];
export const RECORD_CATEGORY_LABELS: Record<RecordCategory, string> = {
  visit_summary: 'Visit summary',
  lab_report: 'Lab report',
  imaging: 'Imaging / X-ray',
  vaccination: 'Vaccination',
  certificate: 'Medical certificate',
  prescription: 'Prescription',
  other: 'Other document',
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

// ---------------------------------------------------------------------------
// Notifications & activity
// ---------------------------------------------------------------------------
export const NOTIFICATION_TYPES = [
  'appointment',
  'consultation',
  'prescription',
  'medicine_request',
  'inventory',
  'emergency',
  'message',
  'call',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ACTIVITY_CATEGORIES = [
  'auth',
  'appointment',
  'consultation',
  'prescription',
  'medicine_request',
  'inventory',
  'emergency',
  'user',
  'record',
  'chat',
  'call',
  'system',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  auth: 'Sign-in',
  appointment: 'Appointments',
  consultation: 'Consultations',
  prescription: 'Prescriptions',
  medicine_request: 'Medicine requests',
  inventory: 'Inventory',
  emergency: 'Emergencies',
  user: 'Users',
  record: 'Medical records',
  chat: 'Messages',
  call: 'Video calls',
  system: 'System',
};

// ---------------------------------------------------------------------------
// Chat & calls
// ---------------------------------------------------------------------------
export const MESSAGE_KINDS = ['text', 'system', 'call'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const CALL_STATUSES = ['ringing', 'active', 'completed', 'missed', 'declined', 'cancelled'] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export const CALL_RING_TIMEOUT_MS = 40_000;

// ---------------------------------------------------------------------------
// Campus reference data
// ---------------------------------------------------------------------------
export const DEPARTMENTS = [
  'Computer Science & Engineering',
  'Electronics & Communication',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Biotechnology',
  'Electronics & Instrumentation',
  'Mathematics & Computing',
  'Management (MBA)',
] as const;

export const PROGRAMS = ['B.E.', 'B.Tech', 'M.E.', 'M.Tech', 'MBA', 'M.Sc', 'Ph.D'] as const;

export const HOSTELS = [
  'Hostel A',
  'Hostel B',
  'Hostel C',
  'Hostel D',
  'Hostel E',
  'Hostel H',
  'Hostel I',
  'Hostel J',
  'Hostel K',
  'Hostel L',
  'Hostel M',
  'Hostel N',
  'Day Scholar',
] as const;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const GENDERS = ['Male', 'Female', 'Other'] as const;

export const CAMPUS_LOCATIONS = [
  'Hostel (enter block & room)',
  'Academic block',
  'Library',
  'Sports complex',
  'Dining hall / canteen',
  'Laboratory',
  'Main gate',
  'Other',
] as const;

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** How far ahead students can book appointments. */
export const BOOKING_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Dispensary operating hours (health centre timetable).
// `doctor` windows = doctor on duty; `assistant` windows = medical assistant only.
// Times are 24h "HH:MM"; an end time of "24:00" means midnight.
// ---------------------------------------------------------------------------
export interface HoursWindow {
  start: string;
  end: string;
  staffing: 'doctor' | 'assistant';
}

export const DISPENSARY_HOURS: Record<number, HoursWindow[]> = {
  // Sunday
  0: [
    { start: '00:00', end: '02:00', staffing: 'doctor' }, // Saturday night shift continues
    { start: '09:00', end: '19:00', staffing: 'doctor' },
    { start: '22:00', end: '24:00', staffing: 'assistant' },
  ],
  // Monday - Friday: 24 hours (medical assistant only 2:00 AM - 8:30 AM)
  1: [
    { start: '00:00', end: '08:30', staffing: 'assistant' },
    { start: '08:30', end: '24:00', staffing: 'doctor' },
  ],
  2: [
    { start: '00:00', end: '02:00', staffing: 'doctor' },
    { start: '02:00', end: '08:30', staffing: 'assistant' },
    { start: '08:30', end: '24:00', staffing: 'doctor' },
  ],
  3: [
    { start: '00:00', end: '02:00', staffing: 'doctor' },
    { start: '02:00', end: '08:30', staffing: 'assistant' },
    { start: '08:30', end: '24:00', staffing: 'doctor' },
  ],
  4: [
    { start: '00:00', end: '02:00', staffing: 'doctor' },
    { start: '02:00', end: '08:30', staffing: 'assistant' },
    { start: '08:30', end: '24:00', staffing: 'doctor' },
  ],
  5: [
    { start: '00:00', end: '02:00', staffing: 'doctor' },
    { start: '02:00', end: '08:30', staffing: 'assistant' },
    { start: '08:30', end: '24:00', staffing: 'doctor' },
  ],
  // Saturday
  6: [
    { start: '00:00', end: '02:00', staffing: 'doctor' },
    { start: '09:00', end: '19:00', staffing: 'doctor' },
    { start: '20:00', end: '24:00', staffing: 'doctor' },
  ],
};

/** Human-readable timetable for display (login page, sidebar, help). */
export const DISPENSARY_TIMETABLE = [
  { days: 'Monday – Friday', hours: 'Open 24 hours', note: '2:00 AM – 8:30 AM: medical assistant only' },
  { days: 'Saturday', hours: '9:00 AM – 7:00 PM · 8:00 PM – 2:00 AM', note: null },
  { days: 'Sunday', hours: '9:00 AM – 7:00 PM', note: '10:00 PM – 8:30 AM: medical assistant only' },
  { days: 'Gazetted holidays', hours: 'Closed', note: 'Emergency care via ambulance service' },
] as const;

/** National emergency ambulance number (India). */
export const NATIONAL_AMBULANCE_NUMBER = '108';

/** Password shared by every seeded demo account. */
export const DEMO_PASSWORD = 'demo1234';
