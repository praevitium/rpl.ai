import { assert, assertThrows, runLine } from './helpers.mjs';
import {
  evalNumeric, lookupEnv, parsePlotExpr, sampleFunction, samplePolar,
  sampleParametric, segmentPoints, niceTicks, niceNum, hasUsableSpan, worldToPixel,
  pixelToWorld, zoomView, panView, pinchView, defaultView, boundsOfPoints,
  valueToPoints, valuesFromColumn, histogram, evalFitModel, sampleFit, sampleDiffEq,
  nextTraceColor, TRACE_COLORS, sampleTraceForFit, fitViewToTraces,
  evalTraceAtX, sampleTrace, traceInputError, axisTicks, traceFromInputs, retypeTrace, stackValueToTrace as engineStackValueToTrace,
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
  const far = niceTicks(1e20, 1e20 + 1e5);
  assert(far.ticks.length > 0 && far.ticks.length <= 12 && far.ticks.every(Number.isFinite),
    'niceTicks returns a finite tick list far from zero');
  const neg = niceTicks(-1e20 - 1e5, -1e20);
  assert(neg.ticks.length > 0 && neg.ticks.every(Number.isFinite),
    'niceTicks returns a finite tick list far below zero');
  const missing = niceTicks(Number.NaN, 1);
  assert(missing.ticks.length === 1 && missing.ticks[0] === 0,
    'niceTicks of a non-finite window does not loop');
  assert(niceTicks(0, 10, 6).ticks.join() === '0,2,4,6,8,10', 'niceTicks: 0..10 steps by 2');
  assert(niceTicks(-1, 1, 6).ticks.join() === '-1,-0.5,0,0.5,1', 'niceTicks: decimal steps carry no binary noise');
}

{
  const narrow = niceTicks(5, 5.000000000000001);
  assert(narrow.ticks.length <= 2, 'niceTicks: a span below the spacing of doubles returns at once instead of looping');
  assert(niceTicks(1e16, 10000000000000002).ticks.length <= 2, 'niceTicks: 1E16 to 1E16+2 returns at once');
  assert(niceTicks(0, 1e300, 8).ticks.length <= 32, 'niceTicks: a huge span stays bounded');
  assert(niceTicks(-Infinity, Infinity).ticks.every(Number.isFinite), 'niceTicks: an infinite window yields only finite ticks');
  const b = boundsOfPoints([[1, 1e16], [2, 10000000000000002]]);
  assert(hasUsableSpan(b.ymin, b.ymax) && hasUsableSpan(b.xmin, b.xmax), 'boundsOfPoints: widens a span too small to draw');
  assert(!hasUsableSpan(5, 5.000000000000001) && hasUsableSpan(0, 1e-300), 'hasUsableSpan: relative to the magnitude');
  const single = boundsOfPoints([[3, 5]], 0);
  assert(single.xmin === 2 && single.xmax === 4 && single.ymin === 4 && single.ymax === 6, 'boundsOfPoints: a single point gets a window of one either side');
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
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const spread = pinchView(view, [[50, 100], [150, 100]], [[0, 100], [200, 100]], 200, 200);
  assert(near(spread.xmin, -5) && near(spread.xmax, 5) && near(spread.ymin, -5) && near(spread.ymax, 5),
    'pinchView: fingers spreading to twice the distance about the centre zoom in twice');
  const slide = pinchView(view, [[50, 100], [150, 100]], [[70, 100], [170, 100]], 200, 200);
  assert(near(slide.xmin, -12) && near(slide.xmax, 8) && near(slide.ymin, -10),
    'pinchView: two fingers sliding 20 px right pan the plot with them');
  const pinchIn = pinchView(view, [[0, 0], [100, 100]], [[25, 25], [75, 75]], 200, 200);
  assert(near(pinchIn.xmax - pinchIn.xmin, 40) && near(pinchIn.xmin, -15) && near(pinchIn.ymax, 15),
    'pinchView: pinching to half the distance zooms out about the midpoint (-5, 5)');
  assert(pinchView(view, [[10, 10], [10, 10]], [[0, 0], [40, 40]], 200, 200) === view, 'pinchView: two fingers on one spot leave the view');
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
  runLine('[[ 1 2 ]] STOΣ 7', s);
  lookup('SCATRPLOT').fn(s);
  assert(seen.kind === 'scatter' && seen.depth === 1, 'SCATRPLOT: hook fires, stack kept');
  lookup('BARPLOT').fn(s);
  assert(seen.kind === 'bar', 'BARPLOT: hook');
  lookup('HISTPLOT').fn(s);
  assert(seen.kind === 'hist', 'HISTPLOT: hook');
  lookup('DRAW').fn(s);
  assert(seen.kind === 'draw', 'DRAW: hook');

  const rows = (m) => m.rows.map((r) => r.map((c) => Number(c.value)).join(',')).join(' ');
  setGraphicsHook((kind, st, data) => { seen = { kind, data }; });
  runLine('[[ 1 10 100 ][ 2 20 200 ][ 3 30 300 ]] STOΣ 1 XCOL 3 YCOL');
  const empty = new Stack();
  lookup('SCATRPLOT').fn(empty);
  const scatter = rows(seen.data);
  lookup('BARPLOT').fn(empty);
  const bars = rows(seen.data);
  runLine('2 XCOL');
  lookup('HISTPLOT').fn(empty);
  assert(scatter === '1,100 2,200 3,300' && bars === '1 2 3' && rows(seen.data) === '10 20 30',
    `SCATRPLOT plots ΣDAT's XCOL column against its YCOL column, BARPLOT and HISTPLOT its XCOL column, as the AUR says (${scatter} / ${bars} / ${rows(seen.data)})`);
  runLine('1 XCOL 5 YCOL');
  assertThrows(() => lookup('SCATRPLOT').fn(empty), /Invalid dimension/, 'SCATRPLOT with YCOL past ΣDAT\'s last column is Invalid dimension');
  lookup('BARPLOT').fn(empty);
  assert(rows(seen.data) === '1 2 3', 'BARPLOT needs only the XCOL column, so a YCOL past the last column does not stop it');
  runLine('2 YCOL CLΣ');
  assertThrows(() => lookup('SCATRPLOT').fn(empty), /Nonexistent ΣDAT/, 'SCATRPLOT with no ΣDAT is Nonexistent ΣDAT');
  runLine('{ ΣPAR } PURGE');
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
  for (const dataKind of ['scatter', 'bar', 'hist', 'fit']) {
    const fromData = stackValueToTrace(Symbolic(parseAlgebra('SIN(X)')), dataKind);
    assert(fromData?.kind === 'function',
      `stackValueToTrace: Symbolic in ${dataKind} mode → function`);
  }
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
  const circle = fitViewToTraces(
    [{ kind: 'polar', expr: '1', enabled: true }],
    defaultView(),
    { angleOpts: { toRad: x => x }, thetaRange: { min: 0, max: 2 * Math.PI }, width: 400, height: 200 },
  );
  const unitsPerPixelX = (circle.xmax - circle.xmin) / 400;
  const unitsPerPixelY = (circle.ymax - circle.ymin) / 200;
  assert(Math.abs(unitsPerPixelX - unitsPerPixelY) < 1e-12 && circle.ymax > 1 && circle.ymin < -1,
    'fitViewToTraces: a polar circle alone fits with equal axes so it stays round');

  const mixed = fitViewToTraces(
    [{ kind: 'polar', expr: '1', enabled: true }, { kind: 'function', expr: '5', enabled: true }],
    defaultView(),
    { angleOpts: { toRad: x => x }, thetaRange: { min: 0, max: 2 * Math.PI }, width: 400, height: 200 },
  );
  assert(mixed.ymax > 5 && mixed.xmax < 2,
    'fitViewToTraces: a function beside a polar curve stays inside the fitted window');
}

{
  const points = [{ kind: 'scatter', points: [[1, 2], [5, 10]], enabled: true }];
  const px = (v, x, w) => (x - v.xmin) / (v.xmax - v.xmin) * w;
  const py = (v, y, h) => (v.ymax - y) / (v.ymax - v.ymin) * h;
  const phone = fitViewToTraces(points, defaultView(), { width: 300, height: 300, tools: { width: 56, height: 56 } });
  assert(px(phone, 5, 300) <= 300 - 56 || py(phone, 10, 300) >= 56,
    `fitViewToTraces: on a phone the last and highest point stays clear of the corner's tools button (${px(phone, 5, 300).toFixed(1)}, ${py(phone, 10, 300).toFixed(1)})`);
  const wide = fitViewToTraces(points, defaultView(), { width: 500, height: 300, tools: { width: 44, height: 260 } });
  assert(px(wide, 5, 500) <= 500 - 44 && wide.ymax < 11,
    `fitViewToTraces: on a wide screen the last point stays left of the tools column (${px(wide, 5, 500).toFixed(1)} of ${500 - 44} px)`);
  const view = { xmin: -10, xmax: 10, ymin: -5, ymax: 5 };
  const fn = fitViewToTraces([{ kind: 'function', expr: 'SIN(X)', enabled: true }], view, { angleOpts: { toRad: (x) => x }, width: 500, height: 300, tools: { width: 44, height: 260 } });
  assert(fn.xmin === -10 && fn.xmax === 10 && fn.ymax < 1.2, 'fitViewToTraces: a function keeps its x range beside the tools column, and its height');
  const fnPhone = fitViewToTraces([{ kind: 'function', expr: 'SIN(X)', enabled: true }], view, { angleOpts: { toRad: (x) => x }, width: 300, height: 300, tools: { width: 56, height: 56 } });
  assert(fnPhone.xmin === -10 && fnPhone.xmax === 10 && py(fnPhone, 1, 300) >= 56, 'fitViewToTraces: on a phone a function\'s peak stays below the tools button, its x range kept');
}

{
  const polar = samplePolar(parsePlotExpr('1+0*X'), 0, Math.PI, 5, {}, { toRad: x => x });
  assert(polar.length === 1 && polar[0].length === 5,
    'samplePolar: X is the angle, as HP polar plots use the independent variable X');
  const param = sampleParametric(parsePlotExpr('X'), parsePlotExpr('2*X'), 0, 2, 3, {});
  assert(param[0][2][0] === 2 && param[0][2][1] === 4,
    'sampleParametric: X is the parameter too');
}

{
  const sine = { kind: 'function', expr: 'SIN(X)', exprY: '' };
  const polar = retypeTrace(sine, 'polar');
  assert(polar.kind === 'polar' && polar.expr === 'SIN(X)',
    'retypeTrace: a function becomes a polar trace of the same expression');
  const param = retypeTrace(sine, 'parametric');
  assert(param.kind === 'parametric' && param.expr === 'T' && param.exprY === 'SIN(X)',
    'retypeTrace: a function becomes the parametric curve (T, f)');
  assert(retypeTrace(param, 'function').expr === 'SIN(X)',
    'retypeTrace: a parametric trace returns to a function of its y expression');
  const ode = retypeTrace(sine, 'diffeq');
  assert(ode.kind === 'diffeq' && ode.expr === 'SIN(X)' && ode.exprY === '0',
    'retypeTrace: a function becomes dy/dx with initial y 0');
  assert(retypeTrace(sine, 'function') === null && retypeTrace(sine, 'scatter') === null,
    'retypeTrace: the same type or an expression-to-data switch changes nothing');

  const data = Matrix([[Real(1), Real(2)], [Real(2), Real(3)], [Real(4), Real(4)]]);
  const scatter = engineStackValueToTrace(data, 'scatter');
  const bar = retypeTrace(scatter, 'bar');
  assert(bar.kind === 'bar' && bar.points.length === 3 && bar.source === data,
    'retypeTrace: scatter data re-plots as bars from the same source');
  const hist = retypeTrace(bar, 'hist');
  assert(hist.kind === 'hist' && hist.points.reduce((n, [, count]) => n + count, 0) === 3,
    'retypeTrace: bar data re-plots as a histogram of its source');

  assert(evalTraceAtX({ kind: 'function', expr: '1+COS(θ)', enabled: true }, 0) === 2,
    'evalTraceAtX: a function written in θ keeps working after a polar trace is retyped');
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

{
  const segs = sampleDiffEq(parsePlotExpr('Y'), 1, 0, 1, 40, {});
  const pts = segs.flat();
  const last = pts[pts.length - 1];
  assert(last && Math.abs(last[0] - 1) < 1e-9, 'sampleDiffEq: ends at x = 1');
  assert(last && Math.abs(last[1] - Math.E) < 1e-3, 'sampleDiffEq: y\'=y grows like e^x');
  const parabola = sampleDiffEq(parsePlotExpr('X'), 0, 0, 2, 20, {}).flat();
  const end = parabola[parabola.length - 1];
  assert(end && Math.abs(end[1] - 2) < 1e-6, 'sampleDiffEq: y\'=x from 0 is x^2/2');

  const shifted = { xmin: 1, xmax: 5, ymin: -1, ymax: 1 };
  const anchored = evalTraceAtX(
    { kind: 'diffeq', expr: 'Y', exprY: '1', enabled: true },
    2,
    { view: shifted, width: 48 },
  );
  assert(Math.abs(anchored - Math.E) < 1e-3, 'evalTraceAtX: diffeq anchors at the left edge when 0 is off-screen');
  assert(Math.abs(anchored - Math.exp(2)) > 1, 'evalTraceAtX: diffeq does not restart at 0 off-screen');
  assert(Number.isNaN(evalTraceAtX(
    { kind: 'diffeq', expr: 'Y', exprY: '1', enabled: true },
    2,
    { width: 48 },
  )), 'evalTraceAtX: diffeq without a view is NaN');
  assert(Number.isNaN(evalTraceAtX(
    { kind: 'diffeq', expr: '1/0', exprY: '1', enabled: true },
    1,
    { view: { xmin: 0, xmax: 2, ymin: -1, ymax: 1 }, width: 48 },
  )), 'evalTraceAtX: diffeq that cannot reach x is NaN');
  const atAnchor = evalTraceAtX(
    { kind: 'diffeq', expr: '1/0', exprY: '1', enabled: true },
    0,
    { view: { xmin: 0, xmax: 2, ymin: -1, ymax: 1 }, width: 48 },
  );
  assert(atAnchor === 1, 'evalTraceAtX: diffeq at the anchor is the initial value');
  const badY = sampleTrace(
    { kind: 'diffeq', expr: 'Y', exprY: 'X' },
    { xmin: 0, xmax: 1, ymin: 0, ymax: 1 },
    { width: 48 },
  );
  assert(badY.length === 0, 'sampleTrace: diffeq with a non-constant initial y draws nothing');

  const added = traceFromInputs('diffeq', 'Y', '');
  assert(added.exprY === '0' && added.label === "y'=Y", 'traceFromInputs: blank diffeq initial y is 0');
  assert(traceInputError('diffeq', { expr: 'Y', exprY: 'X' }, { adding: true }),
    'traceInputError: diffeq initial y must be a number');
  assert(!traceInputError('parametric', { expr: 'COS(T)', exprY: 'SIN(T)' }, { adding: true }),
    'traceInputError: parametric pair parses');
  assert(traceInputError('parametric', { expr: 'COS(T)', exprY: '' }, { adding: true }),
    'traceInputError: parametric y is required');
  const param = stackValueToTrace(
    Symbolic(parseAlgebra('SIN(T)')),
    'parametric',
    Symbolic(parseAlgebra('COS(T)')),
  );
  assert(param.kind === 'parametric' && param.expr.includes('COS') && param.exprY.includes('SIN'),
    'stackValueToTrace: parametric reads x below and y on top');
  const slope = stackValueToTrace(Symbolic(parseAlgebra('Y')), 'diffeq', Real(1));
  assert(slope.kind === 'diffeq' && slope.label === "y'=Y", 'stackValueToTrace: diffeq keeps the slope label');
  assert(stackValueToTrace(Matrix([[Real(1), Real(2)]]), 'diffeq').kind === 'scatter',
    'stackValueToTrace: data still wins over a preferred expression kind');
}



// PPAR and the commands that set it, from the AUR; PPAR is purged after, as other tests read a fresh directory.
{
  const { format } = await import('../www/src/rpl/formatter.js');
  const { varRecall, varPurge } = await import('../www/src/rpl/state.js');
  const ppar = () => format(varRecall('PPAR'));
  varPurge('PPAR');
  runLine('-2 3 XRNG');
  assert(ppar() === '{ (-2, -3.9) (3, 4) X 0. (0, 0) FUNCTION Y }', 'XRNG sets xmin and xmax in the default PPAR');
  runLine('-1 1 YRNG');
  assert(ppar() === '{ (-2, -1) (3, 1) X 0. (0, 0) FUNCTION Y }', 'YRNG sets ymin and ymax');
  runLine('(-6.5,-3.9) PMIN (6.5,4) PMAX');
  assert(ppar() === '{ (-6.5, -3.9) (6.5, 4) X 0. (0, 0) FUNCTION Y }', 'PMIN and PMAX set the corners');
  runLine('(1,2) CENTR');
  assert(ppar() === '{ (-5.5, -1.9) (7.5, 6) X 0. (0, 0) FUNCTION Y }', 'CENTR puts (1,2) under the centre pixel, column 65 and row 40');
  runLine('0 CENTR 2 2 SCALE');
  assert(ppar() === '{ (-13, -7.8) (13, 8) X 0. (0, 0) FUNCTION Y }', 'SCALE 2 2 gives two units per tick, a tick every 10 pixels');
  runLine('.5 SCALEW .5 *H');
  assert(ppar() === '{ (-6.5, -3.9) (6.5, 4) X 0. (0, 0) FUNCTION Y }', 'SCALEW and *H halve the scales about the centre');
  runLine("'T' INDEP -1 1 INDEP");
  assert(format(varRecall('PPAR').items[2]) === '{ T -1 1 }', 'INDEP takes a name, then a range that keeps it');
  runLine("{ 'Z' 0 5 } DEPND");
  assert(format(varRecall('PPAR').items[6]) === '{ Z 0 5 }', 'DEPND takes a name and range together');
  runLine('#5d RES { (0,0) 2 "t" "y" } AXES');
  assert(format(varRecall('PPAR').items[3]) === '#5d', 'RES stores a pixel interval');
  assert(format(varRecall('PPAR').items[4]) === '{ (0, 0) 2 "t" "y" }', 'AXES stores the AUR example list');
  runLine('3 ATICK');
  assert(format(varRecall('PPAR').items[4]) === '{ (0, 0) 3 "t" "y" }', 'ATICK changes only the tick spacing');
  assertThrows(() => runLine('5 PMIN'), /Bad argument type/, 'PMIN wants a complex number');
  assertThrows(() => runLine('0 1 SCALE'), /Bad argument value/, 'SCALE refuses a zero scale');
  varPurge('PPAR');
}

// What plots take from PPAR: INDEP's name and range, RES's step and the axes' crossing and tick spacing.
{
  const { varPurge } = await import('../www/src/rpl/state.js');
  const { plotSettings } = await import('../www/src/rpl/ops/graphics.js');
  const view = { xmin: -2, xmax: 3, ymin: -1, ymax: 5 };
  const xs = (t, opts) => sampleTrace(t, view, { width: 500, ...plotSettings(), ...opts }).flat().map(([x]) => x);
  varPurge('PPAR');
  assert(plotSettings() === null, 'plotSettings: nothing until PPAR is stored');
  runLine('-2 3 XRNG');
  const fresh = plotSettings();
  assert(fresh.view.xmin === -2 && fresh.view.xmax === 3 && fresh.indep.name === 'X' && fresh.indep.range === null
    && fresh.res === null && fresh.axes.x === 0 && fresh.axes.tick === null, 'plotSettings: XRNG window with the default INDEP, RES and AXES');
  assert(xs({ kind: 'function', expr: 'X' }).length === 500, 'FUNCTION: default RES samples every pixel across the window');
  runLine("{ 'A' 0 2 } INDEP .5 RES");
  const ys = sampleTrace({ kind: 'function', expr: 'A^2' }, view, { width: 500, ...plotSettings() }).flat().map(([, y]) => y);
  assert(ys.join(' ') === '0 0.25 1 2.25 4', 'FUNCTION: INDEP names the variable and its range, RES the step');
  const at = (x) => evalTraceAtX({ kind: 'function', expr: 'A^2' }, x, plotSettings());
  assert(at(1.5) === 2.25 && Number.isNaN(at(2.5)), 'FUNCTION: the readout follows INDEP\'s range');
  runLine('#10d RES');
  const pixels = xs({ kind: 'function', expr: 'A' });
  assert(pixels.length === 21 && pixels[0] === 0 && Math.abs(pixels[20] - 2) < 1e-12, 'FUNCTION: RES in pixels, ten pixels of 0.01 from the range start');
  runLine("'X' INDEP 1 RES");
  assert(xs({ kind: 'function', expr: 'X' }).join(' ') === '-2 -1 0 1 2 3', 'FUNCTION: a user-unit RES counts from the window edge');
  runLine("{ 'T' 0 1 } INDEP .25 RES");
  const ppar = plotSettings();
  const curve = sampleTrace({ kind: 'parametric', expr: 'T', exprY: 'T^2' }, view, {
    width: 500, ...ppar, tRange: { min: ppar.indep.range[0], max: ppar.indep.range[1] },
  }).flat();
  assert(curve.map(([x, y]) => `${x},${y}`).join(' ') === '0,0 0.25,0.0625 0.5,0.25 0.75,0.5625 1,1', 'PARAMETRIC: INDEP\'s range stepped by RES');
  runLine('{ (1,2) { 2 .5 } } AXES');
  const { axes } = plotSettings();
  assert(axes.x === 1 && axes.y === 2 && axes.tick.join(' ') === '2 0.5', 'plotSettings: AXES crossing and per-axis ticks');
  runLine('#10d ATICK');
  assert(plotSettings().axes.tick === null, 'plotSettings: a tick spacing in pixels is left to the view');
  runLine("{ 'X' 0 1 } INDEP { 'W' 1 .0001 } DEPND");
  const ode = plotSettings();
  assert(ode.indep.values.join(' ') === '0 1' && ode.depend.name === 'W' && ode.depend.values.join(' ') === '1 0.0001',
    'plotSettings: DEPND\'s name, initial value and tolerance');
  const solve = (expr, y0, s = plotSettings()) => sampleTrace({ kind: 'diffeq', expr, exprY: String(y0) }, view, { width: 500, ...s }).flat();
  const growth = solve('W', 1);
  assert(growth[0].join(' ') === '0 1' && Math.abs(growth.at(-1)[0] - 1) < 1e-12 && Math.abs(growth.at(-1)[1] - Math.E) < 1e-9,
    'DIFFEQ: W\'=W runs from INDEP\'s 0 to 1 and reaches e, DEPND naming the solution');
  const halfway = evalTraceAtX({ kind: 'diffeq', expr: 'W', exprY: '1' }, 0.5, { ...plotSettings(), view, width: 500 });
  assert(Math.abs(halfway - Math.exp(0.5)) < 1e-6, 'DIFFEQ: the readout follows INDEP\'s span');
  runLine("{ 'S' 1 0 } INDEP");
  const back = solve('Y', 1);
  assert(back[0][0] === 1 && Math.abs(back.at(-1)[0]) < 1e-12 && Math.abs(back.at(-1)[1] - 1 / Math.E) < 1e-9, 'DIFFEQ: INDEP { S 1 0 } runs backward from 1 to 0');
  assert(Math.abs(solve('S', 1).at(-1)[1] - 0.5) < 1e-9, 'DIFFEQ: INDEP names the independent variable');
  varPurge('PPAR');
  assert(JSON.stringify(axisTicks(-6.5, 6.5)) === JSON.stringify(niceTicks(-6.5, 6.5, 8)), 'axisTicks: nice ticks without AXES or ATICK');
  assert(axisTicks(-2, 3, 0.5, 1, 16).ticks.join(' ') === '-1.5 -0.5 0.5 1.5 2.5', 'axisTicks: every ATICK unit from the crossing');
  assert(axisTicks(-10, 10, 0, 0.5, 10).ticks.join(' ') === '-10 -8 -6 -4 -2 0 2 4 6 8 10', 'axisTicks: whole multiples of a crowded spacing');
}
