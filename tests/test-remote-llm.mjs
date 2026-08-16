import {
  toOpenAIBase, toOllamaBase, takeSSEFrames, takeNDJSONLines, summarizeRun, pickContextLength,
  chooseNumCtx, normalizeToolCall, RemoteLLM,
} from '../www/src/ai/remote-llm.js';
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

/* Ollama-native helpers: NDJSON line splitting, num_ctx choice, native
   tool-call normalisation, and the load()-time capability probe. */
{
  const { lines, rest } = takeNDJSONLines('{"a":1}\n\n{"b":2}\n{"c":');
  assert(lines.length === 2 && lines[0] === '{"a":1}' && lines[1] === '{"b":2}',
         'takeNDJSONLines returns complete non-empty lines');
  assert(rest === '{"c":', 'takeNDJSONLines carries the incomplete tail');
  const done = takeNDJSONLines(rest + '3}\n');
  assert(done.lines.length === 1 && done.rest === '', 'takeNDJSONLines completes a carried tail');
}
{
  assert(chooseNumCtx(16384, 131072) === 16384, 'chooseNumCtx honours the requested window under the model max');
  assert(chooseNumCtx(65536, 32768) === 32768, 'chooseNumCtx clamps to the model max');
  assert(chooseNumCtx(2048, 131072) === 8192, 'chooseNumCtx floors at 8K so the system prompt fits');
  assert(chooseNumCtx(null, null) === 8192, 'chooseNumCtx defaults to the floor when nothing is known');
  assert(chooseNumCtx(16384, null) === 16384, 'chooseNumCtx keeps the request when the model max is unknown');
}
{
  const a = normalizeToolCall({ function: { name: 'run', arguments: { text: '10 FACT' } } });
  assert(a.name === 'run' && a.arguments.text === '10 FACT', 'normalizeToolCall reads Ollama-shaped calls');
  const b = normalizeToolCall({ function: { name: 'run', arguments: '{"text":"SWAP"}' } });
  assert(b.arguments.text === 'SWAP', 'normalizeToolCall parses stringified OpenAI-style arguments');
  const c = normalizeToolCall({ function: { name: 'get_stack' } });
  assert(c.name === 'get_stack' && Object.keys(c.arguments).length === 0,
         'normalizeToolCall defaults missing arguments to {}');
  assert(normalizeToolCall({ function: { arguments: {} } }) === null
         && normalizeToolCall(null) === null,
         'normalizeToolCall rejects entries without a name');
}
{
  const s = summarizeRun({ t0: 0, firstTokenAt: 10, t1: 110, inputChars: 400, inputMessages: 2,
                           outputChars: 20, outputTokens: 10, finishReason: 'stop', aborted: false,
                           inputTokens: 123 });
  assert(s.inputTokens === 123, 'summarizeRun carries the server-reported prompt token count');
  const s2 = summarizeRun({ t0: 0, firstTokenAt: null, t1: 5, inputChars: 1, inputMessages: 1,
                            outputChars: 0, outputTokens: 0, finishReason: null, aborted: true });
  assert(s2.inputTokens === null, 'summarizeRun defaults inputTokens to null');
}
{
  // load() against a fake Ollama: /api/show answers with capabilities +
  // context length; the instance reports them and sizes num_ctx.
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/api/version')) return { ok: true, status: 200, json: async () => ({ version: '0.12.0' }) };
    if (String(url).endsWith('/api/show')) {
      return { ok: true, status: 200, json: async () => ({
        capabilities: ['completion', 'tools', 'thinking'],
        model_info: { 'qwen3.context_length': 40960 },
      }) };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  try {
    const llm = new RemoteLLM('http://localhost:11434', { contextTokens: 16384, think: false });
    await llm.load('qwen3:8b');
    assert(llm.status === 'ready' && llm.isOllama, 'RemoteLLM.load detects Ollama via /api/show');
    assert(llm.supportsTools && llm.supportsThinking, 'RemoteLLM exposes tools/thinking capabilities');
    assert(llm.contextTokens === 16384, 'RemoteLLM sizes num_ctx from the requested window');
    assert(llm.thinkEnabled === false && llm.options.think === false,
           'RemoteLLM keeps the think option');
  } finally {
    globalThis.fetch = origFetch;
  }
}
{
  // load() against a plain OpenAI-compatible server: /api/show 404s
  // (no Ollama body), /v1/models answers.
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/version')) return { ok: false, status: 404, json: async () => ({}) };
    if (String(url).endsWith('/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'm' }] }) };
    return { ok: false, status: 500, text: async () => '' };
  };
  try {
    const llm = new RemoteLLM('http://srv:8000/v1');
    await llm.load('m');
    assert(llm.status === 'ready' && !llm.isOllama && !llm.supportsTools,
           'RemoteLLM.load falls back to OpenAI-compat when /api/show is not Ollama');
  } finally {
    globalThis.fetch = origFetch;
  }
}
{
  // generate() on the Ollama path: NDJSON stream with thinking, content
  // and a native tool call; stats pick up the real token counts.
  const origFetch = globalThis.fetch;
  const enc = new TextEncoder();
  const chunks = [
    '{"message":{"role":"assistant","content":"","thinking":"hmm"},"done":false}\n',
    '{"message":{"role":"assistant","content":"Computing."},"done":false}\n',
    '{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"run","arguments":{"text":"10 FACT"}}}]},"done":false}\n',
    '{"message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":321,"eval_count":7}\n',
  ];
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/api/version')) return { ok: true, status: 200, json: async () => ({ version: '0.12.0' }) };
    if (String(url).endsWith('/api/show')) {
      return { ok: true, status: 200, json: async () => ({ capabilities: ['tools', 'thinking'], model_info: {} }) };
    }
    if (String(url).endsWith('/api/chat')) {
      sentBody = JSON.parse(init.body);
      let i = 0;
      return { ok: true, status: 200, body: { getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true }),
      }) } };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  try {
    const llm = new RemoteLLM('http://localhost:11434', { contextTokens: 8192 });
    await llm.load('m');
    let text = '', thinking = '';
    const out = await llm.generate([{ role: 'user', content: 'hi' }], {
      onToken: (t) => { text += t; }, onThinking: (t) => { thinking += t; },
      maxTokens: 999, tools: [{ type: 'function', function: { name: 'run', parameters: {} } }],
    });
    assert(text === 'Computing.' && thinking === 'hmm', 'generate streams content and thinking separately');
    assert(out.toolCalls.length === 1 && out.toolCalls[0].arguments.text === '10 FACT',
           'generate returns native tool calls');
    assert(sentBody.options.num_ctx === 8192 && sentBody.options.num_predict === 999,
           'generate requests num_ctx and num_predict');
    assert(Array.isArray(sentBody.tools) && sentBody.think === true && sentBody.keep_alive,
           'generate passes tools, think and keep_alive when supported');
    assert(llm.lastStats.inputTokens === 321 && llm.lastStats.outputTokens === 7,
           'generate reports Ollama\'s real prompt/eval token counts');
  } finally {
    globalThis.fetch = origFetch;
  }
}

{
  // Ollama without the requested model: /api/show 404 → clear error.
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/version')) return { ok: true, status: 200, json: async () => ({ version: '0.12.0' }) };
    if (String(url).endsWith('/api/show')) return { ok: false, status: 404, text: async () => '{"error":"model not found"}' };
    return { ok: false, status: 500, text: async () => '' };
  };
  try {
    const llm = new RemoteLLM('http://localhost:11434');
    let msg = '';
    try { await llm.load('nope'); } catch (e) { msg = e.message; }
    assert(/not available on the server/.test(msg) && llm.status === 'error',
           'RemoteLLM.load reports a missing Ollama model plainly');
  } finally {
    globalThis.fetch = origFetch;
  }
}
