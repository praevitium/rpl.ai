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
  const peak = 0.12;
  // Ramp in and out: a hard-edged square wave clicks.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + atk);
  gain.gain.setValueAtTime(peak, now + dur - rel);
  gain.gain.linearRampToValueAtTime(0, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.01);
}
