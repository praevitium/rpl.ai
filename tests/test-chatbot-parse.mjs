import {
  parseAllToolCalls, parseSuggestions, findMachineSectionStart, stripThinkBlocks,
  resolveToolAlias, activeContextTokens, effectiveBudget,
} from '../www/src/ai/chat-bot.js';
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
