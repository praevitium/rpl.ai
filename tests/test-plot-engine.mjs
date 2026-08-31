import { assert, assertThrows } from './helpers.mjs';
import {
  evalNumeric, lookupEnv, parsePlotExpr, sampleFunction, samplePolar,
  sampleParametric, segmentPoints, niceTicks, niceNum, worldToPixel,
  pixelToWorld, zoomView, panView, defaultView, boundsOfPoints,
  valueToPoints, valuesFromColumn, histogram, evalFitModel, sampleFit,
  nextTraceColor, TRACE_COLORS, sampleTraceForFit, fitViewToTraces,
  evalTraceAtX,
} from '../www/src/ui/plot-engine.js';
import { Matrix, Vector, Real, Integer, Symbolic, Program, RList, isSymbolic, isMatrix } from '../www/src/rpl/types.js';
import { lookup, setGraphicsHook } from '../www/src/rpl/ops.js';
import { Stack } from '../www/src/rpl/stack.js';
import { parseAlgebra } from '../www/src/rpl/algebra.js';
import { stackValueToTrace, traceToStackValues } from '../www/src/ui/graph-view.js';

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
  const nested = valueToPoints(RList([
    RList([Real(1), Real(2)]),
    Vector([Real(3), Real(4)]),
  ]));
  assert(nested.length === 2 && nested[0][0] === 1 && nested[1][1] === 4,
    'valueToPoints: list of lists/vectors is xy');
  const nestedCol = valuesFromColumn(RList([
    RList([Real(5), Real(6)]),
    RList([Real(7), Real(8)]),
  ]), 1);
  assert(nestedCol[0] === 6 && nestedCol[1] === 8,
    'valuesFromColumn: nested list col 1');
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

{
  const view = defaultView();
  const pts = sampleTraceForFit({ kind: 'function', expr: 'SIN(X)' }, view, {
    angleOpts: { toRad: x => x, fromRad: x => x },
  });
  assert(pts.length > 10, 'sampleTraceForFit: function yields samples');
  const ys = pts.map(p => p[1]);
  assert(Math.max(...ys) > 0.9 && Math.min(...ys) < -0.9,
    'sampleTraceForFit: SIN spans [-1, 1]');

  const polar = sampleTraceForFit({ kind: 'polar', expr: '1' }, view, {
    angleOpts: { toRad: x => x },
    thetaRange: { min: 0, max: 2 * Math.PI },
  });
  assert(polar.length > 10, 'sampleTraceForFit: polar unit circle');
  const stored = sampleTraceForFit({ kind: 'scatter', points: [[0, 1], [2, 3]] }, view);
  assert(stored.length === 2 && stored[1][0] === 2, 'sampleTraceForFit: stored points');
}

{
  const spec = stackValueToTrace(Symbolic(parseAlgebra('X^2')));
  assert(spec.kind === 'function' && spec.expr.includes('X'),
    'stackValueToTrace: Symbolic → function');
  const polar = stackValueToTrace(Symbolic(parseAlgebra('SIN(θ)')), 'polar');
  assert(polar.kind === 'polar', 'stackValueToTrace: preferred polar');
  const data = stackValueToTrace(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  assert(data.kind === 'scatter' && data.points.length === 2,
    'stackValueToTrace: Matrix → scatter');
  const bar = stackValueToTrace(Vector([Real(5), Real(6)]), 'bar');
  assert(bar.kind === 'bar' && bar.points[0][1] === 5,
    'stackValueToTrace: Vector + preferred bar');
  assert(stackValueToTrace(null) === null, 'stackValueToTrace: null');
  assert(stackValueToTrace(Program([])) === null,
    'stackValueToTrace: program is not a plot');
}

{
  const pushed = traceToStackValues({ kind: 'function', expr: 'X + 1' });
  assert(pushed.length === 1 && isSymbolic(pushed[0]),
    'traceToStackValues: function → Symbolic');
  const pair = traceToStackValues({ kind: 'parametric', expr: 'COS(T)', exprY: 'SIN(T)' });
  assert(pair.length === 2 && isSymbolic(pair[0]) && isSymbolic(pair[1]),
    'traceToStackValues: parametric → two Symbolics');
  const mat = traceToStackValues({ kind: 'scatter', points: [[1, 2], [3, 4]] });
  assert(mat.length === 1 && isMatrix(mat[0]) && mat[0].rows.length === 2,
    'traceToStackValues: scatter → Matrix');
  assert(traceToStackValues({ kind: 'function', expr: '' }).length === 0,
    'traceToStackValues: empty expr');
}

{
  const view = defaultView();
  const sinFit = fitViewToTraces(
    [{ kind: 'function', expr: 'SIN(X)', enabled: true }],
    view,
    { angleOpts: { toRad: x => x } },
  );
  assert(sinFit.xmin === view.xmin && sinFit.xmax === view.xmax,
    'fitViewToTraces: function keeps x-range');
  assert(sinFit.ymax < 2 && sinFit.ymin > -2,
    'fitViewToTraces: function fits y to SIN');

  const again = fitViewToTraces(
    [{ kind: 'function', expr: 'SIN(X)', enabled: true }],
    sinFit,
    { angleOpts: { toRad: x => x } },
  );
  assert(again.xmin === sinFit.xmin && again.xmax === sinFit.xmax,
    'fitViewToTraces: repeated function Fit does not creep x');

  const polarFit = fitViewToTraces(
    [{ kind: 'polar', expr: '1', enabled: true }],
    view,
    { angleOpts: { toRad: x => x }, thetaRange: { min: 0, max: 2 * Math.PI } },
  );
  assert(polarFit.xmax < 2 && polarFit.xmin > -2 && polarFit.ymax < 2,
    'fitViewToTraces: polar unit circle frames near ±1');

  const dataFit = fitViewToTraces(
    [{ kind: 'scatter', points: [[0, 0], [4, 8]], enabled: true }],
    view,
  );
  assert(dataFit.xmin < 0.1 && dataFit.xmax > 3.9 && dataFit.ymax > 7,
    'fitViewToTraces: scatter uses stored points');

  const empty = fitViewToTraces([], { xmin: 1, xmax: 2, ymin: 3, ymax: 4 });
  assert(empty.xmin === 1 && empty.ymax === 4,
    'fitViewToTraces: nothing to fit keeps the view');

  const off = fitViewToTraces(
    [{ kind: 'function', expr: 'SIN(X)', enabled: false }],
    view,
    { angleOpts: { toRad: x => x } },
  );
  assert(off.ymin === view.ymin && off.ymax === view.ymax,
    'fitViewToTraces: disabled traces are ignored');
}

{
  const y = evalTraceAtX({ kind: 'function', expr: '2*X', enabled: true }, 3);
  assert(y === 6, 'evalTraceAtX: function');
  assert(Number.isNaN(evalTraceAtX({ kind: 'function', expr: 'X', enabled: false }, 3)),
    'evalTraceAtX: disabled is NaN');
  const scatter = evalTraceAtX(
    { kind: 'scatter', points: [[0, 1], [10, 5]], enabled: true },
    9.5,
    { snapX: 1 },
  );
  assert(scatter === 5, 'evalTraceAtX: scatter snaps to nearest');
  assert(Number.isNaN(evalTraceAtX(
    { kind: 'scatter', points: [[0, 1]], enabled: true },
    9,
    { snapX: 1 },
  )), 'evalTraceAtX: scatter outside snap is NaN');
  const fitY = evalTraceAtX({ kind: 'fit', enabled: true }, 3, {
    fitModel: { kind: 'LIN', a: 1, b: 2 },
  });
  assert(fitY === 7, 'evalTraceAtX: fit model');
}


