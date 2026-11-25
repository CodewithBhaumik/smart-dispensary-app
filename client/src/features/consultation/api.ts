import { useMutation, useQuery } from '@tanstack/react-query';
import type { AppointmentDetail, Consultation, Medicine, Prescription, Vitals } from '@shared/types';
import { api } from '@/lib/api';
import { useInvalidateClinic } from '@/features/doctor/api';

export interface ConsultationInput {
  symptoms: string[];
  vitals: Vitals;
  clinicalNotes: string | null;
  observations: string | null;
  diagnosis: string | null;
  advice: string | null;
  followUpDate: string | null;
  followUpNotes: string | null;
}

export interface PrescriptionItemInput {
  medicineId: number;
  dosage: string;
  frequency: string;
  durationDays: number;
  quantity: number;
  instructions: string | null;
  notes: string | null;
}

/** Active formulary for the medicine picker (includes stock info). */
export function useFormulary() {
  return useQuery({
    queryKey: ['medicines', 'formulary'],
    queryFn: () => api.get<Medicine[]>('/medicines', { sort: 'name' }),
    staleTime: 60_000,
  });
}

export function useSaveDraft(appointmentId: number) {
  return useMutation({
    mutationFn: (body: ConsultationInput) => api.put<Consultation>(`/appointments/${appointmentId}/consultation`, body),
  });
}

export function useCompleteConsultation(appointmentId: number) {
  const invalidate = useInvalidateClinic();
  return useMutation({
    mutationFn: (body: { consultation: ConsultationInput; prescription?: { notes: string | null; items: PrescriptionItemInput[] } | null }) =>
      api.post<AppointmentDetail>(`/appointments/${appointmentId}/complete`, body),
    onSuccess: invalidate,
  });
}

export function useCreatePrescription() {
  const invalidate = useInvalidateClinic();
  return useMutation({
    mutationFn: (body: { appointmentId: number; notes: string | null; items: PrescriptionItemInput[] }) =>
      api.post<Prescription>('/prescriptions', body),
    onSuccess: invalidate,
  });
}
