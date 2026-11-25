import { useMemo, useState } from 'react';
import { ChevronRight, Loader2, Stethoscope, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { DoctorListItem, PatientSummary } from '@shared/types';
import { EmptyState, ErrorState, ListSkeleton, SearchInput, UserAvatar } from '@/components/app';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/api';
import { useChatDirectory, useStartConversation } from './api';
import { departmentShort } from './department';

interface Row {
  id: number;
  name: string;
  avatarColor: string;
  primary: string;
  secondary: string | null;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  role,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: 'student' | 'doctor';
  onStarted: (conversationId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const directory = useChatDirectory(role, open);
  const start = useStartConversation();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const rows = useMemo<Row[]>(() => {
    const data = directory.data ?? [];
    if (role === 'student') {
      return (data as DoctorListItem[]).map((d) => ({
        id: d.id,
        name: d.name,
        avatarColor: d.avatarColor,
        primary: d.specialty,
        secondary: d.title,
      }));
    }
    return (data as PatientSummary[]).map((p) => ({
      id: p.id,
      name: p.name,
      avatarColor: p.avatarColor,
      primary: `${p.program} ${departmentShort(p.department)} · Year ${p.year}`,
      secondary: p.rollNo,
    }));
  }, [directory.data, role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.primary, r.secondary ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  const choose = (row: Row) => {
    setPendingId(row.id);
    start.mutate(row.id, {
      onSuccess: (conversation) => {
        onOpenChange(false);
        setSearch('');
        onStarted(conversation.id);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
      onSettled: () => setPendingId(null),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 bg-card p-0 sm:max-w-md">
        <DialogHeader className="space-y-1 border-b border-border/70 px-5 pt-5 pb-4 text-left">
          <DialogTitle className="font-display">New conversation</DialogTitle>
          <DialogDescription>
            {role === 'student'
              ? 'Choose a doctor from the health centre to message.'
              : 'Choose one of your patients to message.'}
          </DialogDescription>
          <div className="pt-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={role === 'student' ? 'Search doctors or specialties' : 'Search by name or roll number'}
              className="sm:w-full"
              autoFocus
            />
          </div>
        </DialogHeader>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
          {directory.isLoading ? (
            <ListSkeleton rows={5} className="p-3" />
          ) : directory.isError ? (
            <ErrorState error={directory.error} retry={() => directory.refetch()} className="m-2" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={role === 'student' ? Stethoscope : Users}
              title={rows.length === 0 ? (role === 'student' ? 'No doctors available' : 'No patients yet') : 'No matches'}
              description={
                rows.length === 0 && role === 'doctor'
                  ? 'Students appear here once they have booked an appointment with you.'
                  : 'Try a different search.'
              }
              compact
            />
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => choose(row)}
                    disabled={start.isPending}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/70 disabled:opacity-60"
                  >
                    <UserAvatar user={row} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.primary}
                        {row.secondary ? ` · ${row.secondary}` : ''}
                      </span>
                    </span>
                    {pendingId === row.id ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <ChevronRight className="size-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
