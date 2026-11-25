import { FREQUENCIES, type FrequencyCode } from '@shared/constants';
import type { Medicine } from '@shared/types';

// ---------------------------------------------------------------------------
// Allergy safety check
// ---------------------------------------------------------------------------
/** Allergy keyword → drug name fragments that commonly cross-react. */
const ALLERGY_MAP: { match: RegExp; drugs: string[] }[] = [
  { match: /penicillin|amoxi|ampicillin|beta.?lactam/i, drugs: ['amoxicillin', 'ampicillin', 'penicillin', 'amoxyclav', 'clavulan', 'cloxacillin'] },
  { match: /sulfa|sulpha|sulfonamide/i, drugs: ['sulfamethoxazole', 'sulfa', 'sulpha', 'cotrimoxazole', 'silver sulfadiazine'] },
  { match: /nsaid|aspirin|ibuprofen|diclofenac/i, drugs: ['ibuprofen', 'diclofenac', 'aspirin', 'mefenamic', 'naproxen', 'aceclofenac'] },
  { match: /cephalo|cefa|cefi/i, drugs: ['cefixime', 'cefuroxime', 'cephalexin', 'ceftriaxone', 'cefpodoxime'] },
  { match: /macrolide|azithro|erythro|clarithro/i, drugs: ['azithromycin', 'erythromycin', 'clarithromycin'] },
  { match: /quinolone|cipro|levoflox|oflox/i, drugs: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'norfloxacin'] },
  { match: /paracetamol|acetaminophen/i, drugs: ['paracetamol', 'acetaminophen'] },
  { match: /iodine|povidone/i, drugs: ['povidone', 'iodine', 'betadine'] },
];

/** Returns the patient allergies a medicine may conflict with (empty = no known conflict). */
export function allergyConflicts(
  medicine: Pick<Medicine, 'name' | 'genericName'> | { name: string; genericName?: string | null },
  allergies: string[],
): string[] {
  const haystack = `${medicine.name} ${medicine.genericName ?? ''}`.toLowerCase();
  const hits: string[] = [];
  for (const allergy of allergies) {
    const a = allergy.trim().toLowerCase();
    if (!a) continue;
    const direct = a.length >= 4 && haystack.includes(a);
    const mapped = ALLERGY_MAP.some((m) => m.match.test(a) && m.drugs.some((d) => haystack.includes(d)));
    if (direct || mapped) hits.push(allergy);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Dose defaults & quantity estimate
// ---------------------------------------------------------------------------
const COUNTABLE_FORMS = new Set(['Tablet', 'Capsule', 'Lozenge', 'Sachet']);

export function defaultDosage(form: string): string {
  switch (form) {
    case 'Tablet':
      return '1 tablet';
    case 'Capsule':
      return '1 capsule';
    case 'Syrup':
    case 'Suspension':
      return '10 ml';
    case 'Drops':
      return '2 drops';
    case 'Ointment':
    case 'Cream':
    case 'Gel':
      return 'Apply a thin layer';
    case 'Inhaler':
      return '2 puffs';
    case 'Sachet':
      return '1 sachet';
    case 'Spray':
      return '2 sprays';
    case 'Lozenge':
      return '1 lozenge';
    case 'Dressing':
      return 'As required';
    default:
      return 'As directed';
  }
}

export function defaultFrequency(form: string): FrequencyCode {
  if (form === 'Inhaler') return 'SOS';
  if (form === 'Lozenge') return 'TDS';
  if (form === 'Dressing') return 'OD';
  return 'BD';
}

export function defaultDuration(form: string): number {
  if (['Ointment', 'Cream', 'Gel'].includes(form)) return 7;
  if (form === 'Inhaler') return 30;
  return 5;
}

/** Units per dispensed pack, parsed from strings like "strip of 10", "pack of 6", "10 tablets". */
export function packSize(unit: string): number {
  const m = unit.match(/(?:strip|pack|box|bottle|card|blister)\s+of\s+(\d+)/i) ?? unit.match(/(\d+)\s*(?:tablets?|tabs?|capsules?|caps?|sachets?|lozenges?)/i);
  return m ? Math.max(1, Number(m[1])) : 1;
}

/** Leading number of a dosage string ("2 tablets" → 2, "½ tablet" → 1). */
function dosesPerIntake(dosage: string): number {
  const m = dosage.match(/^\s*(\d+(?:\.\d+)?)/);
  return m ? Math.max(1, Number(m[1])) : 1;
}

export interface QuantityEstimate {
  quantity: number;
  /** e.g. "10 doses · 1 × strip of 10" */
  hint: string | null;
}

/** Suggested number of dispensing units for a prescription row. */
export function estimateQuantity(
  med: { form: string; unit: string },
  frequency: string,
  durationDays: number,
  dosage: string,
): QuantityEstimate {
  if (!COUNTABLE_FORMS.has(med.form) || !durationDays) return { quantity: 1, hint: `1 × ${med.unit}` };
  const perDay = FREQUENCIES.find((f) => f.value === frequency)?.perDay ?? 1;
  const isSos = frequency === 'SOS';
  const isStat = frequency === 'STAT';
  const doses = isStat ? dosesPerIntake(dosage) : perDay * durationDays * dosesPerIntake(dosage);
  const size = packSize(med.unit);
  const quantity = Math.min(100, Math.max(1, Math.ceil(doses / size)));
  const unitNoun = med.form.toLowerCase();
  return {
    quantity,
    hint:
      size > 1
        ? `${doses} ${unitNoun}${doses === 1 ? '' : 's'} · ${quantity} × ${med.unit}`
        : `${doses} ${unitNoun}${doses === 1 ? '' : 's'}${isSos ? ' (max, as needed)' : ''}`,
  };
}

export const frequencyLabel = (code: string) => FREQUENCIES.find((f) => f.value === code)?.label ?? code;
