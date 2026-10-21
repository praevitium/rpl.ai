import { isName, isString, isList, isStorableHpName } from '../types.js';
import { register } from './registry.js';
import { RPLError } from '../stack.js';
import { inScratchState, testUserFlag, state as calcState } from '../state.js';
import { recallVar } from './internal.js';

// There is no Kermit or XModem link: sending downloads each variable as an HP text file (.rpl), and receiving
// asks for files and stores them in the current directory once they are picked.
let _hooks = null;

export function setTransferHooks(hooks) {
  _hooks = hooks ?? null;
}

function nameOf(v) {
  if (isName(v)) return v.id;
  if (isString(v) && v.value.trim()) return v.value.trim();
  throw new RPLError('Bad argument type');
}

// 'A', "A", { A B } and {{ A B } C }: each item a name, or a list of the old name and the new.
export function transferPairs(arg) {
  const items = isList(arg) ? arg.items : [arg];
  if (!items.length) throw new RPLError('Bad argument value');
  return items.map((v) => {
    if (!isList(v)) return { from: nameOf(v), to: nameOf(v) };
    if (v.items.length !== 2) throw new RPLError('Bad argument value');
    return { from: nameOf(v.items[0]), to: nameOf(v.items[1]) };
  });
}

const inUse = (name) => calcState.current.entries.has(name);

// Flag -36 set lets a received object replace a variable; clear, it takes the name with a number, NAME1, NAME2…
export function receivedName(name) {
  if (testUserFlag(-36) || !inUse(name)) return name;
  let i = 1;
  while (inUse(`${name}${i}`)) i++;
  return `${name}${i}`;
}

// The name a picked file is stored under: its own for RECV, the one asked for when one was, else the new name
// of the pair whose old name the file carries; null for a file that was not asked for.
export function receivedTarget(pairs, fileName, ownName) {
  if (!pairs) return ownName;
  if (pairs.length === 1) return pairs[0].to;
  const stem = fileName.replace(/\.[^.]*$/, '').toLowerCase();
  return pairs.find(({ from }) => [stem, ownName.toLowerCase()].includes(from.toLowerCase()))?.to ?? null;
}

function checkTargets(pairs) {
  const bad = pairs.find(({ to }) => !isStorableHpName(to));
  if (bad) throw new RPLError(`Invalid name: ${bad.to}`);
}

function send(s) {
  const [arg] = s.popN(1);
  const files = transferPairs(arg).map(({ from, to }) => {
    const value = recallVar(from);
    if (value === undefined) throw new RPLError(`Undefined name: ${from}`);
    return { name: to, value };
  });
  if (!inScratchState()) _hooks?.send(files);
}

function receive(pairs) {
  if (!inScratchState()) _hooks?.receive(pairs);
}

function get(s) {
  const [arg] = s.popN(1);
  const pairs = transferPairs(arg);
  checkTargets(pairs);
  receive(pairs);
}

function receiveAs(s, { strict = false } = {}) {
  const [arg] = s.popN(1);
  if (isList(arg)) throw new RPLError('Bad argument type');
  const pairs = [{ from: null, to: nameOf(arg) }];
  checkTargets(pairs);
  if (strict && !testUserFlag(-36) && inUse(pairs[0].to)) throw new RPLError('Name conflict');
  receive(pairs);
}

register('SEND', send, { category: 'System', categoryOrder: 0.7, label: 'SEND' });
register('XSEND', send, { category: 'System', categoryOrder: 0.71, label: 'XSEND' });
register('XPUT', send, { category: 'System', categoryOrder: 0.72, label: 'XPUT' });
register('RECV', () => receive(null), { category: 'System', categoryOrder: 0.73, label: 'RECV' });
register('RECN', (s) => receiveAs(s), { category: 'System', categoryOrder: 0.74, label: 'RECN' });
register('XRECV', (s) => receiveAs(s, { strict: true }), { category: 'System', categoryOrder: 0.75, label: 'XRECV' });
register('KGET', get, { category: 'System', categoryOrder: 0.76, label: 'KGET' });
register('XGET', get, { category: 'System', categoryOrder: 0.77, label: 'XGET' });
