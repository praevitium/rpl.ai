import { RPLAbort, RPLError } from '../stack.js';
import { getHalted, takeHalted, clearHalted, inScratchState, isSuspension, haltMark, owedAfter, runDeferred, tagHalted } from '../state.js';
import { isProgram, isTagged, Name, Real } from '../types.js';
import { register, lookup } from './registry.js';
import { runSuspendable, withStepMode, promptStoProgram, pausableRun } from './internal.js';



// ABORT is not an RPLError, so IFERR cannot trap it and EVAL leaves the stack as
// it was at the abort (AUR p.1-27).
register('ABORT', () => {
  throw new RPLAbort('Abort');
}, { category: 'Control flow / debug', categoryOrder: 0, label: "ABORT" });


// evalRange handles HALT and PROMPT inside a running program; these bodies run
// only when the command is evaluated on its own.
register('HALT', () => {
  throw new RPLError('HALT: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 1, label: "HALT" });


register('PROMPT', () => {
  throw new RPLError('PROMPT: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 4, label: "PROMPT" });


register('MSGBOX', () => {
  throw new RPLError('MSGBOX: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 9, label: "MSGBOX" });


register('INPUT', () => {
  throw new RPLError('INPUT: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 10, label: "INPUT" });

// Typed, PROMPTSTO runs as a program of its own, so its INPUT can wait for the answer.
register('PROMPTSTO', (s) => {
  const [name] = s.popN(1);
  s.push(promptStoProgram(name));
  lookup('EVAL').fn(s);
}, { category: 'Control flow / debug', categoryOrder: 10.1, label: "PROMPTSTO" });


register('CHOOSE', () => {
  throw new RPLError('CHOOSE: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 11, label: "CHOOSE" });


// No key is waiting at the command line, nor in a program between its pauses for one (ops/internal.js).
register('KEY', (s) => {
  s.push(Real(0));
}, { category: 'Control flow / debug', categoryOrder: 11.5, label: "KEY" });


register('WAIT', () => {
  throw new RPLError('WAIT: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 12, label: "WAIT" });


register('INFORM', () => {
  throw new RPLError('INFORM: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 13, label: "INFORM" });


// The HP's NOVAL object, INFORM's empty field, is the name NOVAL here.
register('NOVAL', (s) => {
  s.push(Name('NOVAL'));
}, { category: 'Control flow / debug', categoryOrder: 14, label: "NOVAL" });


// Resumes the most recently halted program, consuming any PROMPT banner.  The rest of the line that called it goes on once
// the program ends, outside any stepping.
function resumeHalted(stepping = null) {
  if (inScratchState()) throw new RPLError('Cannot dry-run a halted program');
  if (!getHalted()) throw new RPLError('No halted program');
  const record = takeHalted();
  const mark = haltMark();
  let owed = null;
  const resume = () => { pausableRun(() => runSuspendable(record.generator)); tagHalted(mark, record.tag); owed = owedAfter(record, mark); };
  if (stepping) withStepMode(stepping.single, stepping.into, resume);
  else resume();
  if (owed) runDeferred(owed);
}


register('CONT', () => resumeHalted(), { category: 'Control flow / debug', categoryOrder: 2, label: "CONT" });


// As the AUR has it, KILL cancels the program it stops and every halted one under it, not just the latest, but leaves a
// program suspended in a dialog.
register('KILL', () => {
  if (inScratchState()) throw new RPLError('Cannot dry-run a halted program');
  clearHalted();
  while (getHalted() && !isSuspension(getHalted())) clearHalted();
}, { category: 'Control flow / debug', categoryOrder: 3, label: "KILL" });


register('RUN', () => resumeHalted({ single: false, into: false }), { category: 'Control flow / debug', categoryOrder: 5, label: "RUN" });


register('DBUG', (s) => {
  s.need(1);
  let probe = s.peek();
  while (isTagged(probe)) probe = probe.value;
  if (!isProgram(probe)) throw new RPLError('Bad argument type');
  withStepMode(true, false, () => lookup('EVAL').fn(s));
}, { category: 'Control flow / debug', categoryOrder: 6, label: "DBUG" });


// SST runs a named sub-program call as one step; SST↓ steps into it.
register('SST',  () => resumeHalted({ single: true, into: false }), { category: 'Control flow / debug', categoryOrder: 7, label: "SST" });

register('SST↓', () => resumeHalted({ single: true, into: true }), { category: 'Control flow / debug', categoryOrder: 8, label: "SST↓" });
