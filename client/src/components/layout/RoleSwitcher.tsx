import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, FlaskConical, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS, ROLES, type Role } from '@shared/constants';
import type { DemoAccount, LoginResponse } from '@shared/types';
import { ConfirmDialog, UserAvatar } from '@/components/app';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export const ROLE_TONE: Record<Role, string> = {
  student: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  doctor: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  staff: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  admin: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function useDemoAccounts() {
  return useQuery({
    queryKey: ['meta', 'demo-accounts'],
    queryFn: () => api.get<DemoAccount[]>('/auth/demo-accounts'),
    staleTime: 5 * 60_000,
  });
}

/** Demo-mode identity switcher: jump between Student / Doctor / Staff / Admin without logging out. */
export function RoleSwitcher() {
  const { user, switchToAccount, applySession } = useAuth();
  const navigate = useNavigate();
  const { data: accounts = [] } = useDemoAccounts();
  const [switching, setSwitching] = useState<number | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const handleSwitch = async (account: DemoAccount) => {
    if (account.id === user.id) return;
    setSwitching(account.id);
    try {
      const next = await switchToAccount(account.id);
      navigate(`/${next.role}`);
      toast.success(`Now viewing as ${next.name}`, { description: `${ROLE_LABELS[next.role]} workspace` });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSwitching(null);
    }
  };

  const handleReset = async () => {
    try {
      const session = await api.post<LoginResponse>('/demo/reset');
      const next = applySession(session);
      navigate(`/${next.role}`);
      toast.success('Demo data has been reset', { description: 'All workflows are back to their starting state.' });
    } catch (e) {
      toast.error(getErrorMessage(e));
      throw e;
    }
  };

  const grouped = ROLES.map((role) => ({
    role,
    accounts: accounts.filter((a) => a.role === role),
  })).filter((g) => g.accounts.length > 0);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="role-switcher"
            className="group inline-flex h-9 items-center gap-2 rounded-full border border-dashed border-teal-300 bg-teal-50/60 pr-2.5 pl-1.5 text-sm font-medium text-teal-900 transition-colors hover:border-teal-400 hover:bg-teal-50"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-white text-teal-600 shadow-xs ring-1 ring-teal-600/15">
              <FlaskConical className="size-3.5" />
            </span>
            <span className="hidden text-xs font-semibold tracking-wide text-teal-700 uppercase sm:inline">Demo</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', ROLE_TONE[user.role])}>
              {ROLE_LABELS[user.role]}
            </span>
            <ChevronDown className="size-3.5 text-teal-700 transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[min(640px,80vh)] w-[320px] overflow-y-auto p-1.5">
          <div className="px-2 pt-1.5 pb-2">
            <p className="font-display text-sm font-semibold text-slate-900">Switch demo identity</p>
            <p className="text-xs text-muted-foreground">Instantly view the app as another role. Data stays shared.</p>
          </div>
          {grouped.map((group, gi) => (
            <DropdownMenuGroup key={group.role}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {ROLE_LABELS[group.role]}
              </DropdownMenuLabel>
              {group.accounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  data-testid={`switch-${account.role}-${account.id}`}
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleSwitch(account);
                  }}
                  className="gap-3 py-2"
                >
                  <UserAvatar user={account} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {account.name}
                      {account.isPrimary && (
                        <span className="ml-1.5 rounded bg-teal-50 px-1 py-px text-[10px] font-semibold text-teal-700 uppercase">
                          Demo
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{account.title}</p>
                  </div>
                  {switching === account.id ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : account.id === user.id ? (
                    <Check className="size-4 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setResetOpen(true)}
            className="gap-2 text-rose-600 focus:bg-rose-50 focus:text-rose-700"
          >
            <RotateCcw className="size-4" />
            Reset demo data…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        tone="danger"
        title="Reset all demo data?"
        description="Every appointment, prescription, request, message and change made during this demo will be replaced with the original sample data. Dates are re-anchored to today."
        confirmLabel="Reset demo data"
        onConfirm={handleReset}
      />
    </>
  );
}
