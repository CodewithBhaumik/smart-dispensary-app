import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MedicalRecord } from '@shared/types';
import { api } from '@/lib/api';

export function useRecords() {
  return useQuery({
    queryKey: ['records', 'mine'],
    queryFn: () => api.get<MedicalRecord[]>('/records'),
  });
}

export interface UploadRecordInput {
  file: File;
  category: string;
  title: string;
  recordDate: string;
  description?: string;
}

export function useUploadRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadRecordInput) => {
      const form = new FormData();
      form.append('file', input.file);
      form.append('category', input.category);
      form.append('title', input.title);
      form.append('recordDate', input.recordDate);
      if (input.description) form.append('description', input.description);
      return api.upload<MedicalRecord>('/records', form);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['records'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<{ ok: true }>(`/records/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['records'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
