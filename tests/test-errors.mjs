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
};
const ctx = (extra = {}) => ({ describe: describeValue, commandInfo: (n) => COMMANDS[n] ?? null, ...extra });

{
  const samples = {
    tooFew: '+: Too few arguments',
    badType: 'SIN: Bad argument type: expected real, got string',
    badValue: 'ASIN: Bad argument value',
    infinite: '/: Infinite result',
    undefinedResult: 'LNP1: Undefined result',
    dimension: '+: Invalid dimension',
    units: '+: Inconsistent units',
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
  const hi = Str('hi');
  const onStack = describeError('SIN: Bad argument type: expected real, got string', ctx({ failure: { op: 'SIN', levels: [hi] }, stack: [hi], depth: 1 }));
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
  const html = haltedBannerHtml({ kind: 'prompt', prompt: 'Enter R2 in kΩ', programHtml: '« R1 <mark>HALT</mark> »' });
  assert(html.includes('Enter R2 in kΩ') && html.includes('data-bn="cont"') && html.includes('data-bn="sst"') && html.includes('data-bn="into"') && html.includes('data-bn="kill"'),
    'haltedBannerHtml: shows the PROMPT text and Continue, Step, Step into and Stop');
  assert(haltedBannerHtml({ kind: 'halt', prompt: '<b>' }).includes('&lt;b&gt;'), 'haltedBannerHtml: prompt text is escaped');
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
