import { toOpenAIBase, toOllamaBase, takeSSEFrames, summarizeRun, pickContextLength, RemoteLLM } from '../www/src/ai/remote-llm.js';
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

// session373: the space after `data:` is optional per the SSE spec, and
// the prior block only ever feeds the spaced `data: ` form (via `frame`).
// The `.slice(5).trim()` handles both — a refactor to `.slice(6)` assuming
// a leading space would pass every other pin but drop these. Pin the
// no-space frame, the multi-space payload, the no-space [DONE] skip, and
// the whitespace-only payload (trims to an empty `''` frame, not skipped).
{
  const nospace = takeSSEFrames('data:{"a":1}\n');
  assert(nospace.frames.length === 1 && nospace.frames[0] === '{"a":1}' && nospace.rest === '',
         'takeSSEFrames reads a frame with no space after data:');
  const multispace = takeSSEFrames('data:    {"b":2}\n');
  assert(multispace.frames.length === 1 && multispace.frames[0] === '{"b":2}',
         'takeSSEFrames trims extra spaces after data:');
  const doneTight = takeSSEFrames('data:[DONE]\n');
  assert(doneTight.frames.length === 0 && doneTight.rest === '',
         'takeSSEFrames skips a [DONE] sentinel with no space after data:');
  const blankPayload = takeSSEFrames('data:   \n');
  assert(blankPayload.frames.length === 1 && blankPayload.frames[0] === '',
         'takeSSEFrames emits an empty-string frame for a whitespace-only data: payload');
}

/* summarizeRun — the post-stream stats/timing assembler extracted from
   generate().  It turns the three captured timestamps (t0, firstTokenAt,
   t1) plus the per-run counters into the stats object the onStats
   listeners receive.  The derivations are the subtle bit: ttft/decode
   throughput must collapse to null when no token arrived, and the
   tokens-per-second math must not divide by a zero-length decode window.
   Pure, so it pins exactly without standing up a fetch. */

// session300: nominal run — t0=100, first token at 300, end at 1300.
// totalMs=1200, ttftMs=200, decode window=1000ms over 50 tokens → 50 tps.
{
  const s = summarizeRun({
    t0: 100, firstTokenAt: 300, t1: 1300,
    inputChars: 42, inputMessages: 3, outputChars: 210, outputTokens: 50,
    finishReason: 'stop', aborted: false,
  });
  assert(s.totalMs === 1200, 'summarizeRun totalMs = t1 - t0');
  assert(s.ttftMs === 200, 'summarizeRun ttftMs = firstTokenAt - t0');
  assert(s.decodeTps === 50, 'summarizeRun decodeTps = tokens / (decodeMs/1000)');
}

// session300: passthrough fields and the fixed id/runtimeStats shape are
// carried straight through so the onStats consumer sees the same object.
{
  const s = summarizeRun({
    t0: 0, firstTokenAt: 10, t1: 20,
    inputChars: 7, inputMessages: 2, outputChars: 9, outputTokens: 4,
    finishReason: 'length', aborted: true,
  });
  assert(s.id === 0 && s.runtimeStats === null,
         'summarizeRun fixes id=0 and runtimeStats=null');
  assert(s.inputChars === 7 && s.inputMessages === 2 &&
         s.outputChars === 9 && s.outputTokens === 4,
         'summarizeRun passes the counters through unchanged');
  assert(s.finishReason === 'length' && s.aborted === true,
         'summarizeRun passes finishReason and aborted through unchanged');
}

// session300: no token ever arrived (firstTokenAt null) — ttftMs and
// decodeTps are null, but totalMs is still measured end to end.
{
  const s = summarizeRun({
    t0: 100, firstTokenAt: null, t1: 900,
    inputChars: 5, inputMessages: 1, outputChars: 0, outputTokens: 0,
    finishReason: null, aborted: true,
  });
  assert(s.totalMs === 800, 'summarizeRun still reports totalMs with no tokens');
  assert(s.ttftMs === null && s.decodeTps === null,
         'summarizeRun nulls ttftMs and decodeTps when no token arrived');
}

// session300: zero-length decode window (first token on the final read,
// firstTokenAt === t1) — guarded so decodeTps is null, not Infinity/NaN.
{
  const s = summarizeRun({
    t0: 0, firstTokenAt: 500, t1: 500,
    inputChars: 3, inputMessages: 1, outputChars: 8, outputTokens: 2,
    finishReason: 'stop', aborted: false,
  });
  assert(s.ttftMs === 500, 'summarizeRun ttftMs measured even for a zero decode window');
  assert(s.decodeTps === null,
         'summarizeRun nulls decodeTps when the decode window is zero-length');
}

/* pickContextLength — the arch-keyed context-window extractor lifted out of
   load()'s /api/show probe.  The key name is model-dependent (the arch
   prefix varies), so it matches whichever key ends in `.context_length` and
   returns the positive token count or null.  Pure, so it pins the key-match
   and the value-validity guard (positive number) without standing up fetch;
   load() routes through it, then chat-bot.js's effectiveBudget falls back to
   a default when it returns null. */

// session346: the happy path — the arch-prefixed `.context_length` key is
// found regardless of arch, and its positive value is returned.
{
  assert(pickContextLength({ 'qwen2.context_length': 32768, 'general.name': 'x' }) === 32768,
         'pickContextLength returns the value behind an arch-prefixed .context_length key');
  assert(pickContextLength({ 'llama.context_length': 8192 }) === 8192,
         'pickContextLength matches a different arch prefix');
}

// session346: the value-validity guard — a zero, negative, or non-number
// value is rejected to null (the > 0 and typeof === 'number' checks), so a
// bogus server response falls back to the default budget rather than sizing
// the trimmer to a useless window.
{
  assert(pickContextLength({ 'a.context_length': 0 }) === null,
         'pickContextLength rejects a zero context length');
  assert(pickContextLength({ 'a.context_length': -5 }) === null,
         'pickContextLength rejects a negative context length');
  assert(pickContextLength({ 'a.context_length': '4096' }) === null,
         'pickContextLength rejects a non-number context length');
}

// session346: the no-usable-key arms — a map with no matching key, an empty
// map, and a missing (null/undefined) map all yield null without throwing.
{
  assert(pickContextLength({ 'general.name': 'x' }) === null,
         'pickContextLength returns null when no key ends in .context_length');
  assert(pickContextLength({}) === null,
         'pickContextLength returns null for an empty model_info map');
  assert(pickContextLength(null) === null && pickContextLength(undefined) === null,
         'pickContextLength tolerates a missing model_info map');
}

// session413: multi-key + match-shape arms. The key match is
// `Object.keys(info).find(k => k.endsWith('.context_length'))` — it selects
// the FIRST matching key by insertion order, then validates only THAT key's
// value. Every session346 pin feeds a single `.context_length` key, so the
// order-dependence and the find-by-name-not-by-validity behavior were never
// exercised: a refactor folding the value guard into the `.find` predicate
// (so it skips an invalid key to a later valid one) would pass every prior
// pin yet change the result on a multi-key map. The dot in `.context_length`
// is also required — a bare `context_length` key does not match.
{
  assert(pickContextLength({ 'qwen2.context_length': 32768, 'llama.context_length': 8192 }) === 32768,
         'pickContextLength returns the first matching key by insertion order');
  assert(pickContextLength({ 'llama.context_length': 8192, 'qwen2.context_length': 32768 }) === 8192,
         'pickContextLength is order-dependent: a different first key wins');
  assert(pickContextLength({ 'a.context_length': 0, 'b.context_length': 4096 }) === null,
         'pickContextLength validates the first matched key, not a later valid one (zero)');
  assert(pickContextLength({ 'a.context_length': '4096', 'b.context_length': 4096 }) === null,
         'pickContextLength validates the first matched key, not a later valid one (non-number)');
  assert(pickContextLength({ 'general.name': 'x', 'q.context_length': 2048 }) === 2048,
         'pickContextLength skips a non-matching key to the first one ending in .context_length');
  assert(pickContextLength({ 'context_length': 4096 }) === null,
         'pickContextLength requires the dot: a bare context_length key does not match');
}

/* RemoteLLM class — the network-free surface.  The four pure helpers above
   were pinned (session288/294/300) but the class wrapping them never was.
   Construction normalizes the typed endpoint through toOpenAIBase and seeds
   the initial getter state; load()/generate() guard their preconditions
   BEFORE any fetch, so those reject/throw arms are reachable with no I/O. */

// session339: constructor normalizes the endpoint via toOpenAIBase and the
// initial getter state is the idle/unloaded defaults.
{
  const r = new RemoteLLM('http://localhost:11434');
  assert(r.endpoint === 'http://localhost:11434/v1',
         'RemoteLLM normalizes the constructor endpoint through toOpenAIBase');
  assert(new RemoteLLM('http://h:1/api/').endpoint === 'http://h:1/v1',
         'RemoteLLM folds an Ollama /api root in the constructor');
  assert(new RemoteLLM().endpoint === '',
         'RemoteLLM defaults to an empty (unset) endpoint');
  assert(r.status === 'idle' && r.statusMsg === '',
         'a fresh RemoteLLM is idle with no status message');
  assert(r.loadedModelId === null && r.contextTokens === null && r.lastStats === null,
         'a fresh RemoteLLM has no loaded model, context window, or stats');
}

// session339: load()'s two preconditions reject before any fetch — a missing
// modelId and an unconfigured (empty) endpoint.
{
  let msg = '';
  await new RemoteLLM('http://h:1').load().catch((e) => { msg = e.message; });
  assert(msg === 'load() requires a modelId',
         'load() rejects without a modelId before probing the network');
  msg = '';
  await new RemoteLLM('').load('llama3').catch((e) => { msg = e.message; });
  assert(msg === 'Endpoint URL not configured',
         'load() rejects when the endpoint is unset before probing');
}

// session339: generate() throws the readiness gate before opening an
// AbortController/fetch when the model has not loaded (status !== 'ready').
{
  let msg = '';
  await new RemoteLLM('http://h:1')
    .generate([{ role: 'user', content: 'hi' }])
    .catch((e) => { msg = e.message; });
  assert(msg === 'Model not ready',
         'generate() rejects on a non-ready model before any network call');
}

// session339: the onStatus subscription contract — the listener fires on a
// status change and the returned unsubscribe function removes it (the same
// add/return-remover shape backs onProgress/onStats).
{
  const r = new RemoteLLM('http://h:1');
  const seen = [];
  const off = r.onStatus((s, m) => seen.push([s, m]));
  assert(typeof off === 'function', 'onStatus returns an unsubscribe function');
  r._setStatus('loading', 'hi');
  off();
  r._setStatus('ready', 'done');
  assert(seen.length === 1 && seen[0][0] === 'loading' && seen[0][1] === 'hi',
         'onStatus listener fires once then stops after unsubscribe');
  assert(r.status === 'ready' && r.statusMsg === 'done',
         '_setStatus updates the status/statusMsg getters regardless of listeners');
}
