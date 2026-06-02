/**
 * Step-timer expiry alert: plays a bundled alarm sound + vibration.
 *
 * iOS only allows programmatic audio after a user gesture has "unlocked" playback. So
 * {@link unlockTimerAudio} is called when the user *starts* a timer (a tap) — it plays the
 * clip muted and immediately resets, which grants permission for the later silent-expiry
 * {@link playTimerAlert}. Everything is feature-detected + try/catch so unsupported or
 * autoplay-blocked contexts just no-op.
 */

// Versioned filename: bump the suffix whenever the audio changes so PWA/browser caches
// can't serve a stale clip (files in public/ keep their literal URL, unlike hashed bundles).
const ALARM_SRC = "/sounds/timer-alarm-2.mp3";

let alarm: HTMLAudioElement | null = null;
let unlocked = false;

function ensureAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!alarm) {
    alarm = new Audio(ALARM_SRC);
    alarm.preload = "auto";
  }
  return alarm;
}

/** Prime audio from within a user gesture (timer start) so the expiry sound can fire later. */
export function unlockTimerAudio(): void {
  const a = ensureAudio();
  if (!a || unlocked) return;
  try {
    a.muted = true;
    const p = a.play();
    const finish = () => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      unlocked = true;
    };
    if (p && typeof p.then === "function") {
      p.then(finish).catch(() => {
        a.muted = false;
      });
    } else {
      finish();
    }
  } catch {
    a.muted = false;
  }
}

/** Stop the alarm if it's currently playing (e.g. the user tapped to acknowledge it). */
export function stopTimerAlert(): void {
  if (!alarm) return;
  try {
    alarm.pause();
    alarm.currentTime = 0;
  } catch {
    /* no-op */
  }
  try {
    navigator.vibrate?.(0); // cancel any ongoing vibration
  } catch {
    /* no-op */
  }
}

/** Play the alarm clip + vibrate. Safe to call outside a gesture once audio is unlocked. */
export function playTimerAlert(): void {
  // Vibration — urgent repeating pattern. Android honors it; iOS Safari ignores (no-op).
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300, 150, 500]);
  } catch {
    /* no-op */
  }

  const a = ensureAudio();
  if (!a) return;
  try {
    a.muted = false;
    a.currentTime = 0;
    void a.play();
  } catch {
    /* no-op */
  }
}
