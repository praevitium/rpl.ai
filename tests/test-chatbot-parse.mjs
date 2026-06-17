import {
  parseAllToolCalls, parseSuggestions, findMachineSectionStart, stripThinkBlocks,
  resolveToolAlias, activeContextTokens, effectiveBudget, TOOL_ALIASES, ChatBot,
} from '../www/src/ai/chat-bot.js';
import { SYSTEM_PROMPT_COMBINED, RPL_CATALOG } from '../www/src/ai/system-prompt.js';
import { hasOp } from '../www/src/rpl/ops.js';
import { assert } from './helpers.mjs';

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
