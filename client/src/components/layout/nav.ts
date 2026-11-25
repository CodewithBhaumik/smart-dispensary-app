import {
  Activity,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileHeart,
  FileText,
  LayoutDashboard,
  MessagesSquare,
  Package,
  PackageCheck,
  Pill,
  Siren,
  Stethoscope,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@shared/constants';

export type NavBadgeKey = 'unreadMessages' | 'pendingRequests' | 'activeEmergencies';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: NavBadgeKey;
  danger?: boolean;
  keywords?: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const NAV: Record<Role, NavSection[]> = {
  student: [
    {
      items: [{ label: 'Overview', to: '/student', icon: LayoutDashboard, end: true, keywords: 'home dashboard' }],
    },
    {
      label: 'Care',
      items: [
        { label: 'Find a Doctor', to: '/student/doctors', icon: Stethoscope, keywords: 'doctors directory specialist' },
        { label: 'Appointments', to: '/student/appointments', icon: CalendarDays, keywords: 'book visit schedule' },
        { label: 'Prescriptions', to: '/student/prescriptions', icon: FileText, keywords: 'rx medicines' },
        { label: 'Medical Records', to: '/student/records', icon: FileHeart, keywords: 'documents reports history' },
        { label: 'Messages', to: '/student/messages', icon: MessagesSquare, badge: 'unreadMessages', keywords: 'chat video call doctor' },
      ],
    },
    {
      label: 'Pharmacy',
      items: [
        { label: 'Medicines', to: '/student/medicines', icon: Pill, keywords: 'catalog request pharmacy' },
        { label: 'My Requests', to: '/student/requests', icon: PackageCheck, keywords: 'orders pickup delivery' },
      ],
    },
    {
      label: 'Support',
      items: [{ label: 'Emergency', to: '/student/emergency', icon: Siren, danger: true, keywords: 'help urgent sos' }],
    },
  ],
  doctor: [
    {
      items: [{ label: 'Overview', to: '/doctor', icon: LayoutDashboard, end: true, keywords: 'home dashboard queue' }],
    },
    {
      label: 'Clinic',
      items: [
        { label: 'Appointments', to: '/doctor/appointments', icon: CalendarDays, keywords: 'queue check in consultation' },
        { label: 'Patients', to: '/doctor/patients', icon: UsersRound, keywords: 'students history' },
        { label: 'Prescriptions', to: '/doctor/prescriptions', icon: FileText, keywords: 'rx issued' },
        { label: 'Messages', to: '/doctor/messages', icon: MessagesSquare, badge: 'unreadMessages', keywords: 'chat video call' },
      ],
    },
    {
      label: 'Settings',
      items: [
        { label: 'Availability', to: '/doctor/availability', icon: CalendarClock, keywords: 'schedule slots leave opd' },
        { label: 'Emergencies', to: '/doctor/emergencies', icon: Siren, badge: 'activeEmergencies', keywords: 'urgent sos' },
      ],
    },
  ],
  staff: [
    {
      items: [{ label: 'Overview', to: '/staff', icon: LayoutDashboard, end: true, keywords: 'home dashboard' }],
    },
    {
      label: 'Dispensary',
      items: [
        { label: 'Medicine Requests', to: '/staff/requests', icon: ClipboardList, badge: 'pendingRequests', keywords: 'orders approve fulfil' },
        { label: 'Inventory', to: '/staff/inventory', icon: Package, keywords: 'stock medicines expiry' },
        { label: 'Emergencies', to: '/staff/emergencies', icon: Siren, badge: 'activeEmergencies', keywords: 'urgent sos respond' },
      ],
    },
  ],
  admin: [
    {
      items: [{ label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true, keywords: 'home analytics dashboard' }],
    },
    {
      label: 'Management',
      items: [
        { label: 'Users', to: '/admin/users', icon: Users, keywords: 'students doctors staff accounts' },
        { label: 'Appointments', to: '/admin/appointments', icon: CalendarDays, keywords: 'bookings schedule' },
        { label: 'Medicine Requests', to: '/admin/requests', icon: ClipboardList, badge: 'pendingRequests', keywords: 'orders' },
        { label: 'Inventory', to: '/admin/inventory', icon: Package, keywords: 'stock medicines' },
        { label: 'Emergencies', to: '/admin/emergencies', icon: Siren, badge: 'activeEmergencies', keywords: 'urgent' },
        { label: 'Activity Log', to: '/admin/activity', icon: Activity, keywords: 'audit history events' },
      ],
    },
  ],
};

export function flatNav(role: Role): NavItem[] {
  return NAV[role].flatMap((s) => s.items);
}
