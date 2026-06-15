import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* EVAL, program execution, quoted-name fidelity, formatStackTop. */


{
  resetHome();
  const s = new Stack();
  s.push(Real(7));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(7),
         'EVAL of Real(7) = Real(7) on top');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(42));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n, 'EVAL of Integer is idempotent');
}

{
  resetHome();
  const s = new Stack();
  s.push(Name('UNDEFINED_THING'));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === 'UNDEFINED_THING',
         'EVAL of unbound Name pushes Name back');
}

{
  resetHome();
  varStore('PI', Real(Math.PI));
  const s = new Stack();
  s.push(Name('PI'));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(Math.PI),
         'EVAL of bound Name(PI) pushes Real(pi)');
}

{
  resetHome();
  // Program: << 1 2 + >>  ⇒  3
  varStore('SUM', Program([Integer(1), Integer(2), Name('+')]));
  const s = new Stack();
  s.push(Name('SUM'));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 3n,
         'EVAL of Name bound to Program runs the program');
}

{
  resetHome();
  const s = new Stack();
  s.push(Real(10));
  s.push(Program([Real(5), Name('+')]));   // << 5 + >>
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(15),
         'EVAL of << 5 + >> with 10 on stack = 15');
}

{
  resetHome();
  varStore('A', Real(40));
  varStore('B', Real(2));
  const s = new Stack();
  // << A B + >>  ⇒  42
  s.push(Program([Name('A'), Name('B'), Name('+')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(42),
         'program << A B + >> with A=40, B=2 evaluates to 42');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([Name('UNDEF')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === 'UNDEF',
         'unbound Name inside program is pushed back as a Name');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([Integer(1), Real(2.5), Str('hi')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'program of 3 literals leaves 3 items');
  assert(s.peek(3).value === 1n && s.peek(2).value.eq(2.5) && s.peek(1).value === 'hi',
         'literals pushed in source order');
}

{
  resetHome();
  // DOUBLE: << 2 * >>     uses bound Name '*' which is the op
  // QUAD:   << DOUBLE DOUBLE >>
  varStore('DOUBLE', Program([Integer(2), Name('*')]));
  varStore('QUAD',   Program([Name('DOUBLE'), Name('DOUBLE')]));
  const s = new Stack();
  s.push(Integer(5));
  s.push(Name('QUAD'));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 20n, 'QUAD(5) via nested EVAL = 20');
}

// Atomicity: an error mid-program unwinds the body's partial pushes,
// but the EVAL'd Program itself stays popped (ship-prep 2026-04-25-r3).
{
  resetHome();
  const s = new Stack();
  s.push(Real(100));               // pre-existing stack content
  s.push(Real(1));                 // first operand for the program's +
  // Program: << 1 + 1 0 / >>
  //   pushes 1, runs +, pushes 1, pushes 0, runs /  → division by zero
  s.push(Program([Integer(1), Name('+'), Integer(1), Integer(0), Name('/')]));
  assertThrows(() => lookup('EVAL').fn(s), null, 'program with 1/0 throws');
  // Post-pop snapshot was [Real(100), Real(1)]; restore() walks back to
  // that on the throw -- the Program is consumed (ship-prep r3 change).
  assert(s.depth === 2, 'on error, stack restored to post-pop depth (2)');
  assert(isReal(s.peek(2)) && s.peek(2).value.eq(100), 'level 2 preserved (Real(100))');
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(1),   'level 1 preserved (Real(1))');
}

{
  resetHome();
  varStore('Z', Real(99));
  const s = new Stack();
  // Tagged label "label", value Name('Z')  ⇒  EVAL strips, looks up Z = 99
  s.push(Tagged('label', Name('Z')));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(99),
         'EVAL of Tagged unwraps and EVALs the inner value');
}

// Recursion bound: a self-recursive program eventually errors instead of
// blowing the JS call stack
{
  resetHome();
  // LOOP: << LOOP >>  — infinite recursion
  varStore('LOOP', Program([Name('LOOP')]));
  const s = new Stack();
  s.push(Name('LOOP'));
  assertThrows(() => lookup('EVAL').fn(s), /recursion/i,
         'self-recursive program throws "recursion too deep"');
  // EVAL's snapshot is post-pop, so on the recursion-depth throw the
  // popped LOOP Name stays gone — empty stack.
  assert(s.depth === 0,
         'ship-prep r3: recursion error consumes the LOOP Name (post-pop snapshot)');
  resetHome();
}

{
  resetHome();
  const s = new Stack();
  const values = parseEntry('<< 1 2 + >> EVAL');
  for (const v of values) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && s.peek().value === 3n,
         'parsed << 1 2 + >> EVAL produces 3');
}

// Unicode guillemets `«  »` parse as program markers equivalent to
// ASCII `<< >>`, so SHIFT-R + (which types the Unicode glyphs the
// HP50 key is printed with) produces a parse-able program.
{
  resetHome();
  const s = new Stack();
  const values = parseEntry('« 1 2 + » EVAL');
  for (const v of values) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && s.peek().value === 3n,
         'parsed « 1 2 + » EVAL (Unicode guillemets) produces 3');
}
{
  // Mixed delimiters also work — `« 1 2 + >>` is accepted because the
  // parser normalises both forms to the same internal '<<' / '>>'
  // delim tokens.  Cheap robustness against copy-paste.
  resetHome();
  const s = new Stack();
  const values = parseEntry('« 7 »');
  assert(values.length === 1 && values[0].type === 'program',
         'Unicode-only guillemets produce a Program value');
  s.push(values[0]);
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && Number(s.peek().value) === 7,
         '« 7 » EVAL leaves 7 on the stack');
}
{
  // IF / THEN / END inside a Unicode-delimited program still work —
  // program markers are the only thing we changed; the block-keyword
  // scanner operates on token text post-normalization.
  resetHome();
  const s = new Stack();
  const values = parseEntry('« IF 1 THEN 42 END » EVAL');
  for (const v of values) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && Number(s.peek().value) === 42,
         '« IF 1 THEN 42 END » EVAL leaves 42 (block keywords survive Unicode delimiters)');
}

/* ================================================================
   Quoted-Name fidelity — `'X'` is distinct from bare `X`.

   Goal: a program can push a Name literal past EVAL, and the
   command-line loop treats `'+'` as "push the name" rather than
   "run the + op".  Implementation: Name has a `quoted` flag; parser
   sets it for tick-wrapped tokens; EVAL and the entry loop honor it.
   ================================================================ */

{
  const n = Name('X');
  assert(n.quoted === false, 'Name() default quoted = false');
  const q = Name('X', { quoted: true });
  assert(q.quoted === true, 'Name(..., { quoted: true }) sets flag');
}

{
  const vs = parseEntry("`X` X");
  assert(vs.length === 2, 'parse emits two tokens');
  assert(isName(vs[0]) && vs[0].id === 'X' && vs[0].quoted === true,
         "`X` parses to quoted Name");
  assert(isName(vs[1]) && vs[1].id === 'X' && vs[1].quoted === false,
         'bare X parses to unquoted Name');
}

{
  assert(format(Name('X', { quoted: true })) === "`X`",
         "format(quoted Name) === `X`");
  assert(format(Name('X')) === 'X', 'format(bare Name) === X');
}

{
  resetHome();
  varStore('X', Real(999));
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === 'X' && s.peek().quoted === true,
         'EVAL of quoted Name pushes it back even when bound');
  // And unquoted still auto-RCLs — sanity check we didn't break that
  s.clear();
  s.push(Name('X'));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(999),
         'EVAL of bare bound Name still auto-recalls (regression check)');
  resetHome();
}

{
  resetHome();
  varStore('X', Real(42));
  const s = new Stack();
  // << 'X' >>  — must push the name, NOT the value 42
  s.push(Program([Name('X', { quoted: true })]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === 'X' && s.peek().quoted === true,
         'quoted Name inside program is pushed literally');
  resetHome();
}

{
  resetHome();
  const s = new Stack();
  // << '+' >>  — pushes the Name '+', does NOT run the + op
  s.push(Program([Name('+', { quoted: true })]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === '+' && s.peek().quoted === true,
         "quoted `+` inside program is pushed, not executed");
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(42));
  s.push(Program([Name('X', { quoted: true }), Name('STO')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 0, 'program consumed both operands');
  assert(varRecall('X')?.value === 42n,
         "<< `X` STO >> applied to 42 stored Integer(42) in X");
  resetHome();
}

{
  resetHome();
  const s = new Stack();
  const entryLoop = (src) => {
    for (const v of parseEntry(src)) {
      if (v?.type === 'name' && !v.quoted) {
        const op = lookup(v.id);
        if (op) { op.fn(s); continue; }
      }
      s.push(v);
    }
  };
  entryLoop("42 `X` STO");
  assert(varRecall('X')?.value === 42n,
         "quoted-aware entry loop: 42 `X` STO stored 42");
  entryLoop("`X` RCL");
  assert(s.peek()?.value === 42n, "`X` RCL put 42 on stack");
  // Now verify that typing `'+'` pushes the Name rather than running the op
  s.clear();
  entryLoop("`+`");
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === '+' && s.peek().quoted === true,
         "typing `+` at the cmdline pushes quoted Name(`+`), does not add");
  resetHome();
}

{
  resetHome();
  varStore('X', Real(1));            // bind X so we'd notice a wrong lookup
  const s = new Stack();
  const values = parseEntry("<< `X` >> EVAL");
  for (const v of values) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === 'X' && s.peek().quoted === true,
         "parsed << `X` >> EVAL produces quoted Name(`X`) even with X bound");
  resetHome();
}

{
  const p = Program([Name('X', { quoted: true }), Name('+')]);
  // Formatter wraps programs with « … » and joins tokens with spaces.
  // Expect: « 'X' + »
  assert(format(p) === "« `X` + »",
         "format(program) renders quoted + bare names distinctly");
}

/* ================================================================
   formatStackTop — HP50 stack-level rendering of Names.

   On a real HP50, any Name visible on a stack level is shown with
   ticks regardless of how it was parsed.  Bare identifiers only
   exist inside program bodies; by the time one lands on the stack
   (via a failed lookup or a direct push) it is semantically a name
   literal.

   The formatStackTop wrapper exists so display.js has one canonical
   call for "render this value as an LCD stack row".  Non-Name values
   render identically to plain format(); nested values (list items,
   program tokens, vector/matrix cells, tagged payloads) do NOT
   inherit the stack context — they follow the authored form.
   ================================================================ */

{
  assert(formatStackTop(Name('X', { quoted: true })) === "`X`",
         "formatStackTop(quoted Name) === `X`");
  assert(formatStackTop(Name('X')) === "`X`",
         "formatStackTop(bare Name) === `X` — stack always ticks");
  // Operator names and funny characters still round-trip
  assert(formatStackTop(Name('+')) === "`+`",
         "formatStackTop(bare Name(`+`)) === \"`+`\"");
  assert(formatStackTop(Name('UNDEFINED_THING')) === "`UNDEFINED_THING`",
         "unbound-lookup residue displays with ticks on stack");
}

{
  // HP50 shows locals with a leading down-arrow in trace output; we
  // preserve the existing formatter convention and do NOT wrap them.
  assert(formatStackTop(Name('x', { local: true })) === '↓x',
         'formatStackTop leaves local names alone (no ticks)');
}

{
  assert(formatStackTop(Real(3.14)) === '3.14',
         'formatStackTop(Real) unchanged');
  assert(formatStackTop(Integer(42)) === '42',
         'formatStackTop(Integer) unchanged');
  // EXACT + STD renders integer-valued Complex components without
  // trailing dots — `(1., 2.)` becomes `(1, 2)`.
  assert(formatStackTop(Complex(1, 2)) === '(1, 2)',
         'formatStackTop(Complex) unchanged');
  assert(formatStackTop(Str('hi')) === '"hi"',
         'formatStackTop(String) unchanged');
}

{
  // { X Y } on the stack renders exactly as authored — bare names stay bare.
  const list = RList([Name('X'), Name('Y')]);
  assert(formatStackTop(list) === '{ X Y }',
         'formatStackTop(List) does not tick nested bare names');
  // But a genuinely-quoted nested Name still ticks — that's a property
  // of the value, not the render context.
  const mixed = RList([Name('X'), Name('Y', { quoted: true })]);
  assert(formatStackTop(mixed) === "{ X `Y` }",
         'formatStackTop(List) preserves per-Name quoted flag');
}

{
  const p = Program([Name('X'), Name('+')]);
  assert(formatStackTop(p) === '« X + »',
         'formatStackTop(Program) shows bare names in program body');
  const p2 = Program([Name('X', { quoted: true }), Name('+')]);
  assert(formatStackTop(p2) === "« `X` + »",
         'formatStackTop(Program) keeps quoted Names quoted in program body');
}

{
  // HP50 vectors of names aren't common, but we guard the behavior.
  const v = Vector([Name('A'), Name('B')]);
  assert(formatStackTop(v) === '[ A B ]',
         'formatStackTop(Vector) does not tick nested bare names');
  const m = Matrix([[Name('A'), Name('B')], [Name('C'), Name('D')]]);
  assert(formatStackTop(m) === '[[ A B ][ C D ]]',
         'formatStackTop(Matrix) does not tick nested bare names');
}

// and inherits no stack context.  A bare Name inside a Tagged therefore
// displays bare — consistent with container types.
{
  const t = Tagged('label', Name('Z'));
  assert(formatStackTop(t) === 'label: Z',
         'formatStackTop(Tagged<Name>) keeps bare name bare inside the payload');
  const t2 = Tagged('label', Name('Z', { quoted: true }));
  assert(formatStackTop(t2) === "label: `Z`",
         'formatStackTop(Tagged<quoted Name>) keeps ticks (per-value)');
}

{
  assert(format(Name('X')) === 'X',
         'format(bare Name) without stack context still renders bare');
  assert(format(Name('X', { quoted: true })) === "`X`",
         'format(quoted Name) without stack context still ticks');
  assert(format(Program([Name('X', { quoted: true }), Name('+')])) === "« `X` + »",
         'format(Program) regression — quoted + bare mix unchanged');
}

