import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppointmentMode } from '@shared/constants';
import type {
  Appointment,
  AppointmentDetail,
  DoctorDashboard,
  DoctorLeave,
  MedicalRecord,
  PatientDetail,
  PatientSummary,
  Prescription,
  ScheduleBlock,
} from '@shared/types';
import { api } from '@/lib/api';

/** Every query key that depends on appointment / consultation state. */
const CLINIC_KEYS = [
  'appointments',
  'appointment',
  'dashboard',
  'patients',
  'patient',
  'prescriptions',
  'prescription',
  'slots',
  'availability',
  'doctors',
  'doctor',
  'records',
] as const;

export function useInvalidateClinic() {
  const qc = useQueryClient();
  return () => Promise.all(CLINIC_KEYS.map((key) => qc.invalidateQueries({ queryKey: [key] })));
}

// ---------------------------------------------------------------------------
// Dashboard & appointments
// ---------------------------------------------------------------------------
export function useDoctorDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'doctor'],
    queryFn: () => api.get<DoctorDashboard>('/dashboard/doctor'),
    refetchInterval: 30_000,
  });
}

/** All of the doctor's appointments (filtered client-side for instant tab switching + counts). */
export function useDoctorAppointments() {
  return useQuery({
    queryKey: ['appointments', 'doctor', 'all'],
    queryFn: () => api.get<Appointment[]>('/appointments', { scope: 'all', limit: 500 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useAppointmentDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api.get<AppointmentDetail>(`/appointments/${id}`),
    enabled: Boolean(id),
  });
}

export function useAppointmentMutations() {
  const invalidate = useInvalidateClinic();
  const checkIn = useMutation({
    mutationFn: (id: number) => api.patch<Appointment>(`/appointments/${id}/check-in`),
    onSuccess: invalidate,
  });
  const checkInByCode = useMutation({
    mutationFn: (code: string) => api.post<Appointment>('/appointments/check-in-by-code', { code }),
    onSuccess: invalidate,
  });
  const start = useMutation({
    mutationFn: (id: number) => api.patch<AppointmentDetail>(`/appointments/${id}/start`),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.patch<Appointment>(`/appointments/${id}/cancel`, { reason: reason || null }),
    onSuccess: invalidate,
  });
  return { checkIn, checkInByCode, start, cancel };
}

// ---------------------------------------------------------------------------
// Patients & prescriptions
// ---------------------------------------------------------------------------
export function usePatients(search: string) {
  return useQuery({
    queryKey: ['patients', { search }],
    queryFn: () => api.get<PatientSummary[]>('/patients', { search }),
    placeholderData: keepPreviousData,
  });
}

export function usePatientDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get<PatientDetail>(`/patients/${id}`),
    enabled: Boolean(id),
  });
}

export function usePatientRecords(studentId: number | null | undefined) {
  return useQuery({
    queryKey: ['records', { studentId }],
    queryFn: () => api.get<MedicalRecord[]>('/records', { studentId }),
    enabled: Boolean(studentId),
  });
}

export function useDoctorPrescriptions() {
  return useQuery({
    queryKey: ['prescriptions', 'doctor'],
    queryFn: () => api.get<Prescription[]>('/prescriptions'),
    placeholderData: keepPreviousData,
  });
}

export function usePrescription(id: number | null | undefined) {
  return useQuery({
    queryKey: ['prescription', id],
    queryFn: () => api.get<Prescription>(`/prescriptions/${id}`),
    enabled: Boolean(id),
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantId: number) => api.post<{ id: number }>('/conversations', { participantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------
export interface ScheduleState {
  slotMinutes: number;
  isAccepting: boolean;
  consultationModes: AppointmentMode[];
  schedule: ScheduleBlock[];
  leaves: DoctorLeave[];
}

export function useSchedule() {
  return useQuery({
    queryKey: ['schedule', 'me'],
    queryFn: () => api.get<ScheduleState>('/doctor/schedule'),
  });
}

function useInvalidateSchedule() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['schedule', 'dashboard', 'doctors', 'doctor', 'slots', 'availability'].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

export function useSaveSchedule() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (body: { slotMinutes: number; consultationModes: AppointmentMode[]; schedule: ScheduleBlock[] }) =>
      api.put<ScheduleState>('/doctor/schedule', body),
    onSuccess: invalidate,
  });
}

export function useSetAccepting() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (isAccepting: boolean) => api.patch<{ isAccepting: boolean }>('/doctor/accepting', { isAccepting }),
    onSuccess: invalidate,
  });
}

export function useAddLeave() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (body: { date: string; reason?: string }) => api.post<DoctorLeave>('/doctor/leaves', body),
    onSuccess: invalidate,
  });
}

export function useDeleteLeave() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (id: number) => api.del(`/doctor/leaves/${id}`),
    onSuccess: invalidate,
  });
}
