import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MoreHorizontal, Pencil, Plus, ShieldCheck, UserCheck, UserRoundX, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS, ROLES, type Role } from '@shared/constants';
import type { UserListItem } from '@shared/types';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FilterChips,
  PageHeader,
  Panel,
  SearchInput,
  StatusBadge,
  UserAvatar,
  type Column,
} from '@/components/app';
import { ROLE_TONE } from '@/components/layout/RoleSwitcher';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSetUserStatus, useUsers } from './api';
import { UserFormDialog } from './UserFormDialog';

type RoleFilter = 'all' | Role;
type StatusFilter = 'all' | 'active' | 'inactive';

const ROLE_PLURAL: Record<Role, string> = { student: 'Students', doctor: 'Doctors', staff: 'Staff', admin: 'Admins' };

export default function UsersPage() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const users = useUsers();
  const setStatus = useSetUserStatus();
  const [search, setSearch] = useState('');
  const [status, setStatusFilter] = useState<StatusFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [toggling, setToggling] = useState<UserListItem | null>(null);

  const roleParam = params.get('role');
  const role: RoleFilter = roleParam && (ROLES as readonly string[]).includes(roleParam) ? (roleParam as Role) : 'all';
  const setRole = (r: RoleFilter) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (r === 'all') next.delete('role');
        else next.set('role', r);
        return next;
      },
      { replace: true },
    );

  const all = users.data ?? [];
  const filteredExceptRole = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((u) => {
      if (status === 'active' && !u.isActive) return false;
      if (status === 'inactive' && u.isActive) return false;
      if (q && ![u.name, u.email, u.summary, u.phone ?? '', u.title ?? ''].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, search, status]);
  const rows = role === 'all' ? filteredExceptRole : filteredExceptRole.filter((u) => u.role === role);
  const count = (r: RoleFilter) => (r === 'all' ? filteredExceptRole.length : filteredExceptRole.filter((u) => u.role === r).length);

  const confirmToggle = async () => {
    if (!toggling) return;
    const activate = !toggling.isActive;
    try {
      await setStatus.mutateAsync({ id: toggling.id, isActive: activate });
      toast.success(activate ? 'Account activated' : 'Account deactivated', {
        description: activate ? `${toggling.name} can sign in again.` : `${toggling.name} has been signed out of all devices.`,
      });
    } catch (e) {
      toast.error(getErrorMessage(e));
      throw e;
    }
  };

  const columns: Column<UserListItem>[] = [
    {
      key: 'user',
      header: 'User',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <UserAvatar user={u} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium text-slate-900">
              {u.name}
              {u.isDemo && (
                <span className="rounded bg-teal-50 px-1 py-px text-[10px] font-semibold text-teal-700 uppercase ring-1 ring-teal-600/15 ring-inset">
                  Demo
                </span>
              )}
              {u.id === me.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (u) => (
        <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset', ROLE_TONE[u.role])}>
          {ROLE_LABELS[u.role]}
        </span>
      ),
    },
    {
      key: 'summary',
      header: 'Details',
      cell: (u) => <span className="block max-w-[300px] truncate text-[13px] text-slate-600">{u.summary}</span>,
    },
    { key: 'phone', header: 'Phone', cell: (u) => <span className="text-[13px] text-slate-600">{u.phone ?? '—'}</span> },
    { key: 'status', header: 'Status', cell: (u) => <StatusBadge kind="user" status={u.isActive ? 'active' : 'inactive'} /> },
    {
      key: 'login',
      header: 'Last sign-in',
      cell: (u) => <span className="text-[13px] text-slate-600">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headClassName: 'w-12',
      className: 'text-right',
      cell: (u) => {
        const protectedAccount = u.isDemo || u.id === me.id;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(u);
                    setFormOpen(true);
                  }}
                >
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {protectedAccount ? (
                  <DropdownMenuLabel className="flex items-start gap-2 text-xs font-normal text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                    {u.id === me.id ? 'You cannot deactivate your own account' : 'Primary demo account — always active'}
                  </DropdownMenuLabel>
                ) : u.isActive ? (
                  <DropdownMenuItem onSelect={() => setToggling(u)} className="text-rose-600 focus:bg-rose-50 focus:text-rose-700">
                    <UserRoundX /> Deactivate account
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setToggling(u)}>
                    <UserCheck /> Activate account
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage student, doctor, dispensary staff and administrator accounts."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Add user
          </Button>
        }
      />
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<RoleFilter>
            value={role}
            onChange={setRole}
            options={[
              { value: 'all', label: 'All', count: count('all') },
              ...ROLES.map((r) => ({ value: r as RoleFilter, label: ROLE_PLURAL[r], count: count(r) })),
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={status} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger size="sm" className="w-full sm:w-[140px]" aria-label="Account status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, roll no…" />
          </div>
        </div>
        {users.isError ? (
          <div className="p-5">
            <ErrorState error={users.error} retry={() => users.refetch()} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={users.isLoading ? undefined : rows}
            loading={users.isLoading}
            rowKey={(u) => u.id}
            onRowClick={(u) => {
              setEditing(u);
              setFormOpen(true);
            }}
            rowClassName={(u) => (!u.isActive ? 'bg-slate-50/70 text-muted-foreground' : undefined)}
            empty={
              <EmptyState
                icon={Users}
                title="No users match"
                description="Try another role, status or search term."
              />
            }
          />
        )}
        {!users.isLoading && rows.length > 0 && (
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            Showing {rows.length} of {all.length} accounts · {all.filter((u) => !u.isActive).length} inactive
          </div>
        )}
      </Panel>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
        defaultRole={role === 'all' ? 'student' : role}
      />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(o) => !o && setToggling(null)}
        tone={toggling?.isActive ? 'danger' : 'default'}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.isActive
            ? 'They will be signed out immediately and cannot sign in until the account is activated again. Their records are kept.'
            : 'They will be able to sign in and use Smart Dispensary again.'
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Activate'}
        onConfirm={confirmToggle}
      />
    </>
  );
}
