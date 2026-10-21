import { isName, isString, isList, isReal, isInteger, isStorableHpName, RList, Integer, Str } from '../types.js';
import { register } from './registry.js';
import { RPLError } from '../stack.js';
import { inScratchState, testUserFlag, homeStore, state as calcState } from '../state.js';
import { recallVar } from './internal.js';
import { print } from './print.js';

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

// The serial port has nothing on the other end: settings land in IOPAR, kept in HOME as on the HP
// ({ baud parity receive-pacing transmit-pacing checksum translation }), reads find an empty buffer and
// XMIT prints, the RS-232 printer being XMIT's usual partner.
const IOPAR_DEFAULT = Object.freeze([115200, 0, 0, 0, 3, 1]);
const BAUDS = Object.freeze([2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200]);

function numberArg(s) {
  const [v] = s.popN(1);
  if (!isReal(v) && !isInteger(v)) throw new RPLError('Bad argument type');
  return Number(v.value);
}

function intArg(s, ok) {
  const n = numberArg(s);
  if (!Number.isInteger(n) || !ok(n)) throw new RPLError('Bad argument value');
  return n;
}

function iopar() {
  const v = calcState.home.entries.get('IOPAR');
  const items = isList(v) && v.items.length === 6 && v.items.every((x) => isReal(x) || isInteger(x)) ? v.items.map((x) => Number(x.value)) : null;
  return items ?? [...IOPAR_DEFAULT];
}

function setIopar(index, n) {
  if (inScratchState()) return;
  const items = iopar();
  items[index] = n;
  homeStore('IOPAR', RList(items.map((x) => Integer(x))));
}

register('BAUD', (s) => setIopar(0, intArg(s, (n) => BAUDS.includes(n))), { category: 'System', categoryOrder: 0.78, label: 'BAUD' });
register('PARITY', (s) => setIopar(1, intArg(s, (n) => Math.abs(n) <= 4)), { category: 'System', categoryOrder: 0.79, label: 'PARITY' });
register('CKSM', (s) => setIopar(4, intArg(s, (n) => n >= 1 && n <= 3)), { category: 'System', categoryOrder: 0.8, label: 'CKSM' });
register('TRANSIO', (s) => setIopar(5, intArg(s, (n) => n >= 0 && n <= 3)), { category: 'System', categoryOrder: 0.81, label: 'TRANSIO' });

// Nothing on the port is ever waited for, so STIME only checks its timeout.
register('STIME', (s) => {
  const x = numberArg(s);
  if (!(x >= 0 && x <= 25.4)) throw new RPLError('Bad argument value');
}, { category: 'System', categoryOrder: 0.82, label: 'STIME' });

register('OPENIO', () => {}, { category: 'System', categoryOrder: 0.83, label: 'OPENIO' });
register('CLOSEIO', () => {}, { category: 'System', categoryOrder: 0.84, label: 'CLOSEIO' });
register('SBRK', () => {}, { category: 'System', categoryOrder: 0.845, label: 'SBRK' });
register('BUFLEN', (s) => { s.push(Integer(0)); s.push(Integer(1)); }, { category: 'System', categoryOrder: 0.85, label: 'BUFLEN' });

// Nothing arrives, so SRECV returns at once what a timed-out HP returns: the characters received (none) and 0.
register('SRECV', (s) => {
  intArg(s, (n) => n >= 0);
  s.push(Str(''));
  s.push(Integer(0));
}, { category: 'System', categoryOrder: 0.86, label: 'SRECV' });

register('XMIT', (s) => {
  const [v] = s.popN(1);
  if (!isString(v)) throw new RPLError('Bad argument type');
  print(v.value.split('\n'));
  s.push(Integer(1));
}, { category: 'System', categoryOrder: 0.87, label: 'XMIT' });

register('KERRM', (s) => s.push(Str('')), { category: 'System', categoryOrder: 0.88, label: 'KERRM' });

// SEND and KGET work with files, so there is no Kermit server to finish, serve as or send packets to.
register('FINISH', () => {}, { category: 'System', categoryOrder: 0.89, label: 'FINISH' });

function serve() {
  if (!inScratchState()) _hooks?.note?.('There is no serial link to serve on: SEND saves files and RECV opens them.');
}

register('SERVER', serve, { category: 'System', categoryOrder: 0.9, label: 'SERVER' });
register('XSERV', serve, { category: 'System', categoryOrder: 0.91, label: 'XSERV' });

register('PKT', (s) => {
  const [data, type] = s.popN(2);
  if (!isString(data) || !isString(type)) throw new RPLError('Bad argument type');
  throw new RPLError('Timeout');
}, { category: 'System', categoryOrder: 0.92, label: 'PKT' });
