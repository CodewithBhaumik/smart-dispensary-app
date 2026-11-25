import {
  CalendarDays,
  ClipboardList,
  FileHeart,
  FileText,
  LogIn,
  MessageSquare,
  Package,
  Settings2,
  Siren,
  Stethoscope,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityCategory } from '@shared/constants';
import type { Tone } from '@/components/app';

export const ACTIVITY_META: Record<ActivityCategory, { icon: LucideIcon; tone: Tone }> = {
  auth: { icon: LogIn, tone: 'slate' },
  appointment: { icon: CalendarDays, tone: 'blue' },
  consultation: { icon: Stethoscope, tone: 'teal' },
  prescription: { icon: FileText, tone: 'violet' },
  medicine_request: { icon: ClipboardList, tone: 'indigo' },
  inventory: { icon: Package, tone: 'amber' },
  emergency: { icon: Siren, tone: 'rose' },
  user: { icon: Users, tone: 'sky' },
  record: { icon: FileHeart, tone: 'emerald' },
  chat: { icon: MessageSquare, tone: 'sky' },
  call: { icon: Video, tone: 'emerald' },
  system: { icon: Settings2, tone: 'slate' },
};
