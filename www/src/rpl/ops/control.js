import { RPLAbort, RPLError } from '../stack.js';
import { getHalted, clearPromptMessage, takeHalted, clearHalted } from '../state.js';
import { isProgram, isTagged } from '../types.js';
import { register, lookup } from './registry.js';
import { runSuspendable, withStepMode } from './internal.js';



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


// Resumes the most recently halted program, consuming any PROMPT banner.
function resumeHalted() {
  if (!getHalted()) throw new RPLError('No halted program');
  clearPromptMessage();
  runSuspendable(takeHalted().generator);
}


register('CONT', resumeHalted, { category: 'Control flow / debug', categoryOrder: 2, label: "CONT" });


// KILL discards only the most recent halted program, and does nothing without one.
register('KILL', () => {
  clearHalted();
  clearPromptMessage();
}, { category: 'Control flow / debug', categoryOrder: 3, label: "KILL" });


register('RUN', () => withStepMode(false, false, resumeHalted), { category: 'Control flow / debug', categoryOrder: 5, label: "RUN" });


register('DBUG', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  let probe = s.peek();
  while (isTagged(probe)) probe = probe.value;
  if (!isProgram(probe)) throw new RPLError('Bad argument type');
  withStepMode(true, false, () => lookup('EVAL').fn(s));
}, { category: 'Control flow / debug', categoryOrder: 6, label: "DBUG" });


// SST runs a named sub-program call as one step; SST↓ steps into it.
register('SST',  () => withStepMode(true, false, resumeHalted), { category: 'Control flow / debug', categoryOrder: 7, label: "SST" });

register('SST↓', () => withStepMode(true, true, resumeHalted), { category: 'Control flow / debug', categoryOrder: 8, label: "SST↓" });
