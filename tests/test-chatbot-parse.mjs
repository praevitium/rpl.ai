import {
  parseAllToolCalls, parseSuggestions, findMachineSectionStart, stripThinkBlocks,
  resolveToolAlias, activeContextTokens, effectiveBudget, TOOL_ALIASES, ChatBot,
  parseFencedBlock, parseInlineSpans, classifyMarkdownLine,
} from '../www/src/ai/chat-bot.js';
import { SYSTEM_PROMPT_COMBINED, RPL_CATALOG } from '../www/src/ai/system-prompt.js';
import { hasOp } from '../www/src/rpl/ops.js';
import { assert } from './helpers.mjs';
import { readFileSync } from 'node:fs';

/* AI chat-bot response parsers — the pure helpers that pull structured
   tool calls, follow-up suggestions and reasoning blocks out of a raw
   model response.  These run on every streamed turn, so edge cases
   (HP50 list braces inside arguments, trailing commas from small
   models, unclosed mid-stream reasoning) need to stay pinned. */


{
  const calls = parseAllToolCalls('{"name":"add","arguments":{"a":1,"b":2}}');
  assert(calls.length === 1 && calls[0].name === 'add'
         && calls[0].arguments.a === 1 && calls[0].arguments.b === 2,
         'parseAllToolCalls reads a single call with arguments');
}

{
  const calls = parseAllToolCalls('Sure, pushing that.\n{"name":"push","arguments":{"value":3}}');
  assert(calls.length === 1 && calls[0].name === 'push' && calls[0].arguments.value === 3,
         'parseAllToolCalls skips prose preceding the JSON anchor');
}

{
  const calls = parseAllToolCalls('{"name":"a","arguments":{}} then {"name":"b","arguments":{}}');
  assert(calls.length === 2 && calls[0].name === 'a' && calls[1].name === 'b',
         'parseAllToolCalls returns multiple calls in order');
}

{
  const calls = parseAllToolCalls('{"name":"clear"}');
  assert(calls.length === 1 && calls[0].name === 'clear'
         && typeof calls[0].arguments === 'object'
         && Object.keys(calls[0].arguments).length === 0,
         'parseAllToolCalls defaults a missing arguments key to {}');
}

// Balanced HP50 list braces inside a string argument don't fool the
// brace walker (depth returns to zero correctly).
{
  const calls = parseAllToolCalls('{"name":"push","arguments":{"value":"{ 1 2 3 }"}}');
  assert(calls.length === 1 && calls[0].arguments.value === '{ 1 2 3 }',
         'parseAllToolCalls keeps balanced braces inside a string argument');
}

// session275: a lone unbalanced `}` inside a string argument no longer
// mis-walks depth — the string-aware scanner ignores braces in literals,
// so the real closing brace is found and the call survives.
{
  const calls = parseAllToolCalls('{"name":"run","arguments":{"text":"« IF x } »"}}');
  assert(calls.length === 1 && calls[0].name === 'run'
         && calls[0].arguments.text === '« IF x } »',
         'parseAllToolCalls survives an unbalanced } inside a string arg');
}

// session275: a lone unbalanced `{` inside a string argument is likewise
// ignored, and a following well-formed call still surfaces.
{
  const calls = parseAllToolCalls('{"name":"run","arguments":{"text":"{ open"}} {"name":"clear"}');
  assert(calls.length === 2 && calls[0].arguments.text === '{ open'
         && calls[1].name === 'clear',
         'parseAllToolCalls ignores an unbalanced { in a string and reads the next call');
}

// session275: an escaped quote inside the string keeps the scanner in
// string mode so a `}` after it is still treated as literal.
{
  const calls = parseAllToolCalls('{"name":"run","arguments":{"text":"say \\"} \\" done"}}');
  assert(calls.length === 1 && calls[0].arguments.text === 'say "} " done',
         'parseAllToolCalls respects escaped quotes when skipping string braces');
}

// session275: SUGGEST bracket walker is now string-aware too — a `]`
// inside a suggestion string no longer truncates the array early.
{
  const out = parseSuggestions('SUGGEST: ["close the ] list", "second"]');
  assert(out && out.length === 2 && out[0] === 'close the ] list' && out[1] === 'second',
         'parseSuggestions ignores a ] inside a suggestion string');
}

{
  const calls = parseAllToolCalls('{"name": not valid json here}');
  assert(Array.isArray(calls) && calls.length === 0,
         'parseAllToolCalls skips a malformed object');
}

{
  const calls = parseAllToolCalls('just a plain prose answer with no tool call');
  assert(Array.isArray(calls) && calls.length === 0,
         'parseAllToolCalls returns [] when no anchor is present');
}

// session332: the two unpinned skip/give-up arms of parseAllToolCalls. The
// malformed-object block above only exercises a JSON.parse *throw*; the
// `obj && typeof obj.name === 'string'` guard's other false arm — valid JSON
// whose `name` is non-string — and the `end < 0` unclosed-brace `break` were
// never pinned. These guard a refactor that narrows the name-type guard or
// drops the early break.
{
  // Valid JSON, numeric `name`: JSON.parse succeeds but the typeof guard
  // rejects it (no throw), and the post-try lastIndex advance still lets a
  // following well-formed call surface — distinct from the parse-throw path.
  const calls = parseAllToolCalls('{"name":42,"arguments":{}} {"name":"clear"}');
  assert(calls.length === 1 && calls[0].name === 'clear',
         'parseAllToolCalls skips a valid object with a non-string name and reads the next call');
  // A null `name` is likewise rejected (typeof null === "object").
  assert(parseAllToolCalls('{"name":null,"arguments":{}}').length === 0,
         'parseAllToolCalls skips an object whose name is null');
  // An unclosed first anchor trips matchBalancedEnd → -1 → the loop *breaks*,
  // so even a following well-formed call is abandoned (partial-stream policy).
  assert(parseAllToolCalls('{"name":"a","arguments":{"x":1 then {"name":"b"}').length === 0,
         'parseAllToolCalls gives up entirely on an unclosed leading brace');
}


{
  const out = parseSuggestions('SUGGEST: ["What is the determinant?", "Invert it", "Show steps"]');
  assert(Array.isArray(out) && out.length === 3 && out[0] === 'What is the determinant?',
         'parseSuggestions reads a JSON array of three');
}

{
  const out = parseSuggestions('SUGGEST: ["a","b","c","d","e"]');
  assert(out.length === 3 && out[2] === 'c',
         'parseSuggestions caps the result at three items');
}

{
  const out = parseSuggestions('Here are ideas.\nSUGGEST: ["x"]');
  assert(out && out.length === 1 && out[0] === 'x',
         'parseSuggestions finds the marker after prose');
}

// Trailing comma breaks JSON.parse; the quoted-token fallback recovers.
{
  const out = parseSuggestions('SUGGEST: ["alpha", "beta",]');
  assert(out && out.length === 2 && out[0] === 'alpha' && out[1] === 'beta',
         'parseSuggestions falls back to quoted-token extraction');
}

{
  const out = parseSuggestions('SUGGEST: ["keep", "", "  "]');
  assert(out && out.length === 1 && out[0] === 'keep',
         'parseSuggestions filters empty/whitespace entries');
}

{
  assert(parseSuggestions('no marker here') === null,
         'parseSuggestions returns null without a marker');
  assert(parseSuggestions('') === null,
         'parseSuggestions returns null on empty input');
}

// session318: parseSuggestions' remaining early-return and coercion arms.
// The marker-present-but-malformed branches and the non-string element
// coercion in tryParse were never pinned — session275/the JSON-array and
// trailing-comma-fallback blocks above only exercise well-formed brackets
// and empty-STRING filtering. These guard a refactor that drops the `lo`/`hi`
// bracket-locator guards or narrows tryParse's `typeof v === 'string'` arm.
{
  // SUGGEST marker present but no opening `[` at all -> lo < 0 -> null.
  assert(parseSuggestions('SUGGEST: nothing here') === null,
         'parseSuggestions returns null when the marker has no [ array');
  // Opening `[` but never closed -> matchBalancedEnd returns -1 -> null.
  assert(parseSuggestions('SUGGEST: ["a", "b"') === null,
         'parseSuggestions returns null on an unbalanced [ array');
  // Non-string elements are coerced to '' and filtered, strings survive.
  const mixed = parseSuggestions('SUGGEST: ["keep", 42, true, null, "also"]');
  assert(mixed && mixed.length === 2 && mixed[0] === 'keep' && mixed[1] === 'also',
         'parseSuggestions drops non-string array elements, keeps strings');
  // Array parses but holds only non-strings -> [] -> tryParse null; the
  // quoted-token fallback finds no "…" tokens either -> null.
  assert(parseSuggestions('SUGGEST: [1, 2, 3]') === null,
         'parseSuggestions returns null when the array has no usable strings');
  // JSON.parse fails (bare identifiers) and the fallback finds no quoted
  // tokens -> null, distinct from the trailing-comma-with-strings recovery.
  assert(parseSuggestions('SUGGEST: [unquoted, junk,]') === null,
         'parseSuggestions returns null when neither parse nor quoted fallback matches');
}


{
  assert(findMachineSectionStart('totally plain prose') === -1,
         'findMachineSectionStart returns -1 for pure prose');
}

{
  const text = 'answer here {"name":"x"}';
  assert(findMachineSectionStart(text) === text.indexOf('{'),
         'findMachineSectionStart reports the JSON anchor offset');
}

{
  const text = 'answer here SUGGEST: ["q"]';
  assert(findMachineSectionStart(text) === text.indexOf('SUGGEST'),
         'findMachineSectionStart reports the SUGGEST offset');
}

{
  const text = 'p SUGGEST: ["q"] more {"name":"x"}';
  assert(findMachineSectionStart(text) === text.indexOf('SUGGEST'),
         'findMachineSectionStart returns the earliest of the two markers');
}

// session325: the prior block only pins the SUGGEST-before-JSON ordering
// (Math.min picks sIdx).  The system prompt's REPLY FORMAT puts TOOL CALLS
// *before* SUGGEST, so the live ordering is JSON-first — the Math.min arm
// that must pick jIdx.  Guards a refactor that returns the wrong marker
// (or drops the min) when both are present in spec order.
{
  const text = 'p {"name":"x"} then SUGGEST: ["q"]';
  assert(findMachineSectionStart(text) === text.indexOf('{'),
         'findMachineSectionStart picks the JSON anchor when it precedes SUGGEST');
}

{
  // Multiple JSON anchors before SUGGEST: still the FIRST marker offset.
  const text = 'lead {"name":"a"} mid {"name":"b"} SUGGEST: ["q"]';
  assert(findMachineSectionStart(text) === text.indexOf('{'),
         'findMachineSectionStart reports the first JSON anchor with several before SUGGEST');
}

{
  // SUGGEST is matched case-insensitively, so a lowercase marker after the
  // JSON anchor still loses the min — JSON-first offset wins.
  const text = 'x {"name":"y"} suggest: ["z"]';
  assert(findMachineSectionStart(text) === text.indexOf('{'),
         'findMachineSectionStart picks JSON over a lowercase suggest marker that follows it');
}

// session380: the two anchor regexes are whitespace-tolerant (`/\{\s*"name"\s*:/`
// and `/\bSUGGEST\s*:/i`) but every pin above feeds only the tight `{"name":` /
// `SUGGEST:` forms.  Real streamed/pretty-printed JSON carries spaces and
// newlines, so the `\s*` arms and the SUGGEST `\b` boundary are the live paths
// the detector actually runs against — none were pinned.  Guards a refactor that
// tightens either regex (dropping `\s*`, the `\b`, or the name-must-be-first-key
// constraint) and would then miss a real machine section mid-stream.
{
  // JSON anchor tolerates whitespace/newlines after `{` and around the colon.
  const pretty = 'ok {\n  "name" : "x"}';
  assert(findMachineSectionStart(pretty) === pretty.indexOf('{'),
         'findMachineSectionStart matches a pretty-printed JSON tool-call anchor');
  const tabbed = 'ok {  "name"\t:"x"}';
  assert(findMachineSectionStart(tabbed) === tabbed.indexOf('{'),
         'findMachineSectionStart tolerates tabs/spaces in the JSON anchor');
  // `"name"` must be the FIRST key after the brace — a leading other key means
  // the `\s*`-only gap between `{` and `"name"` fails to match, so no anchor.
  assert(findMachineSectionStart('ok {"id":1, "name":"x"}') === -1,
         'findMachineSectionStart requires "name" immediately after the brace');
  // SUGGEST tolerates whitespace before the colon.
  const spaced = 'p SUGGEST : ["q"]';
  assert(findMachineSectionStart(spaced) === spaced.indexOf('SUGGEST'),
         'findMachineSectionStart matches SUGGEST with a space before the colon');
  // The `\b` boundary blocks a substring match (NOSUGGEST is not SUGGEST)...
  assert(findMachineSectionStart('here NOSUGGEST: stuff') === -1,
         'findMachineSectionStart does not match SUGGEST as a word substring');
  // ...but a non-word char before SUGGEST still satisfies the boundary.
  const dotted = 'here .SUGGEST: x';
  assert(findMachineSectionStart(dotted) === dotted.indexOf('SUGGEST'),
         'findMachineSectionStart matches SUGGEST after a non-word boundary char');
  // A whitespace-laden JSON anchor before a tight SUGGEST still wins via min.
  const both = 'a {  "name":"x"} SUGGEST: ["q"]';
  assert(findMachineSectionStart(both) === both.indexOf('{'),
         'findMachineSectionStart picks a whitespace JSON anchor over a later SUGGEST');
}


{
  assert(stripThinkBlocks('<think>weighing options</think>The answer is 4.') === 'The answer is 4.',
         'stripThinkBlocks removes a complete reasoning pair');
}

{
  assert(stripThinkBlocks('<THINKING>hmm</THINKING>done') === 'done',
         'stripThinkBlocks handles <thinking> case-insensitively');
}

{
  assert(stripThinkBlocks('<think>line one\nline two</think>ok') === 'ok',
         'stripThinkBlocks spans newlines in the block');
}

{
  assert(stripThinkBlocks('visible answer<think>still reasoning') === 'visible answer',
         'stripThinkBlocks drops a trailing unclosed reasoning block');
}

{
  assert(stripThinkBlocks('plain text') === 'plain text',
         'stripThinkBlocks passes through untagged text');
  assert(stripThinkBlocks('') === '',
         'stripThinkBlocks preserves empty string');
  assert(stripThinkBlocks(null) === null,
         'stripThinkBlocks preserves null');
}

// session306: stripThinkBlocks' two replaces in concert, plus the
// integration that is its whole reason to exist (doc point 2): a fake
// tool-call shape inside a reasoning block must be removed BEFORE
// parseAllToolCalls runs, so a model's internal monologue never
// dispatches a phantom command.  Only single complete pairs and one
// trailing-open block were pinned; multi-pair, interleaved, and the
// strip→parse hand-off were not.
{
  // The global flag collapses every complete pair, not just the first.
  assert(stripThinkBlocks('<think>a</think>keep1<think>b</think>keep2') === 'keep1keep2',
         'stripThinkBlocks removes multiple complete pairs');
  assert(stripThinkBlocks('Intro <think>x</think>middle <think>y</think>end')
           === 'Intro middle end',
         'stripThinkBlocks strips think blocks interleaved with prose');
  // Complete pair then a trailing open block: the pair-collapse pass
  // removes the first, the open-tail pass drops the second.
  assert(stripThinkBlocks('<think>done</think>Answer is 4.<think>more') === 'Answer is 4.',
         'stripThinkBlocks handles a complete pair followed by an open block');
}

// session306: the strip→parse contract.  A `{"name":...}` emitted inside
// a reasoning block parses as a real call on the RAW text but is gone
// once stripped — so the orchestrator's strip-then-parse order is what
// stops a phantom dispatch.
{
  const raw = '<think>Maybe {"name":"DROP","arguments":{}}</think>Pushing 3.\n'
            + '{"name":"push_to_stack","arguments":{"value":"3"}}';
  const rawNames = parseAllToolCalls(raw).map(c => c.name);
  assert(rawNames.length === 2 && rawNames[0] === 'DROP',
         'parseAllToolCalls on RAW text would see the in-think phantom call');
  const strippedNames = parseAllToolCalls(stripThinkBlocks(raw)).map(c => c.name);
  assert(strippedNames.length === 1 && strippedNames[0] === 'push_to_stack',
         'stripThinkBlocks drops the phantom so only the real call parses');
  // Mid-stream: an unclosed think block carrying a tool-call shape is
  // suppressed entirely, leaving nothing for the parser to dispatch.
  const mid = 'Working.<think>plan: {"name":"CLEAR"}';
  assert(stripThinkBlocks(mid) === 'Working.',
         'stripThinkBlocks suppresses an open block mid-stream');
  assert(parseAllToolCalls(stripThinkBlocks(mid)).length === 0,
         'no tool call survives an unclosed reasoning block');
  // And the streaming hide-detector sees pure prose after the strip.
  assert(findMachineSectionStart(stripThinkBlocks('<think>{"name":"X"}</think>just prose')) === -1,
         'findMachineSectionStart reports pure prose once a think-wrapped call is stripped');
}

// session353: parseFencedBlock — the ```-fence language/code splitter lifted
// out of renderMarkdown's DOM (session326/347 extract-and-pin precedent). The
// markdown renderer was the lane's last uncovered surface; this pins the pure
// part — the `lang` routing key that selects mermaid-vs-codeblock and the body
// extraction — without a DOM. Guards a refactor that drops the lower-case/trim
// on the tag, mishandles a tag-less fence, or eats a body newline.
{
  // Tag line present: lower-cased and trimmed; body is everything past the
  // first newline, verbatim (the trailing newline is left for the caller).
  assert(JSON.stringify(parseFencedBlock('```js\nconst x = 1;\n```'))
           === JSON.stringify({ lang: 'js', code: 'const x = 1;\n' }),
         'parseFencedBlock reads the language tag and the body after the first newline');
  // The mermaid routing key folds case AND surrounding whitespace, so a
  // sloppy `  MERMAID  ` tag still routes to the diagram renderer.
  assert(parseFencedBlock('```  MERMAID  \ngraph TD\nA-->B\n```').lang === 'mermaid',
         'parseFencedBlock lower-cases and trims the tag so the mermaid key matches');
  // No newline at all: there is no tag line — the whole inner text is code.
  assert(JSON.stringify(parseFencedBlock('```inline code```'))
           === JSON.stringify({ lang: '', code: 'inline code' }),
         'parseFencedBlock treats a newline-less fence as an untagged code body');
  // A bare opening fence (newline immediately) has an empty tag and a body.
  assert(JSON.stringify(parseFencedBlock('```\nplain code\n```'))
           === JSON.stringify({ lang: '', code: 'plain code\n' }),
         'parseFencedBlock yields an empty tag for a fence with no language line');
  // Multi-line bodies are preserved verbatim (no internal trimming).
  assert(parseFencedBlock('```py\na = 1\nb = 2\n```').code === 'a = 1\nb = 2\n',
         'parseFencedBlock preserves a multi-line body verbatim');
  // A language line with no body yields an empty code string, not undefined.
  assert(JSON.stringify(parseFencedBlock('```python\n```'))
           === JSON.stringify({ lang: 'python', code: '' }),
         'parseFencedBlock returns an empty body for a tag-only fence');
}

// session360: parseInlineSpans — the inline-markdown span tokenizer lifted out
// of appendSpans' DOM (session326/347/353 extract-and-pin precedent). The
// markdown renderer's inline pass was the lane's last uncovered surface; this
// pins the pure part — the alternation order (code before math before bold
// before italic), the span-type dispatch, and the `$…$` bare-dollar guard —
// without a DOM. Guards a refactor that reorders the alternation, drops the
// non-space lookarounds on the `$` math form, or mis-routes a span type.
{
  const types = t => parseInlineSpans(t).map(s => s.type).join(',');
  // Plain text → a single text token; empty input → no tokens.
  assert(JSON.stringify(parseInlineSpans('plain'))
           === JSON.stringify([{ type: 'text', content: 'plain' }]),
         'parseInlineSpans wraps unformatted text in one text token');
  assert(parseInlineSpans('').length === 0,
         'parseInlineSpans returns no tokens for empty input');
  // Code, bold, italic each route to their own type with the body unwrapped.
  assert(JSON.stringify(parseInlineSpans('a `c` b'))
           === JSON.stringify([{ type: 'text', content: 'a ' },
                               { type: 'code', content: 'c' },
                               { type: 'text', content: ' b' }]),
         'parseInlineSpans splits a backtick code span with surrounding text');
  assert(types('**b** and *i*') === 'bold,text,em',
         'parseInlineSpans routes **bold** to bold and *italic* to em');
  // Both inline-math forms collapse to the math type; body is left untrimmed.
  assert(JSON.stringify(parseInlineSpans('\\(x+1\\)'))
           === JSON.stringify([{ type: 'math', content: 'x+1' }]),
         'parseInlineSpans maps the \\(…\\) math form to a math token');
  assert(JSON.stringify(parseInlineSpans('$x^2$'))
           === JSON.stringify([{ type: 'math', content: 'x^2' }]),
         'parseInlineSpans maps the $…$ math form to a math token');
  // Code wins over math: a $…$ inside backticks stays literal code.
  assert(types('` $x$ `') === 'code',
         'parseInlineSpans lets a backtick span swallow an inner $…$ (code before math)');
  // The bare-dollar guard: prose dollars and a space-padded $ … $ stay text.
  assert(types('costs $5 and $10') === 'text',
         'parseInlineSpans leaves bare prose dollar signs as text');
  assert(types('$ spaced $') === 'text',
         'parseInlineSpans rejects a space-padded $ … $ as non-math (lookaround guard)');
}

// session401: parseInlineSpans — the deliberate newline asymmetry between the
// two inline-math forms. The `\(…\)` arm matches `[\s\S]+?` (spans newlines)
// while the `$…$` arm matches `[^$\n]+?` (single-line only); session360 pinned
// each form standalone but never the cross-form distinction, so a refactor
// unifying the two character classes (e.g. widening `$…$` to `[\s\S]` or
// narrowing `\(…\)` to `[^\n]`) would pass every prior pin yet silently change
// which strings math-ify. Also pins paren-math surrounded by prose (session360
// only tested it bare) and back-to-back `$…$` adjacency (the non-greedy body).
{
  const T = t => JSON.stringify(parseInlineSpans(t).map(s => [s.type, s.content]));
  // The `\(…\)` form spans a newline; the `$…$` form does not.
  assert(T('\\(a\nb\\)') === JSON.stringify([['math', 'a\nb']]),
         'parseInlineSpans lets \\(…\\) math span a newline ([\\s\\S] body)');
  assert(T('$a\nb$') === JSON.stringify([['text', '$a\nb$']]),
         'parseInlineSpans rejects a $…$ span across a newline ([^$\\n] body)');
  // Paren math surrounded by prose splits into text/math/text.
  assert(T('see \\(x\\) here')
           === JSON.stringify([['text', 'see '], ['math', 'x'], ['text', ' here']]),
         'parseInlineSpans isolates a \\(…\\) math span from surrounding prose');
  // Adjacent $…$ spans each tokenize (non-greedy body, no swallow).
  assert(T('$a$ $b$')
           === JSON.stringify([['math', 'a'], ['text', ' '], ['math', 'b']]),
         'parseInlineSpans tokenizes back-to-back $…$ spans separately');
}

// session407: parseInlineSpans — the leftmost-match "swallow" contract. The
// single alternation regex is scanned left-to-right, so whichever delimiter
// OPENS FIRST in the string consumes everything up to its own close; the
// alternation order only breaks ties at the same index. session360 pinned just
// code-swallows-math (`\` $x$ \``), reading like an absolute "code before math"
// precedence — but the inverse, `$a\`c\`$`, math-ifies the whole body, proving
// code does NOT unconditionally beat math (the `$` simply opened first). This
// pins the swallow across the emphasis/bold arms (never exercised) and both
// directions of the code↔math tie-break, guarding a refactor that splits the
// regex into ranked passes and turns the order comment into a real precedence.
{
  const T = t => JSON.stringify(parseInlineSpans(t).map(s => [s.type, s.content]));
  // A backtick opening first swallows literal **bold** / *italic* markers.
  assert(T('`**x**`') === JSON.stringify([['code', '**x**']]),
         'parseInlineSpans lets a code span swallow inner emphasis markers verbatim');
  // A `*`/`**` opening first swallows an inner $…$ math span (stays emphasis).
  assert(T('*a $x$ b*') === JSON.stringify([['em', 'a $x$ b']]),
         'parseInlineSpans lets an *italic* span swallow inner $…$ math');
  assert(T('**a $x$ b**') === JSON.stringify([['bold', 'a $x$ b']]),
         'parseInlineSpans lets a **bold** span swallow inner $…$ math');
  // Emphasis opening first also swallows an inner code span.
  assert(T('*a `c` b*') === JSON.stringify([['em', 'a `c` b']]),
         'parseInlineSpans lets an *italic* span swallow an inner code span');
  // A `$` opening first swallows literal `*` and backtick chars as math body —
  // the math arm wins the tie-break the other way, so code does not always win.
  assert(T('$a*b*c$') === JSON.stringify([['math', 'a*b*c']]),
         'parseInlineSpans keeps bare * inside a leading $…$ as math body');
  assert(T('$a`c`$') === JSON.stringify([['math', 'a`c`']]),
         'parseInlineSpans math-ifies a $…$ that opens before an inner code span');
}

// session367: classifyMarkdownLine — the per-line block-role classifier lifted
// out of appendInlineMarkdownLines' DOM (session326/347/353/360 extract-and-pin
// precedent). The renderer's block dispatch (heading/list/paragraph routing)
// was the lane's last uncovered pure surface; this pins the if-chain precedence
// and each arm's captured content without a DOM. Guards a refactor that reorders
// the precedence, drops a `\s+` separator (which would mis-route prose), or
// changes a capture group.
{
  const J = x => JSON.stringify(classifyMarkdownLine(x));
  // Headings: 1-3 hashes + a space carry the 1-3 level and the trimmed-of-marker body.
  assert(J('# Title') === JSON.stringify({ kind: 'heading', level: 1, content: 'Title' }),
         'classifyMarkdownLine reads a level-1 heading');
  assert(J('### Deep') === JSON.stringify({ kind: 'heading', level: 3, content: 'Deep' }),
         'classifyMarkdownLine reads a level-3 heading');
  // 4+ hashes exceed the {1,3} bound, and a hash with no following space, fall to text.
  assert(J('#### too deep') === JSON.stringify({ kind: 'text', content: '#### too deep' }),
         'classifyMarkdownLine treats 4+ hashes as text (level bound is 1-3)');
  assert(J('#NoSpace') === JSON.stringify({ kind: 'text', content: '#NoSpace' }),
         'classifyMarkdownLine requires a space after the hash run');
  // Bullets: a `-` or `*` plus a space, optionally indented; the marker is stripped.
  assert(J('- item') === JSON.stringify({ kind: 'bullet', content: 'item' }),
         'classifyMarkdownLine reads a dash bullet');
  assert(J('  * spaced') === JSON.stringify({ kind: 'bullet', content: 'spaced' }),
         'classifyMarkdownLine reads an indented star bullet');
  // `*italic*` has no space after the star, so it is NOT a bullet — stays text.
  assert(J('*just italic*') === JSON.stringify({ kind: 'text', content: '*just italic*' }),
         'classifyMarkdownLine leaves *italic* (no space after star) as text, not a bullet');
  // Ordered: digits + dot + space, optionally indented; the marker is stripped.
  assert(J('1. first') === JSON.stringify({ kind: 'ordered', content: 'first' }),
         'classifyMarkdownLine reads a numbered item');
  assert(J('   12. twelfth') === JSON.stringify({ kind: 'ordered', content: 'twelfth' }),
         'classifyMarkdownLine reads an indented multi-digit numbered item');
  // Blank: empty or whitespace-only collapses to the blank role (a paragraph break).
  assert(J('') === JSON.stringify({ kind: 'blank' }),
         'classifyMarkdownLine maps an empty line to blank');
  assert(J('   ') === JSON.stringify({ kind: 'blank' }),
         'classifyMarkdownLine maps a whitespace-only line to blank');
  // Anything else is text, carried verbatim.
  assert(J('plain line') === JSON.stringify({ kind: 'text', content: 'plain line' }),
         'classifyMarkdownLine carries an ordinary line as text');
  // Heading is checked before bullet, but a bullet line owns its body verbatim
  // even when the body itself starts with a hash — the line doesn't start with #.
  assert(J('- # not heading') === JSON.stringify({ kind: 'bullet', content: '# not heading' }),
         'classifyMarkdownLine keeps a leading-# bullet body as a bullet (precedence)');
}

// session420: classifyMarkdownLine empty-body asymmetry. The list arms capture
// `(.*)` (empty body allowed) while the heading arm requires `(.+)` — every
// session367 list pin fed a non-empty body, so the empty-marker arms and the
// heading/list capture asymmetry were never exercised. A refactor tightening a
// list's `\s+(.*)` to `\s+(.+)` (mis-aligning it with the heading) would route a
// bare marker to text yet pass every prior pin. Also pins that the heading
// separator `\s+` accepts a tab, not just a space.
{
  const J = x => JSON.stringify(classifyMarkdownLine(x));
  // A marker followed by a space but no body still classifies as a list item
  // with an empty content string (the `.*` capture permits zero chars).
  assert(J('- ') === JSON.stringify({ kind: 'bullet', content: '' }),
         'classifyMarkdownLine reads a bodyless dash bullet (empty content)');
  assert(J('* ') === JSON.stringify({ kind: 'bullet', content: '' }),
         'classifyMarkdownLine reads a bodyless star bullet (empty content)');
  assert(J('  - ') === JSON.stringify({ kind: 'bullet', content: '' }),
         'classifyMarkdownLine reads an indented bodyless bullet (empty content)');
  assert(J('1. ') === JSON.stringify({ kind: 'ordered', content: '' }),
         'classifyMarkdownLine reads a bodyless numbered item (empty content)');
  assert(J('12. ') === JSON.stringify({ kind: 'ordered', content: '' }),
         'classifyMarkdownLine reads a bodyless multi-digit numbered item (empty content)');
  // The heading arm requires `(.+)`, so a bodyless hash run is NOT a heading —
  // it falls through to text (the empty-body asymmetry with the list arms).
  assert(J('# ') === JSON.stringify({ kind: 'text', content: '# ' }),
         'classifyMarkdownLine treats a bodyless hash as text, not an empty heading');
  assert(J('## ') === JSON.stringify({ kind: 'text', content: '## ' }),
         'classifyMarkdownLine treats a bodyless two-hash run as text');
  // A bare `*` with no space and no body is not a bullet — it stays text.
  assert(J('*') === JSON.stringify({ kind: 'text', content: '*' }),
         'classifyMarkdownLine leaves a bare star as text (no space, no body)');
  // The heading separator is `\s+`, so a tab after the hash run is accepted.
  assert(J('#\tTabbed') === JSON.stringify({ kind: 'heading', level: 1, content: 'Tabbed' }),
         'classifyMarkdownLine accepts a tab as the heading separator');
}


{
  assert(resolveToolAlias('add_to_stack') === 'push_to_stack',
         'resolveToolAlias maps a push synonym to push_to_stack');
  assert(resolveToolAlias('execute') === 'run',
         'resolveToolAlias maps a run synonym to run');
}

// An unknown name passes through unchanged (so callers detect a
// rewrite by inequality, and never silently mis-route).
{
  assert(resolveToolAlias('frobnicate') === 'frobnicate',
         'resolveToolAlias passes an unknown name through');
}

// An already-canonical name is not in the alias map, so it too passes
// through — guards against a double-mapping refactor.
{
  assert(resolveToolAlias('push_to_stack') === 'push_to_stack',
         'resolveToolAlias leaves an already-canonical name untouched');
}

// session387: source-side fidelity of the whole alias map. session283
// guards the map from the TARGET side (every value is canonical and
// single-hop), and the blocks above spot-check only a couple of keys
// (add_to_stack, execute) plus the three the prompt advertises — so a
// refactor of resolveToolAlias' lookup (or a stale copy of the map) that
// returned the wrong-but-still-canonical target, or failed to rewrite some
// keys, would pass session283 and every existing pin. Pin the source side:
// resolveToolAlias(key) returns exactly TOOL_ALIASES[key] for every one of
// the 30 keys, and always rewrites to a different name (the inequality
// callers rely on to detect a rewrite). The single-hop guarantee from
// session283 (no target is also a key) is what makes the !== assertion hold.
{
  const keys = Object.keys(TOOL_ALIASES);
  assert(keys.length >= 30,
         'TOOL_ALIASES exposes the full synonym set (extraction floor)');
  for (const key of keys) {
    assert(resolveToolAlias(key) === TOOL_ALIASES[key],
           `resolveToolAlias(${key}) returns its mapped target`);
    assert(resolveToolAlias(key) !== key,
           `resolveToolAlias rewrites the alias key ${key} to a different name`);
  }
}

// session394: resolveToolAlias' own-property guard. session387 flagged (but
// did not pin) that the prior `TOOL_ALIASES[name] ?? name` read through the
// prototype, so a model emitting an Object.prototype member name as a tool
// (toString, constructor, valueOf, hasOwnProperty, __proto__, isPrototypeOf)
// resolved to the inherited function/object instead of passing through —
// dispatch would then see `resolveToolAlias(n) !== n` and mis-route. Source
// now guards with Object.prototype.hasOwnProperty.call, so every such name is
// a clean string pass-through. Probed all six live first (repo-rooted import,
// CAS-free): each returns the name unchanged; real aliases still resolve.
{
  const protoNames = ['toString', 'constructor', 'valueOf',
                      'hasOwnProperty', '__proto__', 'isPrototypeOf'];
  for (const n of protoNames) {
    const r = resolveToolAlias(n);
    assert(r === n,
           `resolveToolAlias(${n}) passes a prototype-member name through unchanged`);
    assert(typeof r === 'string',
           `resolveToolAlias(${n}) never returns an inherited prototype member`);
  }
  // A real alias and an unknown name are unaffected by the guard.
  assert(resolveToolAlias('push') === 'push_to_stack',
         'resolveToolAlias still rewrites a genuine alias after the guard');
  assert(resolveToolAlias('totally_unknown') === 'totally_unknown',
         'resolveToolAlias still passes an unknown name through after the guard');
}


// No model loaded → the safe WebLLM default (4096), and the budget is
// that window in chars minus the response reserve (4096*4 - 4000).
{
  assert(activeContextTokens({}) === 4096,
         'activeContextTokens falls back to 4096 with no model loaded');
  assert(effectiveBudget({}) === 4096 * 4 - 4000,
         'effectiveBudget subtracts the response reserve from the char window');
}

// A remote endpoint (duck-typed by a string `endpoint`) uses its
// probed contextTokens directly.
{
  const remote = { loadedModelId: 'llama3', endpoint: 'http://x', contextTokens: 8000 };
  assert(activeContextTokens(remote) === 8000,
         'activeContextTokens uses a remote model probed contextTokens');
  assert(effectiveBudget(remote) === 8000 * 4 - 4000,
         'effectiveBudget tracks a remote model context window');
}

// A remote endpoint that never reported contextTokens falls back to
// the generous remote default (16384).
{
  const remote = { loadedModelId: 'llama3', endpoint: 'http://x', contextTokens: null };
  assert(activeContextTokens(remote) === 16384,
         'activeContextTokens uses the remote default when unprobed');
}

// An in-browser id absent from the MODELS catalog falls back to 4096
// (the worker-LLM branch has no `endpoint`).
{
  assert(activeContextTokens({ loadedModelId: 'not-a-real-model' }) === 4096,
         'activeContextTokens falls back to 4096 for an unknown catalog id');
}

// session312: positive coverage for the in-catalog worker-model branch and
// the effectiveBudget zero-floor — only the unknown-id `?? 4096` fallback and
// the remote paths were pinned, leaving the catalog hit and the Math.max(0,…)
// guard untested.
{
  // A worker LLM (no `endpoint`) whose id IS in MODELS resolves that
  // entry's real contextTokens, not the 4096 fallback.
  const worker = { loadedModelId: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC' };
  assert(activeContextTokens(worker) === 32768,
         'activeContextTokens resolves an in-catalog worker model contextTokens');
  assert(effectiveBudget(worker) === 32768 * 4 - 4000,
         'effectiveBudget tracks an in-catalog worker model window');

  // The remote branch is gated on a STRING `endpoint`; a worker LLM that
  // happens to carry a contextTokens field still goes through the catalog,
  // so that stray field is ignored.
  const ducked = { loadedModelId: 'Qwen3-0.6B-q4f16_1-MLC', contextTokens: 999 };
  assert(activeContextTokens(ducked) === 32768,
         'activeContextTokens ignores a worker LLM contextTokens field (no endpoint → catalog wins)');

  // A window smaller than the response reserve floors the budget at 0
  // instead of going negative.
  const tiny = { loadedModelId: 'srv', endpoint: 'http://x', contextTokens: 500 };
  assert(activeContextTokens(tiny) === 500,
         'activeContextTokens passes through a tiny remote window');
  assert(effectiveBudget(tiny) === 0,
         'effectiveBudget floors at 0 when the window is below the response reserve');
}

// session426: the remote branch's `contextTokens || DEFAULT` falsy fallback was
// pinned only with `null`, which `||` and `??` treat alike — so a refactor
// swapping `||` for `??` would pass every prior pin yet change behavior for a
// server that probes a 0 / NaN window (`??` would surface 0 instead of falling
// back). 0 (a server reporting an unusable window) and NaN must both fold to
// the generous remote default, distinguishing `||` from `??`.
{
  const zero = { loadedModelId: 'srv', endpoint: 'http://x', contextTokens: 0 };
  assert(activeContextTokens(zero) === 16384,
         'activeContextTokens folds a remote 0 context window to the remote default (|| not ??)');
  assert(effectiveBudget(zero) === 16384 * 4 - 4000,
         'effectiveBudget sizes the default window when a remote reports 0 tokens');

  const nan = { loadedModelId: 'srv', endpoint: 'http://x', contextTokens: NaN };
  assert(activeContextTokens(nan) === 16384,
         'activeContextTokens folds a remote NaN context window to the remote default');
}

// Canonical tool set pulled from the LIVE registry — chat-bot.js
// _buildRegistry is the documented single source of truth.  It reads only
// this._tools / this._getContext, so a minimal fake `this` extracts the
// keys without constructing a ChatBot (DOM-free).  Both sync guards below
// derive from this instead of a hand-copied literal, so a tool added to
// the registry but not the prompt (or vice versa) fails the suite — the
// exact drift these guards promise to catch.
const registryToolNames = () =>
  Object.keys(ChatBot.prototype._buildRegistry.call({ _tools: {}, _getContext: () => ({}) }));

// AI prompt <-> tool-registry sync guards.  The AVAILABLE TOOLS block in
// SYSTEM_PROMPT_COMBINED is a hand-maintained contract the model emits
// verbatim; a tool name that drifts from chat-bot.js _buildRegistry, or
// an advertised alias that no longer resolves, silently breaks dispatch.
{
  const head = SYSTEM_PROMPT_COMBINED.indexOf('AVAILABLE TOOLS');
  const tail = SYSTEM_PROMPT_COMBINED.indexOf('EXAMPLES', head);
  const documented = [...new Set(
    [...SYSTEM_PROMPT_COMBINED.slice(head, tail).matchAll(/"name":"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((n) => !n.includes('<')),
  )].sort();
  const registryNames = registryToolNames().sort();
  assert(registryNames.length >= 8,
         'registry exposes the full tool set (extraction floor)');
  assert(documented.join(',') === registryNames.join(','),
         'AVAILABLE TOOLS block documents exactly the live registry tool set');

  // A canonical tool name must never also be an alias key, or the
  // orchestrator would rewrite a real tool call to something else.
  for (const name of documented) {
    assert(resolveToolAlias(name) === name,
           `canonical tool ${name} is alias-stable (not a TOOL_ALIASES key)`);
  }

  // The aliases the prompt explicitly advertises must still resolve to a
  // documented canonical tool.
  for (const [alias, canon] of [
    ['add_to_stack', 'push_to_stack'],
    ['recall', 'recall_var'],
    ['show_stack', 'get_stack'],
  ]) {
    assert(resolveToolAlias(alias) === canon && documented.includes(canon),
           `advertised alias ${alias} resolves to documented tool ${canon}`);
  }
}

// session321: pin each documented tool's confirm / read-only semantics
// against the live registry's `confirm` flag — the queued code-review
// follow-up to the O-015 name-sync guard, which checked only the tool
// names. The AVAILABLE TOOLS prose the model reads states each tool as
// either "Requires user confirmation" (mutating) or "Auto-executes
// (read-only)", while the registry's `confirm` boolean is what the
// orchestrator actually gates on. A tool flipped read-only<->mutating in
// _buildRegistry without a matching prompt edit (or vice versa) would
// silently mislead the model about whether an action runs unattended, so
// derive the documented semantic from the prose and assert it matches the
// registry flag in both directions. The mutual-exclusion check also
// catches a description that drops the semantic phrase entirely.
{
  const reg = ChatBot.prototype._buildRegistry.call({ _tools: {}, _getContext: () => ({}) });
  const head = SYSTEM_PROMPT_COMBINED.indexOf('AVAILABLE TOOLS');
  const tail = SYSTEM_PROMPT_COMBINED.indexOf('EXAMPLES', head);
  const block = SYSTEM_PROMPT_COMBINED.slice(head, tail);
  let documentedCount = 0;
  for (const m of block.matchAll(/\{"name":"([^"]+)"[^\n]*\}\n\s+([^\n]+)/g)) {
    const name = m[1];
    if (name.includes('<')) { continue; }
    const desc = m[2];
    const saysConfirm = /confirmation/i.test(desc);
    const saysAuto = /auto-executes|read-only/i.test(desc);
    assert(saysConfirm !== saysAuto,
           `AVAILABLE TOOLS describes ${name} as exactly one of mutating / read-only`);
    assert(name in reg,
           `documented tool ${name} exists in the live registry`);
    assert(reg[name].confirm === saysConfirm,
           `${name} prose confirm-semantics match the registry confirm flag`);
    documentedCount++;
  }
  assert(documentedCount >= 8,
         'every registry tool carries a confirm-semantics description in the prompt');
}

// session328: pin each documented tool's ARGUMENT NAMES against the keys its
// registry handler actually reads — the queued O-013 follow-up that O-015
// (name sync) and O-016 (confirm sync) left open. The model emits the
// AVAILABLE TOOLS argument object verbatim (`{"name":"run","arguments":
// {"text":...}}`), but the orchestrator destructures a fixed key out of that
// object (`({ text }) => tools.run(...)`). If a handler's arg is renamed
// (text->code) without a matching prompt edit, or vice versa, the model sends
// a key the handler ignores and the action silently runs empty — invisible to
// the name and confirm guards. Introspect the real read-keys with a recording
// Proxy as the args object (a Get trap fires once per destructured key) and a
// no-op `_tools` so the side-effecting handlers run DOM-free, then assert the
// advertised key set equals the read set per tool, in both directions.
{
  const head = SYSTEM_PROMPT_COMBINED.indexOf('AVAILABLE TOOLS');
  const tail = SYSTEM_PROMPT_COMBINED.indexOf('EXAMPLES', head);
  const block = SYSTEM_PROMPT_COMBINED.slice(head, tail);
  const advertised = {};
  for (const m of block.matchAll(/"name":"([^"]+)","arguments":\{([^}]*)\}/g)) {
    const name = m[1];
    if (name.includes('<')) { continue; }
    advertised[name] = [...m[2].matchAll(/"([^"]+)":/g)].map((x) => x[1]).sort();
  }
  const toolsProxy = new Proxy({}, { get: () => () => undefined });
  const reg = ChatBot.prototype._buildRegistry.call({
    _tools: toolsProxy,
    _getContext: () => ({ stack: [], angleMode: 0, displayMode: 0, dir: [] }),
  });
  let pairs = 0;
  for (const [name, tool] of Object.entries(reg)) {
    const got = new Set();
    const argp = new Proxy({}, {
      get(_o, p) { if (typeof p === 'string') { got.add(p); } return undefined; },
    });
    tool.handler(argp);
    const readKeys = [...got].sort();
    assert(name in advertised,
           `registry tool ${name} appears in the AVAILABLE TOOLS block`);
    assert(advertised[name].join(',') === readKeys.join(','),
           `${name} advertised arg names match the handler's read keys`);
    pairs++;
  }
  for (const name of Object.keys(advertised)) {
    assert(name in reg,
           `documented tool ${name} exists in the live registry (arg-name guard)`);
  }
  assert(pairs >= 8,
         'every registry tool is checked for arg-name sync (extraction floor)');
}

// session283: guard the alias map from the target side. Every alias must
// point at a real canonical tool, and no target may also be a key — a
// two-hop chain (synonym of a synonym) would leave resolveToolAlias one
// rewrite short, and a target outside the tool set would silently route
// a call to a nonexistent op.
{
  const canonical = new Set(registryToolNames());
  const keys = new Set(Object.keys(TOOL_ALIASES));
  for (const target of new Set(Object.values(TOOL_ALIASES))) {
    assert(canonical.has(target),
           `alias target ${target} is a canonical tool`);
    assert(!keys.has(target),
           `alias target ${target} is not also an alias key (single-hop)`);
  }
}

// session286: make the O-013 RPL_CATALOG drift-watch evergreen for the
// glyph-bearing ops — the class that has actually drifted twice. The model
// emits catalog command names verbatim, and Σ/Δ/Π accumulators and →-arrow
// conversions are the names most prone to ASCII<->Unicode confusion (the
// fixed bug advertised `ΣX²` (superscript) when the registered name is `ΣX2`
// (ASCII 2)). Pull every glyph-led token straight from the catalog text and
// assert it dispatches, so a future glyph typo fails the suite instead of
// waiting for a manual review-lane sweep. Whole-token capture (not just the
// leading run) is deliberate: `ΣX²` must surface as the full unresolved
// token, not silently truncate to a resolving `ΣX`.
{
  const strip = (t) => t.replace(/^[`"'(){}\[\].,;:]+|[`"'(){}\[\].,;:]+$/g, '');
  const tokens = [...new Set(
    [...RPL_CATALOG.matchAll(/\S*(?:→|[ΣΔΠ])\S*/g)]
      .map((m) => strip(m[0]))
      .filter((t) => t && t !== '→'),  // bare → is the local-variable arrow, not an op
  )].sort();
  assert(tokens.length >= 25,
         'RPL_CATALOG exposes the glyph-bearing op tokens to sweep');
  for (const name of tokens) {
    assert(hasOp(name),
           `RPL_CATALOG glyph op ${name} resolves to a registered op`);
  }
}

// session291: extend the O-013 drift-watch to the non-glyph (uppercase)
// command names — the queued follow-up to session286's glyph sweep. The
// model emits catalog names verbatim, so a misspelled or de-registered
// uppercase command in a command-list section is the same drift class as
// the `ΣX²`/`ΣX2` bug, just without a glyph to flag it.
//
// Robust extraction (the part the queue noted was hard): walk the catalog
// section by section. Column-0 lines are section headers; the two narrative
// blocks (HOW THE STACK WORKS, ALGEBRAIC OBJECTS) are prose and are skipped
// wholesale — their ALL-CAPS emphasis words (LITERALS, COMMANDS, STACK …)
// would otherwise read as command tokens. Within command-list sections,
// take each indented line's leading command column (the run before the
// 2-space description gap), skip syntax-template lines (those carrying
// `...` or a literal/structure marker like brackets, braces, guillemets,
// backticks, `:` or `/`), and assert every uppercase-shaped token (len >= 2)
// dispatches via hasOp. If a new narrative block is added, extend PROSE.
{
  const PROSE = /^(HOW THE STACK WORKS|ALGEBRAIC OBJECTS)/;
  const names = new Set();
  let inProse = false;
  for (const ln of RPL_CATALOG.split('\n')) {
    if (/^\S/.test(ln)) { inProse = PROSE.test(ln); continue; }
    if (inProse) { continue; }
    const m = ln.match(/^(\s+)(\S.*?)(\s{2,})(\S.*)$/);
    if (!m) { continue; }
    const col = m[2].trim();
    if (/\.\.\.|[:\[\]{}«»`/]/.test(col)) { continue; }
    for (const tok of col.split(/\s+/)) {
      if (/^[A-Z][A-Z0-9]+$/.test(tok)) { names.add(tok); }
    }
  }
  assert(names.size >= 200,
         'RPL_CATALOG exposes the uppercase command tokens to sweep');
  for (const name of names) {
    assert(hasOp(name),
           `RPL_CATALOG uppercase op ${name} resolves to a registered op`);
  }
}

// session297: close the last uncovered RPL_CATALOG command-token classes —
// the queued follow-up to session291. The two prior sweeps both filter on
// shape and so skip real ops: session286 takes only glyph-led tokens, and
// session291's `^[A-Z][A-Z0-9]+$` excludes any name that isn't pure
// uppercase+digits. That leaves the mixed-case / lowercase special-function
// names (Beta, erf, erfc, Ei, Si, Ci, lim) and the punctuation-suffixed ops
// (query-flag `?`, row/col `+`/`-`, the `SST↓` glyph) unguarded — a typo or
// de-registration of any of these in the catalog would ship the same wrong
// advice as the `ΣX²`/`ΣX2` bug, silently. Auto-extracting them re-admits
// prose words and syntax fragments (`"text"`, the `(alias XNUM)`
// parentheticals, the `n` operand placeholder), so per the queue this is an
// explicit curated allowlist instead. The backtick constants `e`/`i`/`π` are
// symbolic literals, not registered ops, and the XNUM/XQ alias names are pure
// uppercase (already swept by session291); both are deliberately absent here.
// Each entry is asserted to actually appear in the catalog text (so the
// allowlist can't silently rot past a catalog rename) and to dispatch.
{
  const NON_UPPER_OPS = [
    'Beta', 'erf', 'erfc', 'Ei', 'Si', 'Ci', 'lim',
    'CMPLX?', 'FC?', 'FC?C', 'FS?', 'FS?C', 'ISPRIME?',
    'COL+', 'COL-', 'ROW+', 'ROW-', 'SST↓',
  ];
  for (const name of NON_UPPER_OPS) {
    assert(RPL_CATALOG.includes(name),
           `RPL_CATALOG still advertises ${name}`);
    assert(hasOp(name),
           `RPL_CATALOG non-uppercase op ${name} resolves to a registered op`);
  }
}

/* ================================================================
   session342: chat-bot.js header "Tool-call loop" ↔ wire-format drift
   guard (code-review R-016, R-013/R-014/R-015 class). The header's
   step 3 described scanning the model reply for `<tool_call>...
   </tool_call>` XML tags, but the orchestrator parses BARE JSON
   objects (parseAllToolCalls anchors on `{"name":`), and the system
   prompt explicitly FORBIDS `<tool_call>` wrappers — so the comment
   documented a wire format the code never reads and the prompt rejects.
   Pin the corrected contract against live behavior so the stale XML
   description can't creep back: the prompt prohibits the tags, the
   parser keys on the bare JSON anchor, and the header no longer claims
   the loop scans for an XML wrapper.
   ================================================================ */
{
  const src = readFileSync(new URL('../www/src/ai/chat-bot.js', import.meta.url), 'utf8');
  const header = src.slice(0, src.indexOf('================================================================= */') + 1);

  // The drift that was just fixed: the header must not claim the loop
  // scans for a `<tool_call>...</tool_call>` XML wrapper.
  assert(!/scan for <tool_call>\.\.\.<\/tool_call>/.test(header),
         'session342: chat-bot.js header no longer claims the loop scans for <tool_call> XML tags');
  // ...and must positively name the bare-JSON wire format it really uses.
  assert(header.includes('parseAllToolCalls') && header.includes('{"name"'),
         'session342: chat-bot.js header documents the bare JSON tool-call format read by parseAllToolCalls');

  // Code side of the contract: the parser reads a bare object with no
  // XML wrapper, and an XML-wrapped object is parsed only by its inner
  // JSON (the tags are inert), proving the anchor is JSON, not `<tool_call>`.
  assert(parseAllToolCalls('{"name":"get_stack","arguments":{}}').length === 1,
         'session342: parseAllToolCalls reads a bare JSON tool call (no <tool_call> wrapper needed)');
  const wrapped = parseAllToolCalls('<tool_call>{"name":"get_stack","arguments":{}}</tool_call>');
  assert(wrapped.length === 1 && wrapped[0].name === 'get_stack',
         'session342: parseAllToolCalls keys on the inner JSON, ignoring inert <tool_call> tags');

  // Prompt side: the system prompt forbids the XML wrapper the header
  // used to describe, which is why the corrected wire format is bare JSON.
  assert(/<tool_call>\s*tags/.test(SYSTEM_PROMPT_COMBINED) &&
         /DO NOT/.test(SYSTEM_PROMPT_COMBINED),
         'session342: system prompt forbids <tool_call> tags (bare JSON objects only)');
}

/* ================================================================
   session356: chat-bot.js file-header "Constructor options" `tools`
   bag ↔ live registry drift guard (code-review R-018, R-014/R-015/
   R-016 class). The header's `tools: { ... }` block listed only `run`,
   but the constructor JSDoc just below it and `_buildRegistry` consume
   six members (run/appendToEditor/clearEditor/getEditor/listVars/
   recallVar) — so a reader auditing the calculator-side callback bag
   from the header would miss five. Derive the live consumed set by
   running every registry handler against a recording `_tools` proxy
   (a Get trap fires once per `tools.<member>` access), then assert the
   header documents exactly that set, both directions. The header was
   the wrong side (it predates the editor/vars tools being added).
   ================================================================ */
{
  const src = readFileSync(new URL('../www/src/ai/chat-bot.js', import.meta.url), 'utf8');

  // Live consumed set: which `this._tools.<member>` keys the handlers read.
  const accessed = new Set();
  const toolsProxy = new Proxy({}, { get(_t, k) { accessed.add(k); return () => undefined; } });
  const reg = ChatBot.prototype._buildRegistry.call({
    _tools: toolsProxy,
    _getContext: () => ({ stack: [], angleMode: '', displayMode: '', dir: '' }),
  });
  for (const t of Object.values(reg)) t.handler({});
  assert(accessed.size >= 6,
         'session356: at least the six known tools-bag members are consumed by the registry');

  // Documented set: the member names inside the header's `tools: { ... }`
  // block (each line's leading identifier before `(`).
  const optsIdx = src.indexOf('Constructor options:');
  const toolsOpen = src.indexOf('tools: {', optsIdx);
  const toolsClose = src.indexOf('}', toolsOpen);
  const toolsBlock = src.slice(toolsOpen, toolsClose);
  const documented = new Set(
    [...toolsBlock.matchAll(/^\s*([a-zA-Z]\w*)\s*\(/gm)].map(m => m[1]),
  );

  for (const member of accessed) {
    assert(documented.has(member),
           `session356: header tools block documents consumed member '${member}'`);
  }
  for (const member of documented) {
    assert(accessed.has(member),
           `session356: header tools block member '${member}' is actually consumed by the registry`);
  }
}

/* ================================================================
   session363: chat-bot.js file-header "Constructor options"
   `getContext(): { ... }` return-shape ↔ live registry drift guard
   (code-review R-019, sibling of session356/R-018, R-014/R-015/R-016
   class). The header documents the context object the calculator must
   supply (stack/angleMode/displayMode/dir); the registry handlers read
   those keys off `_getContext()`. Derive the live consumed set by
   running every handler against a recording context proxy (a Get trap
   fires once per `ctx.<key>` access) and assert the header documents
   exactly that set, both directions — so a key added to / dropped from
   the consumed shape without a matching header edit fails the suite.
   ================================================================ */
{
  const src = readFileSync(new URL('../www/src/ai/chat-bot.js', import.meta.url), 'utf8');

  // Live consumed set: which `_getContext().<key>` keys the handlers read.
  const accessed = new Set();
  const ctxProxy = new Proxy({}, {
    get(_t, k) { if (typeof k === 'string') accessed.add(k); return undefined; },
  });
  const reg = ChatBot.prototype._buildRegistry.call({
    _tools: new Proxy({}, { get() { return () => undefined; } }),
    _getContext: () => ctxProxy,
  });
  for (const t of Object.values(reg)) t.handler({});
  assert(accessed.size >= 4,
         'session363: at least the four known context keys are consumed by the registry');

  // Documented set: the keys inside the header's `getContext(): { ... }`
  // block (each line's leading identifier before `:`).
  const optsIdx = src.indexOf('Constructor options:');
  const ctxOpen = src.indexOf('getContext(): {', optsIdx);
  const ctxClose = src.indexOf('}', ctxOpen);
  const ctxBlock = src.slice(src.indexOf('{', ctxOpen) + 1, ctxClose);
  const documented = new Set(
    [...ctxBlock.matchAll(/^\s*([a-zA-Z]\w*)\s*:/gm)].map(m => m[1]),
  );

  for (const key of accessed) {
    assert(documented.has(key),
           `session363: header getContext block documents consumed key '${key}'`);
  }
  for (const key of documented) {
    assert(accessed.has(key),
           `session363: header getContext block key '${key}' is actually consumed by the registry`);
  }
}
