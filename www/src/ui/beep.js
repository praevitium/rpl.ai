import { testUserFlag } from '../rpl/state.js';

let _ctx = null;
let _queueEnd = 0;

function getCtx() {
  if (_ctx) return _ctx;
  const Ctor = (typeof AudioContext !== 'undefined') ? AudioContext
             : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext
             : null;
  if (!Ctor) return null;
  try { _ctx = new Ctor(); } catch { return null; }
  return _ctx;
}

function play(hz, dur, at = null, peak = 0.12) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = hz;

  const now = at ?? ctx.currentTime;
  const atk = 0.004;
  const rel = Math.min(0.012, dur / 2);
  // Ramp in and out: a hard-edged square wave clicks.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + atk);
  gain.gain.setValueAtTime(peak, now + dur - rel);
  gain.gain.linearRampToValueAtTime(0, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.01);
}

// Flag -56 silences the error beep, as it does BEEP.
export function errorBeep() {
  if (!testUserFlag(-56)) play(1000, 0.125);
}

export function keyClick() {
  play(2000, 0.012, null, 0.05);
}

// BEEP's tones play one after another, as the HP's do while its program waits for each; the program here runs on.
export function beep(hz, seconds) {
  const ctx = getCtx();
  if (!ctx) return;
  const at = Math.max(ctx.currentTime, _queueEnd);
  _queueEnd = at + seconds;
  play(hz, seconds, at);
}

export function alarmBeep() {
  const ctx = getCtx();
  if (!ctx) return;
  for (let i = 0; i < 3; i++) play(2048, 0.1, ctx.currentTime + i * 0.2);
}
