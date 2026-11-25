import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowRight,
  CalendarCheck2,
  Clock3,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  LockKeyhole,
  Mail,
  PackageCheck,
  ShieldCheck,
  Siren,
  Stethoscope,
  Video,
} from 'lucide-react';
import { DEMO_PASSWORD, DISPENSARY_TIMETABLE, ROLE_LABELS, ROLES, type Role } from '@shared/constants';
import type { DemoAccount } from '@shared/types';
import { Field, UserAvatar } from '@/components/app';
import { Logo } from '@/components/layout/Logo';
import { ROLE_TONE, useDemoAccounts } from '@/components/layout/RoleSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthState } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

const FEATURES = [
  { icon: CalendarCheck2, title: 'Book doctors in seconds', text: 'Live OPD slots, check-in passes and queue tokens.' },
  { icon: Video, title: 'Chat & video consultations', text: 'Talk to campus doctors without leaving your room.' },
  { icon: PackageCheck, title: 'Prescriptions to pickup', text: 'Request medicines and track them to the counter.' },
  { icon: Siren, title: 'Emergency assistance', text: 'Alert the health-centre team with your location.' },
];

const ROLE_ICON: Record<Role, typeof Stethoscope> = {
  student: CalendarCheck2,
  doctor: Stethoscope,
  staff: PackageCheck,
  admin: ShieldCheck,
};

const ROLE_BLURB: Record<Role, string> = {
  student: 'Book, consult, request medicines',
  doctor: 'Queue, consultations, prescriptions',
  staff: 'Requests, inventory, emergencies',
  admin: 'Analytics, users, activity',
};

export default function LoginPage() {
  const { status, user, login, switchToAccount } = useAuthState();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [quickId, setQuickId] = useState<number | null>(null);
  const { data: accounts = [] } = useDemoAccounts();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (status === 'authenticated' && user) return <Navigate to={`/${user.role}`} replace />;

  const goHome = (role: Role) => {
    const next = params.get('next');
    navigate(next && next.startsWith(`/${role}`) ? next : `/${role}`, { replace: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const me = await login(values.email, values.password);
      toast.success(`Welcome back, ${me.name}`);
      goHome(me.role);
    } catch (e) {
      form.setError('password', { message: getErrorMessage(e) });
    }
  });

  const quickLogin = async (account: DemoAccount) => {
    setQuickId(account.id);
    try {
      const me = await switchToAccount(account.id);
      toast.success(`Signed in as ${me.name}`, { description: `${ROLE_LABELS[me.role]} workspace` });
      goHome(me.role);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setQuickId(null);
    }
  };

  const primaries = ROLES.map((role) => accounts.find((a) => a.role === role && a.isPrimary)).filter(
    (a): a is DemoAccount => Boolean(a),
  );

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[#0b1b33] text-white lg:flex lg:flex-col">
        <div className="bg-grid absolute inset-0" aria-hidden />
        <div
          className="absolute -top-40 -right-32 size-[520px] rounded-full bg-teal-500/20 blur-3xl"
          aria-hidden
        />
        <div className="absolute -bottom-48 -left-24 size-[420px] rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
          <Logo />
          <div className="mt-auto max-w-lg pt-16">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-xs font-medium text-teal-200 ring-1 ring-white/10">
              <span className="size-1.5 rounded-full bg-teal-300" /> Campus healthcare, connected
            </p>
            <h1 className="mt-5 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance xl:text-[44px]">
              Your health centre, open on every screen.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
              Smart Dispensary connects students, doctors, pharmacists and administrators — from the first booking to
              the last tablet dispensed.
            </p>
            <ul className="mt-9 grid gap-5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-teal-300 ring-1 ring-white/10">
                    <f.icon className="size-[18px]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{f.title}</span>
                    <span className="block text-[13px] leading-snug text-slate-400">{f.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="size-4 text-teal-300" /> Health centre timings
            </div>
            <dl className="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
              {DISPENSARY_TIMETABLE.map((row) => (
                <div key={row.days}>
                  <dt className="text-slate-400">{row.days}</dt>
                  <dd className="font-medium text-slate-100">{row.hours}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </aside>

      {/* Sign-in panel */}
      <main className="flex flex-col bg-background lg:bg-white">
        <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
          <Logo light={false} />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[440px] animate-fade-up">
            <div className="mb-8">
              <h2 className="font-display text-[28px] font-semibold tracking-tight text-slate-900">Sign in</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Use your campus account, or pick a demo identity below.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Field label="Email address" htmlFor="email" error={form.formState.errors.email?.message}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@smartdispensary.in"
                    className="h-11 pl-9"
                    aria-invalid={!!form.formState.errors.email}
                    {...form.register('email')}
                  />
                </div>
              </Field>
              <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 pr-10 pl-9"
                    aria-invalid={!!form.formState.errors.password}
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-muted hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Sign in
                {!form.formState.isSubmitting && <ArrowRight />}
              </Button>
            </form>

            <div className="my-8 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <FlaskConical className="size-3.5 text-teal-600" /> Demo access
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {primaries.map((account) => {
                const Icon = ROLE_ICON[account.role];
                return (
                  <button
                    key={account.id}
                    type="button"
                    data-testid={`demo-login-${account.role}`}
                    onClick={() => quickLogin(account)}
                    disabled={quickId !== null}
                    className={cn(
                      'group relative flex items-start gap-3 rounded-xl border bg-card p-3.5 text-left shadow-xs transition-all',
                      'hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md disabled:pointer-events-none disabled:opacity-60',
                    )}
                  >
                    <UserAvatar user={account} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase ring-1 ring-inset', ROLE_TONE[account.role])}>
                          <Icon className="size-3" />
                          {ROLE_LABELS[account.role]}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold text-slate-900">{account.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{ROLE_BLURB[account.role]}</span>
                    </span>
                    {quickId === account.id ? (
                      <Loader2 className="absolute top-3.5 right-3.5 size-4 animate-spin text-primary" />
                    ) : (
                      <ArrowRight className="absolute top-3.5 right-3.5 size-4 text-slate-300 transition-colors group-hover:text-teal-600" />
                    )}
                  </button>
                );
              })}
              {primaries.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[76px] animate-pulse rounded-xl bg-muted" />)}
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Demo accounts share the password <span className="font-mono font-semibold text-slate-700">{DEMO_PASSWORD}</span>
              . Switch identities anytime from the <span className="font-semibold text-slate-700">Demo</span> menu.
            </p>
          </div>
        </div>
        <p className="px-6 pb-6 text-center text-xs text-muted-foreground">
          Demo environment · sample data only — not connected to real medical records.
        </p>
      </main>
    </div>
  );
}
