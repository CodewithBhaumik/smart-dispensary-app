import {
  Activity,
  Bone,
  CircleHelp,
  HeartHandshake,
  HeartPulse,
  ShieldAlert,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { EmergencySeverity, EmergencyStatus } from '@shared/constants';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Medical emergency': HeartPulse,
  'Injury / accident': Bone,
  'Breathing difficulty': Wind,
  'Severe allergic reaction': ShieldAlert,
  'Fainting / unconscious': Activity,
  'High fever': Thermometer,
  'Mental health crisis': HeartHandshake,
  Other: CircleHelp,
};

export const categoryIcon = (category: string): LucideIcon => CATEGORY_ICONS[category] ?? CircleHelp;

export const SEVERITY_HINTS: Record<EmergencySeverity, string> = {
  critical: 'Life-threatening or rapidly getting worse',
  high: 'Needs a responder within minutes',
  moderate: 'Urgent, but stable right now',
};

export function statusMessage(status: EmergencyStatus, responderName: string | null): string {
  switch (status) {
    case 'submitted':
      return 'Your alert has been sent. The health-centre team will acknowledge it shortly — keep your phone nearby.';
    case 'acknowledged':
      return 'The health-centre team has seen your request and is arranging help.';
    case 'responder_assigned':
      return `${responderName ?? 'A responder'} has been assigned and is coming to your location. Stay where you are if it is safe.`;
    default:
      return 'This emergency has been resolved.';
  }
}

/** General safety guidance while waiting (non-clinical). */
export const WHILE_YOU_WAIT = [
  'Stay where you are if it is safe, and keep your phone on and reachable.',
  'Ask a friend, warden or classmate to stay with you.',
  'Keep the door unlocked and the path clear for the responder.',
  'Keep any medicines you have been prescribed close at hand.',
];
