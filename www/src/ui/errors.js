import { RUN_TIME_LIMIT_MS } from '../rpl/stack.js';
import { parseTyped, plainPunctuation } from '../rpl/parser.js';
import { getBinaryBase } from '../rpl/state.js';

const CORE_MESSAGES = Object.freeze([
  'Too few arguments', 'Bad argument type', 'Bad argument value', 'Infinite result',
  'Invalid dimension', 'Inconsistent units', 'Undefined local name', 'Undefined name',
  'CAS not ready', 'Interrupted', 'EVAL recursion too deep', 'Insufficient memory', 'Nonexistent ΣDAT', 'Nonexistent alarm', 'Undefined result',
]);

const NUMBER_WORDS = Object.freeze(['no values', 'one value', 'two values', 'three values', 'four values', 'five values', 'six values', 'seven values', 'eight values', 'nine values']);

// Counts in one sentence are all words or all digits, so 12 is never set beside four.
const valuesText = (n, digits = false) => (digits ? null : NUMBER_WORDS[n]) ?? `${n} value${n === 1 ? '' : 's'}`;

export function parseErrorMessage(message) {
  const text = String(message ?? '').trim();
  const parts = text.split(': ');
  const at = parts.findIndex((p) => CORE_MESSAGES.some((core) => p.startsWith(core)));
  if (at < 0) {
    const raisedAt = parts.indexOf('DOERR') + 1;
    return raisedAt ? { commands: parts.slice(0, raisedAt), command: 'DOERR', core: parts.slice(raisedAt).join(': '), detail: '' } : { commands: [], command: null, core: text, detail: '' };
  }
  const core = CORE_MESSAGES.find((c) => parts[at].startsWith(c));
  const trailing = parts[at].slice(core.length).trim();
  const detail = [trailing, ...parts.slice(at + 1)].filter(Boolean).join(': ');
  const commands = parts.slice(0, at);
  return { commands, command: commands.at(-1) ?? null, core, detail };
}

// A unit object, not an unit object: a u that sounds like you takes a.
const article = (noun) => (/^(?!uni)[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

const sentence = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`);

const evaluates = (c) => ['EVAL', '→NUM'].includes(c.command);

// A structure's manual page diagrams its words, not the values it takes, so its banner counts and leaves the diagram out.
const STRUCTURES = new Set(['IF', 'CASE', 'WHILE', 'DO', 'START', 'FOR', 'STEP', '→']);

export const ERROR_KINDS = Object.freeze({
  raised: {
    match: (p) => p.command === 'DOERR' && !['Too few arguments', 'Bad argument type'].includes(p.core),
    title: (c) => sentence(c.detail ? `${c.core}: ${c.detail}` : c.core),
    detail: () => 'The program raised this error itself, with DOERR.',
    fixes: () => [{ id: 'explain', label: 'Explain' }],
  },
  tooFew: {
    match: (p) => p.core === 'Too few arguments',
    title: (c) => {
      const cmd = c.command ?? 'That command';
      if (!c.args) return `${cmd} needs more values than the stack holds.`;
      const digits = Math.max(c.args, c.seenDepth) >= NUMBER_WORDS.length;
      return `${cmd} needs ${valuesText(c.args, digits)}; the stack ${c.seenDepth === c.depth ? 'has' : 'had'} ${c.seenDepth ? valuesText(c.seenDepth, digits) : 'none'}.`;
    },
    detail: (c) => {
      const put = `Put the missing ${c.args - c.seenDepth === 1 ? 'value' : 'values'} on the stack first, then run it again.${c.formula ? ` Or, in quotes, it is a formula, '${c.formula}', that EVAL works out.` : ''}`;
      return c.signature ? `${sentence(`${c.command} takes ${c.signature}`)} ${put}` : put;
    },
    fixes: (c) => [
      ...(c.formula ? [{ id: 'formula', label: 'Evaluate as a formula', arg: c.formula }] : []),
      { id: 'edit-line', label: c.hasLine ? 'Fix the line' : 'Type a value' }, ...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []),
    ],
  },
  badType: {
    match: (p) => p.core === 'Bad argument type',
    title: (c) => {
      const cmd = c.command ?? 'That command';
      if (c.culprits.length === 1) return `${cmd} can't use ${article(c.culprits[0].type.toLowerCase())}.`;
      if (c.args === 2 && c.culprits.length === 2) return `${cmd} can't combine ${article(c.culprits[1].type.toLowerCase())} with ${article(c.culprits[0].type.toLowerCase())}.`;
      return `${cmd} can't use ${c.args === 1 ? 'that argument' : 'those arguments'}.`;
    },
    detail: (c) => {
      const takes = c.signature ? sentence(`${c.command} takes ${c.signature}`) : '';
      const seen = c.culprits.map((x) => `level ${x.level} is ${x.text}`).join(', ');
      const want = c.detail ? ` (${c.detail})` : '';
      const here = seen ? ` ${sentence(`Here ${seen}${want}`)}` : want ? ` ${sentence(want.trim())}` : '';
      return `${takes}${here}`.trim() || 'The value on the stack is the wrong kind of object for this command.';
    },
    fixes: (c) => [
      ...(c.onStack ? [{ id: 'drop', label: 'Drop level 1' }] : []),
      ...(c.onStack && c.depth >= 2 && c.args !== 1 ? [{ id: 'swap', label: 'Swap levels 1 and 2' }] : []),
      ...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []),
      { id: 'explain', label: 'Explain' },
    ],
  },
  badValue: {
    match: (p) => p.core === 'Bad argument value',
    title: (c) => `${c.command ?? 'That command'} can't take that value.`,
    detail: (c) => `The argument is the right kind of object, but its value is outside what ${c.command ?? 'the command'} accepts${c.detail ? ` (${c.detail})` : ''}.${c.signature ? ` ${sentence(`${c.command} takes ${c.signature}`)}` : ''}`,
    fixes: (c) => [...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []), { id: 'explain', label: 'Explain' }],
  },
  infinite: {
    match: (p) => p.core === 'Infinite result',
    title: (c) => `${c.command ?? 'That'} would give an infinite result.`,
    detail: () => 'Division by zero, or a function at its pole. The stack is back as it was.',
    fixes: () => [{ id: 'explain', label: 'Explain' }],
  },
  zeroOverZero: {
    match: (p) => p.core === 'Undefined result' && p.command === '/',
    title: () => '0/0 has no value.',
    detail: () => 'Zero divided by zero is undefined, as on the HP. The stack is back as it was.',
    fixes: () => [{ id: 'explain', label: 'Explain' }],
  },
  undefinedResult: {
    match: (p) => p.core === 'Undefined result',
    title: (c) => (evaluates(c) ? 'That expression has no value.' : `${c.command ?? 'That function'} has no value there.`),
    detail: (c) => `${evaluates(c) ? 'Part of it, such as a 0/0, is undefined' : "The argument is outside the function's domain"}. The stack is back as it was.`,
    fixes: (c) => [...(c.command && !evaluates(c) ? [{ id: 'help', label: `${c.command} reference` }] : []), { id: 'explain', label: 'Explain' }],
  },
  dimension: {
    match: (p) => p.core === 'Invalid dimension',
    title: (c) => `${c.command ?? 'That command'}: the sizes don't match.`,
    detail: (c) => sentence(`${c.culprits.some((x) => x.type === 'List') ? 'Lists need the same number of items' : 'Vectors and matrices need compatible dimensions'} for ${c.command ?? 'this'}${c.culprits.length ? `. Here ${c.culprits.map((x) => `level ${x.level} is ${x.text}`).join(', ')}` : ''}`),
    fixes: (c) => [...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []), { id: 'explain', label: 'Explain' }],
  },
  units: {
    match: (p) => p.core === 'Inconsistent units',
    title: () => "Those units don't match.",
    detail: (c) => `${c.command ?? 'Unit arithmetic'} needs compatible dimensions, like m and ft, not m and s.`,
    fixes: () => [{ id: 'help', label: 'CONVERT reference', arg: 'CONVERT' }, { id: 'explain', label: 'Explain' }],
  },
  unknownConstant: {
    match: (p) => p.core === 'Undefined name' && p.command === 'CONST',
    title: (c) => `${c.detail || 'That'} isn't one of the HP's constants.`,
    detail: () => 'CONST knows the Constants Library by name, such as c, g, NA and R∞, and capitals count.',
    fixes: (c) => [{ id: 'help', label: 'CONST reference' }, ...(c.hasLine ? [{ id: 'edit-line', label: 'Fix the line' }] : [])],
  },
  undefinedName: {
    match: (p) => p.core.startsWith('Undefined'),
    title: (c) => `Nothing called ${c.detail || 'that'} is stored here.`,
    detail: () => 'Names are looked up in this directory and the ones above it. Store a value first, for example 42 `X` STO, or check the spelling.',
    fixes: () => [{ id: 'vars', label: 'Open Variables' }],
  },
  casLoading: {
    match: (p) => p.core === 'CAS not ready',
    title: () => 'The algebra engine is still loading.',
    detail: () => 'Giac loads in the background after start-up. Try again in a moment; nothing was lost.',
    fixes: () => [{ id: 'retry', label: 'Try again' }],
  },
  interrupted: {
    match: (p) => p.core === 'Interrupted',
    title: (c) => `${c.command ?? 'That command'} ran for ${RUN_TIME_LIMIT_MS / 1000} seconds, so it was stopped.`,
    detail: () => "The page can't respond while a command runs, so a command that runs this long is stopped. The stack is back as it was. In a program, look for a loop that never ends.",
    fixes: () => [{ id: 'explain', label: 'Explain' }],
  },
  recursion: {
    match: (p) => p.core === 'EVAL recursion too deep',
    title: (c) => `${c.command && !evaluates(c) ? c.command : 'A program'} called itself too many times, so it was stopped.`,
    detail: () => 'A program can call itself a few thousand levels deep, and this one went past that. Check that a test ends the recursion, such as IF n 0 == THEN … END.',
    fixes: () => [{ id: 'explain', label: 'Explain' }],
  },
  memory: {
    match: (p) => p.core === 'Insufficient memory',
    title: (c) => `${c.command ?? 'That command'} would make a result too big to hold.`,
    detail: () => 'The result would pass what the page keeps in memory: a million digits in a number, a million entries in an array or list, or a polynomial of degree 1000. The stack is back as it was. Try a smaller size.',
    fixes: (c) => [...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []), { id: 'explain', label: 'Explain' }],
  },
  syntax: {
    match: (p) => /^(Invalid algebraic|Bad complex literal|Syntax error|Unknown token|Malformed|Unexpected|Missing object|Empty parse|Expected one object|Text after END|(IF|IFERR|WHILE|FOR|START|CASE|DO)\b)/.test(p.core),
    title: () => "That line doesn't read as RPL.",
    detail: (c) => {
      if (c.hex) return `${c.hex.word} has hex digits, but a # number reads in the current base${c.base ? `, ${c.base}` : ''}, as on the HP. ${c.hex.word}h reads as hex. The line is still in the command line to fix.`;
      return `${c.message}.${c.formula ? ` In quotes it is a formula, '${c.formula}', that EVAL works out.` : ''} The line is still in the command line to fix.`;
    },
    fixes: (c) => [
      ...(c.formula ? [{ id: 'formula', label: 'Evaluate as a formula', arg: c.formula }] : []),
      ...(c.hex ? [{ id: 'line', label: `Read as hex, ${c.hex.word}h`, arg: c.hex.line }] : []),
      { id: 'edit-line', label: 'Fix the line' }, { id: 'explain', label: 'Explain' },
    ],
  },
  sigmaData: {
    match: (p) => p.core === 'Nonexistent ΣDAT',
    title: (c) => `${c.command ?? 'That command'} reads its data from ΣDAT, and there is none.`,
    detail: (c) => (c.storesTop
      ? `Level 1 holds ${c.top.text}, but as on the HP the statistics commands read only ΣDAT. Store it there with STOΣ, or add points with Σ+.`
      : 'Add points with Σ+, or store a matrix of data with STOΣ.'),
    fixes: (c) => [
      ...(c.storesTop ? [{ id: 'stosigma', label: 'Store level 1 in ΣDAT' }] : []),
      ...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []),
      { id: 'explain', label: 'Explain' },
    ],
  },
  other: {
    match: () => true,
    title: (c) => c.message,
    detail: () => '',
    fixes: () => [{ id: 'explain', label: 'Explain' }],
  },
});

// A matrix, vector or list among a call's arguments, det([[1,2],[3,4]]), is part of the formula; one outside the parentheses is RPL.
function arraysInCalls(text) {
  let parens = 0, brackets = 0;
  for (const c of text) {
    if ('[{'.includes(c)) { if (!parens && !brackets) return false; brackets++; }
    else if (']}'.includes(c)) { if (--brackets < 0) return false; }
    else if (!brackets && c === '(') parens++;
    else if (!brackets && c === ')') parens--;
  }
  return brackets === 0;
}

// A line typed the way other calculators take it, 2^10 or e^2, is a formula once quoted; a phone's × and ÷ are * and /.
export function formulaOf(line) {
  const text = plainPunctuation(String(line ?? '').trim());
  if (!/[\^*/+\-√=<>(]/.test(text) || /['`"«»]/.test(text) || !arraysInCalls(text)) return '';
  try { return parseTyped(`'${text}'`).length === 1 ? text : ''; } catch { return ''; }
}

const BASE_NAMES = Object.freeze({ d: 'DEC', o: 'OCT', b: 'BIN' });

// As on the HP, #ff reads in the current base, so in DEC its hex digits need the h suffix: the line with each such number as hex.
export function hexLineOf(line) {
  const text = String(line ?? '');
  const words = text.split(/(\s+)/);
  const hexed = words.map((w) => (/^#[0-9a-f]*[a-f][0-9a-f]*$/i.test(w) ? `${w}h` : w));
  if (hexed.join('') === text) return null;
  try { parseTyped(hexed.join('')); } catch { return null; }
  return { line: hexed.join(''), word: words.find((w, i) => hexed[i] !== w) };
}

const LINE_FIX = Object.freeze({ id: 'edit-line', label: 'Fix the line' });

// Any error from a typed line can bring the line back, after the error's own fixes and before its reference.
function withLineFix(fixes, hasLine) {
  if (!hasLine || fixes.some((f) => f.id === 'edit-line' || f.id === 'retry')) return fixes;
  const at = fixes.findIndex((f) => f.id === 'help' || f.id === 'explain');
  return at < 0 ? [...fixes, LINE_FIX] : [...fixes.slice(0, at), LINE_FIX, ...fixes.slice(at)];
}

export function describeError(message, { failure = null, stack = [], depth = 0, line = '', describe, commandInfo = () => null } = {}) {
  const parsed = parseErrorMessage(message);
  const [kind, spec] = Object.entries(ERROR_KINDS).find(([, k]) => k.match(parsed));
  const command = parsed.command ?? failure?.op ?? null;
  const info = command ? commandInfo(command) : null;
  const signature = STRUCTURES.has(command) ? '' : info?.signature ?? '';
  const failedHere = failure && (failure.op == null || !parsed.commands.length || parsed.commands.includes(failure.op));
  const seenDepth = failedHere && failure.depth != null ? failure.depth : depth;
  const args = info?.inputs ?? (failedHere && failure.missing != null ? seenDepth + failure.missing : null);
  const seen = failure && (!parsed.command || failure.op === parsed.command) ? failure.levels : [];
  const count = Math.min(seen.length, args ?? 2);
  const onStack = count > 0 && seen.slice(0, count).every((v, i) => stack[i] === v);
  const culprits = seen.slice(0, count).map((value, i) => ({ level: i + 1, ...describe(value) }));
  const top = stack.length ? describe(stack[0]) : null;
  const storesTop = /^(Vector|Matrix)$/.test(top?.type) && !!command && !['RCLΣ', 'Σ-'].includes(command);
  const formula = kind === 'syntax' || kind === 'tooFew' ? formulaOf(line) : '';
  const hex = kind === 'syntax' ? hexLineOf(line) : null;
  const ctx = { ...parsed, message: String(message ?? ''), command, signature, args, depth, seenDepth, culprits, onStack, top, storesTop, formula, hex, base: BASE_NAMES[getBinaryBase()], hasLine: !!String(line).trim() };
  return {
    kind,
    command,
    title: spec.title(ctx),
    detail: spec.detail(ctx),
    fixes: withLineFix(spec.fixes(ctx), ctx.hasLine),
    // A too-few error is the stack's depth, not a value's fault, so no level is marked as the culprit.
    culpritLevels: onStack && kind !== 'tooFew' ? culprits.map((c) => c.level) : [],
  };
}
