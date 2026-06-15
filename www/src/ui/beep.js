/* =================================================================
   Short audio beep for error flashes.

   Approximates the HP50's piezo buzzer tone — a square-wave chirp
   around 1 kHz, ~125 ms long with tiny attack / release ramps to
   avoid the click you get from a hard start/stop on a square wave.

   A single AudioContext is created lazily on first beep.  All
   browsers require a user-gesture to unlock audio; we rely on the
   fact that error beeps always follow a key press or click, so the
   context is always unlocked by the time we play.

   Silently no-ops in non-browser environments (node tests) where
   AudioContext is undefined.
   ================================================================= */

let _ctx = null;

function getCtx() {
  if (_ctx) return _ctx;
  const Ctor = (typeof AudioContext !== 'undefined') ? AudioContext
             : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext
             : null;
  if (!Ctor) return null;
  try { _ctx = new Ctor(); } catch { return null; }
  return _ctx;
}

export function errorBeep() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1000;

  const now = ctx.currentTime;
  const dur = 0.125;
  const atk = 0.004;
  const rel = 0.012;
  const peak = 0.12;                              // modest — piezos are quiet
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + atk);
  gain.gain.setValueAtTime(peak, now + dur - rel);
  gain.gain.linearRampToValueAtTime(0, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.01);
}
