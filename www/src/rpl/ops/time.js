import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { isReal, isInteger, Real, BinaryInteger, Str } from '../types.js';
import { RPLError } from '../stack.js';
import { testUserFlag, getBinaryBase } from '../state.js';
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
