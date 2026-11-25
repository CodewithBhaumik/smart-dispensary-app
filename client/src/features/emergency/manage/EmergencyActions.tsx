import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, Loader2, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { allowedEmergencyTransitions } from '@shared/constants';
import type { Emergency } from '@shared/types';
import { Field, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useResponders, useUpdateEmergency } from './api';

const RESOLUTION_CHIPS = [
  'First aid given at the location — student is stable',
  'Escorted to the health centre; treated by the duty doctor',
  'Referred to hospital for further care; guardian informed',
  'Situation resolved before the responder arrived',
];

const OTHER = 'other';

/** Acknowledge / assign responder / resolve controls for one emergency. */
export function EmergencyActions({
  emergency,
  size = 'sm',
  className,
}: {
  emergency: Emergency;
  size?: 'xs' | 'sm' | 'default';
  className?: string;
}) {
  const update = useUpdateEmergency();
  const [assignOpen, setAssignOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const transitions = allowedEmergencyTransitions(emergency.status);
  if (transitions.length === 0) return null;

  const busy = (s: string) => update.isPending && update.variables?.status === s;

  const acknowledge = async () => {
    try {
      await update.mutateAsync({ id: emergency.id, status: 'acknowledged' });
      toast.success(`${emergency.code} acknowledged`, { description: `${emergency.student.name} has been notified that help is coming.` });
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} onClick={(e) => e.stopPropagation()}>
      {transitions.includes('resolved') && (
        <Button variant="outline" size={size} onClick={() => setResolveOpen(true)} disabled={update.isPending}>
          <CheckCircle2 /> Resolve
        </Button>
      )}
      {transitions.includes('responder_assigned') && (
        <Button
          variant={transitions.includes('acknowledged') ? 'outline' : 'default'}
          size={size}
          onClick={() => setAssignOpen(true)}
          disabled={update.isPending}
        >
          <UserRoundCheck /> Assign responder
        </Button>
      )}
      {transitions.includes('acknowledged') && (
        <Button size={size} onClick={acknowledge} disabled={update.isPending} className="bg-rose-600 hover:bg-rose-700">
          {busy('acknowledged') ? <Loader2 className="animate-spin" /> : <Eye />}
          Acknowledge
        </Button>
      )}

      <AssignResponderDialog open={assignOpen} onOpenChange={setAssignOpen} emergency={emergency} />
      <ResolveDialog open={resolveOpen} onOpenChange={setResolveOpen} emergency={emergency} />
    </div>
  );
}

function AssignResponderDialog({
  open,
  onOpenChange,
  emergency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  emergency: Emergency;
}) {
  const update = useUpdateEmergency();
  const responders = useResponders(open);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected('');
      setName('');
      setPhone('');
      setNote('');
      setError(null);
    }
  }, [open]);

  const pick = (value: string) => {
    setSelected(value);
    setError(null);
    if (value === OTHER) {
      setName('');
      setPhone('');
      return;
    }
    const r = responders.data?.find((x) => String(x.id) === value);
    if (r) {
      setName(r.title ? `${r.name}, ${r.title}` : r.name);
      setPhone(r.phone ?? '');
    }
  };

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Choose a responder or enter their name.');
      return;
    }
    try {
      await update.mutateAsync({
        id: emergency.id,
        status: 'responder_assigned',
        responderName: name.trim(),
        responderPhone: phone.trim() || null,
        note: note.trim() || null,
      });
      toast.success('Responder assigned', { description: `${name.trim()} is on the way. The student has been notified.` });
      onOpenChange(false);
    } catch (e) {
      setError(getErrorMessage(e));
      toast.error(getErrorMessage(e));
    }
  };

  const chosen = responders.data?.find((x) => String(x.id) === selected);

  return (
    <Dialog open={open} onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Assign a responder</DialogTitle>
          <DialogDescription>
            {emergency.code} · {emergency.category} at {emergency.location}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Responder" required>
            <Select value={selected} onValueChange={pick}>
              <SelectTrigger className="w-full" aria-label="Responder">
                <SelectValue placeholder={responders.isLoading ? 'Loading team…' : 'Choose a staff member or doctor'} />
              </SelectTrigger>
              <SelectContent>
                {responders.data?.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                    {r.title && <span className="text-muted-foreground"> · {r.title}</span>}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Someone else…</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {chosen && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <UserAvatar user={chosen} size="sm" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900">{chosen.name}</p>
                <p className="text-xs text-muted-foreground">{[chosen.title, chosen.phone].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          )}
          {selected === OTHER && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="resp-name" required>
                <Input id="resp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Campus security team" />
              </Field>
              <Field label="Phone" htmlFor="resp-phone">
                <Input id="resp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
              </Field>
            </div>
          )}
          <Field label="Note for the student (optional)" htmlFor="resp-note">
            <Textarea id="resp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please stay where you are; the responder is 5 minutes away." />
          </Field>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" />}
            Assign &amp; notify student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ open, onOpenChange, emergency }: { open: boolean; onOpenChange: (o: boolean) => void; emergency: Emergency }) {
  const update = useUpdateEmergency();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNotes('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (notes.trim().length < 5) {
      setError('Describe how the emergency was resolved (at least 5 characters).');
      return;
    }
    try {
      await update.mutateAsync({ id: emergency.id, status: 'resolved', resolutionNotes: notes.trim() });
      toast.success(`${emergency.code} resolved`, { description: 'The case is closed and logged.' });
      onOpenChange(false);
    } catch (e) {
      setError(getErrorMessage(e));
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Resolve emergency</DialogTitle>
          <DialogDescription>
            {emergency.code} · {emergency.student.name}
          </DialogDescription>
        </DialogHeader>
        <Field label="Resolution notes" htmlFor="resolve-notes" required error={error}>
          <Textarea
            id="resolve-notes"
            rows={4}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setError(null);
            }}
            placeholder="What care was given and the student's condition"
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {RESOLUTION_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNotes(c)}
              className="rounded-full border px-2.5 py-0.5 text-left text-xs text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {c}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {update.isPending && <Loader2 className="animate-spin" />}
            Mark resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
