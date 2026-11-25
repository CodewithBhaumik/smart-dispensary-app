/**
 * Global video-call state for the signed-in user.
 *
 * Signaling runs over the app's Socket.IO connection (see server/src/realtime/calls.ts);
 * media flows peer-to-peer over WebRTC. Only one call per tab at a time.
 *
 *   caller: startCall() → camera/mic → `call:invite` → ringing → `call:accepted`
 *           → create offer → `call:signal` …
 *   callee: `call:incoming` → accept() → camera/mic → `call:accept` → `call:accepted`
 *           → receive offer → answer …
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { UserMini } from '@shared/types';
import { ChatNotifier } from '@/features/chat/ChatNotifier';
import { formatDuration } from '@/lib/format';
import { useSocket, useSocketEvent } from '@/lib/socket';
import {
  CallContext,
  type CallContextValue,
  type CallPhase,
  type ConnectionHealth,
  type StartCallOptions,
} from './call-context';
import { CallWindow } from './CallWindow';
import { IncomingCallDialog } from './IncomingCallDialog';
import { acquireMedia, stopStream, type AcquiredMedia } from './media';
import { useRingtone } from './ringtone';

export { useCall } from './call-context';
export type { CallContextValue, CallPhase, StartCallOptions } from './call-context';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

type SignalData =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'state'; camOn: boolean; micOn: boolean };

interface IncomingPayload {
  callId: number;
  caller: UserMini;
  appointmentId: number | null;
  appointmentCode: string | null;
}

interface EndedPayload {
  callId: number;
  reason: string;
}

interface InviteAck {
  callId?: number;
  error?: 'offline' | 'busy' | 'forbidden' | string;
}

const ENDED_BANNER_MS = 1600;

export function CallProvider({ children }: { children: ReactNode }) {
  const socket = useSocket();

  const [status, setStatus] = useState<CallPhase>('idle');
  const [direction, setDirection] = useState<'outgoing' | 'incoming' | null>(null);
  const [peer, setPeer] = useState<UserMini | null>(null);
  const [callId, setCallId] = useState<number | null>(null);
  const [appointment, setAppointment] = useState<{ id: number | null; code: string | null }>({
    id: null,
    code: null,
  });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteCamOn, setRemoteCamOn] = useState(true);
  const [remoteMicOn, setRemoteMicOn] = useState(true);
  const [mediaNote, setMediaNote] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionHealth>('idle');
  const [activeSince, setActiveSince] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [endedSummary, setEndedSummary] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Refs mirror the state for socket / WebRTC callbacks (avoid stale closures).
  const socketRef = useRef(socket);
  const statusRef = useRef<CallPhase>('idle');
  const directionRef = useRef<'outgoing' | 'incoming' | null>(null);
  const callIdRef = useRef<number | null>(null);
  const peerRef = useRef<UserMini | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const pendingSignals = useRef<SignalData[]>([]);
  const signalChain = useRef<Promise<void>>(Promise.resolve());
  const attemptRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);
  const endTimer = useRef<number | null>(null);
  const micRef = useRef(true);
  const camRef = useRef(true);
  const hangupRef = useRef<() => void>(() => {});

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const setPhase = useCallback((phase: CallPhase) => {
    statusRef.current = phase;
    setStatus(phase);
  }, []);

  const resetIdentity = useCallback(() => {
    peerRef.current = null;
    directionRef.current = null;
    setPeer(null);
    setDirection(null);
    setEndedSummary(null);
    setExpanded(false);
    setAppointment({ id: null, code: null });
  }, []);

  const clearEndTimer = useCallback(() => {
    if (endTimer.current) {
      window.clearTimeout(endTimer.current);
      endTimer.current = null;
    }
  }, []);

  /** Releases camera/mic + peer connection. With a summary the window briefly shows "Call ended". */
  const teardown = useCallback(
    (summary: string | null = null) => {
      attemptRef.current += 1;
      const pc = pcRef.current;
      pcRef.current = null;
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        try {
          pc.close();
        } catch {
          /* already closed */
        }
      }
      stopStream(localRef.current);
      localRef.current = null;
      remoteRef.current = null;
      pendingCandidates.current = [];
      pendingSignals.current = [];
      signalChain.current = Promise.resolve();
      callIdRef.current = null;
      activeSinceRef.current = null;
      micRef.current = true;
      camRef.current = true;
      setLocalStream(null);
      setRemoteStream(null);
      setCallId(null);
      setActiveSince(null);
      setDurationSec(0);
      setConnection('idle');
      setMediaNote(null);
      setRemoteCamOn(true);
      setRemoteMicOn(true);
      setMicOn(true);
      setCamOn(true);
      clearEndTimer();
      if (summary) {
        setEndedSummary(summary);
        setPhase('ended');
        endTimer.current = window.setTimeout(() => {
          endTimer.current = null;
          setPhase('idle');
          resetIdentity();
        }, ENDED_BANNER_MS);
      } else {
        setPhase('idle');
        resetIdentity();
      }
    },
    [clearEndTimer, resetIdentity, setPhase],
  );

  const durationSummary = useCallback(() => {
    const since = activeSinceRef.current;
    return since ? `Call ended · ${formatDuration(Math.round((Date.now() - since) / 1000))}` : 'Call ended';
  }, []);

  const sendSignal = useCallback((data: SignalData) => {
    const id = callIdRef.current;
    const s = socketRef.current;
    if (id && s) s.emit('call:signal', { callId: id, data });
  }, []);

  const applyLocalMedia = useCallback((media: AcquiredMedia) => {
    localRef.current = media.stream;
    setLocalStream(media.stream);
    setMediaNote(media.note);
    const hasVideo = (media.stream?.getVideoTracks().length ?? 0) > 0;
    const hasAudio = (media.stream?.getAudioTracks().length ?? 0) > 0;
    camRef.current = hasVideo;
    micRef.current = hasAudio;
    setCamOn(hasVideo);
    setMicOn(hasAudio);
  }, []);

  const addLocalTracks = useCallback((pc: RTCPeerConnection, ensureReceive: boolean) => {
    const stream = localRef.current;
    stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
    if (ensureReceive) {
      // Still receive the other side's media when we have no camera / mic.
      if (!stream || stream.getVideoTracks().length === 0) pc.addTransceiver('video', { direction: 'recvonly' });
      if (!stream || stream.getAudioTracks().length === 0) pc.addTransceiver('audio', { direction: 'recvonly' });
    }
  }, []);

  const markConnected = useCallback(() => {
    setConnection('connected');
    if (!activeSinceRef.current) {
      activeSinceRef.current = Date.now();
      setActiveSince(activeSinceRef.current);
    }
    if (statusRef.current !== 'active') setPhase('active');
    sendSignal({ type: 'state', camOn: camRef.current, micOn: micRef.current });
  }, [sendSignal, setPhase]);

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ type: 'candidate', candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      const fromStream = event.streams[0]?.getTracks() ?? [];
      const existing = remoteRef.current?.getTracks() ?? [];
      const tracks = [...new Set([...existing, ...fromStream, event.track])];
      const next = new MediaStream(tracks);
      remoteRef.current = next;
      setRemoteStream(next);
    };
    const onState = () => {
      if (pcRef.current !== pc) return;
      const state = pc.connectionState ?? pc.iceConnectionState;
      if (state === 'connected' || pc.iceConnectionState === 'completed') markConnected();
      else if (state === 'disconnected') setConnection('reconnecting');
      else if (state === 'failed') {
        setConnection('failed');
        toast.error('The video connection could not be established.');
        hangupRef.current();
      }
    };
    pc.onconnectionstatechange = onState;
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') onState();
    };
    return pc;
  }, [markConnected, sendSignal]);

  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }, []);

  const handleSignal = useCallback(
    async (data: SignalData) => {
      const pc = pcRef.current;
      if (!pc) {
        pendingSignals.current.push(data);
        return;
      }
      const attempt = attemptRef.current;
      try {
        if (data.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          addLocalTracks(pc, false);
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          if (attempt !== attemptRef.current) return;
          await pc.setLocalDescription(answer);
          sendSignal({ type: 'answer', sdp: answer.sdp ?? '' });
        } else if (data.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await flushCandidates(pc);
        } else if (data.type === 'candidate') {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pendingCandidates.current.push(data.candidate);
        } else if (data.type === 'state') {
          setRemoteCamOn(Boolean(data.camOn));
          setRemoteMicOn(Boolean(data.micOn));
        }
      } catch (error) {
        console.warn('[call] signaling error', error);
      }
    },
    [addLocalTracks, flushCandidates, sendSignal],
  );

  /** Signals are processed strictly in order (offer before its candidates). */
  const enqueueSignal = useCallback(
    (data: SignalData) => {
      signalChain.current = signalChain.current.then(() => handleSignal(data));
    },
    [handleSignal],
  );

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------
  const startCall = useCallback(
    async (target: UserMini, opts?: StartCallOptions) => {
      const s = socketRef.current;
      if (statusRef.current !== 'idle' && statusRef.current !== 'ended') {
        toast.error('You are already in a call.');
        return;
      }
      if (!s || !s.connected) {
        toast.error('Live connection unavailable. Check that the server is running and try again.');
        return;
      }
      clearEndTimer();
      const attempt = ++attemptRef.current;
      const peerMini: UserMini = {
        id: target.id,
        name: target.name,
        role: target.role,
        avatarColor: target.avatarColor,
        title: target.title,
      };
      peerRef.current = peerMini;
      directionRef.current = 'outgoing';
      setPeer(peerMini);
      setDirection('outgoing');
      setAppointment({ id: opts?.appointmentId ?? null, code: null });
      setEndedSummary(null);
      setPhase('outgoing');
      setConnection('connecting');

      const media = await acquireMedia();
      if (attempt !== attemptRef.current) {
        stopStream(media.stream);
        return;
      }
      applyLocalMedia(media);

      let ack: InviteAck;
      try {
        ack = (await s
          .timeout(8000)
          .emitWithAck('call:invite', { toUserId: target.id, appointmentId: opts?.appointmentId })) as InviteAck;
      } catch {
        if (attempt === attemptRef.current) {
          toast.error('Could not reach the call service. Please try again.');
          teardown();
        }
        return;
      }
      if (attempt !== attemptRef.current) {
        // The user hung up while we were waiting for the server.
        if (ack.callId) s.emit('call:cancel', { callId: ack.callId });
        return;
      }
      if (ack.error || !ack.callId) {
        if (ack.error === 'offline') toast.info(`${target.name} is offline — your call was logged as missed.`);
        else if (ack.error === 'busy') toast.error(`${target.name} is on another call. Please try again shortly.`);
        else toast.error('Video calls are available between students and doctors only.');
        teardown();
        return;
      }
      callIdRef.current = ack.callId;
      setCallId(ack.callId);
    },
    [applyLocalMedia, clearEndTimer, setPhase, teardown],
  );

  const accept = useCallback(async () => {
    const id = callIdRef.current;
    if (statusRef.current !== 'incoming' || !id) return;
    const attempt = attemptRef.current;
    setPhase('connecting');
    setConnection('connecting');
    const media = await acquireMedia();
    if (attempt !== attemptRef.current || callIdRef.current !== id) {
      stopStream(media.stream);
      return;
    }
    applyLocalMedia(media);
    socketRef.current?.emit('call:accept', { callId: id });
  }, [applyLocalMedia, setPhase]);

  const decline = useCallback(() => {
    const id = callIdRef.current;
    if (id) socketRef.current?.emit('call:decline', { callId: id });
    teardown();
  }, [teardown]);

  const hangup = useCallback(() => {
    const phase = statusRef.current;
    if (phase === 'idle' || phase === 'ended') return;
    if (phase === 'incoming') {
      decline();
      return;
    }
    const id = callIdRef.current;
    const s = socketRef.current;
    if (id && s) s.emit(phase === 'outgoing' ? 'call:cancel' : 'call:end', { callId: id });
    teardown(phase === 'outgoing' ? 'Call cancelled' : durationSummary());
  }, [decline, durationSummary, teardown]);

  useEffect(() => {
    hangupRef.current = hangup;
  }, [hangup]);

  const toggleMic = useCallback(() => {
    const tracks = localRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) {
      toast.info('No microphone is available on this device.');
      return;
    }
    const next = !micRef.current;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    micRef.current = next;
    setMicOn(next);
    sendSignal({ type: 'state', camOn: camRef.current, micOn: next });
  }, [sendSignal]);

  const toggleCamera = useCallback(() => {
    const tracks = localRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) {
      toast.info('No camera is available on this device.');
      return;
    }
    const next = !camRef.current;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    camRef.current = next;
    setCamOn(next);
    sendSignal({ type: 'state', camOn: next, micOn: micRef.current });
  }, [sendSignal]);

  // ---------------------------------------------------------------------------
  // Socket events
  // ---------------------------------------------------------------------------
  useSocketEvent<IncomingPayload>('call:incoming', (payload) => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'ended') {
      socketRef.current?.emit('call:decline', { callId: payload.callId });
      return;
    }
    clearEndTimer();
    attemptRef.current += 1;
    callIdRef.current = payload.callId;
    peerRef.current = payload.caller;
    directionRef.current = 'incoming';
    setCallId(payload.callId);
    setPeer(payload.caller);
    setDirection('incoming');
    setEndedSummary(null);
    setAppointment({ id: payload.appointmentId, code: payload.appointmentCode });
    setPhase('incoming');
  });

  useSocketEvent<{ callId: number }>('call:accepted', ({ callId: id }) => {
    if (id !== callIdRef.current) return;
    if (statusRef.current !== 'outgoing' && statusRef.current !== 'connecting') return;
    setPhase('connecting');
    setConnection('connecting');
    if (pcRef.current) return;
    const pc = createPeer();
    if (directionRef.current === 'outgoing') {
      addLocalTracks(pc, true);
      const attempt = attemptRef.current;
      void (async () => {
        try {
          const offer = await pc.createOffer();
          if (attempt !== attemptRef.current) return;
          await pc.setLocalDescription(offer);
          sendSignal({ type: 'offer', sdp: offer.sdp ?? '' });
        } catch (error) {
          console.warn('[call] could not create offer', error);
          toast.error('Could not start the video connection.');
          hangupRef.current();
        }
      })();
    } else {
      const queued = pendingSignals.current;
      pendingSignals.current = [];
      queued.forEach(enqueueSignal);
    }
  });

  useSocketEvent<{ callId: number; data: SignalData }>('call:signal', ({ callId: id, data }) => {
    if (id !== callIdRef.current || !data || typeof data !== 'object') return;
    enqueueSignal(data);
  });

  useSocketEvent<{ callId: number }>('call:declined', ({ callId: id }) => {
    if (id !== callIdRef.current) return;
    toast.info(`${peerRef.current?.name ?? 'They'} declined the call.`);
    teardown('Call declined');
  });

  useSocketEvent<EndedPayload>('call:ended', ({ callId: id, reason }) => {
    if (id !== callIdRef.current) return;
    const name = peerRef.current?.name ?? 'The other person';
    const phase = statusRef.current;
    switch (reason) {
      case 'timeout':
        if (directionRef.current === 'outgoing') {
          toast.info(`${name} didn't answer. The missed call is saved in your messages.`);
          teardown('No answer');
        } else {
          // The callee also receives a "Missed video call" notification (toasted by the shell).
          teardown();
        }
        break;
      case 'cancelled':
        if (phase === 'incoming') toast.info(`${name} cancelled the call.`);
        teardown();
        break;
      case 'declined':
      case 'answered_elsewhere':
        teardown();
        break;
      case 'disconnected':
        toast.info(`${name} left the call.`);
        teardown(durationSummary());
        break;
      default:
        teardown(durationSummary());
    }
  });

  useSocketEvent('disconnect', () => {
    if (statusRef.current === 'idle' || statusRef.current === 'ended') return;
    toast.error('Connection to the server was lost — the call ended.');
    teardown();
  });

  // Account switch (new socket) or sign-out ends any call in this tab.
  const previousSocket = useRef(socket);
  useEffect(() => {
    if (previousSocket.current === socket) return;
    previousSocket.current = socket;
    if (statusRef.current !== 'idle') teardown();
  }, [socket, teardown]);

  // Call timer.
  useEffect(() => {
    if (!activeSince) return;
    const tick = () => setDurationSec(Math.max(0, Math.round((Date.now() - activeSince) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [activeSince]);

  // Release devices if the provider unmounts mid-call.
  useEffect(
    () => () => {
      stopStream(localRef.current);
      pcRef.current?.close();
      if (endTimer.current) window.clearTimeout(endTimer.current);
    },
    [],
  );

  useRingtone(status === 'incoming' ? 'incoming' : status === 'outgoing' ? 'outgoing' : null);

  const value = useMemo<CallContextValue>(
    () => ({
      status,
      direction,
      peer,
      callId,
      appointmentId: appointment.id,
      appointmentCode: appointment.code,
      localStream,
      remoteStream,
      durationSec,
      micOn,
      camOn,
      remoteCamOn,
      remoteMicOn,
      mediaNote,
      connection,
      endedSummary,
      expanded,
      setExpanded,
      startCall: (target, opts) => void startCall(target, opts),
      accept: () => void accept(),
      decline,
      hangup,
      toggleMic,
      toggleCamera,
    }),
    [
      status,
      direction,
      peer,
      callId,
      appointment,
      localStream,
      remoteStream,
      durationSec,
      micOn,
      camOn,
      remoteCamOn,
      remoteMicOn,
      mediaNote,
      connection,
      endedSummary,
      expanded,
      startCall,
      accept,
      decline,
      hangup,
      toggleMic,
      toggleCamera,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <ChatNotifier />
      <IncomingCallDialog />
      <CallWindow />
    </CallContext.Provider>
  );
}
