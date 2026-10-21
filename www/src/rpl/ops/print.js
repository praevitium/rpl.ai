import { isString, isName, isList, isReal, isInteger } from '../types.js';
import { register } from './registry.js';
import { RPLError } from '../stack.js';
import { inScratchState } from '../state.js';
import { format, formatSource } from '../formatter.js';
import { recallVar } from './internal.js';

// rpl.ai has no printer: the print commands write to a print log the app shows, as the HP prints on paper.
const MAX_LINES = 2000;
const COMPACT_WIDTH = 33;
export const printLog = [];
let _printHook = null;

export function setPrintHook(fn) {
  _printHook = typeof fn === 'function' ? fn : null;
}

export function clearPrintLog() {
  printLog.length = 0;
}

function print(lines) {
  if (inScratchState()) return;
  printLog.push(...lines);
  if (printLog.length > MAX_LINES) printLog.splice(0, printLog.length - MAX_LINES);
  _printHook?.(lines.length);
}

// Multiline printer format: strings without their quotes, everything else as it is typed.
const multiline = (v) => (isString(v) ? v.value : formatSource(v)).split('\n');

function compact(v) {
  const text = format(v).replace(/\s*\n\s*/g, ' ');
  return text.length > COMPACT_WIDTH ? `${text.slice(0, COMPACT_WIDTH - 1)}…` : text;
}

const stackLevels = (s) => Array.from({ length: s.depth }, (_, i) => [s.depth - i, s.peek(s.depth - i)]);

function labelled(label, lines) {
  return [`${label}: ${lines[0]}`, ...lines.slice(1)];
}

register('PR1', (s) => {
  const [v] = s.popN(1);
  s.push(v);
  print(multiline(v));
}, { category: 'System', categoryOrder: 0.61, label: 'PR1' });

register('PRST', (s) => {
  print(stackLevels(s).flatMap(([n, v]) => labelled(n, multiline(v))));
}, { category: 'System', categoryOrder: 0.62, label: 'PRST' });

register('PRSTC', (s) => {
  print(stackLevels(s).map(([n, v]) => `${n}: ${compact(v)}`));
}, { category: 'System', categoryOrder: 0.63, label: 'PRSTC' });

// PRLCD prints the display as text: the stack's levels as the screen shows them, one line each.
register('PRLCD', (s) => {
  print(stackLevels(s).map(([n, v]) => `${n}: ${compact(v)}`));
}, { category: 'System', categoryOrder: 0.64, label: 'PRLCD' });

register('PRVAR', (s) => {
  const [arg] = s.popN(1);
  const names = isList(arg) ? arg.items : [arg];
  if (!names.length || !names.every(isName)) throw new RPLError('Bad argument type');
  print(names.flatMap((n) => {
    const v = recallVar(n.id);
    if (v === undefined) throw new RPLError(`Undefined name: ${n.id}`);
    return labelled(n.id, multiline(v));
  }));
}, { category: 'System', categoryOrder: 0.65, label: 'PRVAR' });

register('CR', () => {
  print(['']);
}, { category: 'System', categoryOrder: 0.66, label: 'CR' });

// No printer is attached, so there is nothing to pace or remap; programs that set them up still run.
register('DELAY', (s) => {
  const [x] = s.popN(1);
  if (!isReal(x) && !isInteger(x)) throw new RPLError('Bad argument type');
}, { category: 'System', categoryOrder: 0.67, label: 'DELAY' });

register('OLDPRT', () => {}, { category: 'System', categoryOrder: 0.68, label: 'OLDPRT' });
