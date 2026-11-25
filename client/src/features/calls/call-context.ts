import { createContext, useContext } from 'react';
import { toast } from 'sonner';
import type { UserMini } from '@shared/types';

/** Lifecycle of the (single) call this browser tab can be in. */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

/** Health of the peer-to-peer media connection. */
export type ConnectionHealth = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface StartCallOptions {
  /** Links the call to a video-consultation appointment (shown to the callee). */
  appointmentId?: number;
}

export interface CallContextValue {
  status: CallPhase;
  direction: 'outgoing' | 'incoming' | null;
  /** The other participant. */
  peer: UserMini | null;
  callId: number | null;
  appointmentId: number | null;
  appointmentCode: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Seconds since the media connection was established. */
  durationSec: number;
  micOn: boolean;
  camOn: boolean;
  remoteCamOn: boolean;
  remoteMicOn: boolean;
  /** Explains degraded local media (audio only, view-only, …). */
  mediaNote: string | null;
  connection: ConnectionHealth;
  /** Short summary shown briefly after a call ends ("Call ended · 04:12"). */
  endedSummary: string | null;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  /** Rings `peer` (student ↔ doctor only). Safe to call from any page inside the app shell. */
  startCall: (peer: UserMini, opts?: StartCallOptions) => void;
  accept: () => void;
  decline: () => void;
  /** Cancels a ringing call, declines an incoming one or ends an active one. */
  hangup: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
}

export const CallContext = createContext<CallContextValue | null>(null);

const noop = () => {};

/** Fallback used outside <CallProvider> (e.g. login page) so callers never crash. */
const unavailable: CallContextValue = {
  status: 'idle',
  direction: null,
  peer: null,
  callId: null,
  appointmentId: null,
  appointmentCode: null,
  localStream: null,
  remoteStream: null,
  durationSec: 0,
  micOn: false,
  camOn: false,
  remoteCamOn: false,
  remoteMicOn: false,
  mediaNote: null,
  connection: 'idle',
  endedSummary: null,
  expanded: false,
  setExpanded: noop,
  startCall: () => toast.error('Video calls are available after signing in.'),
  accept: noop,
  decline: noop,
  hangup: noop,
  toggleMic: noop,
  toggleCamera: noop,
};

export function useCall(): CallContextValue {
  return useContext(CallContext) ?? unavailable;
}
