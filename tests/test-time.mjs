import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { _setClock } from '../www/src/rpl/ops/time.js';
import { isBinaryInteger } from '../www/src/rpl/types.js';
import { setUserFlag, clearUserFlag } from '../www/src/rpl/state.js';
import { assert, assertThrows, runLine } from './helpers.mjs';

const top = (s) => s.peek();
const num = (s) => Number(top(s).value);
const pad = (n) => String(n).padStart(2, '0');

{
  // A fixed instant; DATE and TIME read it in local time, as a phone's clock does.
  const fixed = Date.UTC(2010, 4, 12, 14, 55, 30, 500);
  _setClock(() => fixed);
  const d = new Date(fixed);
  const month = d.getMonth() + 1, day = d.getDate(), year = d.getFullYear();
  let s = runLine('DATE');
  assert(s.depth === 1 && top(s).type === 'real' && num(s) === Number(`${month}.${pad(day)}${year}`), `DATE gives MM.DDYYYY, the AUR's 5.12201 for May 12 2010 (got ${top(s).value})`);
  setUserFlag(-42);
  s = runLine('DATE');
  assert(num(s) === Number(`${day}.${pad(month)}${year}`), `with flag -42 set DATE gives DD.MMYYYY (got ${top(s).value})`);
  clearUserFlag(-42);
  s = runLine('TIME');
  assert(num(s) === Number(`${d.getHours()}.${pad(d.getMinutes())}${pad(d.getSeconds())}50`), `TIME gives HH.MMSS and the fraction of the second, 24-hour (got ${top(s).value})`);
  s = runLine('TICKS');
  assert(isBinaryInteger(top(s)) && top(s).value === BigInt(Math.round(fixed * 8.192)), `TICKS is a binary integer of 1/8192 s (got ${String(top(s).value)})`);
  const t0 = runLine('TICKS');
  _setClock(() => fixed + 2500);
  lookup('TICKS').fn(t0);
  runLine('SWAP - B→R 8192 /', t0);
  assert(Math.abs(num(t0) - 2.5) < 1e-9, `TICKS SWAP - B→R 8192 / measures 2.5 s between two readings (got ${top(t0).value})`);
  _setClock(null);
  s = runLine('TICKS');
  assert(top(s).value > 0n && Math.abs(Number(top(s).value) / 8.192 - Date.now()) < 60000, 'with no clock set TICKS reads the real one');
}

{
  let s = runLine('2.061990 14.55 TSTR');
  assert(s.depth === 1 && top(s).value === 'TUE 02/06/90 02:55:00P', `the AUR's TSTR example, flags -41 and -42 clear (got ${JSON.stringify(top(s).value)})`);
  s = runLine('2.061990 0.0730 TSTR');
  assert(top(s).value === 'TUE 02/06/90 12:07:30A', `a time after midnight reads 12 with A (got ${JSON.stringify(top(s).value)})`);
  setUserFlag(-41);
  s = runLine('2.061990 14.55 TSTR');
  assert(top(s).value === 'TUE 02/06/90 14:55:00', `flag -41 set gives a 24-hour time (got ${JSON.stringify(top(s).value)})`);
  setUserFlag(-42);
  s = runLine('6.021990 14.55 TSTR');
  assert(top(s).value === 'TUE 06.02.90 14:55:00', `flag -42 set reads DD.MMYYYY and writes DD.MM.YY (got ${JSON.stringify(top(s).value)})`);
  clearUserFlag(-41); clearUserFlag(-42);
  s = runLine('2.282008 1 DATE+');
  assert(num(s) === 2.292008, `DATE+ steps into a leap day (got ${top(s).value})`);
  s = runLine('12.312010 1 DATE+');
  assert(num(s) === 1.012011, `DATE+ crosses the year (got ${top(s).value})`);
  s = runLine('1.012000 -1 DATE+');
  assert(num(s) === 12.311999, `a negative count goes back (got ${top(s).value})`);
  s = runLine('1.012000 1.012001 DDAYS');
  assert(num(s) === 366, `DDAYS over the leap year 2000 (got ${top(s).value})`);
  s = runLine('1.012001 1.012000 DDAYS');
  assert(num(s) === -366, 'DDAYS is negative when the first date is later');
  s = runLine('10.151582 12.319999 DDAYS');
  assert(num(s) === 3074323, `DDAYS spans the whole allowed range (got ${top(s).value})`);
  for (const [line, pattern, why] of [
    ['13.012000 1 DATE+', /Bad argument value/, 'a thirteenth month'],
    ['2.302000 1 DATE+', /Bad argument value/, 'February 30th'],
    ['10.141582 1.012000 DDAYS', /Bad argument value/, 'a date before October 15 1582'],
    ['12.319999 1 DATE+', /Bad argument value/, 'a date past 9999'],
    ['2.061990 25 TSTR', /Bad argument value/, 'an hour past 23'],
    ['2.061990 14.60 TSTR', /Bad argument value/, 'a sixtieth minute'],
    ['"a" 1 DDAYS', /Bad argument type/, 'a string for a date'],
    ['1 "a" DDAYS', /Bad argument type/, 'a string for the second date, checked before the first date is read'],
    ['2.061990 "x" TSTR', /Bad argument type/, 'a string for a time'],
  ]) {
    const t = new Stack();
    assertThrows(() => runLine(line, t), pattern, `${line} refuses ${why}`);
  }
  assertThrows(() => lookup('TSTR').fn(new Stack()), /Too few arguments/, 'TSTR with nothing says so');
  assert(['DATE', 'TIME', 'TICKS', 'TSTR', 'DATE+', 'DDAYS', '→HMS', 'HMS→', 'HMS+', 'HMS-'].every((n) => lookup(n).category === 'Time / dates'), 'the clock and the HMS commands share the Time / dates family, the HP TIME menu');
}
