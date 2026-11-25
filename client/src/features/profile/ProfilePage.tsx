import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Eye,
  EyeOff,
  GraduationCap,
  HeartPulse,
  Home,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  Save,
  Siren,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { BLOOD_GROUPS, DEPARTMENTS, GENDERS, HOSTELS, PROGRAMS, ROLE_LABELS } from '@shared/constants';
import type { AuthUser } from '@shared/types';
import { Field, PageHeader, Panel, TagInput, UserAvatar } from '@/components/app';
import { ROLE_TONE } from '@/components/layout/RoleSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';
import { formatDate, toDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Schemas (all strings in the form; converted on submit)
// ---------------------------------------------------------------------------
const PHONE = /^\+?[\d\s-]{7,16}$/;
const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || PHONE.test(v), 'Enter a valid phone number');
const optionalNumber = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max), `${label} must be between ${min} and ${max}`);
const name = z.string().trim().min(2, 'Enter your full name').max(80, 'Name is too long');

const studentSchema = z.object({
  name,
  phone: optionalPhone,
  gender: z.string(),
  dateOfBirth: z.string(),
  department: z.string().min(1, 'Select your department'),
  program: z.string().min(1, 'Select your programme'),
  year: z.string().min(1, 'Select your year'),
  hostel: z.string(),
  room: z.string().trim().max(20, 'Room number is too long'),
  emergencyContactName: z.string().trim().max(80, 'Name is too long'),
  emergencyContactRelation: z.string().trim().max(30, 'Keep it under 30 characters'),
  emergencyContactPhone: optionalPhone,
  bloodGroup: z.string(),
  allergies: z.array(z.string()),
  conditions: z.array(z.string()),
  medications: z.array(z.string()),
  heightCm: optionalNumber(50, 250, 'Height'),
  weightKg: optionalNumber(20, 250, 'Weight'),
});
type StudentValues = z.infer<typeof studentSchema>;

const doctorSchema = z.object({
  name,
  phone: optionalPhone,
  room: z.string().trim().max(40, 'Too long'),
  qualifications: z.string().trim().min(2, 'Enter your qualifications').max(120, 'Too long'),
  languages: z.array(z.string()),
  bio: z.string().trim().max(600, 'Keep the bio under 600 characters'),
});
type DoctorValues = z.infer<typeof doctorSchema>;

const staffSchema = z.object({
  name,
  phone: optionalPhone,
  shift: z.string().trim().max(60, 'Too long'),
});
type StaffValues = z.infer<typeof staffSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Use at least 8 characters').max(72, 'Too long'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
type PasswordValues = z.infer<typeof passwordSchema>;

const ALLERGY_SUGGESTIONS = ['Penicillin', 'Sulfa drugs', 'Aspirin', 'Ibuprofen (NSAIDs)', 'Peanuts', 'Dust', 'Pollen', 'Latex'];
const CONDITION_SUGGESTIONS = ['Asthma', 'Migraine', 'Diabetes', 'Hypertension', 'Thyroid disorder', 'Anaemia', 'Epilepsy', 'PCOS'];
const LANGUAGE_SUGGESTIONS = ['English', 'Hindi', 'Punjabi', 'Urdu', 'Bengali', 'Tamil', 'Telugu'];

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const nullable = (v: string) => (v.trim() === '' ? null : v.trim());

function studentDefaults(u: AuthUser): StudentValues {
  const p = u.student;
  return {
    name: u.name,
    phone: s(u.phone),
    gender: s(p?.gender),
    dateOfBirth: s(p?.dateOfBirth),
    department: s(p?.department),
    program: s(p?.program),
    year: s(p?.year),
    hostel: s(p?.hostel),
    room: s(p?.room),
    emergencyContactName: s(p?.emergencyContactName),
    emergencyContactRelation: s(p?.emergencyContactRelation),
    emergencyContactPhone: s(p?.emergencyContactPhone),
    bloodGroup: s(p?.bloodGroup),
    allergies: p?.allergies ?? [],
    conditions: p?.conditions ?? [],
    medications: p?.medications ?? [],
    heightCm: p?.heightCm ? String(Math.round(p.heightCm)) : '',
    weightKg: p?.weightKg ? String(Math.round(p.weightKg)) : '',
  };
}

const doctorDefaults = (u: AuthUser): DoctorValues => ({
  name: u.name,
  phone: s(u.phone),
  room: s(u.doctor?.room),
  qualifications: s(u.doctor?.qualifications),
  languages: u.doctor?.languages ?? [],
  bio: s(u.doctor?.bio),
});

const staffDefaults = (u: AuthUser): StaffValues => ({ name: u.name, phone: s(u.phone), shift: s(u.staff?.shift) });

const COMPLETION_FIELDS: (keyof StudentValues)[] = [
  'phone',
  'gender',
  'dateOfBirth',
  'department',
  'program',
  'year',
  'hostel',
  'room',
  'bloodGroup',
  'emergencyContactName',
  'emergencyContactPhone',
  'heightCm',
  'weightKg',
];

function completionOf(v: Partial<StudentValues>): number {
  const filled = COMPLETION_FIELDS.filter((k) => {
    const value = v[k];
    return Array.isArray(value) ? value.length > 0 : Boolean(value && String(value).trim());
  }).length;
  return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}

/** Saves the profile and syncs the signed-in user everywhere. */
function useSaveProfile() {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const save = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const updated = await api.put<AuthUser>('/me/profile', payload);
      setUser(updated);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Profile updated', { description: 'Your changes have been saved.' });
      return updated;
    } catch (e) {
      toast.error(getErrorMessage(e));
      return null;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function SelectField({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  invalid?: boolean;
  id?: string;
}) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {all.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SaveBar({ dirty, saving, onReset }: { dirty: boolean; saving: boolean; onReset: () => void }) {
  return (
    <div
      className={cn(
        'sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur transition-all',
        dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
      aria-hidden={!dirty}
    >
      <p className="text-sm font-medium text-slate-700">You have unsaved changes</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onReset} disabled={saving}>
          <RotateCcw /> Reset
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save changes
        </Button>
      </div>
    </div>
  );
}

function SectionGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

// ---------------------------------------------------------------------------
// Role forms
// ---------------------------------------------------------------------------
function StudentProfileForm({ user, onCompletion }: { user: AuthUser; onCompletion: (n: number) => void }) {
  const form = useForm<StudentValues>({ resolver: zodResolver(studentSchema), defaultValues: studentDefaults(user) });
  const { register, control, handleSubmit, formState, reset, watch } = form;
  const { errors, isDirty } = formState;
  const { save, saving } = useSaveProfile();
  const values = watch();
  const completion = completionOf(values);

  useEffect(() => onCompletion(completion), [completion, onCompletion]);

  const onSubmit = async (v: StudentValues) => {
    const updated = await save({
      name: v.name.trim(),
      phone: nullable(v.phone),
      gender: nullable(v.gender),
      dateOfBirth: nullable(v.dateOfBirth),
      department: v.department,
      program: v.program,
      year: Number(v.year),
      hostel: nullable(v.hostel),
      room: nullable(v.room),
      emergencyContactName: nullable(v.emergencyContactName),
      emergencyContactRelation: nullable(v.emergencyContactRelation),
      emergencyContactPhone: nullable(v.emergencyContactPhone),
      bloodGroup: nullable(v.bloodGroup),
      allergies: v.allergies,
      conditions: v.conditions,
      medications: v.medications,
      heightCm: v.heightCm ? Number(v.heightCm) : null,
      weightKg: v.weightKg ? Number(v.weightKg) : null,
    });
    if (updated) reset(studentDefaults(updated));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Panel title="Personal details" icon={UserRound}>
        <SectionGrid>
          <Field label="Full name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" placeholder="+91 98xxx xxxxx" {...register('phone')} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <SelectField id="gender" value={field.value} onChange={field.onChange} options={GENDERS} placeholder="Select gender" />
              )}
            />
          </Field>
          <Field label="Date of birth" htmlFor="dob">
            <Input id="dob" type="date" max={toDateStr()} {...register('dateOfBirth')} />
          </Field>
        </SectionGrid>
      </Panel>

      <Panel title="Academic details" icon={GraduationCap}>
        <SectionGrid>
          <Field label="Student ID (roll number)" hint="Contact the health centre office to change your roll number.">
            <Input value={user.student?.rollNo ?? ''} readOnly disabled className="font-mono tracking-wider" />
          </Field>
          <Field label="Department" htmlFor="department" error={errors.department?.message} required>
            <Controller
              control={control}
              name="department"
              render={({ field }) => (
                <SelectField
                  id="department"
                  value={field.value}
                  onChange={field.onChange}
                  options={DEPARTMENTS}
                  placeholder="Select department"
                  invalid={!!errors.department}
                />
              )}
            />
          </Field>
          <Field label="Programme" htmlFor="program" error={errors.program?.message} required>
            <Controller
              control={control}
              name="program"
              render={({ field }) => (
                <SelectField id="program" value={field.value} onChange={field.onChange} options={PROGRAMS} placeholder="Select programme" invalid={!!errors.program} />
              )}
            />
          </Field>
          <Field label="Academic year" htmlFor="year" error={errors.year?.message} required>
            <Controller
              control={control}
              name="year"
              render={({ field }) => (
                <SelectField id="year" value={field.value} onChange={field.onChange} options={['1', '2', '3', '4', '5']} placeholder="Select year" invalid={!!errors.year} />
              )}
            />
          </Field>
        </SectionGrid>
      </Panel>

      <Panel title="Residence" description="Used for campus deliveries and emergency response." icon={Home}>
        <SectionGrid>
          <Field label="Hostel / block" htmlFor="hostel">
            <Controller
              control={control}
              name="hostel"
              render={({ field }) => (
                <SelectField id="hostel" value={field.value} onChange={field.onChange} options={HOSTELS} placeholder="Select hostel" />
              )}
            />
          </Field>
          <Field label="Room number" htmlFor="room" error={errors.room?.message}>
            <Input id="room" placeholder="e.g. 214" {...register('room')} />
          </Field>
        </SectionGrid>
      </Panel>

      <Panel title="Emergency contact" description="Shared with responders only during an emergency." icon={Siren}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contact name" htmlFor="ecName" error={errors.emergencyContactName?.message}>
            <Input id="ecName" {...register('emergencyContactName')} />
          </Field>
          <Field label="Relation" htmlFor="ecRelation" error={errors.emergencyContactRelation?.message}>
            <Input id="ecRelation" placeholder="e.g. Father" {...register('emergencyContactRelation')} />
          </Field>
          <Field label="Phone" htmlFor="ecPhone" error={errors.emergencyContactPhone?.message}>
            <Input id="ecPhone" type="tel" {...register('emergencyContactPhone')} aria-invalid={!!errors.emergencyContactPhone} />
          </Field>
        </div>
      </Panel>

      <Panel title="Medical information" description="Visible to doctors during your consultations." icon={HeartPulse}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Blood group" htmlFor="blood">
              <Controller
                control={control}
                name="bloodGroup"
                render={({ field }) => (
                  <SelectField id="blood" value={field.value} onChange={field.onChange} options={BLOOD_GROUPS} placeholder="Select" />
                )}
              />
            </Field>
            <Field label="Height (cm)" htmlFor="height" error={errors.heightCm?.message}>
              <Input id="height" inputMode="numeric" {...register('heightCm')} aria-invalid={!!errors.heightCm} />
            </Field>
            <Field label="Weight (kg)" htmlFor="weight" error={errors.weightKg?.message}>
              <Input id="weight" inputMode="numeric" {...register('weightKg')} aria-invalid={!!errors.weightKg} />
            </Field>
          </div>
          <Field label="Allergies" htmlFor="allergies" hint="Doctors see these as alerts before prescribing.">
            <Controller
              control={control}
              name="allergies"
              render={({ field }) => (
                <TagInput id="allergies" value={field.value} onChange={field.onChange} suggestions={ALLERGY_SUGGESTIONS} placeholder="Add an allergy and press Enter" />
              )}
            />
          </Field>
          <Field label="Existing medical conditions" htmlFor="conditions">
            <Controller
              control={control}
              name="conditions"
              render={({ field }) => (
                <TagInput id="conditions" value={field.value} onChange={field.onChange} suggestions={CONDITION_SUGGESTIONS} placeholder="Add a condition and press Enter" />
              )}
            />
          </Field>
          <Field label="Current medications" htmlFor="medications">
            <Controller
              control={control}
              name="medications"
              render={({ field }) => (
                <TagInput id="medications" value={field.value} onChange={field.onChange} placeholder="e.g. Salbutamol inhaler (as needed)" />
              )}
            />
          </Field>
        </div>
      </Panel>

      <SaveBar dirty={isDirty} saving={saving} onReset={() => reset(studentDefaults(user))} />
    </form>
  );
}

function DoctorProfileForm({ user }: { user: AuthUser }) {
  const form = useForm<DoctorValues>({ resolver: zodResolver(doctorSchema), defaultValues: doctorDefaults(user) });
  const { register, control, handleSubmit, formState, reset, watch } = form;
  const { errors, isDirty } = formState;
  const { save, saving } = useSaveProfile();
  const bio = watch('bio');

  const onSubmit = async (v: DoctorValues) => {
    const updated = await save({
      name: v.name.trim(),
      phone: nullable(v.phone),
      room: nullable(v.room),
      qualifications: v.qualifications.trim(),
      languages: v.languages,
      bio: nullable(v.bio),
    });
    if (updated) reset(doctorDefaults(updated));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Panel title="Professional profile" description="Shown to students in the doctor directory." icon={Stethoscope}>
        <div className="space-y-4">
          <SectionGrid>
            <Field label="Full name" htmlFor="name" error={errors.name?.message} required>
              <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
            </Field>
            <Field label="Mobile number" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" type="tel" {...register('phone')} aria-invalid={!!errors.phone} />
            </Field>
            <Field label="Qualifications" htmlFor="qualifications" error={errors.qualifications?.message} required>
              <Input id="qualifications" {...register('qualifications')} aria-invalid={!!errors.qualifications} />
            </Field>
            <Field label="Consultation room" htmlFor="room" error={errors.room?.message}>
              <Input id="room" placeholder="e.g. OPD 1" {...register('room')} />
            </Field>
          </SectionGrid>
          <Field label="Languages" htmlFor="languages">
            <Controller
              control={control}
              name="languages"
              render={({ field }) => (
                <TagInput id="languages" value={field.value} onChange={field.onChange} suggestions={LANGUAGE_SUGGESTIONS} />
              )}
            />
          </Field>
          <Field
            label="About you"
            htmlFor="bio"
            error={errors.bio?.message}
            hint={`${bio?.length ?? 0}/600 characters`}
          >
            <Textarea id="bio" rows={5} {...register('bio')} />
          </Field>
          <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Specialty</p>
              <p className="font-medium text-slate-800">{user.doctor?.specialty}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Designation</p>
              <p className="font-medium text-slate-800">{user.title ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Slot length</p>
              <p className="font-medium text-slate-800">{user.doctor?.slotMinutes} minutes</p>
            </div>
          </div>
        </div>
      </Panel>
      <SaveBar dirty={isDirty} saving={saving} onReset={() => reset(doctorDefaults(user))} />
    </form>
  );
}

function StaffProfileForm({ user }: { user: AuthUser }) {
  const form = useForm<StaffValues>({ resolver: zodResolver(staffSchema), defaultValues: staffDefaults(user) });
  const { register, handleSubmit, formState, reset } = form;
  const { errors, isDirty } = formState;
  const { save, saving } = useSaveProfile();

  const onSubmit = async (v: StaffValues) => {
    const updated = await save({ name: v.name.trim(), phone: nullable(v.phone), shift: nullable(v.shift) });
    if (updated) reset(staffDefaults(updated));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Panel title="Account details" icon={UserRound}>
        <SectionGrid>
          <Field label="Full name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" {...register('phone')} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Designation" hint="Managed by the health centre office.">
            <Input value={user.staff?.designation ?? user.title ?? ''} readOnly disabled />
          </Field>
          <Field label="Shift" htmlFor="shift" error={errors.shift?.message}>
            <Input id="shift" placeholder="e.g. Morning · 8:30 AM – 2:30 PM" {...register('shift')} />
          </Field>
        </SectionGrid>
      </Panel>
      <SaveBar dirty={isDirty} saving={saving} onReset={() => reset(staffDefaults(user))} />
    </form>
  );
}

function PasswordCard() {
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const { register, handleSubmit, formState, reset } = form;
  const { errors, isSubmitting } = formState;
  const [show, setShow] = useState(false);

  const onSubmit = async (v: PasswordValues) => {
    try {
      await api.put('/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success('Password changed', { description: 'Use your new password next time you sign in.' });
      reset();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Panel title="Change password" icon={KeyRound}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
          <Input id="currentPassword" type={show ? 'text' : 'password'} autoComplete="current-password" {...register('currentPassword')} />
        </Field>
        <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
          <Input id="newPassword" type={show ? 'text' : 'password'} autoComplete="new-password" {...register('newPassword')} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
          <Input id="confirmPassword" type={show ? 'text' : 'password'} autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {show ? 'Hide' : 'Show'} passwords
          </button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />} Update password
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function SummaryCard({ user, completion }: { user: AuthUser; completion: number | null }) {
  const details: { icon: LucideIcon; text: ReactNode }[] = [
    { icon: Mail, text: user.email },
    ...(user.phone ? [{ icon: Phone, text: user.phone }] : []),
  ];
  if (user.student) {
    details.push({ icon: GraduationCap, text: `${user.student.program} · ${user.student.department} · Year ${user.student.year}` });
    if (user.student.hostel) details.push({ icon: Home, text: `${user.student.hostel}${user.student.room ? `, Room ${user.student.room}` : ''}` });
  }
  if (user.doctor) details.push({ icon: Stethoscope, text: `${user.doctor.specialty} · ${user.doctor.qualifications}` });
  if (user.staff) details.push({ icon: BadgeCheck, text: user.staff.designation });

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="h-16 bg-[#0b1b33]">
        <div className="bg-grid h-full w-full opacity-70" />
      </div>
      <div className="px-5 pb-5">
        <span className="-mt-9 mb-3 inline-block rounded-full bg-card p-1 shadow-sm">
          <UserAvatar user={user} size="xl" />
        </span>
        <h2 className="font-display text-lg font-semibold text-slate-900">{user.name}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', ROLE_TONE[user.role])}>
            {ROLE_LABELS[user.role]}
          </span>
          {user.student && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-slate-600">
              {user.student.rollNo}
            </span>
          )}
        </div>
        <ul className="mt-4 space-y-2.5 text-[13px] text-slate-600">
          {details.map((d, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <d.icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <span className="min-w-0 break-words">{d.text}</span>
            </li>
          ))}
        </ul>
        {completion !== null && (
          <div className="mt-5 space-y-1.5 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">Profile completeness</span>
              <span className="font-semibold text-slate-900 tabular-nums">{completion}%</span>
            </div>
            <Progress value={completion} className="h-1.5 bg-slate-200" />
            <p className="text-[11px] text-muted-foreground">
              {completion === 100 ? 'Great — your health profile is complete.' : 'A complete profile helps doctors treat you faster.'}
            </p>
          </div>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground">Member since {formatDate(user.createdAt)}</p>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const initialCompletion = useMemo(() => (user.student ? completionOf(studentDefaults(user)) : null), [user]);
  const [completion, setCompletion] = useState<number | null>(initialCompletion);

  return (
    <>
      <PageHeader
        title="My profile"
        description={
          user.role === 'student'
            ? 'Keep your contact, residence and medical details up to date — doctors and responders rely on them.'
            : 'Manage your account details and password.'
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6 lg:sticky lg:top-24">
          <SummaryCard user={user} completion={user.student ? completion : null} />
          <PasswordCard />
        </div>
        <div className="min-w-0">
          {user.role === 'student' ? (
            <StudentProfileForm key={user.id} user={user} onCompletion={setCompletion} />
          ) : user.role === 'doctor' ? (
            <DoctorProfileForm key={user.id} user={user} />
          ) : (
            <StaffProfileForm key={user.id} user={user} />
          )}
        </div>
      </div>
    </>
  );
}
