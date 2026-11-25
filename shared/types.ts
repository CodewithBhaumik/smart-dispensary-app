/**
 * Shared API data-transfer types. The server returns exactly these shapes
 * (camelCase JSON) and the client consumes them. Dates are ISO strings:
 *  - timestamps: "2026-11-25T14:05:00.000Z" style ISO strings (createdAt etc.)
 *  - calendar dates: "YYYY-MM-DD" (local)
 *  - clock times: "HH:MM" (24h, local)
 */
import type {
  ActivityCategory,
  AppointmentMode,
  AppointmentStatus,
  CallStatus,
  ConsultationStatus,
  EmergencySeverity,
  EmergencyStatus,
  ExpiryStatus,
  FulfilmentMethod,
  MessageKind,
  NotificationType,
  RecordCategory,
  RequestStatus,
  Role,
  StockMovementType,
  StockStatus,
} from './constants';

export type { Role } from './constants';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export interface ApiErrorBody {
  error: {
    code: string; // e.g. "VALIDATION_ERROR", "NOT_FOUND", "CONFLICT", "FORBIDDEN", "UNAUTHORIZED"
    message: string; // human readable, safe to show in a toast
    fields?: Record<string, string>; // per-field validation messages
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

// ---------------------------------------------------------------------------
// Users & profiles
// ---------------------------------------------------------------------------
export interface UserMini {
  id: number;
  name: string;
  role: Role;
  avatarColor: string; // hex colour used for initials avatar
  title: string | null; // designation, e.g. "Sr. Medical Officer", "Pharmacist", "B.E. CSE · Year 3"
}

export interface StudentProfile {
  rollNo: string;
  department: string;
  program: string;
  year: number;
  gender: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  hostel: string | null;
  room: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  allergies: string[];
  conditions: string[];
  medications: string[];
  heightCm: number | null;
  weightKg: number | null;
}

export interface DoctorProfile {
  specialty: string;
  qualifications: string;
  experienceYears: number | null;
  bio: string | null;
  languages: string[];
  room: string | null;
  slotMinutes: number;
  isAccepting: boolean;
  isVisiting: boolean;
  consultationModes: AppointmentMode[];
}

export interface StaffProfile {
  designation: string;
  qualifications: string | null;
  experienceYears: number | null;
  shift: string | null;
}

export interface AuthUser extends UserMini {
  email: string;
  phone: string | null;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  student: StudentProfile | null;
  doctor: DoctorProfile | null;
  staff: StaffProfile | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface DemoAccount {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  avatarColor: string;
  isPrimary: boolean; // the featured identity for its role
}

/** Admin user list row. */
export interface UserListItem extends AuthUser {
  /** One-line role specific summary, e.g. roll no + department, specialty, designation. */
  summary: string;
}

export interface StudentMini extends UserMini {
  email: string;
  phone: string | null;
  rollNo: string;
  department: string;
  program: string;
  year: number;
  hostel: string | null;
  room: string | null;
}

export interface DoctorMini extends UserMini {
  specialty: string;
  qualifications: string;
  room: string | null;
}

// ---------------------------------------------------------------------------
// Doctors, schedules, slots
// ---------------------------------------------------------------------------
export interface ScheduleBlock {
  id?: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM" (exclusive)
}

export interface DoctorLeave {
  id: number;
  date: string; // YYYY-MM-DD
  reason: string | null;
}

export interface DoctorListItem extends DoctorMini {
  email: string;
  phone: string | null;
  experienceYears: number | null;
  bio: string | null;
  languages: string[];
  isAccepting: boolean;
  isVisiting: boolean;
  consultationModes: AppointmentMode[];
  slotMinutes: number;
  /** Next bookable slot within the booking window, or null. */
  nextAvailable: { date: string; time: string } | null;
  /** Number of free slots remaining today. */
  todayFreeSlots: number;
  /** Distinct patients with a completed consultation. */
  patientsSeen: number;
  /** Weekly OPD timetable. */
  schedule: ScheduleBlock[];
}

export interface DoctorDetail extends DoctorListItem {
  leaves: DoctorLeave[];
  completedConsultations: number;
}

export interface Slot {
  time: string; // "HH:MM"
  endTime: string; // "HH:MM"
  available: boolean;
  reason: 'booked' | 'past' | 'leave' | 'own_conflict' | null;
}

export interface DayAvailability {
  date: string; // YYYY-MM-DD
  weekday: number;
  totalSlots: number;
  freeSlots: number;
  onLeave: boolean;
}

// ---------------------------------------------------------------------------
// Status timeline (appointments, requests, emergencies)
// ---------------------------------------------------------------------------
export interface StatusEvent {
  id: number;
  status: string;
  note: string | null;
  actor: UserMini | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Appointments & consultations
// ---------------------------------------------------------------------------
export interface Appointment {
  id: number;
  code: string; // e.g. "APT-7K3Q9M"
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  mode: AppointmentMode;
  reason: string;
  notes: string | null;
  status: AppointmentStatus;
  tokenNo: number | null; // queue token assigned at check-in
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByRole: Role | null;
  rescheduledCount: number;
  createdAt: string;
  updatedAt: string;
  student: StudentMini;
  doctor: DoctorMini;
  consultationId: number | null;
  prescriptionId: number | null;
}

export interface Vitals {
  temperature?: string; // e.g. "99.4 °F"
  bloodPressure?: string; // e.g. "118/76"
  pulse?: string; // bpm
  spo2?: string; // %
  weight?: string; // kg
}

export interface Consultation {
  id: number;
  appointmentId: number;
  status: ConsultationStatus;
  symptoms: string[];
  vitals: Vitals;
  clinicalNotes: string | null;
  observations: string | null;
  diagnosis: string | null;
  advice: string | null;
  followUpDate: string | null;
  followUpNotes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  doctor: DoctorMini;
  student: StudentMini;
}

/** Medical summary of a student shown to doctors. */
export interface PatientSummary extends StudentMini {
  gender: string | null;
  dateOfBirth: string | null;
  age: number | null;
  bloodGroup: string | null;
  allergies: string[];
  conditions: string[];
  medications: string[];
  heightCm: number | null;
  weightKg: number | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  lastVisit: string | null; // YYYY-MM-DD
  totalVisits: number;
}

export interface AppointmentDetail extends Appointment {
  consultation: Consultation | null;
  prescription: Prescription | null;
  patient: PatientSummary;
  timeline: StatusEvent[];
}

export interface PatientDetail {
  patient: PatientSummary;
  appointments: Appointment[];
  consultations: Consultation[];
  prescriptions: Prescription[];
  records: MedicalRecord[];
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------
export interface PrescriptionItem {
  id: number;
  medicineId: number;
  medicineName: string;
  form: string;
  strength: string | null;
  dosage: string; // e.g. "1 tablet", "10 ml"
  frequency: string; // FrequencyCode, e.g. "BD"
  durationDays: number;
  quantity: number; // units to dispense
  instructions: string | null; // e.g. "After food"
  notes: string | null;
  requiresPrescription: boolean;
}

export interface Prescription {
  id: number;
  code: string; // e.g. "RX-4F8K2P"
  appointmentId: number | null;
  consultationId: number | null;
  diagnosis: string | null;
  notes: string | null;
  validUntil: string; // YYYY-MM-DD
  createdAt: string;
  student: StudentMini;
  doctor: DoctorMini;
  items: PrescriptionItem[];
  /** Most recent medicine request raised from this prescription (if any). */
  latestRequest: { id: number; code: string; status: RequestStatus } | null;
}

// ---------------------------------------------------------------------------
// Medical records
// ---------------------------------------------------------------------------
export interface MedicalRecord {
  id: number;
  studentId: number;
  category: RecordCategory;
  title: string;
  description: string | null;
  recordDate: string; // YYYY-MM-DD
  source: 'consultation' | 'upload';
  doctor: DoctorMini | null;
  consultationId: number | null;
  appointmentId: number | null;
  prescriptionId: number | null;
  file: { name: string; size: number; mimeType: string } | null;
  uploadedBy: UserMini | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Medicines & inventory
// ---------------------------------------------------------------------------
export interface Medicine {
  id: number;
  name: string; // e.g. "Paracetamol 500 mg"
  genericName: string | null;
  category: string;
  form: string;
  strength: string | null;
  unit: string; // dispensing unit, e.g. "strip of 10", "bottle (100 ml)"
  description: string | null;
  usageInstructions: string | null;
  requiresPrescription: boolean;
  stockQuantity: number;
  minStock: number;
  batchNo: string | null;
  expiryDate: string | null; // YYYY-MM-DD
  manufacturer: string | null;
  unitPrice: number; // INR per unit (inventory valuation)
  isActive: boolean;
  stockStatus: StockStatus;
  expiryStatus: ExpiryStatus;
  daysToExpiry: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: number;
  medicineId: number;
  medicineName: string;
  type: StockMovementType;
  quantityChange: number; // signed
  balanceAfter: number;
  reason: string | null;
  reference: string | null; // e.g. request code
  requestId: number | null;
  performedBy: UserMini | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Medicine requests
// ---------------------------------------------------------------------------
export interface MedicineRequestItem {
  id: number;
  medicineId: number;
  medicineName: string;
  form: string;
  strength: string | null;
  unit: string;
  quantity: number;
  stockAvailable: number; // current stock of the medicine
  requiresPrescription: boolean;
}

export interface MedicineRequest {
  id: number;
  code: string; // e.g. "MR-9TX2LQ"
  status: RequestStatus;
  fulfilment: FulfilmentMethod;
  deliveryLocation: string | null;
  notes: string | null;
  rejectionReason: string | null;
  staffNotes: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  dispatchedAt: string | null;
  fulfilledAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  student: StudentMini;
  prescription: { id: number; code: string; doctorName: string } | null;
  handledBy: UserMini | null;
  items: MedicineRequestItem[];
  totalUnits: number;
  timeline: StatusEvent[];
}

// ---------------------------------------------------------------------------
// Emergencies
// ---------------------------------------------------------------------------
export interface Emergency {
  id: number;
  code: string; // e.g. "EMG-3KQ8"
  category: string;
  severity: EmergencySeverity;
  description: string;
  location: string;
  contactPhone: string;
  emergencyContact: string | null;
  additionalInfo: string | null;
  status: EmergencyStatus;
  responderName: string | null;
  responderPhone: string | null;
  resolutionNotes: string | null;
  acknowledgedAt: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: StudentMini & { bloodGroup: string | null; allergies: string[]; conditions: string[] };
  handledBy: UserMini | null;
  timeline: StatusEvent[];
}

export interface Responder {
  id: number;
  name: string;
  title: string | null;
  role: Role;
  phone: string | null;
  avatarColor: string;
}

// ---------------------------------------------------------------------------
// Notifications & activity
// ---------------------------------------------------------------------------
export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null; // in-app route, e.g. "/student/appointments?open=12"
  isRead: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: number;
  action: string; // e.g. "appointment.booked"
  category: ActivityCategory;
  description: string;
  entityType: string | null;
  entityId: number | null;
  actor: UserMini | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Chat & calls
// ---------------------------------------------------------------------------
export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number | null; // null for system messages
  kind: MessageKind;
  body: string;
  meta: { callStatus?: CallStatus; durationSec?: number; callId?: number } | null;
  createdAt: string;
  readAt: string | null;
}

export interface Conversation {
  id: number;
  student: UserMini;
  doctor: UserMini;
  /** The participant that is not the current user. */
  otherParty: UserMini & { online: boolean; subtitle: string | null };
  lastMessage: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
}

export interface CallLog {
  id: number;
  callerId: number;
  calleeId: number;
  appointmentId: number | null;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------
export interface StudentDashboard {
  nextAppointment: Appointment | null;
  upcomingAppointments: Appointment[];
  recentPrescriptions: Prescription[];
  activeRequests: MedicineRequest[];
  recentNotifications: Notification[];
  activeEmergency: Emergency | null;
  stats: {
    upcomingAppointments: number;
    visitsThisYear: number;
    activePrescriptions: number;
    requestsInProgress: number;
    unreadNotifications: number;
  };
  profileCompletion: number; // 0-100
}

export interface DoctorDashboard {
  isAccepting: boolean;
  stats: {
    todayTotal: number;
    waiting: number; // checked in
    inProgress: number;
    completedToday: number;
    upcomingWeek: number;
    patientsThisMonth: number;
  };
  todayQueue: Appointment[]; // all of today's appointments ordered by time
  nextPatient: Appointment | null;
  upcoming: Appointment[]; // next 7 days excluding today
  weeklyConsultations: { date: string; completed: number; cancelled: number }[]; // last 7 days
  recentPrescriptions: Prescription[];
  todaySchedule: ScheduleBlock[];
}

export interface StaffDashboard {
  stats: {
    pendingRequests: number; // submitted
    inProgress: number; // approved + preparing
    readyForPickup: number;
    outForDelivery: number;
    fulfilledToday: number;
    totalItems: number;
    lowStock: number;
    outOfStock: number;
    expiringSoon: number;
    expired: number;
    activeEmergencies: number;
  };
  actionQueue: MedicineRequest[]; // open requests, oldest first
  lowStockItems: Medicine[];
  expiringItems: Medicine[];
  recentActivity: ActivityLog[];
  dispensedLast7Days: { date: string; units: number; requests: number }[];
  activeEmergencies: Emergency[];
}

export interface AdminDashboard {
  kpis: {
    students: number;
    doctors: number;
    staff: number;
    activeUsers: number;
    appointmentsTotal: number;
    appointmentsPending: number; // scheduled + checked_in + in_progress
    appointmentsCompleted: number;
    appointmentsCancelled: number;
    appointmentsToday: number;
    prescriptionsTotal: number;
    requestsTotal: number;
    requestsOpen: number;
    requestsFulfilled: number;
    inventoryItems: number;
    inventoryUnits: number;
    inventoryValue: number; // INR
    lowStock: number;
    expiringSoon: number;
    emergenciesTotal: number;
    emergenciesActive: number;
  };
  appointmentsOverTime: { date: string; completed: number; cancelled: number; scheduled: number }[]; // last 30 days
  statusDistribution: { status: AppointmentStatus; count: number }[];
  requestsByWeek: { week: string; pickup: number; delivery: number }[]; // last 8 weeks, label "DD MMM"
  inventoryByCategory: { category: string; items: number; units: number }[];
  specialtyDemand: { specialty: string; count: number }[];
  peakHours: { hour: string; count: number }[]; // "09:00" ... appointment counts by start hour
  recentActivity: ActivityLog[];
  activeEmergencies: Emergency[];
}

// ---------------------------------------------------------------------------
// App metadata
// ---------------------------------------------------------------------------
export interface AppMeta {
  appName: string;
  demoMode: boolean;
  serverTime: string; // ISO
  today: string; // YYYY-MM-DD (server local)
  seededAt: string | null; // ISO timestamp of last demo seed
}
