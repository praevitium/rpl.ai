import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { isReal, isInteger, isList, isString, Real, BinaryInteger, Str, RList } from '../types.js';
import { RPLError } from '../stack.js';
import { testUserFlag, getBinaryBase, getAlarms, setAlarms } from '../state.js';
import { register } from './registry.js';


// The clock is the device's own, so →DATE, →TIME and CLKADJ stay out. As on the HP, flag -42 set reads and
// writes dates as DD.MMYYYY and flag -41 set gives TSTR a 24-hour time.
let _now = () => Date.now();

export function _setClock(fn) {
  _now = typeof fn === 'function' ? fn : () => Date.now();
}

const DAY_MS = 86400000;
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const FIRST_DAY = Date.UTC(1582, 9, 15);
const LAST_DAY = Date.UTC(9999, 11, 31);
const TIME = { category: 'Time / dates' };

const dayFirst = () => testUserFlag(-42);
const pad = (n, width = 2) => String(n).padStart(width, '0');

function number(v) {
  if (!(isReal(v) || isInteger(v))) throw new RPLError('Bad argument type');
  return isReal(v) ? v.value : new Decimal(v.value.toString());
}

function digitsOf(v, decimals) {
  const d = number(v);
  if (d.isNegative()) throw new RPLError('Bad argument value');
  return d.toFixed(decimals, Decimal.ROUND_DOWN).split('.');
}

// MM.DDYYYY, or DD.MMYYYY with flag -42, as the UTC midnight of that day.
function parseDate(v) {
  const [whole, frac] = digitsOf(v, 6);
  const first = Number(whole), second = Number(frac.slice(0, 2)), year = Number(frac.slice(2, 6));
  const [month, day] = dayFirst() ? [second, first] : [first, second];
  const ms = Date.UTC(year, month - 1, day);
  if (!(month >= 1 && month <= 12 && day >= 1 && new Date(ms).getUTCDate() === day && ms >= FIRST_DAY && ms <= LAST_DAY)) throw new RPLError('Bad argument value');
  return ms;
}

function dateReal(ms) {
  const d = new Date(ms);
  const month = d.getUTCMonth() + 1, day = d.getUTCDate();
  const [first, second] = dayFirst() ? [day, month] : [month, day];
  return Real(new Decimal(`${first}.${pad(second)}${pad(d.getUTCFullYear(), 4)}`));
}

// HH.MMSS, any fraction of a second dropped.
function parseTime(v) {
  const [whole, frac] = digitsOf(v, 4);
  const h = Number(whole), m = Number(frac.slice(0, 2)), s = Number(frac.slice(2, 4));
  if (h > 23 || m > 59 || s > 59) throw new RPLError('Bad argument value');
  return [h, m, s];
}

register('DATE', (s) => {
  const d = new Date(_now());
  s.push(dateReal(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}, { ...TIME, categoryOrder: 1, label: 'DATE' });

register('TIME', (s) => {
  const d = new Date(_now());
  s.push(Real(new Decimal(`${d.getHours()}.${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(Math.floor(d.getMilliseconds() / 10))}`)));
}, { ...TIME, categoryOrder: 2, label: 'TIME' });

register('TICKS', (s) => {
  s.push(BinaryInteger(BigInt(Math.round(_now() * 8.192)), getBinaryBase() || 'd'));
}, { ...TIME, categoryOrder: 3, label: 'TICKS' });

register('TSTR', (s) => {
  const [date, time] = s.popN(2).map((v) => (number(v), v));
  const d = new Date(parseDate(date));
  const [h, m, sec] = parseTime(time);
  const yy = pad(d.getUTCFullYear() % 100), mm = pad(d.getUTCMonth() + 1), dd = pad(d.getUTCDate());
  const dateText = dayFirst() ? `${dd}.${mm}.${yy}` : `${mm}/${dd}/${yy}`;
  const timeText = testUserFlag(-41) ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h % 12 || 12)}:${pad(m)}:${pad(sec)}${h < 12 ? 'A' : 'P'}`;
  s.push(Str(`${DOW[d.getUTCDay()]} ${dateText} ${timeText}`));
}, { ...TIME, categoryOrder: 4, label: 'TSTR' });

register('DATE+', (s) => {
  const [date, days] = s.popN(2).map((v) => (number(v), v));
  const to = parseDate(date) + Math.round(Number(days.value)) * DAY_MS;
  if (to < FIRST_DAY || to > LAST_DAY) throw new RPLError('Bad argument value');
  s.push(dateReal(to));
}, { ...TIME, categoryOrder: 5, label: 'DATE+' });

register('DDAYS', (s) => {
  const [from, to] = s.popN(2).map((v) => (number(v), v));
  const start = parseDate(from);
  s.push(Real(Math.round((parseDate(to) - start) / DAY_MS)));
}, { ...TIME, categoryOrder: 6, label: 'DDAYS' });


// Appointment alarms, as the user chose: STOALARM takes a message, never an object to run, and alarms come due
// only while the app is open. An alarm's index is its place in the list, soonest first.
const TICK_MS = 1000 / 8192;
const ALARM = { category: 'Time / dates' };

function localDue(date, time) {
  const d = new Date(parseDate(date));
  const [h, m, sec] = time === undefined ? [0, 0, 0] : parseTime(time);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, sec).getTime();
}

function todayAt(time) {
  const now = new Date(_now());
  const [h, m, sec] = parseTime(time);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, sec).getTime();
}

function alarmAt(n) {
  const i = Number(number(n)) - 1;
  const alarm = getAlarms()[i];
  if (!Number.isInteger(i) || !alarm) throw new RPLError('Nonexistent alarm');
  return i;
}

const pastDue = (a) => !a.ack && a.due <= _now();

// A repeating alarm moves to its next time after now unless flag -43 is set; a done one goes unless flag -44 keeps it.
function acknowledge(alarm) {
  if (alarm.repeat > 0 && !testUserFlag(-43)) {
    const step = alarm.repeat * TICK_MS;
    return { ...alarm, due: alarm.due + Math.max(1, Math.ceil((_now() - alarm.due + 1) / step)) * step };
  }
  return testUserFlag(-44) ? { ...alarm, ack: true } : null;
}

register('STOALARM', (s) => {
  const [arg] = s.popN(1);
  let due, message = '', repeat = 0;
  if (isList(arg)) {
    const [date, time, action, every] = arg.items;
    if (arg.items.length < 2 || arg.items.length > 4) throw new RPLError('Bad argument value');
    due = localDue(date, time);
    if (action !== undefined) {
      if (!isString(action)) throw new RPLError('Bad argument type');
      message = action.value;
    }
    if (every !== undefined) {
      repeat = Number(number(every));
      if (repeat < 0) throw new RPLError('Bad argument value');
    }
  } else {
    due = todayAt(arg);
  }
  const alarm = { due, message, repeat, ack: false };
  setAlarms([...getAlarms(), alarm]);
  s.push(Real(getAlarms().indexOf(alarm) + 1));
}, { ...ALARM, categoryOrder: 20, label: 'STOALARM' });

register('RCLALARM', (s) => {
  const [n] = s.popN(1);
  const alarm = getAlarms()[alarmAt(n)];
  const d = new Date(alarm.due);
  const time = Real(new Decimal(`${d.getHours()}.${pad(d.getMinutes())}${pad(d.getSeconds())}`));
  s.push(RList([dateReal(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), time, Str(alarm.message), Real(alarm.repeat)]));
}, { ...ALARM, categoryOrder: 21, label: 'RCLALARM' });

register('DELALARM', (s) => {
  const [n] = s.popN(1);
  if (Number(number(n)) === 0) { setAlarms([]); return; }
  const i = alarmAt(n);
  setAlarms(getAlarms().filter((_, k) => k !== i));
}, { ...ALARM, categoryOrder: 22, label: 'DELALARM' });

register('FINDALARM', (s) => {
  const [arg] = s.popN(1);
  const alarms = getAlarms();
  let i;
  if (isList(arg)) {
    const from = localDue(arg.items[0], arg.items[1]);
    i = alarms.findIndex((a) => a.due >= from);
  } else if (Number(number(arg)) === 0) {
    i = alarms.findIndex(pastDue);
  } else {
    const from = localDue(arg);
    i = alarms.findIndex((a) => a.due >= from);
  }
  s.push(Real(i + 1));
}, { ...ALARM, categoryOrder: 23, label: 'FINDALARM' });

register('ACK', () => {
  const alarms = getAlarms();
  const i = alarms.findIndex(pastDue);
  if (i < 0) return;
  const next = acknowledge(alarms[i]);
  setAlarms(alarms.flatMap((a, k) => (k !== i ? [a] : next ? [next] : [])));
}, { ...ALARM, categoryOrder: 24, label: 'ACK' });

register('ACKALL', () => {
  setAlarms(getAlarms().flatMap((a) => {
    if (!pastDue(a)) return [a];
    const next = acknowledge(a);
    return next ? [next] : [];
  }));
}, { ...ALARM, categoryOrder: 25, label: 'ACKALL' });
