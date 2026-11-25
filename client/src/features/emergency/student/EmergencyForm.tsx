import { useState } from 'react';
import { Loader2, MapPin, Phone, Siren, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  CAMPUS_LOCATIONS,
  EMERGENCY_CATEGORIES,
  EMERGENCY_SEVERITIES,
  EMERGENCY_SEVERITY_LABELS,
  type EmergencySeverity,
} from '@shared/constants';
import type { AuthUser, Emergency } from '@shared/types';
import { ConfirmDialog, Field } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCreateEmergency } from './api';
import { categoryIcon, SEVERITY_HINTS } from './meta';

const HOSTEL_TYPE = CAMPUS_LOCATIONS[0];

const SEVERITY_STYLES: Record<EmergencySeverity, { active: string; dot: string }> = {
  critical: { active: 'border-rose-400 bg-rose-50 ring-1 ring-rose-500/30', dot: 'bg-rose-500' },
  high: { active: 'border-orange-400 bg-orange-50 ring-1 ring-orange-500/30', dot: 'bg-orange-500' },
  moderate: { active: 'border-amber-400 bg-amber-50 ring-1 ring-amber-500/30', dot: 'bg-amber-500' },
};

interface FormState {
  category: string;
  severity: EmergencySeverity;
  description: string;
  locationType: string;
  locationDetails: string;
  contactPhone: string;
  emergencyContact: string;
  additionalInfo: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

function initialState(user: AuthUser): FormState {
  const s = user.student;
  const inHostel = Boolean(s?.hostel && s.hostel !== 'Day Scholar');
  const contactParts = [
    s?.emergencyContactName,
    s?.emergencyContactRelation ? `(${s.emergencyContactRelation})` : null,
    s?.emergencyContactPhone,
  ].filter(Boolean);
  const info = [
    s?.allergies?.length ? `Allergies: ${s.allergies.join(', ')}` : null,
    s?.conditions?.length ? `Conditions: ${s.conditions.join(', ')}` : null,
    s?.medications?.length ? `Current medication: ${s.medications.join(', ')}` : null,
    s?.bloodGroup ? `Blood group: ${s.bloodGroup}` : null,
  ].filter(Boolean);
  return {
    category: '',
    severity: 'high',
    description: '',
    locationType: inHostel ? HOSTEL_TYPE : '',
    locationDetails: inHostel ? `${s!.hostel}${s?.room ? `, Room ${s.room}` : ''}` : '',
    contactPhone: user.phone ?? '',
    emergencyContact: contactParts.join(' '),
    additionalInfo: info.join('. '),
  };
}

function composeLocation(form: FormState): string {
  const details = form.locationDetails.trim();
  if (form.locationType === HOSTEL_TYPE) return details;
  if (form.locationType === 'Other') return details;
  return details ? `${form.locationType} — ${details}` : form.locationType;
}

export function EmergencyForm({ user, onSubmitted }: { user: AuthUser; onSubmitted: (e: Emergency) => void }) {
  const [form, setForm] = useState<FormState>(() => initialState(user));
  const [errors, setErrors] = useState<Errors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const create = useCreateEmergency();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!form.category) next.category = 'Choose what kind of emergency this is.';
    if (form.description.trim().length < 10) next.description = 'Describe what is happening (at least 10 characters).';
    if (!form.locationType) next.locationType = 'Where are you right now?';
    const needsDetails = form.locationType === HOSTEL_TYPE || form.locationType === 'Other';
    if (needsDetails && form.locationDetails.trim().length < 2) {
      next.locationDetails = form.locationType === HOSTEL_TYPE ? 'Enter your hostel and room.' : 'Describe your location.';
    }
    const digits = form.contactPhone.replace(/\D/g, '');
    if (digits.length < 10) next.contactPhone = 'Enter a phone number the team can call you on.';
    return next;
  };

  const requestSubmit = () => {
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      toast.error('Please complete the highlighted fields.');
      return;
    }
    setConfirmOpen(true);
  };

  const send = async () => {
    try {
      const created = await create.mutateAsync({
        category: form.category,
        severity: form.severity,
        description: form.description.trim(),
        location: composeLocation(form),
        contactPhone: form.contactPhone.trim(),
        emergencyContact: form.emergencyContact.trim() || undefined,
        additionalInfo: form.additionalInfo.trim() || undefined,
      });
      toast.success('Emergency alert sent', { description: `Reference ${created.code}. The health-centre team has been alerted.` });
      onSubmitted(created);
    } catch (e) {
      toast.error('Alert not sent', { description: getErrorMessage(e) });
      throw e;
    }
  };

  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-600/10">
          <Siren className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Request emergency assistance</h2>
          <p className="text-[13px] text-muted-foreground">Takes under a minute. Your profile details are pre-filled.</p>
        </div>
      </header>

      <div className="space-y-6 p-5">
        {/* Category */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-slate-700">
            What is happening?<span className="text-rose-500">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EMERGENCY_CATEGORIES.map((category) => {
              const Icon = categoryIcon(category);
              const active = form.category === category;
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set('category', category)}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all',
                    active
                      ? 'border-rose-400 bg-rose-50 shadow-sm ring-1 ring-rose-500/25'
                      : 'bg-white hover:border-slate-300 hover:bg-muted/40',
                    errors.category && !form.category && 'border-rose-200',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg',
                      active ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className={cn('text-[13px] leading-tight font-medium', active ? 'text-rose-900' : 'text-slate-800')}>
                    {category}
                  </span>
                </button>
              );
            })}
          </div>
          {errors.category && <p className="text-xs font-medium text-rose-600">{errors.category}</p>}
        </div>

        {/* Severity */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-slate-700">How serious is it?</p>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Severity">
            {EMERGENCY_SEVERITIES.map((severity) => {
              const active = form.severity === severity;
              return (
                <button
                  key={severity}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set('severity', severity)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                    active ? SEVERITY_STYLES[severity].active : 'bg-white hover:border-slate-300',
                  )}
                >
                  <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', SEVERITY_STYLES[severity].dot)} />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{EMERGENCY_SEVERITY_LABELS[severity]}</span>
                    <span className="block text-xs text-slate-600">{SEVERITY_HINTS[severity]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Describe the situation" htmlFor="emg-description" required error={errors.description}>
          <Textarea
            id="emg-description"
            rows={3}
            maxLength={1000}
            value={form.description}
            aria-invalid={Boolean(errors.description)}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. Twisted my ankle badly on the stairs and can't put weight on it."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <Field label="Where are you?" required error={errors.locationType}>
            <Select value={form.locationType} onValueChange={(v) => set('locationType', v)}>
              <SelectTrigger className="w-full" aria-invalid={Boolean(errors.locationType)}>
                <SelectValue placeholder="Choose location" />
              </SelectTrigger>
              <SelectContent>
                {CAMPUS_LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={form.locationType === HOSTEL_TYPE ? 'Hostel & room' : 'Location details'}
            htmlFor="emg-location"
            required={form.locationType === HOSTEL_TYPE || form.locationType === 'Other'}
            error={errors.locationDetails}
            hint="Landmark, floor or room number helps the responder find you."
          >
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="emg-location"
                className="pl-9"
                maxLength={150}
                value={form.locationDetails}
                aria-invalid={Boolean(errors.locationDetails)}
                onChange={(e) => set('locationDetails', e.target.value)}
                placeholder={form.locationType === HOSTEL_TYPE ? 'e.g. Hostel J, Room 214' : 'e.g. Second floor, near the lift'}
              />
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your phone number" htmlFor="emg-phone" required error={errors.contactPhone}>
            <div className="relative">
              <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="emg-phone"
                type="tel"
                className="pl-9"
                maxLength={20}
                value={form.contactPhone}
                aria-invalid={Boolean(errors.contactPhone)}
                onChange={(e) => set('contactPhone', e.target.value)}
              />
            </div>
          </Field>
          <Field label="Emergency contact" htmlFor="emg-contact" hint="Family member or guardian to inform.">
            <div className="relative">
              <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="emg-contact"
                className="pl-9"
                maxLength={150}
                value={form.emergencyContact}
                onChange={(e) => set('emergencyContact', e.target.value)}
              />
            </div>
          </Field>
        </div>

        <Field
          label="Relevant medical information"
          htmlFor="emg-info"
          hint="Allergies, conditions or medicines the responder should know about."
        >
          <Textarea
            id="emg-info"
            rows={2}
            maxLength={600}
            value={form.additionalInfo}
            onChange={(e) => set('additionalInfo', e.target.value)}
          />
        </Field>
      </div>

      <footer className="flex flex-col gap-3 border-t border-border/70 bg-rose-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-600">Your location, phone number and medical notes are shared only with the response team.</p>
        <Button variant="destructive" size="lg" onClick={requestSubmit} disabled={create.isPending} className="shrink-0">
          {create.isPending ? <Loader2 className="animate-spin" /> : <Siren />}
          Send emergency alert
        </Button>
      </footer>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="danger"
        title="Send emergency alert now?"
        description={`The health-centre team will be alerted immediately with your location (${composeLocation(form) || 'not set'}) and phone number.`}
        confirmLabel="Send alert"
        cancelLabel="Go back"
        onConfirm={send}
      />
    </section>
  );
}
