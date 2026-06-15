import { toOpenAIBase, toOllamaBase, takeSSEFrames } from '../www/src/ai/remote-llm.js';
import { assert } from './helpers.mjs';

/* RemoteLLM URL normalizers — the two pure helpers that turn whatever
   base URL the user typed into the canonical forms the call sites need:
   `toOpenAIBase` → the OpenAI-compatible `…/v1` base (for
   /chat/completions and /models), `toOllamaBase` → the Ollama-native
   server root (call sites append /api/<endpoint>).  Both run once per
   load() and feed every request URL, so the accepted-input shapes
   (bare host, trailing slashes, an explicit /v1, Ollama's /api root)
   need to stay pinned against a refactor of the suffix juggling. */

// session288: toOpenAIBase — append /v1, strip trailing slashes, fold
// the Ollama-native /api root to the server root before suffixing.
{
  assert(toOpenAIBase('http://localhost:11434') === 'http://localhost:11434/v1',
         'toOpenAIBase appends /v1 to a bare host:port');
}
{
  assert(toOpenAIBase('http://localhost:11434/') === 'http://localhost:11434/v1',
         'toOpenAIBase strips a trailing slash before appending /v1');
}
{
  assert(toOpenAIBase('http://localhost:11434///') === 'http://localhost:11434/v1',
         'toOpenAIBase strips multiple trailing slashes');
}
{
  assert(toOpenAIBase('http://localhost:11434/v1') === 'http://localhost:11434/v1',
         'toOpenAIBase leaves an explicit /v1 untouched');
}
{
  assert(toOpenAIBase('http://localhost:11434/v1/') === 'http://localhost:11434/v1',
         'toOpenAIBase strips the trailing slash off an explicit /v1');
}
{
  assert(toOpenAIBase('http://localhost:11434/api') === 'http://localhost:11434/v1',
         'toOpenAIBase folds the Ollama-native /api root to /v1');
}
{
  assert(toOpenAIBase('http://localhost:11434/api/') === 'http://localhost:11434/v1',
         'toOpenAIBase folds /api with a trailing slash to /v1');
}
{
  assert(toOpenAIBase('') === '',
         'toOpenAIBase preserves empty so callers can detect unset');
}
{
  assert(toOpenAIBase(null) === '' && toOpenAIBase(undefined) === '',
         'toOpenAIBase coerces null/undefined to empty');
}

// session288: toOllamaBase — strip a trailing slash plus any /v1 or
// /api suffix, leaving the bare server root for /api/<endpoint>.
{
  assert(toOllamaBase('http://localhost:11434') === 'http://localhost:11434',
         'toOllamaBase leaves a bare host:port unchanged');
}
{
  assert(toOllamaBase('http://localhost:11434/') === 'http://localhost:11434',
         'toOllamaBase strips a trailing slash');
}
{
  assert(toOllamaBase('http://localhost:11434/v1') === 'http://localhost:11434',
         'toOllamaBase strips a /v1 suffix');
}
{
  assert(toOllamaBase('http://localhost:11434/v1/') === 'http://localhost:11434',
         'toOllamaBase strips a /v1 suffix with a trailing slash');
}
{
  assert(toOllamaBase('http://localhost:11434/api') === 'http://localhost:11434',
         'toOllamaBase strips an /api suffix');
}
{
  assert(toOllamaBase('') === '',
         'toOllamaBase returns empty for empty input');
}
{
  assert(toOllamaBase(null) === '' && toOllamaBase(undefined) === '',
         'toOllamaBase coerces null/undefined to empty');
}

// session288: round-trip — a typed base normalized to the OpenAI form
// folds back to the same server root via toOllamaBase, so the two
// derived URLs always share an origin regardless of what the user typed.
{
  const root = 'http://localhost:11434';
  for (const typed of [root, root + '/', root + '/v1', root + '/api', root + '/v1/']) {
    assert(toOllamaBase(toOpenAIBase(typed)) === root,
           `toOllamaBase(toOpenAIBase("${typed}")) folds back to the server root`);
  }
}

/* takeSSEFrames — the SSE frame-splitter extracted from generate()'s read
   loop.  It owns the trickiest part of the streaming path: carving an
   accumulating byte-buffer into complete `data:` payloads while carrying
   the incomplete final line forward to the next read.  JSON.parse stays at
   the call site (so a malformed frame is logged in context), so this helper
   only needs to be pinned on the framing/skip/carry behavior. */

const frame = (obj) => 'data: ' + JSON.stringify(obj);

// session294: two complete frames plus an incomplete tail — the tail (no
// terminating newline yet) is returned as `rest` to prepend next read.
{
  const buf = frame({ a: 1 }) + '\n' + frame({ b: 2 }) + '\ndata: {"c":3';
  const { frames, rest } = takeSSEFrames(buf);
  assert(frames.length === 2 && frames[0] === '{"a":1}' && frames[1] === '{"b":2}',
         'takeSSEFrames extracts each complete data frame in order');
  assert(rest === 'data: {"c":3',
         'takeSSEFrames carries the unterminated final line as rest');
}

// session294: a frame split across two reads reassembles via rest — the
// carried tail prepended to the next chunk yields the whole frame.
{
  const first = takeSSEFrames('data: {"d":');
  assert(first.frames.length === 0 && first.rest === 'data: {"d":',
         'takeSSEFrames buffers a frame that has no newline yet');
  const second = takeSSEFrames(first.rest + '4}\n');
  assert(second.frames.length === 1 && second.frames[0] === '{"d":4}' && second.rest === '',
         'takeSSEFrames completes a split frame once its newline arrives');
}

// session294: blank lines, non-`data:` lines (SSE comments), and the
// [DONE] sentinel are all skipped — they yield no frames.
{
  const buf = '\n\n: keep-alive comment\n' + frame({ x: 1 }) + '\ndata: [DONE]\n';
  const { frames, rest } = takeSSEFrames(buf);
  assert(frames.length === 1 && frames[0] === '{"x":1}',
         'takeSSEFrames skips blank/comment lines and the [DONE] sentinel');
  assert(rest === '', 'takeSSEFrames consumes a fully newline-terminated buffer');
}

// session294: CRLF line endings — the per-line .trim() drops the trailing
// \r so the JSON payload comes out clean.
{
  const { frames } = takeSSEFrames(frame({ z: 1 }) + '\r\n');
  assert(frames.length === 1 && frames[0] === '{"z":1}',
         'takeSSEFrames tolerates CRLF line endings');
}

// session294: degenerate inputs — empty buffer and a bare incomplete line
// produce no frames; the bare line is preserved as rest.
{
  const empty = takeSSEFrames('');
  assert(empty.frames.length === 0 && empty.rest === '',
         'takeSSEFrames on an empty buffer yields no frames and empty rest');
  const partial = takeSSEFrames('data: {"p":1}');
  assert(partial.frames.length === 0 && partial.rest === 'data: {"p":1}',
         'takeSSEFrames holds a complete-looking but unterminated frame as rest');
}
