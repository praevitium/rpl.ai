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
import { assert, assertThrows, runLine } from './helpers.mjs';

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
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(Real(Math.PI).value),
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

// As on the HP, an error mid-program keeps what ran before the failing command,
// which gets its arguments back; the EVAL'd Program stays popped.
{
  resetHome();
  const s = new Stack();
  s.push(Real(100));               // pre-existing stack content
  s.push(Real(1));                 // first operand for the program's +
  // Program: << 1 + 1 0 / >>
  //   pushes 1, runs +, pushes 1, pushes 0, runs /  → division by zero
  s.push(Program([Integer(1), Name('+'), Integer(1), Integer(0), Name('/')]));
  assertThrows(() => lookup('EVAL').fn(s), null, 'program with 1/0 throws');
  assert(s.depth === 4, 'on error, the stack keeps 100, the 1 + result and the / arguments (4)');
  assert(isReal(s.peek(4)) && s.peek(4).value.eq(100), 'level 4 preserved (Real(100))');
  assert(isReal(s.peek(3)) && s.peek(3).value.eq(2), 'level 3 is 1 + 1, which ran before the error');
  assert(Number(s.peek(2).value) === 1 && Number(s.peek(1).value) === 0, 'levels 2 and 1 are the 1 and 0 / gave back');
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
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(999),
         'EVAL of a quoted Name evaluates it, as on the HP50 (AUR EVAL)');
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


/* ---- Evaluating a global name follows the AUR EVAL table: a name or a
        program in it is evaluated, anything else is put on the stack. ---- */
{
  resetHome();
  varStore('X', Integer(5n));
  varStore('A', parseEntry('`X+1`')[0]);
  varStore('B', Name('X', { quoted: true }));
  varStore('L', parseEntry('{ 1 2 + }')[0]);
  const s = runLine('A B L');
  assert(s.peek(3).type === 'symbolic', 'a global holding an algebraic pushes it unevaluated');
  assert(s.peek(2).value === 5n, 'a global holding a name evaluates the name');
  assert(s.peek(1).type === 'list' && s.peek(1).items.length === 3, 'a global holding a list pushes the list');
  const t = runLine('`A` EVAL EVAL');
  assert(isReal(t.peek()) || t.peek().type === 'integer', 'EVAL of the pushed algebraic then evaluates it');
  resetHome();
}

// TEVAL evaluates as EVAL does and adds the seconds it took, tagged s.
{
  const s = runLine("'2+3' TEVAL");
  assert(s.depth === 2 && s.peek(2).value === 5n, 'TEVAL leaves the result of EVAL');
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 's' && isReal(t.value) && t.value.value.gte(0), 'TEVAL adds the time taken, tagged s');
}

// VERSION gives the app's version and its copyright line.
{
  const { setVersion } = await import('../www/src/rpl/ops.js');
  setVersion('9.9.9');
  const s = runLine('VERSION');
  assert(s.depth === 2 && isString(s.peek(2)) && s.peek(2).value === 'rpl.ai 9.9.9' && isString(s.peek()) && /GPL-3\.0/.test(s.peek().value),
    'VERSION pushes "rpl.ai <version>" and the copyright line');
}

// VER, DEDICACE and RULES; →HEADER, →KEYTIME and →NDISP check and keep their setting.
{
  const { setVersion } = await import('../www/src/rpl/ops.js');
  const { getHalted, getPromptMessage, clearAllHalted, clearPromptMessage } = await import('../www/src/rpl/state.js');
  const top = (line) => format(runLine(line).peek());
  setVersion('9.9.9', '2026-10-19');
  assert(top('VER') === '1.520261019', 'VER gives Giac 1.5 and the build date as V.YYYYMMDD');
  assert(/^"rpl\.ai is dedicated to .* Salut"$/.test(top('"Salut" DEDICACE')), 'DEDICACE gives the dedication, extended by its argument');
  clearAllHalted(); clearPromptMessage();
  runLine('RULES');
  assert(getHalted()?.kind === 'msgbox' && /Bernard Parisse/.test(getPromptMessage()?.value) && /William C\. Wickes/.test(getPromptMessage()?.value),
    'RULES shows the credits in a message box');
  clearAllHalted(); clearPromptMessage();
  assert(top('7 FILER OFF') === '7', 'FILER and OFF run from a program and leave the stack alone; the app opens the Variables drawer and the off screen through their hooks');
  assert(top('HEADER→') === '2.' && top('1 →HEADER HEADER→') === '1.', '→HEADER keeps a size HEADER→ gives back, 2 lines at first');
  assertThrows(() => runLine('3 →HEADER'), /Bad argument value/, '→HEADER takes 0, 1 or 2 lines');
  assert(top('KEYTIME→') === '1138.' && top('500 →KEYTIME KEYTIME→') === '500.', '→KEYTIME keeps a time KEYTIME→ gives back, 1138 ticks at first');
  assertThrows(() => runLine('5000 →KEYTIME'), /Bad argument value/, '→KEYTIME takes 0 to 4096 ticks');
  assert(runLine('12 →NDISP').depth === 0, '→NDISP takes a number of program lines');
  assertThrows(() => runLine('0 →NDISP'), /Bad argument value/, '→NDISP needs at least one line');
  assertThrows(() => runLine('"a" →HEADER'), /Bad argument type/, '→HEADER takes a number');
  runLine('2 →HEADER 1138 →KEYTIME 9 →NDISP');
}

// MINEHUNT: an 8×16 field from the upper-left to the lower-right corner, Nmines mines, a game saved in MHpar resumed.
{
  const { setGameHook } = await import('../www/src/rpl/ops.js');
  const { minesAround, step, saveField, loadField, newField, GOAL } = await import('../www/src/rpl/minehunt.js');
  let game = null;
  setGameHook((g) => { game = g; });
  runLine('MINEHUNT');
  assert(game.mines.size === 20 && game.at === 0 && !game.mines.has(0) && !game.mines.has(GOAL) && !game.visible,
    'MINEHUNT starts in the corner with 20 mines, none on the start or the goal');
  runLine("-5 'Nmines' STO MINEHUNT");
  assert(game.mines.size === 5 && game.visible, 'a negative Nmines sets that many mines and shows them');
  assertThrows(() => runLine("99 'Nmines' STO MINEHUNT"), /Bad argument value/, 'Nmines takes 1 to 64');
  runLine("'Nmines' PURGE");
  const field = { mines: new Set([1, 16, 17]), at: 0, visited: new Set([0]), visible: false, over: null };
  assert(minesAround(field) === 3, 'the count is of the mines in the squares around you');
  assert(step(field, -1, 0) === null && field.at === 0, 'the edge of the field holds you');
  assert(step(field, 0, 1) === 'mine', 'a step onto a mine ends the game');
  const won = { mines: new Set(), at: GOAL - 1, visited: new Set([GOAL - 1]), visible: false, over: null };
  assert(step(won, 0, 1) === 'won', 'reaching the far corner wins');
  let seed = 0;
  const fresh = newField(7, () => ((seed = (seed + 0.37) % 1)));
  const back = loadField(saveField(fresh));
  assert(back.mines.size === fresh.mines.size && [...back.mines].every((m) => fresh.mines.has(m)) && back.at === 0, 'MHpar keeps the mines and where you are');
  game = null;
  calcState.current.entries.set('MHpar', saveField({ ...fresh, at: 17, visited: new Set([0, 17]) }));
  runLine('MINEHUNT');
  assert(game.at === 17 && !varList().includes('MHpar'), 'MINEHUNT resumes the game in MHpar and purges it');
  setGameHook(null);
}

// A built-in command named in an algebraic runs on its numeric arguments when no function rule folds it, as on the HP.
{
  const top = (line) => format(runLine(line).peek());
  assert(top("'UTPN(0,1,0.5)' EVAL") === '0.308537538726', 'UTPN in an algebraic evaluates');
  assert(top("'NDIST(0,1,0)' →NUM") === '0.398942280401', 'NDIST in an algebraic evaluates under →NUM');
  assert(top("'TRNC(1.27,1)' →NUM") === '1.2', 'TRNC with two arguments evaluates under →NUM');
  assert(top("'UTPC(2,3)' →NUM") === '0.223130160148', 'UTPC with two arguments evaluates under →NUM');
  assert(top("'GAMMA(2.5)' EVAL") === '1.32934038818', 'GAMMA of a non-integer evaluates');
  assert(top("'MANT(123)' EVAL") === '`MANT(123)`', 'EXACT mode keeps an inexact result of integers symbolic');
  assert(format(runLine("'SF(5)' EVAL 5 FS?").peek()) === '0.', 'a command that changes state runs in scratch state, so SF in an algebraic sets nothing');
  assert(top("'DUP(3)' EVAL") === '`DUP(3)`', 'a command that leaves other than one result stays symbolic');
  runLine('5 CF');
}

// i in an algebraic is the imaginary unit under →NUM and APPROX, as π is the number; EXACT EVAL keeps it symbolic.
{
  const top = (line) => format(runLine(line).peek());
  assert(top("'3+4*i' →NUM") === '(3, 4)', "→NUM works '3+4*i' out to a complex number");
  assert(top("'(1+i)*(1-i)' →NUM") === '(2, 0)' && top("'i^2' →NUM") === '(-1, 0)', 'products and powers of i are worked out');
  assert(top("'ABS(3+4*i)' →NUM") === '5.' && top("'RE(i+2)' →NUM") === '2.', 'a function of an expression holding i is worked out');
  assert(top("'EXP(i*π)' →NUM") === '(-1, -2.0682310711E-13)', 'EXP(i*π) comes out as the 12-digit π gives it');
  assert(top("APPROX '3+4*i' EVAL EXACT") === '(3, 4)', 'APPROX EVAL works it out too');
  assert(top("'3+4*i' EVAL") === '`3 + 4*i`', 'EXACT EVAL keeps i symbolic');
  assert(top("'X+i' →NUM") === '`X + i`', 'another unknown name keeps the whole expression symbolic');
  assert(top("[ 'i+1' 2 ] →NUM") === '[ (1, 1) 2. ]', 'an array entry holding i is worked out');
  assert(top("'1/(1+i)' →NUM") === '(0.5, -0.5)', 'a quotient is worked out');
}

// EVAL of an array with symbolic entries evaluates each entry; a numeric array stays as it is.
{
  const top = (line) => format(runLine(line).peek());
  runLine("3 'EVX' STO");
  assert(top('[[ EVX 1 ][ 2 EVY ]] EVAL') === '[[ 3 1 ][ 2 EVY ]]', 'EVAL puts a stored value into a symbolic matrix entry');
  assert(top("[ EVX 'EVX^2' ] EVAL") === '[ 3 9 ]', 'EVAL evaluates each entry of a symbolic vector');
  assert(top('[[ 1 2 ][ 3 4 ]] EVAL') === '[[ 1 2 ][ 3 4 ]]', 'EVAL leaves a numeric matrix as it is');
  runLine("« 1 2 » 'EVP' STO");
  assertThrows(() => runLine('[ EVP ] EVAL'), /Bad argument value/, 'EVAL of an array refuses an entry that gives two values');
  runLine("'EVX' PURGE 'EVP' PURGE");
}

// The print commands write to the print log, rpl.ai having no printer.
{
  const { printLog, clearPrintLog, setPrintHook } = await import('../www/src/rpl/ops.js');
  const printed = (line) => { clearPrintLog(); const s = runLine(line); return [printLog.join('|'), s.depth]; };
  let lines = 0;
  setPrintHook((n) => { lines += n; });
  assert(printed('"Hello" PR1').join() === 'Hello,1', 'PR1 prints a string without its quotes and leaves it on the stack');
  assert(printed('1 [[ 1 2 ][ 3 4 ]] « 1 + » PRST').join() === '3: 1|2: [[ 1 2 ][ 3 4 ]]|1: « 1 + »,3', 'PRST prints every level, the highest first, with its level number');
  assert(printed('"a string longer than the HP display is wide" PRSTC')[0] === '1: "a string longer than the HP dis…', 'PRSTC prints each level on one line cut to the display width');
  assert(printed('1 2 PRLCD')[0] === '2: 1|1: 2', 'PRLCD prints the stack as the display shows it');
  assert(printed("42 'PRV' STO { PRV } PRVAR").join() === 'PRV: 42,0' && printed("'PRV' PRVAR")[0] === 'PRV: 42', 'PRVAR prints a name or a list of names with its value');
  assertThrows(() => runLine("'PRNOPE' PRVAR"), /Undefined name: PRNOPE/, 'PRVAR names a variable that does not exist');
  assert(printed("'PRDIR' CRDIR 'PRDIR' EVAL 5 'Q' STO UPDIR { PRDIR } PRVAR 'PRDIR' RCL PR1 DROP 'PRDIR' PGDIR")[0] === 'PRDIR: DIR|  Q 5|END|DIR|  Q 5|END',
    'PRVAR and PR1 print a directory as DIR, its variables and END');
  assert(printed('CR').join() === ',0', 'CR prints an empty line');
  assert(printed('-4 DELAY OLDPRT').join() === ',0' && lines === 16, 'DELAY and OLDPRT have no printer to set up and print nothing; the hook heard every printed line');
  assertThrows(() => runLine('"x" DELAY'), /Bad argument type/, 'DELAY wants a number');
  setPrintHook(null);
  clearPrintLog();
  runLine("'PRV' PURGE");
}

// The font commands: the system font is the stack text size, a font object the tagged size :Font:n.
{
  const { setFontHooks } = await import('../www/src/rpl/ops.js');
  const show = (line) => format(runLine(line).peek());
  let size = 'larger';
  setFontHooks({ get: () => size, set: (v) => { size = v; } });
  assert(show('FONT6') === 'Font: 6' && show('FONT8') === 'Font: 8', 'FONT6, FONT7 and FONT8 give font objects, tagged sizes here');
  assert(show('FONT→') === 'Font: 8', 'FONT→ reads the stack text size, Larger counting as font 8');
  runLine('FONT→ →FONT FONT8 →FONT');
  assert(size === 'larger', '→FONT of font 8 keeps Larger, so FONT→ saved and restored leaves it be');
  runLine('FONT6 →FONT');
  assert(size === 'small' && show('FONT→') === 'Font: 6', '→FONT 6 sets the stack text size to Small');
  runLine('7 →FONT');
  assert(size === 'normal', '→FONT takes a plain 7 too');
  assertThrows(() => runLine(':Font:9 →FONT'), /Bad argument value/, '→FONT knows fonts 6, 7 and 8 only');
  assertThrows(() => runLine('"x" →FONT'), /Bad argument type/, '→FONT wants a font');
  assert(show('MINIFONT→') === 'Font: 6' && show('FONT8 →MINIFONT MINIFONT→') === 'Font: 8', '→MINIFONT keeps a minifont that MINIFONT→ gives back');
  runLine('FONT6 →MINIFONT');
  setFontHooks(null);
}

// The transfer commands: sending downloads .rpl files, receiving asks for files to store.
{
  const { setTransferHooks, receivedName, receivedTarget } = await import('../www/src/rpl/ops.js');
  const sent = [];
  const asked = [];
  setTransferHooks({ send: (files) => sent.push(files.map(({ name, value }) => `${name}=${format(value)}`).join(' ')), receive: (pairs) => asked.push(JSON.stringify(pairs)) });
  runLine("1 'TXA' STO 2 'TXC' STO");
  runLine("'TXA' SEND {{ TXA TXB } TXC } SEND {{ TXA \"my file\" }} XSEND 'TXC' XPUT");
  assert(sent.join('|') === 'TXA=1|TXB=1 TXC=2|my file=1|TXC=2', 'SEND, XSEND and XPUT send a name, a list of names and {{ old new }} renames, a new name as a string too');
  assertThrows(() => runLine("{ TXA TXNOPE } SEND"), /Undefined name: TXNOPE/, 'SEND names a variable that does not exist');
  assert(sent.length === 4, 'a failed SEND sends nothing');
  assertThrows(() => runLine('{ } SEND'), /Bad argument value/, 'SEND wants a name');
  assertThrows(() => runLine('5 SEND'), /Bad argument type/, 'SEND wants a name, not a number');
  runLine("RECV 'TXN' RECN {{ \"old name\" TXD } TXE } KGET 'TXF' XGET");
  assert(asked.join('|') === 'null|[{"from":null,"to":"TXN"}]|[{"from":"old name","to":"TXD"},{"from":"TXE","to":"TXE"}]|[{"from":"TXF","to":"TXF"}]',
    'RECV takes files under their own names, RECN one under a name, KGET and XGET the named ones');
  assertThrows(() => runLine('{ "not a name" } KGET'), /Invalid name: not a name/, 'KGET stores only under a valid name');
  assertThrows(() => runLine("'TXA' XRECV"), /Name conflict/, 'XRECV into a name in use is an error while flag -36 is clear');
  runLine("-36 SF 'TXA' XRECV");
  assert(asked.length === 5 && receivedName('TXA') === 'TXA', 'flag -36 set lets XRECV and a received file replace a variable');
  runLine('-36 CF');
  assert(receivedName('TXA') === 'TXA1' && receivedName('TXZ') === 'TXZ', 'with flag -36 clear a received name in use takes a number');
  const pairs = [{ from: 'TXA', to: 'TXB' }, { from: 'old name', to: 'TXD' }];
  assert(receivedTarget(null, 'x.rpl', 'X') === 'X' && receivedTarget([{ from: null, to: 'N' }], 'x.rpl', 'X') === 'N'
      && receivedTarget(pairs, 'txa.rpl', 'txa') === 'TXB' && receivedTarget(pairs, 'old name.rpl', 'old_name') === 'TXD' && receivedTarget(pairs, 'other.rpl', 'other') === null,
    'a received file goes under its own name, the one asked for, or the new name of the pair it matches; others are skipped');
  setTransferHooks(null);
  runLine("{ TXA TXC } PURGE");
}

// The serial commands: settings go to IOPAR in HOME, nothing ever arrives, XMIT prints.
{
  const { printLog, clearPrintLog, setTransferHooks } = await import('../www/src/rpl/ops.js');
  const notes = [];
  setTransferHooks({ note: (text) => notes.push(text) });
  const show = (line) => runLine(line).snapshot().map((v) => format(v)).reverse().join(' ');
  assert(show("9600 BAUD 2 PARITY 1 CKSM 0 TRANSIO 'IOSUB' CRDIR 'IOSUB' EVAL 4800 BAUD UPDIR IOPAR") === '{ 4800 2 0 0 1 0 }',
    'BAUD, PARITY, CKSM and TRANSIO set IOPAR in HOME, from a subdirectory too');
  assertThrows(() => runLine('1234 BAUD'), /Bad argument value/, 'BAUD knows the HP rates only');
  assertThrows(() => runLine('5 PARITY'), /Bad argument value/, 'PARITY runs from -4 to 4');
  assertThrows(() => runLine('4 CKSM'), /Bad argument value/, 'CKSM is 1, 2 or 3');
  assertThrows(() => runLine('30 STIME'), /Bad argument value/, 'STIME runs from 0 to 25.4 seconds');
  assert(show('2.5 STIME OPENIO SBRK CLOSEIO FINISH BUFLEN') === '0 1', 'BUFLEN finds no characters and no error, SBRK no transfer to break');
  assert(show('10 SRECV') === '"" 0', 'SRECV returns what a timed-out HP does: no characters and 0');
  clearPrintLog();
  assert(show('"to the printer" XMIT') === '1' && printLog.join() === 'to the printer', 'XMIT prints the string, as to an RS-232 printer, and reports success');
  assert(show('KERRM') === '""', 'KERRM has no Kermit error to report');
  assert(show('SERVER XSERV 1') === '1' && notes.length === 2, 'SERVER and XSERV say there is no serial link and return');
  assertThrows(() => runLine('"D" "G" PKT'), /Timeout/, 'PKT times out with no Kermit server, as the HP does with nothing connected');
  setTransferHooks(null);
  clearPrintLog();
  runLine("{ IOPAR IOSUB } PURGE");
}

// A program called by name runs on the driver stack, not nested on the JS call stack, so recursion goes thousands deep.
{
  const { localFramesDepth } = await import('../www/src/rpl/ops.js');
  const { clearAllHalted, getHalted, subscribe } = await import('../www/src/rpl/state.js');
  resetHome(); clearAllHalted();
  const run = (line, s = new Stack()) => runLine(line, s);
  run("« → n « IF n 0 == THEN 0 ELSE n 1 - QDEEP 1 + END » » 'QDEEP' STO");
  run("« IF DUP 0 == THEN DROP 0 ELSE 1 - QFLAT 1 + END » 'QFLAT' STO");
  assert(format(run('3000 QDEEP').peek()) === '3000' && localFramesDepth() === 0,
    'EVAL: a program that binds a local and calls itself by name goes 3000 deep, and leaves no local frame behind');
  assert(format(run('3000 QFLAT').peek()) === '3000', 'EVAL: a program that calls itself on the stack goes 3000 deep');
  run("« → n « n 1 + QRUN » » 'QRUN' STO");
  assertThrows(() => run('0 QRUN'), /recursion too deep/, 'EVAL: a program that recurses without end stops with recursion too deep, not a JS stack error');
  assert(localFramesDepth() === 0, 'EVAL: the locals of a runaway recursion are unwound when it stops');
  run("« → n « IF n 0 == THEN \"x\" 1 - ELSE n 1 - QFAIL END » » 'QFAIL' STO");
  assert(format(run('« IFERR 1500 QFAIL THEN ERRM END » EVAL').peek()) === '"Bad argument type"' && localFramesDepth() === 0,
    'IFERR: an error 1500 calls down is caught by the program that called them, with its own message');
  assert(format(run('« 7 → keep « 500 QDEEP DROP keep » » EVAL').peek()) === '7', '→: a local of the caller survives a deep recursion');
  run("« → n « IF n 0 == THEN HALT 0 ELSE n 1 - QSTOP 1 + END » » 'QSTOP' STO");
  const s = run('1000 QSTOP');
  assert(getHalted() !== null && s.depth === 0, 'HALT: a halt 1000 calls down parks the whole recursion');
  run('CONT', s);
  assert(getHalted() === null && format(s.peek()) === '1000' && localFramesDepth() === 0, 'CONT: the recursion finishes from where it halted and unwinds its locals');
  run('1000 QSTOP');
  run('KILL');
  assert(getHalted() === null && localFramesDepth() === 0, 'KILL: a halted recursion is closed and releases its locals');
  clearAllHalted();

  // What a halted program can still see of its locals, for the VAR menu: innermost first, each name once, none when nothing is halted.
  const { haltedLocals, recallVar, storeVar } = await import('../www/src/rpl/ops.js');
  const names = () => haltedLocals().map(([id, v]) => `${id}=${format(v)}`).join(' ');
  run("« 5 7 → a b « a b + HALT a b * » » 'QLV' STO");
  run("« 1 → x « 2 → y « HALT » » » 'QNST' STO");
  run("« 1 → x « 2 → x « HALT » » » 'QSHD' STO");
  assert(names() === '', 'locals: none are listed while no program is halted');
  const t = run('QLV');
  assert(getHalted() !== null && names() === 'a=5 b=7', `locals: a halted program lists its locals in the order it bound them (${names()})`);
  storeVar('a', Real(9));
  assert(recallVar('a') && format(recallVar('a')) === '9.', 'locals: STO into a listed name changes the program\'s own variable');
  let heard = 0;
  const stopHearing = subscribe(() => { heard++; });
  storeVar('a', Real(10));
  assert(heard === 1, 'locals: a store into one from the command line tells the listeners, so the drawer shows the new value');
  stopHearing();
  storeVar('a', Real(9));
  run('CONT', t);
  assert(format(t.peek()) === '63.' && names() === '', `locals: and the halted program goes on with it, then none are left (${format(t.peek())})`);
  run('QNST');
  assert(names() === 'y=2 x=1', `locals: a program halted inside another lists the innermost frame first (${names()})`);
  run('KILL');
  assert(names() === '', 'locals: KILL leaves none');
  run('QSHD');
  assert(names() === 'x=2', `locals: a name bound twice is listed once, as the program sees it (${names()})`);
  run('KILL');
  clearAllHalted();
  varPurge('QLV'); varPurge('QNST'); varPurge('QSHD');
  resetHome();
}

// When the app asks for it, a program that has run for a while pauses so that the page can take a press, and the rest of its line
// waits; a part that can't pause, a dry run and a stepped program run straight through.
{
  const { Entry } = await import('../www/src/ui/entry.js');
  const { setRunSlice, withoutRunSlices } = await import('../www/src/rpl/ops.js');
  const { clearAllHalted, getHalted, varPurge, haltRun } = await import('../www/src/rpl/state.js');
  const { evalScratch } = await import('../www/src/rpl/scratch.js');
  resetHome(); clearAllHalted();
  const s = new Stack();
  const e = new Entry(s);
  const typed = (line) => { e.buffer = line; e.cursor = line.length; e.enter(); return e.error; };
  const text = () => s.snapshot().map((v) => format(v)).join(' ');
  const finish = () => {
    let resumes = 0;
    while (getHalted()?.kind === 'slice' && resumes < 100000) { e.safeRun(() => lookup('CONT').fn(s, e), '', { keepPartial: true }); resumes++; }
    return resumes;
  };
  const clear = () => { clearAllHalted(); while (s.depth) s.pop(); e.error = ''; };
  typed("« 0 1 300000 START 1 + NEXT » 'QSL' STO");

  typed('5 QSL 1 +');
  assert(text() === '300001 5' && !getHalted(), `by default a long program runs straight through (${text()})`);
  clear();

  try {
    setRunSlice(1);
    typed('5 QSL 1 +');
    assert(getHalted()?.kind === 'slice' && getHalted().after?.length === 2 && text() !== '300001 5', `with slices on, a long program pauses part way with the rest of the line owed (${text()})`);
    const resumes = finish();
    assert(resumes > 1 && text() === '300001 5' && !getHalted(), `resuming it again and again finishes the program and then the line, as if it had not paused (${resumes} resumes, ${text()})`);
    clear();

    typed('5 QSL 1 +');
    clearAllHalted();
    assert(!getHalted() && text() !== '300001 5' && s.depth > 0, `stopping a paused program drops the rest of the line and leaves the stack as it was (${text()})`);
    clear();

    typed('1 « QSL » IFT');
    assert(!getHalted() && text() === '300000', `a program run by IFT can't pause, so it runs through (${text()})`);
    clear();

    typed('"QSL" STR→');
    assert(!getHalted() && text() === '300000', `an op that runs a program for its own work, STR→, gets its answer at once rather than a half-run program (${text()})`);
    clear();

    const dry = evalScratch('QSL', { liveItems: s.save() });
    assert(!getHalted() && dry.ok !== false, 'a dry run never pauses');
    clear();

    withoutRunSlices(() => typed('QSL'));
    assert(!getHalted() && text() === '300000', 'withoutRunSlices runs a program through whatever the setting');
    clear();

    typed("« QSL HALT 1 + » 'QSH' STO");
    typed('QSH');
    const during = finish();
    assert(getHalted()?.kind === 'halt' && during > 0, `a program that pauses and then halts for real is left at its HALT (${getHalted()?.kind})`);
    e.safeRun(() => lookup('CONT').fn(s, e), '', { keepPartial: true });
    assert(text() === '300001' && !getHalted(), `and CONT finishes it (${text()})`);
    clear();

    typed('5 QSL 1 +');
    assert(haltRun() && getHalted()?.kind === 'halt' && getHalted().paused && getHalted().after?.length === 2, `Pause halts a running program where it is, as a HALT would, with the rest of the line still owed (${getHalted()?.kind})`);
    assert(!haltRun(), 'and a program already halted has no pause left to take');
    e.safeRun(() => lookup('SST').fn(s, e), '', { keepPartial: true });
    assert(getHalted()?.kind === 'step' && getHalted().after?.length === 2, `SST steps it one word and halts again (${getHalted()?.kind})`);
    e.safeRun(() => lookup('CONT').fn(s, e), '', { keepPartial: true });
    finish();
    assert(text() === '300001 5' && !getHalted(), `CONT then takes it to the end and runs the rest of the line (${text()})`);
    clear();

    typed('5 QSL 1 +');
    haltRun();
    lookup('KILL').fn(s, e);
    assert(!getHalted() && text() !== '300001 5', `KILL after a Pause drops the program and the rest of the line (${text()})`);
    clear();

  } finally {
    setRunSlice(0);
  }
  varPurge('QSL');
  varPurge('QSH');
  resetHome();
}
