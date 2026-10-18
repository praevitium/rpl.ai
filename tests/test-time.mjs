import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { _setClock, pastDueAlarm, msToNextAlarm, acknowledgeOldest } from '../www/src/rpl/ops/time.js';
import { isBinaryInteger } from '../www/src/rpl/types.js';
import { setUserFlag, clearUserFlag } from '../www/src/rpl/state.js';
import { snapshot, rehydrate } from '../www/src/rpl/persist.js';
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
  s = runLine('2.061990 23.595960 TSTR');
  assert(top(s).value === 'TUE 02/06/90 11:59:59P', `TSTR drops a time's fraction of a second, so TIME's 23.595960 is no sixtieth second (got ${JSON.stringify(top(s).value)})`);
  s = runLine('2.0619909 12 TSTR');
  assert(top(s).value === 'TUE 02/06/90 12:00:00P', `TSTR drops a date's digits past the year rather than rounding them into it (got ${JSON.stringify(top(s).value)})`);
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

{
  // Appointment alarms: kept soonest first, the index being the place in that list.
  const now = new Date(2026, 9, 18, 12, 0, 0).getTime();
  _setClock(() => now);
  const vals = (s) => s.snapshot().reverse().map((v) => v.type === 'list' ? `{ ${v.items.map((x) => x.type === 'string' ? `"${x.value}"` : Number(x.value)).join(' ')} }` : Number(v.value)).join(' | ');
  runLine('0 DELALARM');
  assert(vals(runLine('{ 10.182026 15.2530 "Call" } STOALARM')) === '1', 'STOALARM stores an alarm and gives its index');
  assert(vals(runLine('{ 10.182026 9 "Past" } STOALARM')) === '1', 'an earlier alarm takes index 1');
  assert(vals(runLine('2 RCLALARM')) === '{ 10.182026 15.253 "Call" 0 }', `RCLALARM gives { date time message repeat } (got ${vals(runLine('2 RCLALARM'))})`);
  assert(vals(runLine('0 FINDALARM { 10.182026 13 } FINDALARM 10.192026 FINDALARM')) === '1 | 2 | 0', '0 FINDALARM finds the past-due alarm, a date and time the first due after it, a later date none');
  runLine('ACK');
  assert(vals(runLine('1 RCLALARM')) === '{ 10.182026 15.253 "Call" 0 }' && vals(runLine('0 FINDALARM')) === '0', 'ACK deletes the oldest past-due alarm while flag -44 is clear');
  runLine('{ 10.182026 11 "Every minute" 491520 } STOALARM DROP ACK');
  assert(vals(runLine('1 RCLALARM')) === '{ 10.182026 12.01 "Every minute" 491520 }', 'ACK moves a repeating alarm to its next time after now');
  assert(vals(runLine('16.3 STOALARM 3 RCLALARM')).endsWith('{ 10.182026 16.3 "" 0 }'), 'a time alone is today, with an empty message');
  assertThrows(() => runLine('{ 10.182026 15 « 1 » } STOALARM'), /Bad argument type/, 'STOALARM takes a message, not an object to run (no control alarms)');
  assertThrows(() => runLine('9 RCLALARM'), /Nonexistent alarm/, 'RCLALARM of a missing index says Nonexistent alarm');
  setUserFlag(-44);
  runLine('{ 10.182026 8 "A" } STOALARM { 10.182026 7 "B" } STOALARM DROP2 ACKALL');
  assert(vals(runLine('0 FINDALARM')) === '0' && vals(runLine('1 RCLALARM')) === '{ 10.182026 7 "B" 0 }', 'ACKALL with flag -44 set keeps the acknowledged alarms, no longer past due');
  clearUserFlag(-44);
  const saved = JSON.parse(JSON.stringify(snapshot(new Stack())));
  runLine('0 DELALARM');
  rehydrate(saved, new Stack());
  assert(vals(runLine('1 RCLALARM')) === '{ 10.182026 7 "B" 0 }', 'alarms are saved with the calculator and come back with it');
  runLine('0 DELALARM');
  assert(vals(runLine('0 FINDALARM')) === '0' && (() => { try { runLine('1 RCLALARM'); return false; } catch { return true; } })(), '0 DELALARM deletes every alarm');
  assert(pastDueAlarm() === null && msToNextAlarm() === null, 'with no alarms none is past due and none is next');
  runLine('{ 10.182026 11.59 "Lunch" } STOALARM { 10.182026 12.0005 "Call" } STOALARM DROP2');
  assert(pastDueAlarm()?.message === 'Lunch' && msToNextAlarm() === 5000, `the app's watch: Lunch is past due and Call comes due in 5 s (got ${pastDueAlarm()?.message}, ${msToNextAlarm()})`);
  acknowledgeOldest();
  assert(pastDueAlarm() === null && vals(runLine('1 RCLALARM')) === '{ 10.182026 12.0005 "Call" 0 }', 'the note\'s ACK acknowledges the oldest past-due alarm, as ACK does');
  runLine('0 DELALARM');
  _setClock(null);
}
