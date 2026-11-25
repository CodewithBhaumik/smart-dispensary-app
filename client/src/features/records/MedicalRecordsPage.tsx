import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { format } from 'date-fns';
import {
  CalendarDays,
  CloudUpload,
  ExternalLink,
  Eye,
  FileHeart,
  FileImage,
  FileText,
  FileUp,
  Loader2,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { RECORD_CATEGORIES, RECORD_CATEGORY_LABELS, type RecordCategory } from '@shared/constants';
import type { MedicalRecord } from '@shared/types';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  PageHeader,
  Panel,
  SearchInput,
  StatCard,
  TONE_TILE,
  ToneBadge,
} from '@/components/app';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage, openProtectedFile } from '@/lib/api';
import { formatDate, formatFileSize, parseDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDeleteRecord, useRecords } from './api';
import { RECORD_META } from './record-meta';
import { UploadRecordDialog } from './UploadRecordDialog';

type Filter = 'all' | RecordCategory;

function FileChip({ record }: { record: MedicalRecord }) {
  const [opening, setOpening] = useState(false);
  if (!record.file) return null;
  const Icon = record.file.mimeType === 'application/pdf' ? FileText : FileImage;
  const open = async () => {
    setOpening(true);
    try {
      await openProtectedFile(`/records/${record.id}/file`);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Could not open this file.'));
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-white py-1 pr-1 pl-2.5 shadow-xs">
      <Icon className="size-4 shrink-0 text-slate-400" />
      <span className="truncate text-xs font-medium text-slate-700">{record.file.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(record.file.size)}</span>
      <Button size="xs" variant="soft" onClick={open} disabled={opening} aria-label={`View ${record.file.name}`}>
        {opening ? <Loader2 className="animate-spin" /> : <Eye />}
        View
      </Button>
    </div>
  );
}

function RecordRow({
  record,
  canDelete,
  onDelete,
  isLast,
}: {
  record: MedicalRecord;
  canDelete: boolean;
  onDelete: () => void;
  isLast: boolean;
}) {
  const meta = RECORD_META[record.category] ?? RECORD_META.other;
  const Icon = meta.icon;
  return (
    <li className="relative flex gap-4">
      {!isLast && <span className="absolute top-12 bottom-0 left-5 w-px bg-border" aria-hidden />}
      <span
        className={cn('relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1', TONE_TILE[meta.tone])}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{record.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span>{RECORD_CATEGORY_LABELS[record.category]}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(record.recordDate)}</span>
              {record.doctor && (
                <>
                  <span aria-hidden>·</span>
                  <span>{record.doctor.name}</span>
                </>
              )}
            </p>
          </div>
          {record.source === 'consultation' ? (
            <ToneBadge tone="teal" icon={<Stethoscope />}>
              Visit summary
            </ToneBadge>
          ) : (
            <ToneBadge tone="slate" icon={<FileUp />}>
              Uploaded
            </ToneBadge>
          )}
        </div>
        {record.description && (
          <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-slate-600">{record.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FileChip record={record} />
          {record.appointmentId && (
            <Button asChild size="xs" variant="outline">
              <Link to={`/student/appointments?open=${record.appointmentId}`}>
                <CalendarDays /> View visit
              </Link>
            </Button>
          )}
          {record.prescriptionId && (
            <Button asChild size="xs" variant="outline">
              <Link to={`/student/prescriptions?open=${record.prescriptionId}`}>
                <FileText /> Prescription
              </Link>
            </Button>
          )}
          {canDelete && (
            <Button
              size="xs"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={onDelete}
              aria-label={`Delete ${record.title}`}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function MedicalRecordsPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useRecords();
  const remove = useDeleteRecord();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MedicalRecord | null>(null);

  const records = useMemo(
    () =>
      [...(data ?? [])].sort((a, b) =>
        a.recordDate === b.recordDate ? b.createdAt.localeCompare(a.createdAt) : b.recordDate.localeCompare(a.recordDate),
      ),
    [data],
  );

  const stats = useMemo(() => {
    const visits = records.filter((r) => r.source === 'consultation');
    return {
      visits: visits.length,
      uploads: records.filter((r) => r.source === 'upload').length,
      lastVisit: visits[0]?.recordDate ?? null,
    };
  }, [records]);

  const chipOptions = useMemo(() => {
    const counts = new Map<RecordCategory, number>();
    for (const r of records) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return [
      { value: 'all' as Filter, label: 'All records', count: records.length },
      ...RECORD_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({
        value: c as Filter,
        label: RECORD_CATEGORY_LABELS[c],
        count: counts.get(c),
      })),
    ];
  }, [records]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = records.filter((r) => {
      if (filter !== 'all' && r.category !== filter) return false;
      if (!q) return true;
      return [r.title, r.description, r.doctor?.name, RECORD_CATEGORY_LABELS[r.category], r.file?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    const byMonth = new Map<string, MedicalRecord[]>();
    for (const r of visible) {
      const key = format(parseDate(r.recordDate), 'MMMM yyyy');
      byMonth.set(key, [...(byMonth.get(key) ?? []), r]);
    }
    return [...byMonth.entries()];
  }, [records, filter, search]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast.success('Document deleted', { description: `${toDelete.title} was removed from your records.` });
    } catch (e) {
      toast.error(getErrorMessage(e));
      throw e;
    }
  };

  return (
    <>
      <PageHeader
        title="Medical Records"
        description="Your visit summaries and health documents, kept together for every consultation."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <CloudUpload /> Upload document
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Visit summaries" value={isLoading ? '—' : stats.visits} icon={Stethoscope} tone="teal" hint="Added after each consultation" />
        <StatCard label="Uploaded documents" value={isLoading ? '—' : stats.uploads} icon={FileUp} tone="blue" hint="Reports, scans & certificates" />
        <StatCard
          label="Last visit"
          value={isLoading ? '—' : stats.lastVisit ? formatDate(stats.lastVisit) : 'No visits yet'}
          icon={CalendarDays}
          tone="violet"
          hint="Most recent consultation"
          className="[&_.font-display]:text-xl"
        />
      </div>

      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<Filter> options={chipOptions} value={filter} onChange={setFilter} className="min-w-0" />
          <SearchInput value={search} onChange={setSearch} placeholder="Search records" />
        </div>
        <div className="px-5 pt-5">
          {error ? (
            <ErrorState error={error} retry={() => void refetch()} className="mb-5" />
          ) : isLoading ? (
            <ListSkeleton rows={6} className="pb-5" />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={FileHeart}
              title={records.length ? 'No records match your filters' : 'No medical records yet'}
              description={
                records.length
                  ? 'Try another category or search term.'
                  : 'Visit summaries appear automatically after consultations. You can also upload your own reports.'
              }
              action={
                records.length ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilter('all');
                      setSearch('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setUploadOpen(true)}>
                    <CloudUpload /> Upload a document
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-2">
              {groups.map(([month, items]) => (
                <section key={month}>
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="font-display text-sm font-semibold text-slate-900">{month}</h2>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">
                      {items.length} {items.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                  <ul>
                    {items.map((record, i) => (
                      <RecordRow
                        key={record.id}
                        record={record}
                        isLast={i === items.length - 1}
                        canDelete={record.source === 'upload' && record.uploadedBy?.id === user.id}
                        onDelete={() => setToDelete(record)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border/70 bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          <ExternalLink className="size-3.5" />
          Documents open in a new tab. Only you and your treating doctors can view them.
        </div>
      </Panel>

      <UploadRecordDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        tone="danger"
        title="Delete this document?"
        description={toDelete ? `"${toDelete.title}" will be permanently removed from your medical records.` : undefined}
        confirmLabel="Delete document"
        onConfirm={confirmDelete}
      />
    </>
  );
}
