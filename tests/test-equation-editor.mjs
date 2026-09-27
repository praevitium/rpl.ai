import { assert, assertThrows } from './helpers.mjs';
import {
  emptyEquation, equationFromValue, fromAst, toAst, targetAst, EQW_PALETTE, EQW_FEATURED, eqwPaletteFaces,
  pressEquationKey, keypadFace, physicalFace, isEquationFace,
  equationToSymbolic, valueToEquationDraft, valueFromEquation,
  EQW_CMDS, EQW_APP_FACES, EQW_UNAVAILABLE_FACES, applyOpsToAst,
  cutTarget, pasteText, replaceTarget,
} from '../www/src/ui/equation-editor.js';
import { Symbolic, Name, Integer, Matrix, isSymbolic, isInteger } from '../www/src/rpl/types.js';
import { parseAlgebra, formatAlgebra, astEqual } from '../www/src/rpl/algebra.js';
import { eqwToSvg } from '../www/src/rpl/pretty.js';
import { SOFT_KEYS, NAV_KEYS, ARROW_KEYS, MAIN_KEYS } from '../www/src/ui/keyboard.js';
import { lookup } from '../www/src/rpl/ops.js';
import { giac } from '../www/src/rpl/cas/giac-engine.mjs';
import { buildGiacCmd } from '../www/src/rpl/cas/giac-convert.mjs';
import { setApproxMode, getApproxMode } from '../www/src/rpl/state.js';

function press(state, ...faces) {
  return faces.reduce((next, face) => pressEquationKey(next, face), state);
}

function textOf(state) {
  return formatAlgebra(toAst(state.root));
}

function same(state, source, label) {
  const got = toAst(state.root);
  const want = parseAlgebra(source);
  assert(astEqual(got, want), `${label} (got ${formatAlgebra(got)})`);
}

{
  const state = press(emptyEquation(), '5', '÷', '5', '+', '2');
  same(state, '5/(5+2)', 'EQW ÷ after a leaf makes it the numerator and moves the cursor to the denominator (5÷5+2 → 5/(5+2))');
  assert(state.target.mode === 'insert', 'EQW ÷ denominator cursor stays in the denominator');
  assert(state.target.path[1] === 1, 'EQW ÷ cursor slot is the denominator');
}

{
  const state = press(emptyEquation(), '÷');
  assert(state.root[0].t === 'frac', 'EQW ÷ on an empty box opens ■/■ with the cursor in the numerator');
  assert(state.root[0].slots[0][0].t === 'hole' && state.root[0].slots[1][0].t === 'hole',
    'EQW ÷ on an empty box opens two holes');
  assert(state.target.mode === 'insert' && state.target.path[1] === 0,
    'EQW ÷ on an empty box leaves the cursor in the numerator');
}

{
  const state = press(emptyEquation(), 'π', 'yˣ', '2', '▶');
  assert(state.target.mode === 'select', 'EQW yˣ then ► with nothing after the cursor selects the power (π²)');
  same(state, 'π^2', 'EQW yˣ then ► keeps π^2');
  assert(state.target.from === 0 && state.target.to === 0, 'EQW yˣ then ► selects the power item');
}

{
  const built = press(emptyEquation(), '√x', '3', '×', '( )', '5', '−', '1', '÷', '3', '×', '3');
  let state = built;
  for (let i = 0; i < 6; i++) state = pressEquationKey(state, '▲');
  const before = formatAlgebra(targetAst(state));
  state = pressEquationKey(state, '▲');
  assert(formatAlgebra(targetAst(state)) === '3*(5 - 1/(3*3))',
    `EQW ▲ from the last 3 of √3·(5−1/(3·3)) reaches 3·(…) in exactly 7 presses (got ${formatAlgebra(targetAst(state))} after ${before})`);
}

{
  let state = press(emptyEquation(), '5', '+', '3', '.', '2', '▶', '÷', '7', '−', '2', '.', '2');
  const walks = [];
  for (let i = 0; i < 4; i++) {
    state = pressEquationKey(state, '▲');
    walks.push(formatAlgebra(targetAst(state)));
  }
  assert(walks.join(' | ') === '2.2 | -2.2 | 7 - 2.2 | (5 + 3.2)/(7 - 2.2)',
    `EQW ▲ from 2.2 in (5+3.2)/(7−2.2) walks 2.2, −2.2, 7−2.2, fraction (got ${walks.join(' | ')})`);
}

{
  let state = press(emptyEquation(), 'x', '+', '2', 'μ', '×', 'Δ', 'y');
  const walks = [];
  for (let i = 0; i < 3; i++) {
    state = pressEquationKey(state, '▲');
    walks.push(formatAlgebra(targetAst(state)));
  }
  assert(walks.join(' | ') === 'Δy | 2*μ*Δy | x + 2*μ*Δy',
    `EQW ▲ from Δy walks Δy, 2·μ·Δy, x+2·μ·Δy (got ${walks.join(' | ')})`);
}

{
  let state = press(emptyEquation(), '7', '−', '2', '.', '2', '▲');
  assert(formatAlgebra(targetAst(state)) === '2.2', 'EQW a subtracted term starts at its leaf');
  state = pressEquationKey(state, '▲');
  assert(formatAlgebra(targetAst(state)) === '-2.2', 'EQW a subtracted term is its own selectable node');
}

{
  const loaded = equationFromValue(Symbolic(parseAlgebra('A*(B+C)')));
  let state = press(loaded, '▲', '▲');
  assert(formatAlgebra(targetAst(state)) === 'B + C',
    'EQW precedence parentheses of a loaded expression are not an ▲ stop (App E A2→A3)');
  state = pressEquationKey(state, '▲');
  assert(formatAlgebra(targetAst(state)) === 'A*(B + C)',
    'EQW ▲ from a loaded product skips the precedence parentheses');
  let typed = press(emptyEquation(), '( )', 'B', '+', 'C', '▲', '▲', '▲');
  assert(typed.target.mode === 'select' && typed.root[0].t === 'paren' && typed.root[0].typed,
    'EQW typed parentheses are a ▲ stop');
}

{
  let state = press(emptyEquation(), 'x', '+', '1', 'RS▲', '▼');
  assert(formatAlgebra(targetAst(state)) === 'x', 'EQW ▼ selects the first child');
  state = pressEquationKey(state, '▼');
  assert(state.target.mode === 'clear', 'EQW ▼ on a selected leaf switches to the clear cursor');
}

{
  let state = press(emptyEquation(), '1', '÷', '2', '◀', '◀');
  assert(state.target.mode === 'clear' && state.target.path[1] === 0,
    'EQW clear-cursor ◀ walks from the denominator back to the numerator');
  state = pressEquationKey(state, '▶');
  assert(state.target.mode === 'clear' && state.target.path[1] === 1,
    'EQW clear-cursor ▶ walks leaves in reading order across structures');
  const hole = press(emptyEquation(), '1', '÷', '◀');
  assert(hole.target.mode === 'clear' && hole.target.path[1] === 0,
    'EQW clear-cursor ◀ from ■ steps to the previous leaf');
}

{
  let state = equationFromValue(Symbolic(parseAlgebra('X^2+2*X*Y+Y^2-A^2+B^2')));
  state = press(state, 'RS▲', '▼', 'RS▶', 'RS▶');
  assert(formatAlgebra(targetAst(state)) === 'X^2 + 2*X*Y + Y^2',
    'EQW RS▶ extends a sum run');
  let neg = equationFromValue(Symbolic(parseAlgebra('-(A^2)+B^2')));
  neg = press(neg, '▲', '▲', 'RS◀');
  const selected = formatAlgebra(targetAst(neg));
  assert(selected.startsWith('-') && selected.includes('B^2'),
    `EQW RS▶ extends a run starting with a subtracted term and includes its minus (got ${selected})`);
}

{
  const state = press(emptyEquation(), '5', '÷', '1', 'RS▲');
  assert(state.target.mode === 'select' && state.target.row === '' && state.target.from === 0,
    'EQW RS▲ selects the whole expression from any state');
}

{
  const state = press(emptyEquation(), '∫', '0', '▶', '1', '▶', 't', '×', 'SIN', 't', '▶', 't');
  same(state, 'INTEG(t*SIN(t),t,0,1)',
    'EQW ► fills ∫ slots in lower, upper, integrand, variable order and SIN(t◄)► reaches d■');
}

{
  const state = press(emptyEquation(), 'Σ', 'K', '▶', '1', '▶', 'N', '▶', 'K', 'yˣ', '2');
  same(state, 'Σ(K^2,K,1,N)', 'EQW Σ slots are index, start, end, summand and toAst builds Σ(body,var,lo,hi)');
}

{
  const state = press(emptyEquation(), '∂', 't', '▶', 'α', '×', 't', 'yˣ', '2', '▶', '▶', '+', 'β', '×', 't', '+', 'δ');
  same(state, 'DERIV(α*t^2+β*t+δ,t)', 'EQW ∂ template yields DERIV(α*t^2+β*t+δ,t)');
}

{
  let state = press(emptyEquation(), '5', '+', '1', 'RS▲');
  const before = textOf(state);
  state = pressEquationKey(state, '⌫');
  assert(textOf(state) === before && state.target.mode === 'insert',
    'EQW DEL on a selection becomes the insertion cursor at its last leaf and deletes nothing');
}

{
  const state = press(emptyEquation(), '1', '÷', '3', '⌫', '⌫');
  same(state, '1', 'EQW DEL in an emptied denominator removes the fraction and keeps the numerator (UG 2-12)');
}

{
  const state = press(emptyEquation(), '5', '÷', '1', '▶', '+', '⌫');
  assert(state.target.mode === 'select' && state.root[0].t === 'frac',
    'EQW DEL on ■ after an operator removes the operator and selects the structure to its left (UG 2-19)');
}

{
  const state = press(emptyEquation(), 'X', 'RS▲', '+', '1');
  same(state, 'X+1', 'EQW an operator on a selection uses it as the left operand');
}

{
  let state = press(emptyEquation(), '2', '×', 'x', '◀', '◀', '▲', '+');
  assert(state.root[0].t === 'paren' && state.root[0].typed === false && state.root[1].op === '*',
    'EQW + on a selected factor groups as (2+■)·x');
}

{
  const state = press(emptyEquation(), 'X', 'RS▲', 'SIN');
  assert(state.target.mode === 'select', 'EQW a function key on a selection wraps it and leaves the result selected');
  same(state, 'SIN(X)', 'EQW a function key on a selection wraps the target');
}

{
  const state = press(emptyEquation(), 's', 'i', 'n', '( )');
  assert(state.root[0].t === 'fn' && state.root[0].name === 'SIN',
    'EQW sin( converts the name into SIN(■)');
  const unknown = press(emptyEquation(), 'f', '( )');
  assert(unknown.root.some(item => item.t === 'op' && item.op === '*') && unknown.root.some(item => item.t === 'paren'),
    'EQW an unknown name followed by ( multiplies');
}

{
  const juxta = press(emptyEquation(), '2', 'x');
  same(juxta, '2*x', 'EQW a letter after a number inserts an explicit ·');
  const name = press(emptyEquation(), 'Δ', 'y');
  assert(name.root[0].t === 'name' && name.root[0].text === 'Δy', 'EQW Δ then y is one name');
}

{
  const neg = press(emptyEquation(), '5', '+/-');
  same(neg, '-5', 'EQW +/- toggles a Neg box');
  const back = press(neg, '+/-');
  same(back, '5', 'EQW +/- unwraps a Neg box');
  const exp = press(emptyEquation(), '1', 'EEX', '+/-');
  assert(exp.root[0].text === '1E-', 'EQW +/- after EEX types the exponent sign');
}

{
  assertThrows(() => toAst(emptyEquation().root), /Incomplete Subexpression/,
    'EQW toAst refuses ■ with Incomplete Subexpression');
}

{
  const samples = [
    'X^2+2*X*Y+Y^2-(A^2-B^2)', '1/(X+1)', 'A-(B-C)', 'A+(B+C)', 'A*(B*C)',
    'A/(B*C)', '(-X)^2', '-X*Y', 'SIN(X)^2', 'SQRT(X)', 'XROOT(X,3)', 'EXP(X)',
    'FACT(X)', 'A=B', 'DERIV(X^2,X)', 'INTEG(X,X,0,1)', 'Σ(K^2,K,1,N)',
    '12345678901234567890',
  ];
  for (const source of samples) {
    const ast = parseAlgebra(source);
    const round = toAst(fromAst(ast));
    assert(astEqual(round, ast), `EQW fromAst/toAst round-trips parser output (${source} → ${formatAlgebra(round)})`);
  }
  const negative = parseAlgebra('-2');
  const back = toAst(fromAst(negative));
  assert(astEqual(back, negative) || (back.kind === 'neg' && back.arg.kind === 'num'),
    'EQW negative numeric literals come back as Neg(Num)');
}

{
  const prev = getApproxMode();
  setApproxMode(true);
  try {
    let state = equationFromValue(Symbolic(parseAlgebra('X*(2+3)')));
    state = press(state, '▲', '▲');
    assert(formatAlgebra(targetAst(state)) === '2 + 3', `EQW EVAL setup selects 2+3 (got ${formatAlgebra(targetAst(state))})`);
    const result = applyOpsToAst(targetAst(state), ['EVAL', 'SIMPLIFY']);
    assert(result.kind === 'num' && result.value === 5, 'EQW EVAL replaces only the selected subtree and leaves it selected');
    state = replaceSelection(state, result);
    assert(state.target.mode === 'select', 'EQW EVAL leaves the replacement selected');
    assert(textOf(state) === 'X*5', `EQW EVAL of 2+3 inside X*(2+3) yields X*5 (got ${textOf(state)})`);
  } finally {
    setApproxMode(prev);
  }
}

{
  let state = equationFromValue(Symbolic(parseAlgebra('X^2+2*X*Y+Y^2-A^2+B^2')));
  state = press(state, 'RS▲', '▼', 'RS▶', 'RS▶');
  const ast = targetAst(state);
  const cmd = buildGiacCmd(ast, (expr) => `factor(${expr})`);
  giac._setFixture(cmd, '(X+Y)^2');
  try {
    const factored = applyOpsToAst(ast, ['FACTOR']);
    state = replaceSelection(state, factored);
    assert(textOf(state).includes('(X + Y)^2') && textOf(state).includes('A^2'),
      `EQW FACTOR on the run X²+2·X·Y+Y² replaces only the run (UG 2-24) (got ${textOf(state)})`);
  } finally {
    giac._clear();
  }
}

{
  let state = press(emptyEquation(), '2', '×', 'x', '▲');
  state = cutTarget(state);
  assert(state.root.some(item => item.t === 'hole') && state.target.mode === 'clear',
    'EQW CUT leaves ■ under the clear cursor');
  let product = press(emptyEquation(), 'λ', 'RS▲');
  product = pasteText(product, 'x+2');
  assert(product.root[0].t === 'paren' || textOf(product).includes('x + 2'),
    'EQW a pasted sum inside a product gets parentheses (UG 2-27)');
}

{
  let digits = press(emptyEquation(), '1', '2', '3');
  digits = pressEquationKey(digits, 'UNDO');
  assertThrows(() => toAst(digits.root), /Incomplete/,
    'EQW consecutive digits undo as one step');
  let state = press(emptyEquation(), '1', '2', '3', '+', '4');
  state = pressEquationKey(state, 'UNDO');
  state = pressEquationKey(state, 'UNDO');
  assert(textOf(state) === '123' && state.target.mode === 'insert',
    `EQW UNDO restores the previous tree and target (got ${textOf(state)})`);
}

{
  const state = equationFromValue(Symbolic(parseAlgebra('X+1')));
  assert(state.target.mode === 'insert' && state.target.path.join('.') === '2',
    'EQW equationFromValue opens a Symbolic with the insertion cursor after its last leaf');
  assertThrows(() => equationFromValue(Matrix([[Integer(1)]])), /not an algebraic/,
    'EQW equationFromValue refuses a Matrix');
}

{
  const sqrt = MAIN_KEYS.find(key => key.primary === '√x');
  const up = ARROW_KEYS.find(key => key.primary === '▲');
  const letter = SOFT_KEYS[0];
  assert(keypadFace(sqrt, 'shiftR') === 'ⁿ√y', 'EQW keypadFace resolves √x+RS to ⁿ√y');
  assert(keypadFace(up, 'shiftR') === 'RS▲', 'EQW keypadFace resolves ▲+RS to RS▲');
  assert(keypadFace(letter, 'alpha') === 'a', 'EQW keypadFace resolves alpha to the letter');
}

{
  const labels = new Set();
  for (const key of [...SOFT_KEYS, ...NAV_KEYS, ...ARROW_KEYS, ...MAIN_KEYS]) {
    for (const label of [key.primary, key.shiftL, key.shiftR, key.alpha]) {
      if (label) labels.add(label);
    }
  }
  const bad = [...labels].filter((label) => {
    const hits = [isEquationFace(label), EQW_APP_FACES.has(label), EQW_UNAVAILABLE_FACES.has(label)]
      .filter(Boolean).length;
    return hits !== 1;
  });
  assert(bad.length === 0,
    `EQW every keypad label is an EQW face, an app face or listed unavailable${bad.length ? ` (${bad.join(', ')})` : ''}`);
}

{
  assert(physicalFace({ key: '^', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }) === 'yˣ',
    'EQW physicalFace maps ^ to yˣ');
  assert(physicalFace({ key: '/', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }) === '÷',
    'EQW physicalFace maps / to ÷');
  assert(physicalFace({ key: 'ArrowUp', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true }) === 'RS▲',
    'EQW physicalFace maps Shift+ArrowUp to RS▲');
  assert(physicalFace({ key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }) === 'UNDO',
    'EQW physicalFace maps Ctrl+Z to UNDO');
}

{
  for (const name of EQW_CMDS) {
    assert(lookup(name), `EQW_CMDS are all registered ops (${name})`);
  }
}

{
  const symbolic = equationToSymbolic('SIN(X)^2');
  assert(isSymbolic(symbolic), 'equationToSymbolic: Symbolic');
  assertThrows(() => equationToSymbolic(''), /Empty/, 'equationToSymbolic: empty');
  assert(valueToEquationDraft(Symbolic(parseAlgebra('X+1'))) === 'X + 1',
    'valueToEquationDraft: symbolic');
  assert(valueToEquationDraft(Name('foo')) === 'foo', 'valueToEquationDraft: name');
  assert(valueToEquationDraft(Integer(4)) === '4', 'valueToEquationDraft: integer');
  assert(valueToEquationDraft(Matrix([[Integer(1)]])) === null,
    'valueToEquationDraft: matrix is not an expression');
  const pushed = valueFromEquation(fromAst(parseAlgebra('X+1')));
  assert(isSymbolic(pushed), 'valueFromEquation pushes a compound expression as a Symbolic');
  const four = valueFromEquation(fromAst(parseAlgebra('4')));
  assert(isInteger(four) && four.value === 4n, 'valueFromEquation pushes an integer leaf as an Integer');
}

{
  const featured = new Set(EQW_FEATURED.map(button => button.face));
  const offered = new Set(eqwPaletteFaces());
  assert(featured.has('∂') && featured.has('∫') && featured.has('Σ') && featured.has('π') && featured.has('≠'),
    'EQW palette features derivative, integral, sum, and symbols a keyboard cannot type');
  for (const face of ['0', '+', '−', '×', 'x', 'e', 'SIN', '( )', '⌫']) {
    assert(!featured.has(face), `EQW featured palette hides typeable ${face}`);
    assert(offered.has(face), `EQW more palette still offers ${face}`);
  }
  const dead = [...EQW_FEATURED, ...EQW_PALETTE.flatMap(group => group.items)].filter(button => !isEquationFace(button.face)).map(button => button.label);
  assert(dead.length === 0, `EQW palette buttons insert equation faces${dead.length ? ` (${dead.join(', ')})` : ''}`);
  for (const [face, kind] of [['∂', 'deriv'], ['∫', 'integ'], ['Σ', 'sigma'], ['÷', 'frac'], ['yˣ', 'pow'], ['√x', 'sqrt'], ['ⁿ√y', 'xroot'], ['eˣ', 'exp']]) {
    const state = press(emptyEquation(), face);
    assert(state.root[0]?.t === kind, `EQW palette ${face} opens a ${kind} (got ${state.root[0]?.t})`);
  }
}

{
  const empty = emptyEquation();
  const drawn = eqwToSvg(empty.root, { caret: '0', size: 24 });
  assert(drawn.rects.has('0'), 'eqwToSvg records a rect for every item key');
  assert(drawn.svg.includes('eqw-caret') && !drawn.svg.includes('eqw-hole'),
    'eqwToSvg draws ■ for holes and the caret instead of the cursor\'s ■');
  const other = eqwToSvg(press(emptyEquation(), '1', '÷').root, { caret: '0.0.0', size: 24 });
  assert(other.svg.includes('eqw-hole') && other.svg.includes('eqw-caret'),
    'eqwToSvg draws ■ for the hole that does not hold the cursor');
  const boxed = eqwToSvg(press(emptyEquation(), '1').root, { boxed: '0', size: 24 });
  assert(boxed.svg.includes('eqw-clear'), 'eqwToSvg draws the clear cursor as an outline');
  const selected = eqwToSvg(press(emptyEquation(), '1', '+', '2').root, {
    selected: { row: '', from: 0, to: 2 }, size: 24, clipId: 'eqw-test',
  });
  assert(selected.svg.includes('eqw-inverse') && selected.svg.includes('clipPath'),
    'eqwToSvg draws the selection as an inverse clip over exactly the selected items');
}

function replaceSelection(state, ast) {
  return replaceTarget(state, [...fromAst(ast)]);
}
