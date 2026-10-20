// MINEHUNT's 8×16 battlefield: start in the upper-left corner and reach the lower-right one, told only how many
// mines lie in the squares around you. Squares are numbered row by row from 0.
import { RList, Real, Str, isList, isReal, isInteger, isString } from './types.js';

export const ROWS = 8;
export const COLS = 16;
export const GOAL = ROWS * COLS - 1;

// A negative count leaves the mines in view, as the HP's Nmines does.
export function newField(count, random = Math.random) {
  const mines = new Set();
  while (mines.size < Math.min(Math.abs(count), GOAL - 1)) {
    const at = Math.floor(random() * ROWS * COLS);
    if (at !== 0 && at !== GOAL) mines.add(at);
  }
  return { mines, at: 0, visited: new Set([0]), visible: count < 0, over: null };
}

export function minesAround(game, at = game.at) {
  const row = Math.floor(at / COLS), col = at % COLS;
  let count = 0;
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if ((r !== row || c !== col) && r >= 0 && r < ROWS && c >= 0 && c < COLS && game.mines.has(r * COLS + c)) count++;
    }
  }
  return count;
}

// One square towards (dr, dc); the edge of the field holds you. A mine or the far corner ends the game.
export function step(game, dr, dc) {
  const row = Math.floor(game.at / COLS) + dr, col = game.at % COLS + dc;
  if (game.over || row < 0 || row >= ROWS || col < 0 || col >= COLS) return game.over;
  game.at = row * COLS + col;
  game.visited.add(game.at);
  if (game.mines.has(game.at)) game.over = 'mine';
  else if (game.at === GOAL) game.over = 'won';
  return game.over;
}

// MHpar: { square "mines" "visited" shown }, a 1 or 0 for each square.
const bits = (set) => Array.from({ length: ROWS * COLS }, (_, i) => (set.has(i) ? '1' : '0')).join('');
const fromBits = (text) => new Set([...text].flatMap((ch, i) => (ch === '1' ? [i] : [])));
const isBits = (v) => isString(v) && v.value.length === ROWS * COLS && /^[01]+$/.test(v.value);

export const saveField = (game) => RList([Real(game.at), Str(bits(game.mines)), Str(bits(game.visited)), Real(game.visible ? 1 : 0)]);

export function loadField(v) {
  const [at, mines, visited, shown] = isList(v) ? v.items : [];
  const square = isReal(at) || isInteger(at) ? Number(at.value) : NaN;
  if (!(Number.isInteger(square) && square >= 0 && square <= GOAL && isBits(mines) && isBits(visited))) return null;
  return { mines: fromBits(mines.value), at: square, visited: fromBits(visited.value), visible: Number(shown?.value) === 1, over: null };
}
