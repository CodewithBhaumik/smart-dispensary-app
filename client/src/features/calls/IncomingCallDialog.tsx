import { CalendarCheck2, PhoneOff, Video } from 'lucide-react';
import { ROLE_LABELS } from '@shared/constants';
import { UserAvatar } from '@/components/app';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useCall } from './call-context';

/** Full-attention prompt for an incoming video call (rings via the provider's ringtone). */
export function IncomingCallDialog() {
  const call = useCall();
  const open = call.status === 'incoming' && call.peer !== null;
  const peer = call.peer;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && open) call.decline();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="gap-0 overflow-hidden border-0 bg-card p-0 shadow-2xl sm:max-w-[380px]"
      >
        {peer && (
          <>
            <div className="relative overflow-hidden bg-sidebar px-6 pt-9 pb-7 text-center text-white">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(45,212,191,0.28),transparent_60%)]"
              />
              <div className="relative mx-auto flex size-28 items-center justify-center">
                <span className="absolute inset-2 animate-ping rounded-full bg-teal-400/25 [animation-duration:1.8s]" />
                <span className="absolute inset-0 rounded-full border border-teal-300/25" />
                <span className="relative rounded-full bg-white p-1.5 shadow-lg shadow-teal-900/40">
                  <UserAvatar user={peer} size="xl" />
                </span>
              </div>
              <p className="relative mt-5 text-[11px] font-semibold tracking-[0.16em] text-teal-300 uppercase">
                Incoming video call
              </p>
              <DialogTitle className="relative mt-1.5 font-display text-xl font-semibold text-white">
                {peer.name}
              </DialogTitle>
              <DialogDescription className="relative mt-1 text-sm text-slate-300">
                {peer.title ?? ROLE_LABELS[peer.role]}
              </DialogDescription>
              {call.appointmentCode && (
                <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-teal-50 ring-1 ring-white/15">
                  <CalendarCheck2 className="size-3.5" />
                  Video consultation · {call.appointmentCode}
                </span>
              )}
            </div>
            <div className="flex items-start justify-center gap-12 px-6 pt-6 pb-4">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={call.decline}
                  aria-label="Decline call"
                  className="flex size-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 transition hover:scale-105 hover:bg-rose-700 focus-visible:ring-4 focus-visible:ring-rose-200 focus-visible:outline-none"
                >
                  <PhoneOff className="size-6" />
                </button>
                <span className="text-xs font-medium text-slate-600">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={call.accept}
                  aria-label="Accept call"
                  autoFocus
                  className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:scale-105 hover:bg-emerald-600 focus-visible:ring-4 focus-visible:ring-emerald-200 focus-visible:outline-none"
                >
                  <Video className="size-6" />
                </button>
                <span className="text-xs font-medium text-slate-600">Accept</span>
              </div>
            </div>
            <p className="px-6 pb-5 text-center text-xs text-muted-foreground">
              Your camera and microphone turn on only after you accept.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
