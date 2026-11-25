import { useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Confirmation for destructive / important actions. `onConfirm` may be async. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void | Promise<unknown>;
  loading?: boolean;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const isBusy = loading ?? busy;
  const handle = async () => {
    try {
      setBusy(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // caller shows its own toast; keep dialog open
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !isBusy && onOpenChange(o)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {tone === 'danger' && (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-600/10">
                <AlertTriangle className="size-5" />
              </span>
            )}
            <div className="space-y-1.5 text-left">
              <AlertDialogTitle className="font-display">{title}</AlertDialogTitle>
              {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
            </div>
          </div>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>{cancelLabel}</AlertDialogCancel>
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={handle} disabled={isBusy}>
            {isBusy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-primary', className)} />;
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground', className)}>
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorState({
  error,
  retry,
  className,
}: {
  error: unknown;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-6 text-rose-500" />
      <div>
        <p className="font-medium text-rose-900">Couldn&apos;t load this section</p>
        <p className="mt-1 text-sm text-rose-700">{getErrorMessage(error)}</p>
      </div>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

/** Generic page skeleton (header + stat row + two panels). */
export function PageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-xl" />
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton rows for lists/tables. */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
