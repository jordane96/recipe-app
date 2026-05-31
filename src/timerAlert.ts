/**
 * Step-timer expiry alert: a short triple-beep (Web Audio, no asset) + vibration.
 *
 * iOS requires audio playback to be unlocked by a user gesture before it can be triggered
 * programmatically later. So {@link unlockTimerAudio} is called when the user *starts* a timer
 * (a tap), priming the AudioContext; {@link playTimerAlert} then works at the silent expiry
 * moment. Everything is wrapped in try/catch and feature-detected so unsupported environments
 * (or autoplay-blocked contexts) just no-op.
 */

let audioCtx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Prime audio from within a user gesture (timer start) so the expiry beep can fire later. */
export function unlockTimerAudio(): void {
  ensureCtx();
}

/** Triple-beep + vibrate. Safe to call outside a gesture once audio has been unlocked. */
export function playTimerAlert(): void {
  // Vibration — Android honors it; iOS Safari ignores (no-op, not an error).
  try {
    navigator.vibrate?.([200, 120, 200, 120, 300]);
  } catch {
    /* no-op */
  }

  const ctx = ensureCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Three short pleasant pips at 880 Hz.
    for (const offset of [0, 0.32, 0.64]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.25);
    }
  } catch {
    /* no-op */
  }
}
