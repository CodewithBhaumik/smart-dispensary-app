/** Camera / microphone acquisition with graceful fallbacks (never throws). */

export interface AcquiredMedia {
  stream: MediaStream | null;
  /** Human-readable explanation when we could not get both camera and microphone. */
  note: string | null;
}

export async function acquireMedia(): Promise<AcquiredMedia> {
  const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!devices?.getUserMedia) {
    return {
      stream: null,
      note: 'Camera and microphone need a secure connection (localhost or https). You can still see and hear the other person.',
    };
  }
  try {
    const stream = await devices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return { stream, note: null };
  } catch {
    // fall through to degraded modes
  }
  try {
    const stream = await devices.getUserMedia({ audio: true });
    return { stream, note: 'Camera unavailable — you joined with audio only.' };
  } catch {
    // fall through
  }
  try {
    const stream = await devices.getUserMedia({ video: true });
    return { stream, note: 'Microphone unavailable — the other person cannot hear you.' };
  } catch {
    return {
      stream: null,
      note: 'Camera and microphone are blocked or unavailable — you joined in view-only mode.',
    };
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Binds a stream to a <video> element without restarting playback needlessly. */
export function attachStream(el: HTMLVideoElement | null, stream: MediaStream | null): void {
  if (!el) return;
  if (el.srcObject !== stream) el.srcObject = stream;
  if (stream) el.play().catch(() => {});
}
