import { assert, assertThrows, runLine } from './helpers.mjs';
import {
  evalNumeric, lookupEnv, parsePlotExpr, sampleFunction, samplePolar,
  sampleParametric, segmentPoints, niceTicks, niceNum, hasUsableSpan, worldToPixel,
  pixelToWorld, zoomView, panView, pinchView, defaultView, boundsOfPoints,
  valueToPoints, valuesFromColumn, histogram, evalFitModel, sampleFit, sampleDiffEq,
  nextTraceColor, TRACE_COLORS, sampleTraceForFit, fitViewToTraces,
  evalTraceAtX, sampleTrace, traceInputError, axisTicks, traceFromInputs, retypeTrace, stackValueToTrace as engineStackValueToTrace,
  DEFAULT_TURN, turnBy, evalComplex, TRACE_KINDS, cursorPoint, stepCursor, slopeAt, nearestRoot, nearestExtremum,
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
  const view = { xmin: -10, xmax: 10, ymin: -5, ymax: 5 };
  const p = cursorPoint(1.23456, -0.98765, view);
  assert(p.x === 1.2 && p.y === -0.99, 'cursorPoint: PICTURE rounds the point to what a pixel resolves');
  assert(Object.is(cursorPoint(0.004, 0, view).x, 0), 'cursorPoint: a point by the origin is 0, not -0');
  const tiny = cursorPoint(1.00000123456, 2, { xmin: 1, xmax: 1.0001, ymin: 0, ymax: 4 });
  assert(tiny.x === 1.0000012 && tiny.y === 2, 'cursorPoint: a narrow window keeps the digits its pixels resolve');
  const step = stepCursor({ x: 0, y: 0 }, 'right', view);
  assert(Math.abs(step.cursor.x - 20 / 130) < 1e-12 && step.cursor.y === 0 && step.view === view, 'stepCursor: an arrow moves the cursor one pixel');
  const edge = stepCursor({ x: 0, y: 5 }, 'up', view);
  assert(Math.abs(edge.view.ymax - edge.cursor.y) < 1e-12 && edge.view.xmin === -10, 'stepCursor: past an edge the view scrolls with the cursor');
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



// VPAR and the commands that set it for the 3D plots, from the HP 48G plot form's defaults.
{
  const { format } = await import('../www/src/rpl/formatter.js');
  const { varRecall, varPurge } = await import('../www/src/rpl/state.js');
  const vpar = () => format(varRecall('VPAR'));
  varPurge('VPAR');
  runLine('-2 2 XVOL');
  assert(vpar() === '{ -2. 2. -1. 1. -1. 1. -1. 1. -1. 1. 0. -3. 0. 10. 8. }', `XVOL sets the view volume's width in the default VPAR (${vpar()})`);
  runLine('0 5 YVOL -3 3 ZVOL -4 4 XXRNG -5 5 YYRNG 1 -2 3 EYEPT 12 NUMX 6 NUMY');
  assert(vpar() === '{ -2. 2. 0. 5. -3. 3. -4. 4. -5. 5. 1. -2. 3. 12. 6. }', `YVOL, ZVOL, XXRNG, YYRNG, EYEPT, NUMX and NUMY each set their part (${vpar()})`);
  assertThrows(() => runLine('5 1 YVOL'), /Bad argument value/, 'YVOL wants ynear less than yfar');
  assertThrows(() => runLine('1 NUMX'), /Bad argument value/, 'NUMX wants 2 or more steps');
  assertThrows(() => runLine('"a" 2 XVOL'), /Bad argument type/, 'XVOL wants numbers');
  varPurge('VPAR');
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

// PICT, the graphics object the drawing commands use, with PDIM, ERASE and PICT as a target for STO, RCL and PURGE.
{
  const { format } = await import('../www/src/rpl/formatter.js');
  const { varRecall, varPurge, setPict } = await import('../www/src/rpl/state.js');
  const text = (src) => runLine(src).snapshot().reverse().map((v) => format(v)).join(' | ');
  varPurge('PPAR');
  setPict(null);
  assert(text('PICT SIZE') === '#131d | #80d' && text('PICT RCL') === 'Graphic 131 × 80', 'PICT starts as a blank 131 × 80, the 50g\'s screen');
  runLine('#200d #100d PDIM');
  assert(text('PICT SIZE') === '#200d | #100d' && varRecall('PPAR') === undefined, 'PDIM in pixels resizes PICT and leaves PPAR alone');
  runLine('#10d #10d PDIM');
  assert(text('PICT SIZE') === '#131d | #80d', 'PDIM keeps PICT at least 131 × 80');
  assertThrows(() => runLine('#2049d #80d PDIM'), /Bad argument value/, 'PDIM: PICT is at most 2048 wide');
  runLine('(-10,-5) (10,5) PDIM');
  assert(text('PICT SIZE') === '#201d | #101d' && format(varRecall('PPAR').items[1]) === '(10, 5)',
    'PDIM with corners keeps the default tenth of a unit to a pixel and sets PPAR\'s corners');
  runLine('#261d #159d PDIM (-6.5,-3.9) PMIN (6.5,4) PMAX 0 CENTR');
  assert(format(varRecall('PPAR').items[0]) === '(-6.5, -3.95)' && format(varRecall('PPAR').items[1]) === '(6.5, 3.95)',
    'CENTR keeps the centre pixel of a larger PICT, column 130 and row 79 of 261 × 159');
  runLine('GROB 2 2 1020 PICT STO');
  const pict = runLine('PICT RCL').peek();
  assert(pict.width === 131 && pict.height === 80 && pict.bytes[0] === 1 && pict.bytes[17] === 2,
    'STO puts a smaller graphics object in the top left corner of a blank 131 × 80');
  runLine('ERASE');
  assert(runLine('PICT RCL').peek().bytes.every((b) => b === 0) && text('PICT SIZE') === '#131d | #80d', 'ERASE blanks PICT and keeps its size');
  assertThrows(() => runLine('5 PICT STO'), /Bad argument type/, 'PICT holds only a graphics object');
  runLine('{ PICT } PURGE');
  assert(text('PICT SIZE') === '#0d | #0d', 'purging PICT leaves a 0 × 0 graphics object, as the AUR says');
  varPurge('PPAR');
  setPict(null);
}

// The drawing commands, on PICT's pixels, given in pixels or in PPAR's user units.
{
  const { format } = await import('../www/src/rpl/formatter.js');
  const { varPurge, setPict, getPict, state, setAngle } = await import('../www/src/rpl/state.js');
  const angle = state.angle;
  const text = (src) => runLine(src).snapshot().reverse().map((v) => format(v)).join(' | ');
  const lit = (col, row) => {
    const p = getPict();
    return (p.bytes[row * Math.ceil(p.width / 8) + (col >> 3)] >> (col & 7)) & 1;
  };
  const count = () => getPict().bytes.reduce((n, b) => n + [...b.toString(2)].filter((d) => d === '1').length, 0);
  varPurge('PPAR');
  setPict(null);
  assert(text('(0,0) C→PX') === '{ #65d #40d }' && text('(-6.5,4) C→PX') === '{ #0d #0d }',
    'C→PX: (0,0) is PICT\'s centre pixel and (xmin, ymax) its top left');
  assert(text('{ #65d #40d } PX→C') === '(0, 0)' && text('{ #0d #79d } PX→C') === '(-6.5, -3.9)', 'PX→C gives a pixel\'s centre in user units');
  runLine('{ #3d #2d } PIXON (0,0) PIXON');
  assert(lit(3, 2) && lit(65, 40) && count() === 2 && text('{ #3d #2d } PIX? { #4d #2d } PIX?') === '1. | 0.',
    'PIXON lights a pixel given in pixels or in user units, and PIX? tests one');
  runLine('{ #3d #2d } PIXOFF');
  assert(!lit(3, 2) && count() === 1, 'PIXOFF turns a pixel off');
  runLine('ERASE { #2d #1d } { #12d #5d } LINE');
  assert(count() === 11 && lit(2, 1) && lit(7, 3) && lit(12, 5), 'LINE lights a pixel a column from end to end, the ends included');
  runLine('{ #2d #1d } { #12d #5d } TLINE');
  assert(count() === 0, 'TLINE toggles the same pixels back off');
  runLine('ERASE { #1d #1d } { #8d #6d } BOX');
  assert(count() === 24 && lit(1, 1) && lit(8, 6) && !lit(4, 3), 'BOX draws the outline between two corners');
  runLine('RAD ERASE { #20d #20d } #6d 0 7 ARC');
  assert(lit(26, 20) && lit(20, 14) && lit(14, 20) && lit(20, 26) && !lit(20, 20), 'ARC past a full turn draws the whole circle, its radius in pixels');
  runLine('ERASE { #20d #20d } #6d 0 1.5707963268 ARC');
  assert(lit(26, 20) && lit(20, 14) && !lit(14, 20) && !lit(20, 26), 'ARC goes counterclockwise from the first angle to the second');
  runLine('ERASE (0,0) 1 0 0 ARC');
  assert(count() === 1 && lit(75, 40), 'ARC with equal angles plots one point, a user-unit radius from the centre');
  runLine('ERASE { #0d #0d } { #100000000000d #3d } LINE');
  assert(count() === 131, 'a line to a far-off point is cut at the edge of PICT');
  assertThrows(() => runLine('5 PIXON'), /Bad argument type/, 'PIXON wants a point');
  let seen = null;
  setGraphicsHook((kind, st, data) => { seen = { kind, data }; });
  runLine('{ } PVIEW');
  assert(seen?.kind === 'pview' && seen.data.items.length === 0, 'PVIEW opens the plot view on PICT');
  runLine('(1,2) PVIEW');
  assert(format(seen.data) === '(1, 2)', 'PVIEW passes the point for the top left');
  assertThrows(() => runLine('5 PVIEW'), /Bad argument type/, 'PVIEW wants a point or { }');
  setGraphicsHook(null);
  setAngle(angle);
  varPurge('PPAR');
  setPict(null);
}

// GOR, GXOR, REPL, SUB and NEG on graphics objects and on PICT, with the AUR's examples.
{
  const { formatSource } = await import('../www/src/rpl/formatter.js');
  const { varPurge, setPict, getPict } = await import('../www/src/rpl/state.js');
  const text = (src) => runLine(src).snapshot().reverse().map((v) => formatSource(v)).join(' | ');
  const count = () => getPict().bytes.reduce((n, b) => n + [...b.toString(2)].filter((d) => d === '1').length, 0);
  const X = 'GROB 5 5 11A040A011';
  varPurge('PPAR');
  setPict(null);
  runLine('ERASE PICT NEG');
  assert(count() === 131 * 80 && text('PICT NEG') === '', 'NEG of PICT turns every pixel over, in place');
  runLine(`ERASE PICT NEG PICT { #0d #0d } ${X} GXOR`);
  assert(count() === 131 * 80 - 9, 'GXOR clears the 9 pixels of the AUR\'s 5 × 5 X on a dark PICT');
  runLine(`« ERASE PICT NEG PICT { #0d #0d } ${X} GXOR LASTARG GXOR » EVAL`);
  assert(count() === 131 * 80, 'GXOR again with LASTARG puts the picture back, as the AUR\'s example does');
  runLine('ERASE PICT (0,0) #5d #5d BLANK NEG REPL');
  const lit = (col, row) => (getPict().bytes[row * 17 + (col >> 3)] >> (col & 7)) & 1;
  assert(count() === 25 && lit(65, 40) && lit(69, 44) && !lit(70, 44), 'REPL puts a dark 5 × 5 on PICT with its corner at (0,0), the AUR\'s example');
  assert(text('PICT { #10d #20d } { #20d #40d } SUB SIZE') === '#11d | #21d', 'SUB of PICT gives the AUR\'s Graphic 11 × 21');
  assert(text(`${X} NEG`) === 'GROB 5 5 E051B151E0', 'NEG turns a graphics object\'s pixels over, not the bits past its width');
  assert(text(`${X} { #1d #1d } GROB 2 2 3030 GOR`) === 'GROB 5 5 11E060A011' && text(`${X} { #1d #1d } GROB 2 2 3030 GXOR`) === 'GROB 5 5 11C020A011',
    'GOR and GXOR lay one object on another at a pixel');
  assert(text(`${X} { #9d #9d } GROB 2 2 3030 REPL`) === `${X}`, 'REPL leaves the target as it is when the corner is off it');
  assert(text(`${X} { #3d #3d } { #99d #99d } SUB`) === 'GROB 2 2 1020' && text(`${X} { #2d #2d } { #0d #0d } SUB`) === 'GROB 3 3 102040',
    'SUB keeps corners on the object and takes them in either order');
  assertThrows(() => runLine(`${X} { #0d #0d } 5 GOR`), /Bad argument type/, 'GOR wants a graphics object to lay on');
  runLine('ERASE DRAX');
  assert(count() === 248 && lit(5, 39) && lit(64, 10) && !lit(4, 39) && lit(130, 40) && lit(65, 79),
    'DRAX draws both axes across PICT through (0,0), with a tick every 10 pixels');
  runLine('ERASE { (1,1) 2 } AXES DRAX');
  const label = runLine('"A=2" 1 →GROB').peek();
  const on = (g, col, row) => (g.bytes[row * Math.ceil(g.width / 8) + (col >> 3)] >> (col & 7)) & 1;
  assert(label.width === 18 && label.height === 8 && !on(label, 0, 0) && on(label, 1, 0) && on(label, 3, 0) && on(label, 0, 3) && on(label, 4, 3),
    '→GROB draws a string in rpl.ai\'s pixel font, six columns and eight rows a character');
  assert(text("`Y=3*X^2` 1 →GROB SIZE `Y=3*X^2` 0 →GROB SIZE") === '#66d | #8d | #54d | #8d',
    '→GROB size 0 leaves an algebraic\'s quotes off, as for the Equation Writer\'s picture');
  assertThrows(() => runLine('5 4 →GROB'), /Bad argument value/, '→GROB takes a size from 0 to 3');
  {
    const { setUserFlag, clearUserFlag } = await import('../www/src/rpl/state.js');
    setUserFlag(-51);
    const comma = text('1.5 1 →GROB');
    clearUserFlag(-51);
    assert(comma === text('"1,5" 1 →GROB') && comma !== text('"1.5" 1 →GROB'), '→GROB draws a number with the comma fraction mark when flag -51 is set');
  }
  assert(lit(75, 0) && lit(0, 30) && lit(95, 29) && lit(95, 31) && !lit(85, 29), 'DRAX follows AXES\' crossing and a tick spacing in units');
  varPurge('PPAR');
  runLine('ERASE LABEL');
  assert([0, 1, 2, 3, 4].every((c) => lit(c, 45)) && lit(125, 31) && lit(129, 31) && lit(57, 0) && lit(61, 0),
    'LABEL writes -6.5 under the axis at the left, X above it at the right and Y beside the top of the vertical axis');
  runLine('ERASE { (0,0) #10d "t" "v" } AXES LABEL');
  assert(lit(126, 31) && !lit(125, 31), 'LABEL takes the axis names AXES gives');
  varPurge('PPAR');
  setPict(null);
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

// GROBADD, PICTURE, GRAPH and TEXT.
{
  const { formatSource } = await import('../www/src/rpl/formatter.js');
  const text = (src) => runLine(src).snapshot().reverse().map((v) => formatSource(v)).join(' | ');
  const X = 'GROB 5 5 11A040A011';
  assert(text(`${X} GROB 2 2 3030 GROBADD`) === 'GROB 5 7 11A040A0113030', 'GROBADD sets the second graphics object under the first');
  assert(text(`GROB 2 2 3030 ${X} GROBADD`) === 'GROB 5 7 303011A040A011', 'GROBADD widens to the wider object, both at the left edge');
  assertThrows(() => runLine(`${X} PICT GROBADD`), /Bad argument type/, 'GROBADD wants two graphics objects');
  const seen = [];
  setGraphicsHook((kind, st, data) => { seen.push({ kind, data }); });
  runLine('PICTURE GRAPH TEXT');
  assert(seen.map((e) => e.kind).join(' ') === 'picture picture text' && seen[0].data.items.length === 0,
    'PICTURE and GRAPH show PICT as { } PVIEW does, with the graphics cursor; TEXT goes back to the stack');
  setGraphicsHook(null);
  assert(text('1 TEXT') === '1', 'TEXT without a plot view leaves the stack as it was');
}

// AUTO and SCLΣ scale PPAR's window; BAR, HISTOGRAM and SCATTER draw ΣDAT.
{
  const { format } = await import('../www/src/rpl/formatter.js');
  const { varPurge, varRecall, setAngle, state } = await import('../www/src/rpl/state.js');
  const angle = state.angle;
  const corners = () => varRecall('PPAR').items.slice(0, 2).map((v) => format(v)).join(' ');
  const reset = () => ['PPAR', 'EQ', 'ΣDAT', 'ΣPAR', 'X'].forEach(varPurge);
  reset();
  runLine("'X^2' STEQ AUTO");
  assert(corners() === '(-6.5, 0) (6.5, 42.25)', 'AUTO: FUNCTION keeps the x range and takes y from EQ\'s values and the origin');
  runLine("5 'X' STO AUTO");
  assert(format(runLine('X').peek()) === '5', 'AUTO leaves a variable named like the plot variable as it was');
  reset();
  runLine("'SIN(X)=COS(X)' STEQ AUTO");
  const [lo, hi] = varRecall('PPAR').items.map((v) => v.im);
  assert(lo < -0.99 && hi > 0.99 && hi <= 1, 'AUTO: both sides of an equation are sampled');
  reset();
  runLine("RAD { (-6.5,-3.9) (6.5,4) X 0 (0,0) POLAR Y } 'PPAR' STO '2' STEQ AUTO");
  const [p1, p2] = varRecall('PPAR').items;
  assert(Math.abs(p2.re - 2) < 1e-9 && p1.re < -1.9 && Math.abs(p2.im - 2) < 0.01, 'AUTO: POLAR fits the circle r = 2');
  reset();
  runLine("{ (-6.5,-1) (6.5,1) X 0 (0,0) CONIC Y } 'PPAR' STO AUTO");
  assert(corners() === '(-6.5, -3.95) (6.5, 3.95)', 'AUTO: CONIC makes the y scale the x scale');
  reset();
  runLine("[[ 1 2 ][ 3 5 ][ 4 1 ]] STOΣ SCLΣ");
  assert(corners() === '(1, 1) (4, 5)', 'SCLΣ fits the window to XCOL and YCOL');
  runLine("{ (-6.5,-3.9) (6.5,4) X 0 (0,0) BAR Y } 'PPAR' STO AUTO");
  assert(corners() === '(0, 0) (4, 4)', 'AUTO: BAR runs 0 to n+1 across and holds the x axis');
  runLine("{ (-6.5,-3.9) (6.5,4) X 0 (0,0) HISTOGRAM Y } 'PPAR' STO AUTO");
  assert(corners() === '(1, 0) (4, 3)', 'AUTO: HISTOGRAM spans the data and 0 to the number of rows');
  runLine("{ (-6.5,-3.9) (6.5,4) X 0 (0,0) TRUTH Y } 'PPAR' STO AUTO");
  assert(corners() === '(-6.5, -3.9) (6.5, 4)', 'AUTO leaves TRUTH alone');
  runLine("[[ 2 2 ]] STOΣ SCLΣ");
  assert(corners() === '(1, 1) (3, 3)', 'SCLΣ widens a single point by one unit each way');
  const seen = [];
  setGraphicsHook((kind) => seen.push(kind));
  runLine('[[ 1 2 ][ 3 5 ]] STOΣ BAR HISTOGRAM SCATTER');
  assert(seen.join(' ') === 'bar hist scatter', 'BAR, HISTOGRAM and SCATTER draw ΣDAT as BARPLOT, HISTPLOT and SCATRPLOT do');
  setGraphicsHook(null);
  reset();
  assertThrows(() => runLine('AUTO'), /Undefined Name/, 'AUTO for FUNCTION needs EQ');
  setAngle(angle);
}

// SLOPEFIELD: a dash of slope f(x, y) at each grid point, the same length on screen, and the command's hook.
{
  const view = { xmin: -1, xmax: 1, ymin: -1, ymax: 1 };
  const dashes = sampleTrace({ kind: 'slopefield', expr: 'X' }, view, { width: 240, height: 240 });
  const slope = ([[x0, y0], [x1, y1]]) => (y1 - y0) / (x1 - x0);
  const mid = ([[x0, y0], [x1, y1]]) => [(x0 + x1) / 2, (y0 + y1) / 2];
  assert(dashes.length === 100, 'SLOPEFIELD: a 10 × 10 grid of dashes on a 240 × 240 view');
  assert(dashes.every((d) => Math.abs(slope(d) - mid(d)[0]) < 1e-9), 'SLOPEFIELD: each dash has slope f at its centre');
  const px = ([[x0, y0], [x1, y1]]) => Math.hypot((x1 - x0) * 120, (y1 - y0) * 120);
  assert(dashes.every((d) => Math.abs(px(d) - px(dashes[0])) < 1e-9), 'SLOPEFIELD: every dash is as long on screen');
  const field = sampleTrace({ kind: 'slopefield', expr: 'X-Y' }, view, { width: 240, height: 240 });
  assert(field.every((d) => { const [x, y] = mid(d); return Math.abs(slope(d) - (x - y)) < 1e-9; }), 'SLOPEFIELD: f may use both X and Y');
  const real = sampleTrace({ kind: 'slopefield', expr: 'SQRT(X)' }, view, { width: 240, height: 240 });
  assert(real.length === 50 && real.every((d) => mid(d)[0] > 0), 'SLOPEFIELD: a grid point where f has no value is left out');
  let seen = null;
  setGraphicsHook((kind) => { seen = kind; });
  runLine("'X-Y' SLOPEFIELD DROP");
  assert(seen === 'slopefield', 'SLOPEFIELD hands its expression to the plot view');
  setGraphicsHook(null);
}

// CONIC: the equation as a quadratic in Y at each X, two branches joined where they meet.
{
  const view = { xmin: -3, xmax: 3, ymin: -2, ymax: 2 };
  const conic = (expr) => sampleTrace({ kind: 'conic', expr }, view, { width: 600, height: 400 });
  const ellipse = conic('X^2/4+Y^2=1');
  assert(ellipse.length === 2 && ellipse.flat().every(([x, y]) => Math.abs(x * x / 4 + y * y - 1) < 1e-6),
    'CONIC: both halves of the ellipse lie on it');
  assert(ellipse.every((half) => Math.abs(half[0][0] + 2) < 1e-6 && Math.abs(half.at(-1)[0] - 2) < 1e-6 && Math.abs(half[0][1]) < 1e-3),
    'CONIC: the halves meet at the ellipse\'s ends, so it closes');
  const hyperbola = conic('X^2-Y^2=1');
  assert(hyperbola.length === 4 && hyperbola.flat().every(([x, y]) => Math.abs(x * x - y * y - 1) < 1e-6), 'CONIC: a hyperbola has four branch pieces');
  assert(conic('Y=X^2').flat().every(([x, y]) => Math.abs(y - x * x) < 1e-6), 'CONIC: an equation linear in Y is solved for it');
  assert(conic('X^2+Y^2+1').length === 0, 'CONIC: an equation with no real points draws nothing');
  let seen = null;
  setGraphicsHook((kind) => { seen = kind; });
  runLine("'X^2+Y^2=4' CONIC DROP");
  assert(seen === 'conic', 'CONIC hands its equation to the plot view');
  setGraphicsHook(null);
}

// TRUTH: shaded runs of cells where the condition holds, inside INDEP's and DEPND's ranges.
{
  const view = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
  const truth = (expr, opts = {}) => sampleTrace({ kind: 'truth', expr }, view, { width: 240, height: 240, ...opts });
  const centre = ([[x0, y0], [x1, y1]]) => [(x0 + x1) / 2, (y0 + y1) / 2];
  const half = truth('X<0');
  assert(half.length === 80 && half.every(([[x0], [x1]]) => x0 === -2 && Math.abs(x1) < 1e-9),
    'TRUTH: X<0 shades one run per row across the left half');
  const disc = truth('X^2+Y^2<1');
  assert(disc.length > 0 && disc.every(([[x0, y0], [x1, y1]]) => {
    const y = (y0 + y1) / 2, w = Math.sqrt(Math.max(0, 1 - y * y));
    return x0 >= -w - 0.05 && x1 <= w + 0.05;
  }), 'TRUTH: a disc stays inside the circle');
  assert(truth('X>0 AND Y>0').every((c) => centre(c).every((v) => v > 0)), 'TRUTH: AND joins two conditions');
  assert(truth('X^2+Y^2+1<0').length === 0, 'TRUTH: a condition that never holds shades nothing');
  assert(truth('SQRT(X)').every(([[x0]]) => x0 >= 0), 'TRUTH: a cell where f has no value stays unshaded');
  const ranged = truth('1', { indep: { name: 'X', range: [0, 1] }, depend: { name: 'Y', range: [-1, 0] } });
  assert(ranged.length > 0 && ranged.every(([[x0, y0], [x1, y1]]) => x0 >= 0 && x1 <= 1 && y0 >= -1 && y1 <= 0),
    'TRUTH: INDEP and DEPND ranges bound the shading');
  const named = truth('T<U', { indep: { name: 'T' }, depend: { name: 'U' } });
  assert(named.length > 0 && named.every((c) => { const [x, y] = centre(c); return x < y + 0.05; }), 'TRUTH: INDEP and DEPND name the variables');
  let seen = null;
  setGraphicsHook((kind) => { seen = kind; });
  runLine("'X<Y' TRUTH DROP");
  assert(seen === 'truth', 'TRUTH hands its condition to the plot view');
  setGraphicsHook(null);
}

// ANIMATE: the graphics objects from the deepest level up, the place, delay and repeats, the stack left as it was.
{
  let seen = null;
  setGraphicsHook((kind, st, data) => { seen = { kind, data, depth: st.depth }; });
  runLine('2 2 BLANK 3 3 BLANK NEG 2 ANIMATE');
  assert(seen?.kind === 'animate' && seen.depth === 3 && seen.data.frames.map((g) => g.width).join() === '2,3',
    'ANIMATE hands the graphics objects over from the deepest level up and leaves the stack as it was');
  assert(seen.data.at.join() === '0,0' && seen.data.delay === 0.1 && seen.data.rep === 0,
    'ANIMATE without a list starts at the top left, 0.1 s apart, until the view closes');
  runLine("4 4 BLANK 'F7' STO 'F7' 5 5 BLANK { 2 { #5d #6d } .5 3 } ANIMATE");
  assert(seen.data.frames.map((g) => g.width).join() === '4,5' && seen.data.at.join() === '5,6' && seen.data.delay === 0.5 && seen.data.rep === 3,
    'ANIMATE takes a variable holding a graphics object, and its list gives the place, delay and repeats');
  assertThrows(() => runLine('1 2 ANIMATE'), /Too few arguments/, 'ANIMATE wants n graphics objects');
  assertThrows(() => runLine('"x" 1 ANIMATE'), /Bad argument type/, 'ANIMATE plays only graphics objects');
  assertThrows(() => runLine('0 ANIMATE'), /Bad argument value/, 'ANIMATE wants at least one');
  assertThrows(() => runLine('2 2 BLANK { 1 { 1 2 } .1 1 } ANIMATE'), /Bad argument type/, 'ANIMATE\'s place is two binary integers');
  runLine("'F7' PURGE");
  setGraphicsHook(null);
}

// PLOT and PLOTADD: EQ takes the expression, and the plot view the trace, of PPAR's plot type.
{
  const { varRecall, varPurge } = await import('../www/src/rpl/state.js');
  const { format } = await import('../www/src/rpl/formatter.js');
  let seen = null;
  setGraphicsHook((kind, st, data = null) => { seen = { kind, top: st.depth ? format(st.peek()) : null, depth: st.depth, data }; });
  varPurge('EQ');
  varPurge('PPAR');
  const s = runLine("'SIN(X)' PLOT");
  assert(seen?.kind === 'function' && s.depth === 1 && format(varRecall('EQ')) === format(s.peek()),
    'PLOT stores level 1 in EQ, leaves it on the stack and plots it as a function');
  const t = runLine("'X^2' PLOTADD");
  assert(t.depth === 0 && seen.kind === 'function' && seen.top === format(runLine("'X^2'").peek()) && varRecall('EQ')?.items?.length === 2,
    'PLOTADD takes level 1, adds it to EQ as a list and to the plot');
  runLine("'COS(X)' PLOTADD");
  assert(varRecall('EQ').items.length === 3, 'PLOTADD appends to EQ\'s list');
  runLine("{ (-1,-1) (1,1) X 0 (0,0) POLAR Y } 'PPAR' STO 'T' PLOT");
  assert(seen.kind === 'polar', 'PLOT follows PPAR\'s plot type');
  assertThrows(() => runLine('5 PLOT'), /Bad argument type/, 'PLOT wants an expression or a name');
  assertThrows(() => runLine('PLOT'), /Too few arguments/, 'PLOT wants an argument');
  varPurge('PPAR');
  runLine("{ 'SIN(X)' 'COS(X)' } PLOT");
  assert(seen.kind === 'function' && varRecall('EQ')?.items?.length === 2,
    'PLOT takes a list of formulas, stores it in EQ and plots it, as EQ holding a list does on the HP');
  assertThrows(() => runLine("{ 'SIN(X)' 5 } PLOT"), /Bad argument type/, 'PLOT refuses a list holding a number');
  runLine("'X^3' STEQ DRAW");
  assert(seen.kind === 'draw' && seen.data?.kind === 'function' && format(seen.data.eq) === format(runLine("'X^3'").peek()),
    'DRAW hands the plot view EQ and PPAR\'s plot type, so it plots EQ as the HP does');
  runLine("{ (-1,-1) (1,1) X 0 (0,0) SCATTER Y } 'PPAR' STO DRAW");
  assert(seen.kind === 'draw' && seen.data === null, 'DRAW with a ΣDAT plot type hands no EQ');
  varPurge('EQ');
  varPurge('PPAR');
  setGraphicsHook(null);
}

// WIREFRAME: z = f(x, y) seen from VPAR's eye point, looking at the view volume's centre, with the volume's box.
{
  const volume = { x: [-1, 1], y: [-1, 1], z: [-1, 1], eye: [0, -3, 0], steps: [10, 8] };
  const wire = (expr, v = volume) => sampleTrace({ kind: 'wireframe', expr }, null, { volume: v });
  const saddle = wire('X^2-Y^2');
  const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-12 && Math.abs(p[1] - q[1]) < 1e-12;
  assert(saddle.length === 8 + 10 + 12, `WIREFRAME: NUMY lines across x, NUMX along y and the box's 12 edges (${saddle.length})`);
  assert(saddle.some((seg) => seg.length === 2 && near(seg[0], [-0.5, -0.5]) && near(seg[1], [0.5, -0.5])),
    'WIREFRAME: the box\'s near bottom edge, 2 units from the eye, spans -.5 to .5');
  assert(saddle.flat().every(([u, v]) => Math.abs(u) <= 0.5 + 1e-12 && Math.abs(v) <= 0.5 + 1e-12), 'WIREFRAME: the surface stays inside the box\'s image');
  const bowl = wire('X^2+Y^2');
  assert(bowl.length < saddle.length && bowl.slice(0, -12).every((seg) => seg.length > 1), 'WIREFRAME: points above the volume\'s z range break their lines');
  assert(wire('X', { ...volume, eye: [0, 0, 0] }).length === 0, 'WIREFRAME: an eye at the volume\'s centre sees nothing');
  let seen = null;
  setGraphicsHook((kind) => { seen = kind; });
  runLine("'X*Y' WIREFRAME DROP");
  assert(seen === 'wireframe', 'WIREFRAME hands its expression to the plot view');
  setGraphicsHook(null);
}

// YSLICE draws only the slices across x; PARSURFACE maps VPAR's input plane through x, y and z of two variables.
{
  const volume = { x: [-1, 1], y: [-1, 1], z: [-1, 1], input: { x: [0, 1], y: [0, 2 * Math.PI] }, eye: [0, -3, 0], steps: [10, 8] };
  const slices = sampleTrace({ kind: 'yslice', expr: 'X^2-Y^2' }, null, { volume });
  assert(slices.length === 8 + 12, `YSLICE: NUMY slices across x and the box (${slices.length})`);
  const disc = sampleTrace({ kind: 'parsurface', expr: 'X*COS(Y)', exprY: 'X*SIN(Y)', exprZ: '0' }, null, { volume });
  assert(disc.length === 8 + 10 + 12 && disc.slice(0, -12).flat().every(([u, v]) => Math.abs(v) < 1e-12),
    `PARSURFACE: a flat disc at z = 0, seen edge on from (0, -3, 0), lies on the horizon (${disc.length})`);
  const tall = sampleTrace({ kind: 'parsurface', expr: 'X', exprY: '0', exprZ: 'Y' }, null, { volume });
  const lengthwise = tall.slice(0, -12).filter((seg) => seg.length < 48);
  assert(tall.length - 12 === 2 + 10 && lengthwise.length === 10,
    `PARSURFACE: z = v leaves the volume past v = 1, dropping the lines across u beyond it and cutting those along v (${tall.length})`);
  const kinds = [];
  setGraphicsHook((kind, s, data) => kinds.push(`${kind}${data ? ' data' : ''}`));
  runLine("'X*Y' YSLICE DROP { 'X' 'Y' 'X*Y' } PARSURFACE DROP");
  assert(kinds.join(',') === 'yslice,parsurface data', `YSLICE and PARSURFACE hand their level 1 to the plot view (${kinds})`);
  assertThrows(() => runLine("'X' PARSURFACE"), /Bad argument type/, 'PARSURFACE wants x, y and z in a list or vector');
  setGraphicsHook(null);
}

// FAST3D turns the view volume, scaled to a cube, about its centre; the eye point plays no part.
{
  const volume = { x: [-10, 10], y: [-1, 1], z: [-1, 1], eye: [0, 0, 0], steps: [10, 8] };
  const fast = (expr, turn) => sampleTrace({ kind: 'fast3d', expr }, null, { volume, turn });
  assert(fast('X*Y/10').length === 8 + 10 + 12, 'FAST3D: the mesh and the box, whatever the eye point');
  const level = fast('0', { azimuth: 0, elevation: 0 });
  assert(level.slice(0, -12).flat().every(([, v]) => Math.abs(v) < 1e-12), 'FAST3D: z = 0 seen level from the front lies on the horizon');
  const side = fast('0', { azimuth: 0, elevation: 0 }).flat();
  assert(Math.max(...side.map(([u]) => Math.abs(u))) < 0.5, 'FAST3D: a wide x range is scaled to the cube, not drawn 10 times wider');
  assert(DEFAULT_TURN.elevation > 0 && turnBy(DEFAULT_TURN, 0, 10).elevation === 1.5 && turnBy(DEFAULT_TURN, 1, 0).azimuth === DEFAULT_TURN.azimuth + 1,
    'FAST3D turns freely around and up to just short of straight above');
  let seen = null;
  setGraphicsHook((kind) => { seen = kind; });
  runLine("'X*Y' FAST3D DROP");
  assert(seen === 'fast3d', 'FAST3D hands its expression to the plot view');
  setGraphicsHook(null);
}

{
  const at = (expr, x, y) => evalComplex(parsePlotExpr(expr), { X: x, Y: y });
  const near = (z, re, im) => z && Math.abs(z[0] - re) < 1e-12 && Math.abs(z[1] - im) < 1e-12;
  assert(near(at('SIN(X+i*Y)', 1, 2), Math.sin(1) * Math.cosh(2), Math.cos(1) * Math.sinh(2)), 'GRIDMAP: SIN works on x + iy');
  assert(near(at('(X+i*Y)^2', 1, 2), -3, 4) && near(at('SQRT(X)', -4, 0), 0, 2), 'GRIDMAP: powers and roots are complex');
  assert(at('FLOOR(X)', 1, 0) === null, 'GRIDMAP: a function with no complex form has no value');
  const volume = { x: [-1, 1], y: [-1, 1], z: [-1, 1], input: { x: [-1, 1], y: [-1, 1] }, eye: [0, -3, 0], steps: [10, 8] };
  const grid = (expr) => sampleTrace({ kind: 'gridmap', expr }, null, { volume });
  const plain = grid('X+i*Y');
  assert(plain.length === 8 + 10 && plain.flat().every(([u, v]) => Math.abs(u) <= 1 && Math.abs(v) <= 1),
    `GRIDMAP: f = z draws the input grid itself, NUMY lines across and NUMX along (${plain.length})`);
  const steep = grid('EXP(20*X)');
  assert(steep.length === 8 + 8 && steep.flat().every(([u]) => u <= 1e6), `GRIDMAP: points past 1E6 are left out (${steep.length})`);
  let seen = null;
  setGraphicsHook((kind) => { seen = kind; });
  runLine("'EXP(X+i*Y)' GRIDMAP DROP");
  assert(seen === 'gridmap', 'GRIDMAP hands its expression to the plot view');
  setGraphicsHook(null);
}

{
  const turn = { azimuth: 0, elevation: 0 };
  const rows = [[1, 2, 3], [4, 5, 6]];
  const mesh = (low, high) => sampleTrace({ kind: 'matrix3d', points: { rows, low, high } }, null, { turn });
  assert(mesh(0, 10).length === 2 + 3 + 12, 'DRAW3DMATRIX: a line along each row and down each column, and the box');
  assert(mesh(0, 4.5).length === 2 + 12, 'DRAW3DMATRIX: values outside vmin to vmax are left out, and the lines through them');
  const fromLevel = TRACE_KINDS.matrix3d.fromStack(Matrix([[Real(1), Real(2)], [Real(3), Real(9)]]));
  assert(fromLevel.points.low === 1 && fromLevel.points.high === 9 && isMatrix(fromLevel.source),
    'DRAW3DMATRIX: a matrix plotted from level 1 spans its own values');
  let seen = null;
  setGraphicsHook((kind, s, data) => { seen = data; });
  runLine('[[1 2][3 4]] 0 5 DRAW3DMATRIX');
  assert(seen?.rows?.[1]?.[1] === 4 && seen.low === 0 && seen.high === 5 && isMatrix(seen.source),
    'DRAW3DMATRIX hands its matrix and range to the plot view');
  setGraphicsHook(null);
  assertThrows(() => runLine("{ 1 2 } 0 5 DRAW3DMATRIX"), /Bad argument type/, 'DRAW3DMATRIX wants a real matrix');
  assertThrows(() => runLine('[[1 2]] 0 DRAW3DMATRIX'), /Too few arguments/, 'DRAW3DMATRIX takes the matrix, vmin and vmax');
}

// PCONTOUR: ten level curves by marching squares, each segment on its level.
{
  const view = { xmin: -3, xmax: 3, ymin: -3, ymax: 3 };
  const contour = (expr) => sampleTrace({ kind: 'contour', expr }, view, { width: 240, height: 240 });
  const rings = contour('X^2+Y^2');
  const radii = [...new Set(rings.flat().map(([x, y]) => Math.round(Math.hypot(x, y) * 10) / 10))];
  assert(rings.length > 0 && rings.every((seg) => seg.length === 2), 'PCONTOUR: level curves come as two-point segments');
  assert(radii.length >= 10 && rings.every(([[x0, y0], [x1, y1]]) => Math.abs(Math.hypot(x0, y0) - Math.hypot(x1, y1)) < 0.1),
    'PCONTOUR: X^2+Y^2 gives rings, each segment at one radius');
  assert(contour('5').length === 0, 'PCONTOUR: a constant has no level curves');
  assert(contour('X*Y').length > 0, 'PCONTOUR: a saddle draws');
  assert(contour('SQRT(X)').every(([[x0], [x1]]) => x0 >= 0 && x1 >= 0), 'PCONTOUR: where f has no value nothing is drawn');
  let seen = null;
  setGraphicsHook((kind) => { seen = kind; });
  runLine("'X^2-Y' PCONTOUR DROP");
  assert(seen === 'contour', 'PCONTOUR hands its expression to the plot view');
  setGraphicsHook(null);
}

{
  const near = (a, b, tol = 1e-7) => Math.abs(a - b) <= tol;
  assert(near(nearestRoot(Math.sin, 3, 10), Math.PI), 'FCN ROOT: the nearest root of sin about 3 is pi');
  assert(near(nearestRoot(Math.sin, -0.5, 10), 0) && near(nearestRoot(Math.sin, 2.9, 10), Math.PI), 'FCN ROOT: the nearer side wins, 0 from -0.5 and pi from 2.9');
  assert(Number.isNaN(nearestRoot((x) => x * x + 1, 0, 10)), 'FCN ROOT: a function without a root in the window gives NaN');
  assert(Number.isNaN(nearestRoot((x) => 1 / (x - 2), 1.5, 4)), 'FCN ROOT: the sign change at a pole is not a root');
  assert(near(nearestRoot((x) => x - 1.25, 0, 10), 1.25), 'FCN ROOT: a line crosses where it should');
  const e = nearestExtremum(Math.cos, 0.5, 10);
  assert(e && near(e.x, 0, 1e-5) && near(e.y, 1, 1e-9), `FCN EXTR: the extremum of cos about 0.5 is (0, 1), got ${JSON.stringify(e)}`);
  const m = nearestExtremum((x) => (x - 2) * (x - 2) + 3, 0, 10);
  assert(m && near(m.x, 2, 1e-5) && near(m.y, 3, 1e-9), 'FCN EXTR: a parabola\'s vertex');
  assert(nearestExtremum((x) => x, 0, 10) === null, 'FCN EXTR: a line has no extremum');
  assert(near(slopeAt((x) => x * x, 1, 1e-4), 2, 1e-6) && near(slopeAt(Math.sin, 0, 1e-4), 1, 1e-6), 'FCN SLOPE: central differences give 2 for x^2 at 1 and 1 for sin at 0');
}
