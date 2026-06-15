import {
  parseAllToolCalls, parseSuggestions, findMachineSectionStart, stripThinkBlocks,
} from '../www/src/ai/chat-bot.js';
import { assert } from './helpers.mjs';

/* AI chat-bot response parsers — the pure helpers that pull structured
   tool calls, follow-up suggestions and reasoning blocks out of a raw
   model response.  These run on every streamed turn, so edge cases
   (HP50 list braces inside arguments, trailing commas from small
   models, unclosed mid-stream reasoning) need to stay pinned. */

/* ================================================================
   parseAllToolCalls
   ================================================================ */

// Single well-formed call.
{
  const calls = parseAllToolCalls('{"name":"add","arguments":{"a":1,"b":2}}');
  assert(calls.length === 1 && calls[0].name === 'add'
         && calls[0].arguments.a === 1 && calls[0].arguments.b === 2,
         'parseAllToolCalls reads a single call with arguments');
}

// Leading prose before the JSON is ignored.
{
  const calls = parseAllToolCalls('Sure, pushing that.\n{"name":"push","arguments":{"value":3}}');
  assert(calls.length === 1 && calls[0].name === 'push' && calls[0].arguments.value === 3,
         'parseAllToolCalls skips prose preceding the JSON anchor');
}

// Two back-to-back calls both surface.
{
  const calls = parseAllToolCalls('{"name":"a","arguments":{}} then {"name":"b","arguments":{}}');
  assert(calls.length === 2 && calls[0].name === 'a' && calls[1].name === 'b',
         'parseAllToolCalls returns multiple calls in order');
}

// Missing arguments key defaults to an empty object.
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

// Malformed JSON at the anchor is skipped, not thrown.
{
  const calls = parseAllToolCalls('{"name": not valid json here}');
  assert(Array.isArray(calls) && calls.length === 0,
         'parseAllToolCalls skips a malformed object');
}

// No anchor at all → empty list.
{
  const calls = parseAllToolCalls('just a plain prose answer with no tool call');
  assert(Array.isArray(calls) && calls.length === 0,
         'parseAllToolCalls returns [] when no anchor is present');
}

/* ================================================================
   parseSuggestions
   ================================================================ */

// Canonical SUGGEST line.
{
  const out = parseSuggestions('SUGGEST: ["What is the determinant?", "Invert it", "Show steps"]');
  assert(Array.isArray(out) && out.length === 3 && out[0] === 'What is the determinant?',
         'parseSuggestions reads a JSON array of three');
}

// More than three are capped to three.
{
  const out = parseSuggestions('SUGGEST: ["a","b","c","d","e"]');
  assert(out.length === 3 && out[2] === 'c',
         'parseSuggestions caps the result at three items');
}

// Leading prose before the marker is tolerated.
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

// Empty and whitespace-only entries are dropped.
{
  const out = parseSuggestions('SUGGEST: ["keep", "", "  "]');
  assert(out && out.length === 1 && out[0] === 'keep',
         'parseSuggestions filters empty/whitespace entries');
}

// No marker → null.
{
  assert(parseSuggestions('no marker here') === null,
         'parseSuggestions returns null without a marker');
  assert(parseSuggestions('') === null,
         'parseSuggestions returns null on empty input');
}

/* ================================================================
   findMachineSectionStart
   ================================================================ */

// Pure prose → -1.
{
  assert(findMachineSectionStart('totally plain prose') === -1,
         'findMachineSectionStart returns -1 for pure prose');
}

// JSON anchor offset is reported.
{
  const text = 'answer here {"name":"x"}';
  assert(findMachineSectionStart(text) === text.indexOf('{'),
         'findMachineSectionStart reports the JSON anchor offset');
}

// SUGGEST marker offset is reported.
{
  const text = 'answer here SUGGEST: ["q"]';
  assert(findMachineSectionStart(text) === text.indexOf('SUGGEST'),
         'findMachineSectionStart reports the SUGGEST offset');
}

// When both appear, the earliest wins.
{
  const text = 'p SUGGEST: ["q"] more {"name":"x"}';
  assert(findMachineSectionStart(text) === text.indexOf('SUGGEST'),
         'findMachineSectionStart returns the earliest of the two markers');
}

/* ================================================================
   stripThinkBlocks
   ================================================================ */

// Complete pair is removed.
{
  assert(stripThinkBlocks('<think>weighing options</think>The answer is 4.') === 'The answer is 4.',
         'stripThinkBlocks removes a complete reasoning pair');
}

// <thinking> spelling and case-insensitivity.
{
  assert(stripThinkBlocks('<THINKING>hmm</THINKING>done') === 'done',
         'stripThinkBlocks handles <thinking> case-insensitively');
}

// Multiline reasoning content.
{
  assert(stripThinkBlocks('<think>line one\nline two</think>ok') === 'ok',
         'stripThinkBlocks spans newlines in the block');
}

// Unclosed mid-stream open block drops everything from the tag on.
{
  assert(stripThinkBlocks('visible answer<think>still reasoning') === 'visible answer',
         'stripThinkBlocks drops a trailing unclosed reasoning block');
}

// No tags → passthrough; empty/null preserved.
{
  assert(stripThinkBlocks('plain text') === 'plain text',
         'stripThinkBlocks passes through untagged text');
  assert(stripThinkBlocks('') === '',
         'stripThinkBlocks preserves empty string');
  assert(stripThinkBlocks(null) === null,
         'stripThinkBlocks preserves null');
}
