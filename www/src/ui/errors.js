const CORE_MESSAGES = Object.freeze([
  'Too few arguments', 'Bad argument type', 'Bad argument value', 'Infinite result',
  'Invalid dimension', 'Inconsistent units', 'Undefined local name', 'Undefined name',
  'CAS not ready',
]);

const NUMBER_WORDS = Object.freeze(['no values', 'one value', 'two values', 'three values', 'four values', 'five values']);

const valuesText = (n) => NUMBER_WORDS[n] ?? `${n} values`;

export function parseErrorMessage(message) {
  const text = String(message ?? '').trim();
  const parts = text.split(': ');
  const at = parts.findIndex((p) => CORE_MESSAGES.some((core) => p.startsWith(core)));
  if (at < 0) return { commands: [], command: null, core: text, detail: '' };
  const core = CORE_MESSAGES.find((c) => parts[at].startsWith(c));
  const trailing = parts[at].slice(core.length).trim();
  const detail = [trailing, ...parts.slice(at + 1)].filter(Boolean).join(': ');
  const commands = parts.slice(0, at);
  return { commands, command: commands.at(-1) ?? null, core, detail };
}

const article = (noun) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

const sentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

function levelWord(level) { return `level ${level}`; }

export const ERROR_KINDS = Object.freeze({
  tooFew: {
    match: (p) => p.core === 'Too few arguments',
    title: (c) => {
      const cmd = c.command ?? 'That command';
      return c.args ? `${cmd} needs ${valuesText(c.args)}; the stack has ${c.depth ? valuesText(c.depth) : 'none'}.` : `${cmd} needs more values than the stack holds.`;
    },
    detail: (c) => (c.signature ? `${c.command} takes ${c.signature}. Put the missing value on the stack first, then run it again.` : 'Put the missing values on the stack first, then run it again.'),
    fixes: (c) => [{ id: 'edit-line', label: c.hasLine ? 'Fix the line' : 'Type a value' }, ...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : [])],
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
      const takes = c.signature ? `${c.command} takes ${c.signature}.` : '';
      const seen = c.culprits.map((x) => `${levelWord(x.level)} is ${x.text}`).join(', ');
      const want = c.detail ? ` (${c.detail})` : '';
      const here = seen ? ` ${sentence(`Here ${seen}${want}`)}` : want ? ` ${sentence(want.trim())}` : '';
      return `${takes}${here}`.trim() || 'The value on the stack is the wrong kind of object for this command.';
    },
    fixes: (c) => [
      ...(c.onStack ? [{ id: 'drop', label: `Drop ${levelWord(1)}` }] : c.hasLine ? [{ id: 'edit-line', label: 'Fix the line' }] : []),
      ...(c.onStack && c.depth >= 2 && c.args !== 1 ? [{ id: 'swap', label: 'Swap levels 1 and 2' }] : []),
      ...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []),
      { id: 'explain', label: 'Explain' },
    ],
  },
  badValue: {
    match: (p) => p.core === 'Bad argument value',
    title: (c) => `${c.command ?? 'That command'} can't take that value.`,
    detail: (c) => `The argument is the right kind of object, but its value is outside what ${c.command ?? 'the command'} accepts${c.detail ? ` (${c.detail})` : ''}.${c.signature ? ` ${c.command} takes ${c.signature}.` : ''}`,
    fixes: (c) => [...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []), { id: 'explain', label: 'Explain' }],
  },
  infinite: {
    match: (p) => p.core === 'Infinite result',
    title: (c) => `${c.command ?? 'That'} would give an infinite result.`,
    detail: () => 'Division by zero, or a function at its pole. The stack is back as it was.',
    fixes: (c) => [...(c.hasLine ? [{ id: 'edit-line', label: 'Fix the line' }] : []), { id: 'explain', label: 'Explain' }],
  },
  dimension: {
    match: (p) => p.core === 'Invalid dimension',
    title: (c) => `${c.command ?? 'That command'}: the sizes don't match.`,
    detail: (c) => sentence(`Vectors and matrices need compatible dimensions for ${c.command ?? 'this'}${c.culprits.length ? `. Here ${c.culprits.map((x) => `${levelWord(x.level)} is ${x.text}`).join(', ')}` : ''}`),
    fixes: (c) => [...(c.command ? [{ id: 'help', label: `${c.command} reference` }] : []), { id: 'explain', label: 'Explain' }],
  },
  units: {
    match: (p) => p.core === 'Inconsistent units',
    title: () => "Those units don't match.",
    detail: (c) => `${c.command ?? 'Unit arithmetic'} needs compatible dimensions, like m and ft, not m and s.`,
    fixes: () => [{ id: 'help', label: 'CONVERT reference', arg: 'CONVERT' }, { id: 'explain', label: 'Explain' }],
  },
  undefinedName: {
    match: (p) => p.core.startsWith('Undefined'),
    title: (c) => `Nothing called ${c.detail || 'that'} is stored here.`,
    detail: () => 'Names are looked up in this directory and the ones above it. Store a value first, for example 42 `X` STO, or check the spelling.',
    fixes: (c) => [{ id: 'vars', label: 'Open Variables' }, ...(c.hasLine ? [{ id: 'edit-line', label: 'Fix the line' }] : [])],
  },
  casLoading: {
    match: (p) => p.core === 'CAS not ready',
    title: () => 'The algebra engine is still loading.',
    detail: () => 'Giac loads in the background after start-up. Try again in a moment; nothing was lost.',
    fixes: () => [{ id: 'retry', label: 'Try again' }],
  },
  syntax: {
    match: (p) => /^(Invalid algebraic|Bad complex literal|Syntax error|Unknown token|Malformed|Unexpected|Missing object|Empty parse|Expected one object|Text after END|(IF|IFERR|WHILE|FOR|START|CASE|DO)\b)/.test(p.core),
    title: () => "That line doesn't read as RPL.",
    detail: (c) => `${c.message}. The line is still in the command line to fix.`,
    fixes: () => [{ id: 'edit-line', label: 'Fix the line' }, { id: 'explain', label: 'Explain' }],
  },
  other: {
    match: () => true,
    title: (c) => c.message,
    detail: () => '',
    fixes: () => [{ id: 'explain', label: 'Explain' }],
  },
});

export function describeError(message, { failure = null, stack = [], depth = 0, line = '', describe, commandInfo = () => null } = {}) {
  const parsed = parseErrorMessage(message);
  const kind = Object.entries(ERROR_KINDS).find(([, k]) => k.match(parsed))[0];
  const command = parsed.command ?? failure?.op ?? null;
  const info = command ? commandInfo(command) : null;
  const signature = info?.signature ?? '';
  const args = info?.inputs ?? null;
  const seen = failure && (!parsed.command || failure.op === parsed.command) ? failure.levels : [];
  const count = Math.min(seen.length, args ?? Math.min(seen.length, 2));
  const onStack = count > 0 && seen.slice(0, count).every((v, i) => stack[i] === v);
  const culprits = seen.slice(0, count).map((value, i) => ({ level: i + 1, ...describe(value) }));
  const ctx = { ...parsed, message: String(message ?? ''), command, signature, args, depth, culprits, onStack, hasLine: !!String(line).trim() };
  const spec = ERROR_KINDS[kind];
  return {
    kind,
    command,
    title: spec.title(ctx),
    detail: spec.detail(ctx),
    fixes: spec.fixes(ctx),
    culpritLevels: onStack ? culprits.map((c) => c.level) : [],
  };
}
