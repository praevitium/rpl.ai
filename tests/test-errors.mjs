import { assert } from './helpers.mjs';
import { ERROR_KINDS, parseErrorMessage, describeError } from '../www/src/ui/errors.js';
import { errorBannerHtml, haltedBannerHtml } from '../www/src/ui/banner.js';
import { describeValue } from '../www/src/ui/display.js';
import { Str, Real, Name, Vector, RList } from '../www/src/rpl/types.js';

{
  const p = parseErrorMessage('SIN: Bad argument type: expected real, got string');
  assert(p.command === 'SIN' && p.core === 'Bad argument type' && p.detail === 'expected real, got string',
    'parseErrorMessage: command, core message and detail split apart');
  const nested = parseErrorMessage('BAD: -: Bad argument type');
  assert(nested.command === '-' && nested.commands.join(',') === 'BAD,-',
    'parseErrorMessage: the innermost command is the one that failed');
  const syntax = parseErrorMessage('Invalid algebraic: Unexpected end of expression');
  assert(syntax.command === null && syntax.core === 'Invalid algebraic: Unexpected end of expression',
    'parseErrorMessage: a message with no known core keeps its text');
}

const COMMANDS = {
  SIN: { signature: 'z → sin z', inputs: 1 },
  '+': { signature: 'z1 z2 → z1 + z2', inputs: 2 },
  '/': { signature: 'z1 z2 → z1 / z2', inputs: 2 },
  DROP: { signature: 'obj → ', inputs: 1 },
  DUPN: { signature: 'obj1 obj2 … obji–1 obji n → obj1 obj2 …' },
};
const ctx = (extra = {}) => ({ describe: describeValue, commandInfo: (n) => COMMANDS[n] ?? null, ...extra });

{
  const zero = describeError('/: Undefined result', ctx({ line: '0 0 /' }));
  assert(zero.title === '0/0 has no value.' && /Zero divided by zero/.test(zero.detail),
    'the 0/0 banner names 0/0, where it said / has no value there and spoke of one argument outside a domain');
  const expr = describeError('EVAL: Undefined result', ctx());
  assert(expr.title === 'That expression has no value.' && !expr.fixes.some((f) => f.id === 'help'),
    "an expression's Undefined result is the expression's, not EVAL's, with no EVAL reference to offer");
  assert(describeError('LNP1: Undefined result', ctx()).title === 'LNP1 has no value there.',
    'a function outside its domain keeps its own banner');
}

{
  const constant = describeError('CONST: Undefined name: NOPE', ctx({ line: "'NOPE' CONST" }));
  assert(constant.title === "NOPE isn't one of the HP's constants." && constant.fixes[0].label === 'CONST reference' && !constant.fixes.some((f) => f.id === 'vars'),
    "CONST's banner for an unknown constant names it and offers the CONST reference, where it said nothing called that was stored and offered Variables");
}

{
  const samples = {
    raised: 'EVAL: DOERR: Disk full',
    tooFew: '+: Too few arguments',
    badType: 'SIN: Bad argument type: expected real, got string',
    badValue: 'ASIN: Bad argument value',
    infinite: '/: Infinite result',
    zeroOverZero: '/: Undefined result',
    undefinedResult: 'LNP1: Undefined result',
    dimension: '+: Invalid dimension',
    units: '+: Inconsistent units',
    unknownConstant: 'CONST: Undefined name: NOPE',
    undefinedName: 'Undefined name: FOO',
    casLoading: 'FACTOR: CAS not ready',
    interrupted: 'EVAL: Interrupted',
    syntax: 'Invalid algebraic: Unexpected end of expression',
    sigmaData: 'MEAN: Nonexistent ΣDAT',
    other: 'Something new went wrong',
  };
  assert(Object.keys(samples).sort().join() === Object.keys(ERROR_KINDS).sort().join(),
    'every error kind has a sample message in this test');
  for (const [kind, message] of Object.entries(samples)) {
    for (const line of ['', 'the line']) {
      const d = describeError(message, ctx({ line }));
      assert(d.kind === kind, `describeError: "${message}" is a ${kind} error`);
      assert(d.title && !d.title.includes('undefined') && d.fixes.length >= 1,
        `describeError: ${kind} has a title and at least one fix${line ? ' when the line is kept' : ''}`);
      const html = errorBannerHtml(d);
      assert(html.includes('role="alert"') && html.includes('data-fix='), `errorBannerHtml: ${kind} renders its fixes`);
    }
  }
}

{
  const typed = describeError('Syntax error near ^10', ctx({ line: '2^10' }));
  assert(typed.fixes[0].id === 'formula' && typed.fixes[0].arg === '2^10' && typed.fixes[0].label === 'Evaluate as a formula'
    && /In quotes it is a formula, '2\^10', that EVAL works out/.test(typed.detail),
    'syntax banner: 2^10 typed without quotes leads with evaluating it as a formula');
  assert(['ZZQ?', '2^10 3', "'x' 2^", '« 2^10 »'].every((line) => !describeError('Syntax error near x', ctx({ line })).fixes.some((f) => f.id === 'formula')),
    'syntax banner: no formula fix for a line with no operator, one that is no single formula, or one already quoted');
  const { setUserFlag, clearUserFlag } = await import('../www/src/rpl/state.js');
  setUserFlag(-51);
  const comma = describeError('Syntax error near ^2', ctx({ line: '2,5^2' }));
  clearUserFlag(-51);
  assert(comma.fixes[0].id === 'formula' && comma.fixes[0].arg === '2,5^2',
    'syntax banner: with flag -51 a formula typed with the comma fraction mark, 2,5^2, gets the formula fix too, where it read as no formula');
}

{
  const hex = describeError('Malformed d-base integer: #ffd', ctx({ line: '#ff 10 +' }));
  assert(hex.kind === 'syntax' && hex.fixes[0].id === 'line' && hex.fixes[0].arg === '#ffh 10 +' && hex.fixes[0].label === 'Read as hex, #ffh'
    && /^#ff has hex digits, but a # number reads in the current base, DEC, as on the HP\. #ffh reads as hex\./.test(hex.detail),
    `syntax banner: #ff typed in DEC offers reading it as hex, #ffh, where it spoke of a #ffd nobody typed (${hex.detail})`);
  assert(['#19 2 +', '#ffh 1 +', 'ZZQ?', '"#ff"'].every((line) => !describeError('Syntax error near x', ctx({ line })).fixes.some((f) => f.id === 'line')),
    'syntax banner: no hex fix for a # number with only decimal digits, one already in hex, or no # number at all');
}

{
  const hi = Str('hi');
  const onStack =describeError('SIN: Bad argument type: expected real, got string', ctx({ failure: { op: 'SIN', levels: [hi] }, stack: [hi], depth: 1 }));
  assert(onStack.title === "SIN can't use a string." && onStack.culpritLevels.join() === '1',
    'describeError: a bad argument still on the stack is named and outlined');
  assert(onStack.detail.includes('SIN takes z → sin z') && onStack.detail.includes('level 1 is the string "hi"'),
    'describeError: the detail quotes the stack diagram and what level 1 held');
  assert(onStack.fixes[0].id === 'drop', 'describeError: the first fix drops the culprit');

  const typed = describeError('SIN: Bad argument type: expected real, got string', ctx({ failure: { op: 'SIN', levels: [hi] }, stack: [], depth: 0, line: '"hi" SIN' }));
  assert(typed.culpritLevels.length === 0 && typed.fixes[0].id === 'edit-line',
    'describeError: when the rollback removed the argument, the fix is the kept line');

  const x = Name('X');
  const two = Real(2);
  const both = describeError('+: Bad argument type', ctx({ failure: { op: '+', levels: [x, two] }, stack: [x, two], depth: 2 }));
  assert(both.title === "+ can't combine a real number with a name." && both.fixes.some((f) => f.id === 'swap'),
    'describeError: a two-argument command names both and offers SWAP');
  assert(!both.detail.includes('..'), 'describeError: an HP real like "2." does not end the sentence with two periods');

  const few = describeError('+: Too few arguments', ctx({ depth: 1 }));
  assert(few.title === '+ needs two values; the stack has one value.', 'describeError: too few arguments counts what is missing');
  const rolledBack = describeError('DROP: Too few arguments', ctx({ failure: { op: 'DROP', levels: [], depth: 0 }, depth: 4 }));
  assert(rolledBack.title === 'DROP needs one value; the stack had none.',
    'describeError: DROP after CLEAR counts the stack DROP saw, not the four values the rollback put back');
  const inProgram = describeError('P: DROP: Too few arguments', ctx({ failure: { op: 'P', levels: [], depth: 0 }, depth: 2 }));
  assert(inProgram.title === 'DROP needs one value; the stack had none.',
    'describeError: DROP failing inside program P counts the stack it saw');
  const stale = describeError('DROP: Too few arguments', ctx({ failure: { op: 'SIN', levels: [], depth: 3 }, depth: 0 }));
  assert(stale.title === 'DROP needs one value; the stack has none.',
    "describeError: DROP ignores the depth recorded for another command's failure");
}

{
  const { Stack } = await import('../www/src/rpl/stack.js');
  const s = new Stack();
  s.push(Str('hi'));
  let thrown = null;
  try { s.popN(2); } catch (e) { thrown = e; }
  assert(thrown?.missing === 1, 'Stack.popN: a too-few error says how many more values it wanted');
  const missingOf = (fn) => { try { fn(); } catch (e) { return e.missing; } return null; };
  const one = new Stack(); one.push(Str('x'));
  assert(missingOf(() => one.dropN(3)) === 2 && missingOf(() => one.swap()) === 1 && missingOf(() => one.pick(4)) === 3 && missingOf(() => new Stack().dup()) === 1,
    'Stack: DROPN, SWAP, PICK and DUP say how many values they lack too, so their banners count, where DROPN said it needs more values than the stack holds');
  const xroot = describeError('XROOT: Too few arguments', ctx({ failure: { op: 'XROOT', levels: [Str('hi')], depth: 1, missing: 1 }, depth: 1 }));
  assert(xroot.title === 'XROOT needs two values; the stack has one value.' && xroot.detail === 'Put the missing value on the stack first, then run it again.',
    `describeError: a command whose manual page gives no input count counts from what the stack lacked, where it said XROOT needs more values than the stack holds (${xroot.title})`);
  const swap = describeError('+: Too few arguments', ctx({ depth: 0 }));
  assert(/Put the missing values on/.test(swap.detail), 'describeError: two missing values are values');
  const hi = Str('hi');
  const short = describeError('XROOT: Too few arguments', ctx({ failure: { op: 'XROOT', levels: [hi], depth: 1, missing: 1 }, stack: [hi], depth: 1 }));
  assert(short.culpritLevels.length === 0, 'describeError: a too-few error marks no level as the culprit, where level 1 read "this one" though nothing was wrong with it');
  const dupn = describeError('DUPN: Too few arguments', ctx({ failure: { op: 'DUPN', levels: [], depth: 1, missing: 3 }, depth: 1 }));
  assert(dupn.detail === 'DUPN takes obj1 obj2 … obji–1 obji n → obj1 obj2 … Put the missing values on the stack first, then run it again.',
    `describeError: a clipped stack diagram ends at its ellipsis, where the banner read obj2 ...…. (${dupn.detail})`);
}

{
  const html = haltedBannerHtml({ kind: 'prompt', prompt: 'Enter R2 in kΩ', programHtml: '« R1 <mark>HALT</mark> »' });
  assert(html.includes('Enter R2 in kΩ') && html.includes('data-bn="cont"') && html.includes('data-bn="sst"') && html.includes('data-bn="into"') && html.includes('data-bn="kill"'),
    'haltedBannerHtml: shows the PROMPT text and Continue, Step, Step into and Stop');
  assert(haltedBannerHtml({ kind: 'halt', prompt: '<b>' }).includes('&lt;b&gt;'), 'haltedBannerHtml: prompt text is escaped');
}

{
  const own = describeError('EVAL: DOERR: Disk full: drive A', ctx());
  const stop = describeError('EVAL: DOERR: Interrupted', ctx());
  const sized = describeError('DOERR: Invalid dimension', ctx());
  assert(own.kind === 'raised' && own.title === 'Disk full: drive A.' && /with DOERR/.test(own.detail),
    `describeError: a program's own DOERR message is the title, without the EVAL: DOERR: it showed (${own.title})`);
  assert(stop.kind === 'raised' && stop.title === 'Interrupted.' && sized.kind === 'raised' && sized.title === 'Invalid dimension.',
    'describeError: "" DOERR no longer says the program ran for 10 seconds, and #501h DOERR no longer explains vector sizes');
  assert(describeError('DOERR: Too few arguments', ctx()).kind === 'tooFew' && describeError('EVAL: Interrupted', ctx()).kind === 'interrupted',
    'describeError: DOERR with nothing on the stack is still too few arguments, and the time limit still reads as interrupted');
}

{
  const v = Vector([Real(1), Real(2), Real(3)]);
  const fixIds = (d) => d.fixes.map((f) => f.id).join(',');
  const withData = describeError('MEAN: Nonexistent ΣDAT', ctx({ stack: [v], depth: 1 }));
  const bare = describeError('MEAN: Nonexistent ΣDAT', ctx());
  const recall = describeError('RCLΣ: Nonexistent ΣDAT', ctx({ stack: [v], depth: 1 }));
  assert(withData.kind === 'sigmaData' && fixIds(withData) === 'stosigma,help,explain' && /a vector of 3/.test(withData.detail) && /MEAN reads its data from ΣDAT/.test(withData.title),
    `describeError: a statistics command without ΣDAT names ΣDAT and offers to store level 1 there when it holds an array (${withData.detail})`);
  assert(fixIds(bare) === 'help,explain' && fixIds(recall) === 'help,explain',
    'describeError: no Store level 1 fix with nothing to store, or for RCLΣ, which only reads ΣDAT back');
}

{
  const short = RList([Real(1), Real(2)]), long = RList([Real(1), Real(2), Real(3)]);
  const lists = describeError('ADD: Invalid dimension', ctx({ failure: { op: 'ADD', levels: [long, short] }, stack: [long, short], depth: 2 }));
  const arrays = describeError('+: Invalid dimension', ctx({ failure: { op: '+', levels: [Vector([Real(1)])] }, stack: [], depth: 0 }));
  assert(lists.kind === 'dimension' && /^Lists need the same number of items for ADD/.test(lists.detail) && /^Vectors and matrices/.test(arrays.detail),
    `describeError: a size error over lists speaks of their items, not of vectors and matrices (${lists.detail})`);
}
