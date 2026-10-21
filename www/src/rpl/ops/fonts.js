import { Tagged, Integer, isTagged, isReal, isInteger } from '../types.js';
import { register } from './registry.js';
import { RPLError } from '../stack.js';
import { inScratchState } from '../state.js';

// rpl.ai draws in one typeface, so the HP's system font is the stack text size: font 6 is Small, 7 Normal and 8 Large.
// A font object is the tagged size :Font:7, there being no font objects to hold glyphs.
const SIZE_OF_FONT = Object.freeze({ 6: 'small', 7: 'normal', 8: 'large' });
const FONT_OF_SIZE = Object.freeze({ small: 6, normal: 7, large: 8, larger: 8 });

let _stackSize = 'normal';
let _minifont = 6;
const STANDALONE = Object.freeze({ get: () => _stackSize, set: (size) => { _stackSize = size; } });
let _hooks = STANDALONE;

export function setFontHooks(hooks) {
  _hooks = hooks ?? STANDALONE;
}

const fontObject = (n) => Tagged('Font', Integer(n));

function fontNumber(v) {
  const n = isTagged(v) && v.tag === 'Font' ? v.value : v;
  if (!isReal(n) && !isInteger(n)) throw new RPLError('Bad argument type');
  const size = Number(n.value);
  if (!SIZE_OF_FONT[size]) throw new RPLError('Bad argument value');
  return size;
}

[6, 7, 8].forEach((n, i) => {
  register(`FONT${n}`, (s) => s.push(fontObject(n)), { category: 'Display / base', categoryOrder: 31.6 + i / 100, label: `FONT${n}` });
});

// Font 8 is Large or Larger, so a program that saves FONT→ and restores it keeps Larger.
register('→FONT', (s) => {
  const [font] = s.popN(1);
  const n = fontNumber(font);
  if (!inScratchState() && FONT_OF_SIZE[_hooks.get()] !== n) _hooks.set(SIZE_OF_FONT[n]);
}, { category: 'Display / base', categoryOrder: 31.63, label: '→FONT' });

register('FONT→', (s) => {
  s.push(fontObject(FONT_OF_SIZE[_hooks.get()] ?? 7));
}, { category: 'Display / base', categoryOrder: 31.64, label: 'FONT→' });

// The minifont is kept so a program that sets it and reads it back runs; nothing here is drawn in it.
register('→MINIFONT', (s) => {
  const [font] = s.popN(1);
  const n = fontNumber(font);
  if (!inScratchState()) _minifont = n;
}, { category: 'Display / base', categoryOrder: 31.65, label: '→MINIFONT' });

register('MINIFONT→', (s) => {
  s.push(fontObject(_minifont));
}, { category: 'Display / base', categoryOrder: 31.66, label: 'MINIFONT→' });
