import {
  parseAllToolCalls, parseSuggestions, findMachineSectionStart, stripThinkBlocks,
  resolveToolAlias, activeContextTokens, effectiveBudget, TOOL_ALIASES,
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
  const expected = [
    'append_to_editor', 'clear_editor', 'get_editor', 'get_stack',
    'get_vars', 'push_to_stack', 'recall_var', 'run',
  ];
  assert(documented.join(',') === expected.join(','),
         'AVAILABLE TOOLS block documents exactly the registry tool set');

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

// session283: guard the alias map from the target side. Every alias must
// point at a real canonical tool, and no target may also be a key — a
// two-hop chain (synonym of a synonym) would leave resolveToolAlias one
// rewrite short, and a target outside the tool set would silently route
// a call to a nonexistent op.
{
  const canonical = new Set([
    'append_to_editor', 'clear_editor', 'get_editor', 'get_stack',
    'get_vars', 'push_to_stack', 'recall_var', 'run',
  ]);
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
