import {
  Bandage,
  Candy,
  Droplet,
  Package,
  Pill,
  PillBottle,
  SprayCan,
  Tablets,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { Medicine } from '@shared/types';
import { ToneBadge, type Tone } from '@/components/app';

const FORM_ICONS: Record<string, LucideIcon> = {
  Tablet: Tablets,
  Capsule: Pill,
  Syrup: PillBottle,
  Suspension: PillBottle,
  Solution: PillBottle,
  Ointment: Package,
  Cream: Package,
  Gel: Package,
  Drops: Droplet,
  Inhaler: Wind,
  Sachet: Package,
  Spray: SprayCan,
  Lozenge: Candy,
  Dressing: Bandage,
};

export function formIcon(form: string): LucideIcon {
  return FORM_ICONS[form] ?? Pill;
}

/** Student-facing availability wording (no exact stock counts). */
export function availability(medicine: Pick<Medicine, 'stockStatus'>): { label: string; tone: Tone } {
  switch (medicine.stockStatus) {
    case 'out_of_stock':
      return { label: 'Out of stock', tone: 'rose' };
    case 'low_stock':
      return { label: 'Low stock', tone: 'amber' };
    default:
      return { label: 'Available', tone: 'emerald' };
  }
}

export function AvailabilityBadge({ medicine }: { medicine: Pick<Medicine, 'stockStatus'> }) {
  const a = availability(medicine);
  return (
    <ToneBadge tone={a.tone} dot>
      {a.label}
    </ToneBadge>
  );
}

export function RxBadge() {
  return (
    <span className="inline-flex h-5 items-center rounded-md bg-violet-50 px-1.5 text-[10.5px] font-semibold text-violet-700 ring-1 ring-violet-600/15 ring-inset">
      Rx · Prescription required
    </span>
  );
}

export function medicineSubtitle(m: Pick<Medicine, 'form' | 'strength' | 'unit'>): string {
  return [m.strength, m.form, m.unit].filter(Boolean).join(' · ');
}
