import { assert, assertThrows } from './helpers.mjs';
import {
  evalNumeric, lookupEnv, parsePlotExpr, sampleFunction, samplePolar,
  sampleParametric, segmentPoints, niceTicks, niceNum, worldToPixel,
  pixelToWorld, zoomView, panView, defaultView, boundsOfPoints,
  valueToPoints, valuesFromColumn, histogram, evalFitModel, sampleFit,
  nextTraceColor, TRACE_COLORS,
} from '../www/src/ui/plot-engine.js';
import { Matrix, Vector, Real, Integer } from '../www/src/rpl/types.js';
import { lookup, setGraphicsHook } from '../www/src/rpl/ops.js';
import { Stack } from '../www/src/rpl/stack.js';

{
  assert(lookupEnv('π', {}) === Math.PI, 'lookupEnv: π is pi');
  assert(lookupEnv('pi', {}) === Math.PI, 'lookupEnv: pi is pi');
  assert(lookupEnv('e', {}) === Math.E, 'lookupEnv: e');
  assert(lookupEnv('x', { x: 3 }) === 3, 'lookupEnv: exact');
  assert(lookupEnv('X', { x: 3 }) === 3, 'lookupEnv: case-insensitive');
  assert(lookupEnv('z', {}) === undefined, 'lookupEnv: missing');
}

{
  const ast = parsePlotExpr('X^2 + 1');
  assert(evalNumeric(ast, { x: 3 }) === 10, 'evalNumeric: X^2+1 at 3');
  assert(evalNumeric(parsePlotExpr('SIN(0)'), {}) === 0, 'evalNumeric: SIN(0)');
  const nan = evalNumeric(parsePlotExpr('1/X'), { x: 0 });
  assert(Number.isNaN(nan), 'evalNumeric: 1/0 is NaN');
}

{
  const ast = parsePlotExpr('2*X');
  const segs = sampleFunction(ast, 0, 2, 3, {});
  assert(segs.length === 1 && segs[0].length === 3, 'sampleFunction: one segment');
  assert(segs[0][0][1] === 0 && segs[0][2][1] === 4, 'sampleFunction: y values');
}

{
  const ast = parsePlotExpr('1');
  const segs = samplePolar(ast, 0, Math.PI, 5, {}, { toRad: x => x });
  assert(segs.length === 1, 'samplePolar: unit circle arc is one segment');
  const [x0, y0] = segs[0][0];
  assert(Math.abs(x0 - 1) < 1e-9 && Math.abs(y0) < 1e-9, 'samplePolar: θ=0 → (1,0)');
}

{
  const segs = sampleParametric(parsePlotExpr('T'), parsePlotExpr('2*T'), 0, 2, 3, {});
  assert(segs[0][2][0] === 2 && segs[0][2][1] === 4, 'sampleParametric: line y=2x');
}

{
  const segs = segmentPoints([[0, 0], [1, 1], [2, NaN], [3, 3], [4, 4]], Infinity);
  assert(segs.length === 2, 'segmentPoints: NaN splits');
  assert(segs[0].length === 2 && segs[1].length === 2, 'segmentPoints: two pairs');
}

{
  const { ticks, step } = niceTicks(0, 10, 6);
  assert(step > 0, 'niceTicks: positive step');
  assert(ticks[0] >= 0 && ticks[ticks.length - 1] <= 10 + step, 'niceTicks: in range');
  assert(niceNum(10, true) === 10, 'niceNum: 10 rounds to 10');
}

{
  const view = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
  const [px, py] = worldToPixel(0, 0, view, 200, 100);
  assert(px === 100 && py === 50, 'worldToPixel: origin centred');
  const [wx, wy] = pixelToWorld(px, py, view, 200, 100);
  assert(Math.abs(wx) < 1e-9 && Math.abs(wy) < 1e-9, 'pixelToWorld: inverse');
  const z = zoomView(view, 0, 0, 0.5);
  assert(z.xmin === -5 && z.xmax === 5, 'zoomView: toward origin');
  const p = panView(view, 1, -2);
  assert(p.xmin === -9 && p.ymin === -12, 'panView: shifts');
}

{
  const b = boundsOfPoints([[0, 0], [10, 10]], 0);
  assert(b.xmin === 0 && b.xmax === 10 && b.ymax === 10, 'boundsOfPoints: tight');
  const d = defaultView();
  assert(d.xmin === -10 && d.xmax === 10, 'defaultView: ±10');
}

{
  const m = Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);
  const pts = valueToPoints(m);
  assert(pts[0][0] === 1 && pts[0][1] === 2, 'valueToPoints: 2-col matrix');
  const col = valueToPoints(Matrix([[Real(5)], [Real(7)]]));
  assert(col[0][0] === 1 && col[1][1] === 7, 'valueToPoints: 1-col uses index');
  const v = valueToPoints(Vector([Real(9), Real(8)]));
  assert(v[1][0] === 2 && v[1][1] === 8, 'valueToPoints: vector');
  assert(valueToPoints(Integer(1)) === null, 'valueToPoints: scalar is null');
  const nums = valuesFromColumn(m, 1);
  assert(nums[0] === 2 && nums[1] === 4, 'valuesFromColumn: col 1');
}

{
  const h = histogram([1, 1, 1, 5, 5], 2);
  assert(h.counts.length === 2, 'histogram: two bins');
  assert(h.counts[0] + h.counts[1] === 5, 'histogram: all samples counted');
  assert(histogram([]).counts.length === 0, 'histogram: empty');
}

{
  assert(evalFitModel({ kind: 'LIN', a: 1, b: 2 }, 3) === 7, 'evalFitModel: LIN');
  assert(Number.isNaN(evalFitModel({ kind: 'LOG', a: 0, b: 1 }, -1)), 'evalFitModel: LOG domain');
  const segs = sampleFit({ kind: 'LIN', a: 0, b: 1 }, 0, 2, 3);
  assert(segs[0][2][1] === 2, 'sampleFit: y=x');
}

{
  assert(TRACE_COLORS.length >= 5, 'TRACE_COLORS: palette');
  assert(nextTraceColor(0) === TRACE_COLORS[0], 'nextTraceColor: wraps from 0');
  assert(nextTraceColor(TRACE_COLORS.length) === TRACE_COLORS[0], 'nextTraceColor: wraps');
}

{
  let seen = null;
  setGraphicsHook((kind, s) => { seen = { kind, depth: s.depth }; });
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)]]));
  lookup('SCATRPLOT').fn(s);
  assert(seen.kind === 'scatter' && seen.depth === 1, 'SCATRPLOT: hook fires, stack kept');
  lookup('BARPLOT').fn(s);
  assert(seen.kind === 'bar', 'BARPLOT: hook');
  lookup('HISTPLOT').fn(s);
  assert(seen.kind === 'hist', 'HISTPLOT: hook');
  lookup('DRAW').fn(s);
  assert(seen.kind === 'draw', 'DRAW: hook');
  setGraphicsHook(null);
  assertThrows(() => lookup('FUNCTION').fn(s), /No graphics view/,
    'FUNCTION without hook → No graphics view');
  assertThrows(() => lookup('POLAR').fn(s), /No graphics view/,
    'POLAR without hook → No graphics view');
  assertThrows(() => lookup('PARAMETRIC').fn(s), /No graphics view/,
    'PARAMETRIC without hook → No graphics view');
}


