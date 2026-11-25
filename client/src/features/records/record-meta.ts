import {
  BadgeCheck,
  File,
  FileText,
  FlaskConical,
  ScanLine,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from 'lucide-react';
import type { RecordCategory } from '@shared/constants';
import type { Tone } from '@/components/app';

export const RECORD_META: Record<RecordCategory, { icon: LucideIcon; tone: Tone }> = {
  visit_summary: { icon: Stethoscope, tone: 'teal' },
  lab_report: { icon: FlaskConical, tone: 'blue' },
  imaging: { icon: ScanLine, tone: 'indigo' },
  vaccination: { icon: Syringe, tone: 'emerald' },
  certificate: { icon: BadgeCheck, tone: 'amber' },
  prescription: { icon: FileText, tone: 'violet' },
  other: { icon: File, tone: 'slate' },
};

/** Categories a student may choose when uploading a document. */
export const UPLOAD_CATEGORIES: RecordCategory[] = ['lab_report', 'imaging', 'vaccination', 'certificate', 'other'];
