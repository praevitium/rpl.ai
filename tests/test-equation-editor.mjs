import { assert, assertThrows } from './helpers.mjs';
import {
  wrapSelection, insertAt, previewEquation, equationToSymbolic,
  valueToEquationDraft, EQ_FNS,
} from '../www/src/ui/equation-editor.js';
import { Symbolic, Real, Name, Integer } from '../www/src/rpl/types.js';
import { parseAlgebra, isBin, isFn } from '../www/src/rpl/algebra.js';
import { isSymbolic } from '../www/src/rpl/types.js';

{
  const w = wrapSelection('x+1', 0, 3, 'frac');
  assert(w.text === '(x+1)/()', 'wrapSelection: frac wraps sel as numerator');
  assert(w.cursor === '(x+1)/('.length, 'wrapSelection: frac cursor in denom');
  const empty = wrapSelection('', 0, 0, 'frac');
  assert(empty.text === '()/()', 'wrapSelection: frac empty template');
  assert(empty.cursor === 1, 'wrapSelection: frac empty cursor in num');
}

{
  const w = wrapSelection('x', 0, 1, 'pow');
  assert(w.text === '(x)^()', 'wrapSelection: pow');
  const s = wrapSelection('x+1', 0, 3, 'sqrt');
  assert(s.text === 'SQRT(x+1)', 'wrapSelection: sqrt');
  const p = wrapSelection('x', 0, 1, 'parens');
  assert(p.text === '(x)', 'wrapSelection: parens');
  const f = wrapSelection('X', 0, 1, 'fn', 'SIN');
  assert(f.text === 'SIN(X)', 'wrapSelection: SIN');
}

{
  const i = insertAt('ab', 1, 1, 'π');
  assert(i.text === 'aπb' && i.cursor === 2, 'insertAt: mid');
}

{
  const ok = previewEquation('X^2 + 1');
  assert(ok.ok && ok.svg.includes('<svg'), 'previewEquation: svg');
  const empty = previewEquation('  ');
  assert(empty.ok && empty.ast === null, 'previewEquation: blank is empty-ok');
  const bad = previewEquation('SIN(');
  assert(!bad.ok, 'previewEquation: unclosed call fails');
}

{
  const v = equationToSymbolic('SIN(X)^2');
  assert(isSymbolic(v), 'equationToSymbolic: Symbolic');
  assert(isFn(v.expr) || isBin(v.expr), 'equationToSymbolic: AST');
  assertThrows(() => equationToSymbolic(''), /Empty/, 'equationToSymbolic: empty');
}

{
  assert(valueToEquationDraft(Symbolic(parseAlgebra('X+1'))) === 'X + 1',
    'valueToEquationDraft: symbolic');
  assert(valueToEquationDraft(Name('foo')) === 'foo', 'valueToEquationDraft: name');
  const n = valueToEquationDraft(Integer(4));
  assert(n === '4', 'valueToEquationDraft: integer');
  assert(EQ_FNS.includes('SIN') && EQ_FNS.includes('SQRT'), 'EQ_FNS: palette');
}

void Real;
