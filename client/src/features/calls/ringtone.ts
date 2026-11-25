import { useEffect } from 'react';

type RingKind = 'incoming' | 'outgoing' | null;

/**
 * Soft synthesized tones (no audio files):
 *  - incoming: gentle two-note chime every 3 s
 *  - outgoing: quiet ring-back tone while the other side is ringing
 */
export function useRingtone(kind: RingKind): void {
  useEffect(() => {
    if (!kind || typeof window === 'undefined') return;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    ctx.resume().catch(() => {});
    let stopped = false;

    const tone = (freq: number, start: number, duration: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    };

    const play = () => {
      if (stopped || ctx.state === 'closed') return;
      const t = ctx.currentTime + 0.05;
      if (kind === 'incoming') {
        tone(659.25, t, 0.4, 0.09);
        tone(880, t + 0.42, 0.6, 0.09);
        tone(659.25, t + 1.2, 0.4, 0.06);
        tone(880, t + 1.62, 0.6, 0.06);
      } else {
        tone(440, t, 1.1, 0.035);
        tone(480, t, 1.1, 0.035);
      }
    };

    play();
    const interval = window.setInterval(play, kind === 'incoming' ? 3000 : 3600);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      ctx.close().catch(() => {});
    };
  }, [kind]);
}
