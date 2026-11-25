import { useEffect, useRef, useState, type ComponentType, type PointerEvent } from 'react';
import {
  CalendarCheck2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Video,
  VideoOff,
  WifiOff,
} from 'lucide-react';
import { UserAvatar } from '@/components/app';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCall } from './call-context';
import { attachStream } from './media';

function ControlButton({
  icon: Icon,
  label,
  onClick,
  off,
  large,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  off?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center justify-center rounded-full ring-1 transition focus-visible:ring-4 focus-visible:outline-none',
        large ? 'size-12' : 'size-10',
        off
          ? 'bg-white text-slate-900 ring-white hover:bg-slate-100 focus-visible:ring-white/40'
          : 'bg-white/12 text-white ring-white/15 backdrop-blur hover:bg-white/20 focus-visible:ring-white/30',
      )}
    >
      <Icon className={large ? 'size-5' : 'size-[18px]'} />
    </button>
  );
}

/**
 * Floating call window (bottom-right), expandable to a near full-screen view.
 * Rendered once at the app root by <CallProvider>, so calls survive navigation.
 */
export function CallWindow() {
  const call = useCall();
  const { status, peer, expanded } = call;
  const visible = status === 'outgoing' || status === 'connecting' || status === 'active' || status === 'ended';
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  // Drag offset of the collapsed window (so it never hides content such as a chat composer).
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; base: { x: number; y: number }; rect: DOMRect } | null>(null);

  useEffect(() => {
    if (status === 'idle') setOffset({ x: 0, y: 0 });
  }, [status]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (expanded || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      base: offset,
      rect: e.currentTarget.getBoundingClientRect(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const margin = 8;
    const dx = Math.min(
      Math.max(e.clientX - d.startX, margin - d.rect.left),
      window.innerWidth - margin - d.rect.right,
    );
    const dy = Math.min(
      Math.max(e.clientY - d.startY, margin - d.rect.top),
      window.innerHeight - margin - d.rect.bottom,
    );
    setOffset({ x: d.base.x + dx, y: d.base.y + dy });
  };

  const endDrag = () => {
    drag.current = null;
  };

  useEffect(() => {
    attachStream(remoteVideo.current, call.remoteStream);
  }, [call.remoteStream, visible]);

  useEffect(() => {
    attachStream(localVideo.current, call.localStream);
  }, [call.localStream, visible]);

  // Esc collapses the expanded view.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') call.setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, call]);

  if (!visible || !peer) return null;

  const remoteHasVideo = (call.remoteStream?.getVideoTracks().length ?? 0) > 0 && call.remoteCamOn;
  const showRemoteVideo = status === 'active' && remoteHasVideo;
  const localHasVideo = (call.localStream?.getVideoTracks().length ?? 0) > 0 && call.camOn;

  let statusText: string;
  if (status === 'outgoing') statusText = 'Ringing…';
  else if (status === 'connecting') statusText = 'Connecting…';
  else if (status === 'ended') statusText = call.endedSummary ?? 'Call ended';
  else if (call.connection === 'reconnecting') statusText = 'Reconnecting…';
  else statusText = formatDuration(call.durationSec);

  const placeholderText =
    status === 'outgoing'
      ? `Calling ${peer.name}…`
      : status === 'connecting'
        ? 'Setting up a secure video connection…'
        : status === 'ended'
          ? call.endedSummary ?? 'Call ended'
          : call.remoteStream && call.remoteStream.getVideoTracks().length === 0
            ? 'Audio only'
            : 'Camera is off';

  return (
    <>
      {expanded && (
        <div
          aria-hidden
          className="fixed inset-0 z-[69] bg-slate-950/60 backdrop-blur-sm animate-in fade-in-0"
          onClick={() => call.setExpanded(false)}
        />
      )}
      <section
        role="region"
        aria-label={`Video call with ${peer.name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={expanded ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px)` }}
        className={cn(
          'fixed z-[70] overflow-hidden bg-slate-950 text-white shadow-2xl shadow-slate-950/40 ring-1 ring-white/10 transition-[inset,width,height,border-radius] duration-300 animate-in fade-in-0 slide-in-from-bottom-4',
          expanded
            ? 'inset-3 rounded-2xl sm:inset-6 lg:inset-10'
            : 'right-3 bottom-3 left-3 h-[300px] cursor-grab touch-none rounded-2xl select-none active:cursor-grabbing sm:left-auto sm:right-6 sm:bottom-6 sm:h-[280px] sm:w-[400px]',
        )}
      >
        {/* Remote media (also plays the remote audio, so it stays mounted). */}
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          className={cn(
            'absolute inset-0 size-full bg-slate-950 object-cover transition-opacity duration-300',
            showRemoteVideo ? 'opacity-100' : 'opacity-0',
          )}
        />
        {!showRemoteVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_35%,#16325a,#0b1b33_60%,#060f1f)] px-6 text-center">
            <div className="relative">
              {(status === 'outgoing' || status === 'connecting') && (
                <span className="absolute -inset-3 animate-ping rounded-full bg-teal-400/20 [animation-duration:2s]" />
              )}
              <span className="relative block rounded-full bg-white p-1 shadow-lg">
                <UserAvatar user={peer} size={expanded ? 'xl' : 'lg'} />
              </span>
            </div>
            <p className={cn('max-w-[260px] text-slate-200', expanded ? 'text-base' : 'text-[13px]')}>
              {placeholderText}
            </p>
            {status === 'active' && !call.remoteMicOn && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                <MicOff className="size-3" /> Muted
              </span>
            )}
          </div>
        )}

        {/* Legibility gradients */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 to-transparent" />

        {/* Header */}
        <div className={cn('absolute top-3 left-3 min-w-0', expanded ? 'right-72' : 'right-[104px]')}>
          <p className={cn('truncate font-semibold', expanded ? 'text-base' : 'text-sm')}>{peer.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1',
                status === 'active' && call.connection !== 'reconnecting'
                  ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30'
                  : status === 'ended'
                    ? 'bg-white/10 text-slate-200 ring-white/15'
                    : 'bg-amber-500/15 text-amber-100 ring-amber-400/30',
              )}
            >
              {call.connection === 'reconnecting' ? (
                <WifiOff className="size-3" />
              ) : (
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    status === 'active' ? 'bg-emerald-400' : status === 'ended' ? 'bg-slate-300' : 'animate-pulse bg-amber-300',
                  )}
                />
              )}
              {statusText}
            </span>
            {call.appointmentCode && expanded && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200 ring-1 ring-white/15">
                <CalendarCheck2 className="size-3" /> Video consultation · {call.appointmentCode}
              </span>
            )}
          </div>
        </div>

        {/* Self view */}
        <div
          className={cn(
            'absolute top-3 right-3 overflow-hidden rounded-xl bg-slate-800 shadow-lg ring-1 ring-white/20 transition-all duration-300',
            expanded ? 'h-40 w-60 sm:h-44 sm:w-64' : 'h-[104px] w-[84px]',
          )}
        >
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            className={cn('size-full -scale-x-100 object-cover', localHasVideo ? 'opacity-100' : 'opacity-0')}
          />
          {!localHasVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-300">
              <VideoOff className="size-4" />
              Camera off
            </div>
          )}
          {!call.micOn && (
            <span className="absolute bottom-1 left-1 rounded-md bg-rose-600 p-0.5" aria-label="Your microphone is muted">
              <MicOff className="size-3" />
            </span>
          )}
          <span className="absolute right-1 bottom-1 rounded bg-black/40 px-1 text-[9px] font-medium text-white/80">
            You
          </span>
        </div>

        {/* Degraded-media note */}
        {call.mediaNote && status !== 'ended' && (
          <div className="absolute right-3 bottom-[4.25rem] left-3 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[11px] leading-snug text-amber-100 ring-1 ring-amber-400/30 backdrop-blur sm:right-auto sm:max-w-[85%]">
            {call.mediaNote}
          </div>
        )}

        {/* Controls */}
        {status !== 'ended' && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2.5 pb-3.5">
            <ControlButton
              icon={call.micOn ? Mic : MicOff}
              label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}
              onClick={call.toggleMic}
              off={!call.micOn}
              large={expanded}
            />
            <ControlButton
              icon={call.camOn ? Video : VideoOff}
              label={call.camOn ? 'Turn camera off' : 'Turn camera on'}
              onClick={call.toggleCamera}
              off={!call.camOn}
              large={expanded}
            />
            <ControlButton
              icon={expanded ? Minimize2 : Maximize2}
              label={expanded ? 'Minimise call window' : 'Expand call window'}
              onClick={() => call.setExpanded(!expanded)}
              large={expanded}
            />
            <button
              type="button"
              onClick={call.hangup}
              aria-label={status === 'outgoing' ? 'Cancel call' : 'End call'}
              title={status === 'outgoing' ? 'Cancel call' : 'End call'}
              className={cn(
                'flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 font-medium text-white shadow-lg shadow-rose-900/40 transition hover:bg-rose-700 focus-visible:ring-4 focus-visible:ring-rose-300/50 focus-visible:outline-none',
                expanded ? 'h-12 text-sm' : 'h-10 text-[13px]',
              )}
            >
              <PhoneOff className="size-[18px]" />
              {status === 'outgoing' ? 'Cancel' : 'End'}
            </button>
          </div>
        )}

        {status === 'ended' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 backdrop-blur-sm animate-in fade-in-0">
            <span className="flex size-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
              <PhoneOff className="size-5 text-slate-200" />
            </span>
            <p className="text-sm font-medium text-slate-100">{call.endedSummary ?? 'Call ended'}</p>
          </div>
        )}
      </section>
    </>
  );
}
