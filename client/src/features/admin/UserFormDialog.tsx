import { useEffect } from 'react';
import { Controller, useForm, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  BLOOD_GROUPS,
  DEMO_PASSWORD,
  DEPARTMENTS,
  GENDERS,
  HOSTELS,
  PROGRAMS,
  ROLE_LABELS,
  ROLES,
  type Role,
} from '@shared/constants';
import type { UserListItem } from '@shared/types';
import { Field, ToneBadge } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ApiError, getErrorMessage } from '@/lib/api';
import { useCreateUser, useUpdateUser, type UserPayload } from './api';

const schema = z
  .object({
    role: z.enum(ROLES),
    name: z.string().trim().min(2, 'Enter the full name.').max(80),
    email: z.string().trim().email('Enter a valid email address.').max(120),
    phone: z
      .string()
      .trim()
      .refine((v) => v === '' || /^[+\d][\d\s-]{6,19}$/.test(v), 'Enter a valid phone number.'),
    title: z.string().trim().max(80),
    password: z.string().refine((v) => v === '' || v.length >= 6, 'Password must be at least 6 characters.'),
    rollNo: z.string().trim().max(20),
    department: z.string(),
    program: z.string(),
    year: z.string(),
    gender: z.string(),
    bloodGroup: z.string(),
    hostel: z.string(),
    room: z.string().trim().max(20),
    specialty: z.string().trim().max(80),
    qualifications: z.string().trim().max(160),
    experienceYears: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d+(\.\d)?$/.test(v) && Number(v) <= 60), 'Enter years of experience (0–60).'),
    docRoom: z.string().trim().max(40),
    slotMinutes: z.string(),
    modeInPerson: z.boolean(),
    modeVideo: z.boolean(),
    isVisiting: z.boolean(),
    designation: z.string().trim().max(80),
    shift: z.string().trim().max(80),
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v, message: string, ok: boolean) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [field], message });
    };
    if (v.role === 'student') {
      need('rollNo', 'Enter the roll number.', v.rollNo.trim().length >= 3);
      need('department', 'Choose a department.', !!v.department);
      need('program', 'Choose a programme.', !!v.program);
      need('year', 'Choose the year of study.', !!v.year);
    }
    if (v.role === 'doctor') {
      need('title', 'Enter a designation, e.g. Medical Officer.', v.title.trim().length >= 2);
      need('specialty', 'Enter a specialty.', v.specialty.trim().length >= 2);
      need('qualifications', 'Enter qualifications.', v.qualifications.trim().length >= 2);
      need('modeInPerson', 'Offer at least one consultation mode.', v.modeInPerson || v.modeVideo);
    }
    if (v.role === 'staff' || v.role === 'admin') {
      need('designation', 'Enter a designation.', v.designation.trim().length >= 2);
    }
  });

type FormValues = z.infer<typeof schema>;

const blank = (role: Role): FormValues => ({
  role,
  name: '',
  email: '',
  phone: '',
  title: '',
  password: '',
  rollNo: '',
  department: '',
  program: 'B.E.',
  year: '1',
  gender: '',
  bloodGroup: '',
  hostel: '',
  room: '',
  specialty: '',
  qualifications: '',
  experienceYears: '',
  docRoom: '',
  slotMinutes: '15',
  modeInPerson: true,
  modeVideo: true,
  isVisiting: false,
  designation: '',
  shift: '',
});

function fromUser(u: UserListItem): FormValues {
  const v = blank(u.role);
  return {
    ...v,
    name: u.name,
    email: u.email,
    phone: u.phone ?? '',
    title: u.title ?? '',
    rollNo: u.student?.rollNo ?? '',
    department: u.student?.department ?? '',
    program: u.student?.program ?? v.program,
    year: u.student ? String(u.student.year) : v.year,
    gender: u.student?.gender ?? '',
    bloodGroup: u.student?.bloodGroup ?? '',
    hostel: u.student?.hostel ?? '',
    room: u.student?.room ?? '',
    specialty: u.doctor?.specialty ?? '',
    qualifications: u.doctor?.qualifications ?? u.staff?.qualifications ?? '',
    experienceYears: u.doctor?.experienceYears != null ? String(u.doctor.experienceYears) : '',
    docRoom: u.doctor?.room ?? '',
    slotMinutes: u.doctor ? String(u.doctor.slotMinutes) : v.slotMinutes,
    modeInPerson: u.doctor ? u.doctor.consultationModes.includes('in_person') : true,
    modeVideo: u.doctor ? u.doctor.consultationModes.includes('video') : true,
    isVisiting: u.doctor?.isVisiting ?? false,
    designation: u.staff?.designation ?? '',
    shift: u.staff?.shift ?? '',
  };
}

/** Server error field path → form field. */
const FIELD_MAP: Record<string, keyof FormValues> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  title: 'title',
  password: 'password',
  'student.rollNo': 'rollNo',
  'student.department': 'department',
  'student.program': 'program',
  'student.year': 'year',
  'student.room': 'room',
  'doctor.specialty': 'specialty',
  'doctor.qualifications': 'qualifications',
  'doctor.experienceYears': 'experienceYears',
  'doctor.room': 'docRoom',
  'doctor.slotMinutes': 'slotMinutes',
  'doctor.consultationModes': 'modeInPerson',
  'staff.designation': 'designation',
  'staff.shift': 'shift',
};

const orNull = (v: string) => (v.trim() ? v.trim() : null);

function buildPayload(v: FormValues, isCreate: boolean): UserPayload {
  const base: UserPayload = {
    name: v.name.trim(),
    email: v.email.trim().toLowerCase(),
    phone: orNull(v.phone),
    title: orNull(v.title),
  };
  if (isCreate) {
    base.role = v.role;
    if (v.password) base.password = v.password;
  }
  if (v.role === 'student') {
    base.student = {
      rollNo: v.rollNo.trim(),
      department: v.department,
      program: v.program,
      year: Number(v.year),
      gender: orNull(v.gender),
      bloodGroup: orNull(v.bloodGroup),
      hostel: orNull(v.hostel),
      room: orNull(v.room),
    };
    base.title = `${v.program} · ${v.department} · Year ${v.year}`;
  } else if (v.role === 'doctor') {
    base.doctor = {
      specialty: v.specialty.trim(),
      qualifications: v.qualifications.trim(),
      experienceYears: v.experienceYears ? Number(v.experienceYears) : null,
      room: orNull(v.docRoom),
      slotMinutes: Number(v.slotMinutes),
      consultationModes: [v.modeInPerson && 'in_person', v.modeVideo && 'video'].filter(Boolean),
      isVisiting: v.isVisiting,
    };
  } else {
    base.staff = { designation: v.designation.trim(), shift: orNull(v.shift) };
    base.title = v.designation.trim();
  }
  return base;
}

function SelectField({
  control,
  name,
  label,
  options,
  placeholder,
  errors,
  required,
}: {
  control: Control<FormValues>;
  name: keyof FormValues;
  label: string;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  errors: FieldErrors<FormValues>;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required} error={errors[name]?.message as string | undefined}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={String(field.value ?? '')} onValueChange={field.onChange}>
            <SelectTrigger className="w-full" aria-label={label} aria-invalid={!!errors[name]}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  );
}

const asOptions = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));

function TextField({
  register,
  name,
  label,
  errors,
  required,
  placeholder,
  hint,
  type = 'text',
}: {
  register: UseFormRegister<FormValues>;
  name: keyof FormValues;
  label: string;
  errors: FieldErrors<FormValues>;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  const id = `user-${name}`;
  return (
    <Field label={label} htmlFor={id} required={required} error={errors[name]?.message as string | undefined} hint={hint}>
      <Input id={id} type={type} placeholder={placeholder} aria-invalid={!!errors[name]} {...register(name)} />
    </Field>
  );
}

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  defaultRole = 'student',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserListItem | null;
  defaultRole?: Role;
}) {
  const isCreate = !user;
  const create = useCreateUser();
  const update = useUpdateUser();
  const pending = create.isPending || update.isPending;

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: blank(defaultRole) });

  useEffect(() => {
    if (open) reset(user ? fromUser(user) : blank(defaultRole));
  }, [open, user, defaultRole, reset]);

  const role = watch('role');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const body = buildPayload(values, isCreate);
      if (user) {
        const saved = await update.mutateAsync({ id: user.id, body });
        toast.success('User updated', { description: saved.name });
      } else {
        const saved = await create.mutateAsync(body);
        toast.success(`${ROLE_LABELS[saved.role]} account created`, {
          description: `${saved.name} can sign in with ${saved.email}.`,
        });
      }
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'EMAIL_TAKEN') setError('email', { message: e.message });
        for (const [path, message] of Object.entries(e.fields ?? {})) {
          const field = FIELD_MAP[path];
          if (field) setError(field, { message });
        }
      }
      toast.error(getErrorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="gap-0 bg-card p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="font-display">{isCreate ? 'Add user' : `Edit ${user?.name}`}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'Create an account for a student, doctor, dispensary staff member or administrator.'
              : 'Update account and profile details. Changes apply immediately.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <div className="scrollbar-thin max-h-[min(68vh,640px)] space-y-6 overflow-y-auto px-6 py-5">
            <section className="space-y-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Account</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {isCreate ? (
                  <SelectField
                    control={control}
                    name="role"
                    label="Role"
                    required
                    errors={errors}
                    placeholder="Choose role"
                    options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  />
                ) : (
                  <Field label="Role">
                    <div className="flex h-9 items-center">
                      <ToneBadge tone="teal">{ROLE_LABELS[role]}</ToneBadge>
                    </div>
                  </Field>
                )}
                <TextField register={register} name="name" label="Full name" required errors={errors} placeholder={role === 'doctor' ? 'Dr. Firstname Lastname' : 'Firstname Lastname'} />
                <TextField register={register} name="email" label="Email" type="email" required errors={errors} placeholder="name@smartdispensary.in" />
                <TextField register={register} name="phone" label="Phone" errors={errors} placeholder="+91 98xxx xxxxx" />
                {isCreate && (
                  <TextField
                    register={register}
                    name="password"
                    label="Password"
                    type="password"
                    errors={errors}
                    placeholder="Leave blank for default"
                    hint={`Defaults to the demo password "${DEMO_PASSWORD}".`}
                  />
                )}
              </div>
            </section>

            {role === 'student' && (
              <section className="space-y-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Student profile</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField register={register} name="rollNo" label="Roll number" required errors={errors} placeholder="e.g. 102403215" />
                  <SelectField control={control} name="department" label="Department" required errors={errors} placeholder="Choose department" options={asOptions(DEPARTMENTS)} />
                  <SelectField control={control} name="program" label="Programme" required errors={errors} placeholder="Choose programme" options={asOptions(PROGRAMS)} />
                  <SelectField
                    control={control}
                    name="year"
                    label="Year of study"
                    required
                    errors={errors}
                    placeholder="Choose year"
                    options={[1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }))}
                  />
                  <SelectField control={control} name="gender" label="Gender" errors={errors} placeholder="Not specified" options={asOptions(GENDERS)} />
                  <SelectField control={control} name="bloodGroup" label="Blood group" errors={errors} placeholder="Unknown" options={asOptions(BLOOD_GROUPS)} />
                  <SelectField control={control} name="hostel" label="Hostel" errors={errors} placeholder="Choose hostel" options={asOptions(HOSTELS)} />
                  <TextField register={register} name="room" label="Room" errors={errors} placeholder="e.g. 214" />
                </div>
              </section>
            )}

            {role === 'doctor' && (
              <section className="space-y-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Doctor profile</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField register={register} name="title" label="Designation" required errors={errors} placeholder="e.g. Medical Officer" />
                  <TextField register={register} name="specialty" label="Specialty" required errors={errors} placeholder="e.g. General Medicine" />
                  <TextField register={register} name="qualifications" label="Qualifications" required errors={errors} placeholder="e.g. M.B.B.S, M.D" />
                  <TextField register={register} name="experienceYears" label="Experience (years)" errors={errors} placeholder="e.g. 8" />
                  <TextField register={register} name="docRoom" label="Consultation room" errors={errors} placeholder="e.g. OPD 3" />
                  <SelectField
                    control={control}
                    name="slotMinutes"
                    label="Slot length"
                    errors={errors}
                    placeholder="Choose"
                    options={[10, 15, 20, 30].map((m) => ({ value: String(m), label: `${m} minutes` }))}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-[13px] font-medium text-slate-700">Consultation modes</span>
                  <Controller
                    control={control}
                    name="modeInPerson"
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} /> In-person
                      </label>
                    )}
                  />
                  <Controller
                    control={control}
                    name="modeVideo"
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} /> Video
                      </label>
                    )}
                  />
                  <Controller
                    control={control}
                    name="isVisiting"
                    render={({ field }) => (
                      <label className="ml-auto flex items-center gap-2 text-sm">
                        <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Visiting consultant" /> Visiting consultant
                      </label>
                    )}
                  />
                </div>
                {errors.modeInPerson?.message && <p className="text-xs font-medium text-rose-600">{errors.modeInPerson.message}</p>}
                {isCreate && (
                  <p className="text-xs text-muted-foreground">
                    New doctors start with a Monday–Friday 9:00 AM – 1:00 PM OPD; they can change it under Availability.
                  </p>
                )}
              </section>
            )}

            {(role === 'staff' || role === 'admin') && (
              <section className="space-y-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {role === 'admin' ? 'Administrator profile' : 'Staff profile'}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    register={register}
                    name="designation"
                    label="Designation"
                    required
                    errors={errors}
                    placeholder={role === 'admin' ? 'e.g. Health Centre Administrator' : 'e.g. Pharmacist'}
                  />
                  <TextField register={register} name="shift" label="Shift" errors={errors} placeholder="e.g. Morning · 8:30 AM – 2:30 PM" />
                </div>
              </section>
            )}
          </div>
          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {isCreate ? 'Create account' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
