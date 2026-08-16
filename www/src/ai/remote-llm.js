/* =================================================================
   RemoteLLM — drop-in replacement for LLM that talks to an HTTP
   endpoint instead of running WebLLM in a worker.

   Two wire protocols, picked at load() time:

     Ollama native (`POST /api/chat`) — used when the server answers
       Ollama's `/api/show`.  This is the path that makes Ollama work
       well: we size `num_ctx` ourselves (Ollama's default context is
       small enough to silently truncate our system prompt), pass
       `tools` for native tool calling and `think` for reasoning models
       when the model advertises those capabilities, keep the model
       resident between turns, and read real prompt/eval token counts.

     OpenAI-compatible (`POST /v1/chat/completions`) — any other server
       that mirrors that subset of the OpenAI API.

   Public surface mirrors LLM so chat-bot.js can swap one for the
   other without conditional plumbing:
     status, statusMsg, loadedModelId, lastStats, contextTokens,
     supportsTools, supportsThinking
     onStatus(fn), onProgress(fn), onStats(fn)
     load(modelId), generate(messages, {onToken, onThinking, maxTokens,
     tools}) → { toolCalls }, abort()

   Progress events never fire (no weights to download); the onProgress
   subscription exists only so the consumer doesn't special-case which
   impl it has. */

/** Normalize a user-typed base URL into the OpenAI-compatible base
 *  (with `/v1` suffix).  Accepts `http://host:port`, `…/v1`, or
 *  `…/api` (Ollama-native root) and returns `…/v1` in all cases.
 *  Trailing slashes are stripped. */
export function toOpenAIBase(typed) {
  let s = (typed || '').replace(/\/+$/, '');
  if (!s) return '';               // preserve empty so callers can detect "unset"
  s = s.replace(/\/api$/, '');     // Ollama-native root → server root
  if (!/\/v1$/.test(s)) s += '/v1';
  return s;
}

/** Normalize a user-typed base URL into the Ollama-native server root
 *  (no `/v1`, no `/api`).  Call sites append `/api/<endpoint>`. */
export function toOllamaBase(typed) {
  return (typed || '')
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '')
    .replace(/\/api$/, '');
}

/** Pull complete SSE data frames out of an accumulating stream buffer.
 *  Each returned frame is the JSON text following a `data:` prefix on a
 *  newline-terminated line; blank lines, non-`data:` lines, and the
 *  `[DONE]` sentinel are skipped.  The unconsumed tail (an incomplete
 *  final line that hasn't seen its newline yet) is returned as `rest` to
 *  carry into the next read.  JSON parsing stays at the call site so a
 *  malformed frame can be logged in context. */
export function takeSSEFrames(buffer) {
  const frames = [];
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    frames.push(data);
  }
  return { frames, rest: buffer };
}

/** Pull complete newline-delimited JSON lines out of an accumulating
 *  stream buffer (Ollama's /api/chat streaming format).  Same contract
 *  as takeSSEFrames: complete lines out, unconsumed tail back. */
export function takeNDJSONLines(buffer) {
  const lines = [];
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line) lines.push(line);
  }
  return { lines, rest: buffer };
}

/** Assemble the post-stream stats object from a run's raw measurements.
 *  Derives totalMs/ttftMs and the decode throughput (tokens per second
 *  over the decode window) from the three timestamps; `firstTokenAt`
 *  null means no token ever arrived, so ttft and decodeTps stay null.
 *  A zero-length decode window yields null decodeTps (no divide-by-zero).
 *  `inputTokens` is the server-reported prompt token count when known
 *  (Ollama), else null — the UI falls back to a chars/4 estimate. */
export function summarizeRun({
  t0, firstTokenAt, t1,
  inputChars, inputMessages, outputChars, outputTokens,
  finishReason, aborted, inputTokens = null,
}) {
  const totalMs   = t1 - t0;
  const ttftMs    = firstTokenAt !== null ? firstTokenAt - t0 : null;
  const decodeMs  = firstTokenAt !== null ? t1 - firstTokenAt : null;
  const decodeTps = (decodeMs && decodeMs > 0)
    ? (outputTokens / (decodeMs / 1000))
    : null;
  return {
    id: 0,
    inputChars,
    inputMessages,
    inputTokens,
    outputTokens,
    outputChars,
    totalMs,
    ttftMs,
    decodeTps,
    finishReason,
    aborted,
    runtimeStats: null,
  };
}

/** Pick the model's max context length out of Ollama's `/api/show`
 *  `model_info` map.  The key is arch-prefixed and varies by model
 *  (e.g. `qwen2.context_length`), so we match whichever key ends in
 *  `.context_length`.  Returns the positive token count, or null when
 *  no usable entry is present. */
export function pickContextLength(modelInfo) {
  const info = modelInfo ?? {};
  const ctxKey = Object.keys(info).find((k) => k.endsWith('.context_length'));
  if (ctxKey && typeof info[ctxKey] === 'number' && info[ctxKey] > 0) {
    return info[ctxKey];
  }
  return null;
}

/** Decide the `num_ctx` to request from Ollama.  We ask for the user's
 *  configured window (default REMOTE_CONTEXT_TOKENS_DEFAULT in chat-
 *  bot.js), clamped to what the model supports and floored so the
 *  system prompt always fits.  Kept constant across a session because
 *  Ollama reloads the model whenever num_ctx changes. */
export function chooseNumCtx(requested, modelMax) {
  const MIN = 8192;
  let n = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : MIN;
  if (n < MIN) n = MIN;
  if (Number.isFinite(modelMax) && modelMax > 0 && n > modelMax) n = modelMax;
  return n;
}

/** Normalise one Ollama `message.tool_calls[]` entry (or an OpenAI-
 *  style one with stringified arguments) into `{ name, arguments }`.
 *  Returns null when the entry carries no usable function name. */
export function normalizeToolCall(tc) {
  const fn = tc?.function ?? tc;
  const name = fn?.name;
  if (typeof name !== 'string' || !name) return null;
  let args = fn.arguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = { text: args }; }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  return { name, arguments: args };
}

const now = () => (typeof performance !== 'undefined' && performance.now)
  ? performance.now() : Date.now();

export class RemoteLLM {
  /** `opts.contextTokens` — context window to request from Ollama
   *  (num_ctx) and to budget history against; `opts.think` — let a
   *  thinking-capable model reason before answering (default true). */
  constructor(endpoint = '', opts = {}) {
    // Always store the OpenAI-compat base (with /v1).  /chat/completions
    // and /models are appended directly; Ollama-native calls derive the
    // server root via toOllamaBase().
    this._endpoint  = toOpenAIBase(endpoint);
    this._status    = 'idle';
    this._statusMsg = '';
    this._statusListeners   = new Set();
    this._progressListeners = new Set();
    this._statsListeners    = new Set();
    this._lastStats         = null;

    this._loadingModelId = null;
    this._loadedModelId  = null;
    this._requestedContext = opts.contextTokens ?? null;
    this._think = opts.think !== false;
    // Filled by load(): whether the server is Ollama, what the model
    // can do, and the context window we'll actually run with.
    this._isOllama = false;
    this._capabilities = [];
    this._modelMaxContext = null;
    this._contextTokens = null;

    this._abortCtrl = null;
  }

  /* ---- Public API ---- */

  get status()    { return this._status; }
  get statusMsg() { return this._statusMsg; }
  get endpoint()  { return this._endpoint; }
  get lastStats() { return this._lastStats; }
  get loadedModelId() { return this._loadedModelId ?? null; }
  get contextTokens() { return this._contextTokens; }
  get isOllama() { return this._isOllama; }
  get supportsTools() { return this._isOllama && this._capabilities.includes('tools'); }
  get supportsThinking() { return this._isOllama && this._capabilities.includes('thinking'); }
  get thinkEnabled() { return this._think; }
  get options() { return { contextTokens: this._requestedContext, think: this._think }; }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }
  onProgress(fn) {
    this._progressListeners.add(fn);
    return () => this._progressListeners.delete(fn);
  }
  onStats(fn) {
    this._statsListeners.add(fn);
    return () => this._statsListeners.delete(fn);
  }

  /** Probe the configured endpoint and mark ready.  modelId is the
   *  model name the server will route requests to (e.g. "llama3.2").
   *  We don't pre-load weights — the server keeps them resident. */
  async load(modelId /* , opts = {} */) {
    if (!modelId) {
      return Promise.reject(new Error('load() requires a modelId'));
    }
    if (!this._endpoint) {
      return Promise.reject(new Error('Endpoint URL not configured'));
    }
    if (this._status === 'ready' && this._loadedModelId === modelId) {
      return;
    }
    this._loadingModelId = modelId;
    this._setStatus('loading', `Connecting to ${this._endpoint}…`);
    try {
      // Ollama first: /api/version proves it's Ollama, then /api/show
      // tells us everything we need (context length, capabilities) and
      // proves the model exists.
      const ollamaBase = toOllamaBase(this._endpoint);
      let isOllama = false;
      try {
        const v = await fetch(ollamaBase + '/api/version', { method: 'GET' });
        if (v.ok) {
          const body = await v.json().catch(() => null);
          isOllama = !!(body && typeof body.version === 'string');
        }
      } catch { isOllama = false; }

      let shown = null;
      if (isOllama) {
        const r = await fetch(ollamaBase + '/api/show', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: modelId }),
        });
        if (r.status === 404) {
          throw new Error(`Model "${modelId}" is not available on the server (pull it first)`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} from ${ollamaBase}/api/show`);
        shown = await r.json();
      }

      if (shown) {
        this._isOllama = true;
        this._capabilities = Array.isArray(shown.capabilities) ? shown.capabilities : [];
        this._modelMaxContext = pickContextLength(shown.model_info);
        this._contextTokens = chooseNumCtx(this._requestedContext, this._modelMaxContext);
        // eslint-disable-next-line no-console
        console.log('[RemoteLLM] Ollama model', modelId,
                    'capabilities=', this._capabilities,
                    'maxContext=', this._modelMaxContext,
                    'num_ctx=', this._contextTokens);
      } else {
        // OpenAI-compatible: GET /models is the lightest probe.
        const resp = await fetch(this._endpoint + '/models', { method: 'GET' });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} from ${this._endpoint}/models`);
        }
        try {
          const body = await resp.json();
          const ids = (body?.data ?? []).map((m) => m.id).filter(Boolean);
          if (ids.length && !ids.includes(modelId)) {
            // eslint-disable-next-line no-console
            console.warn('[RemoteLLM] model', modelId,
                         'not in /models response; available:', ids);
          }
        } catch { /* not JSON / unexpected shape — ignore */ }
        this._isOllama = false;
        this._capabilities = [];
        this._contextTokens = this._requestedContext || null;
      }

      this._loadedModelId  = modelId;
      this._loadingModelId = null;
      this._setStatus('ready', this._isOllama ? 'Ready (Ollama)' : 'Ready (remote)');
    } catch (err) {
      this._loadingModelId = null;
      this._setStatus('error', `Remote endpoint unreachable: ${err.message ?? err}`);
      throw err;
    }
  }

  /** Stream one reply.  Resolves to `{ toolCalls }` — native tool
   *  calls the model made (Ollama only; empty otherwise).  `onToken`
   *  receives visible text, `onThinking` a thinking model's hidden
   *  reasoning (Ollama only). */
  async generate(messages, { onToken, onThinking, maxTokens, tools } = {}) {
    if (this._status !== 'ready') {
      // eslint-disable-next-line no-console
      console.warn('[RemoteLLM] generate rejected: status=', this._status);
      throw new Error('Model not ready');
    }
    this._abortCtrl = new AbortController();
    const run = {
      t0: now(), firstTokenAt: null, outputChars: 0, outputTokens: 0,
      finishReason: null, aborted: false, inputTokens: null, toolCalls: [],
      inputChars: messages.reduce((n, m) => n + (m.content?.length ?? 0), 0),
    };
    const emit = (text) => {
      if (typeof text !== 'string' || !text) return;
      if (run.firstTokenAt === null) run.firstTokenAt = now();
      run.outputChars += text.length;
      run.outputTokens++;
      try { onToken?.(text); } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[RemoteLLM] onToken threw:', err);
      }
    };
    const think = (text) => {
      if (typeof text !== 'string' || !text) return;
      if (run.firstTokenAt === null) run.firstTokenAt = now();
      try { onThinking?.(text); } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[RemoteLLM] onThinking threw:', err);
      }
    };

    try {
      if (this._isOllama) {
        await this._streamOllama(messages, { maxTokens, tools, emit, think, run });
      } else {
        await this._streamOpenAI(messages, { maxTokens, emit, run });
      }
    } catch (err) {
      if (err.name === 'AbortError' || this._abortCtrl?.signal.aborted) {
        run.aborted = true;
      } else {
        this._abortCtrl = null;
        throw err;
      }
    } finally {
      this._abortCtrl = null;
    }

    const stats = summarizeRun({
      t0: run.t0, firstTokenAt: run.firstTokenAt, t1: now(),
      inputChars: run.inputChars, inputMessages: messages.length,
      outputChars: run.outputChars, outputTokens: run.outputTokens,
      finishReason: run.finishReason, aborted: run.aborted,
      inputTokens: run.inputTokens,
    });
    this._lastStats = stats;
    for (const fn of this._statsListeners) {
      try { fn(stats); } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[RemoteLLM] stats listener threw:', err);
      }
    }
    return { toolCalls: run.toolCalls };
  }

  abort() {
    try { this._abortCtrl?.abort(); } catch { /* no-op */ }
  }

  /* ---- Internal ---- */

  async _streamOllama(messages, { maxTokens, tools, emit, think, run }) {
    const body = {
      model: this._loadedModelId,
      messages,
      stream: true,
      keep_alive: '30m',
      options: {
        num_ctx: this._contextTokens || undefined,
        num_predict: maxTokens || 1024,
      },
    };
    if (tools?.length && this.supportsTools) body.tools = tools;
    if (this.supportsThinking) body.think = this._think;

    let resp = await this._post('/api/chat', body, /* ollama */ true);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      // A server that lies about tool support: retry once without.
      if (body.tools && /does not support tools/i.test(text)) {
        // eslint-disable-next-line no-console
        console.warn('[RemoteLLM] model rejected tools; retrying without');
        this._capabilities = this._capabilities.filter((c) => c !== 'tools');
        delete body.tools;
        resp = await this._post('/api/chat', body, true);
      }
      if (!resp.ok) {
        const t2 = body.tools ? text : await resp.text().catch(() => text);
        throw new Error(`HTTP ${resp.status}${t2 ? `: ${t2.slice(0, 200)}` : ''}`);
      }
    }
    if (!resp.body) throw new Error('Streaming response has no body');

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = takeNDJSONLines(buffer);
      buffer = rest;
      for (const line of lines) {
        let chunk;
        try { chunk = JSON.parse(line); } catch {
          // eslint-disable-next-line no-console
          console.warn('[RemoteLLM] dropped malformed NDJSON line:', line.slice(0, 200));
          continue;
        }
        if (chunk.error) throw new Error(String(chunk.error));
        const msg = chunk.message ?? {};
        if (typeof msg.thinking === 'string' && msg.thinking) think(msg.thinking);
        if (typeof msg.content === 'string' && msg.content) emit(msg.content);
        if (Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            const norm = normalizeToolCall(tc);
            if (norm) run.toolCalls.push(norm);
          }
        }
        if (chunk.done) {
          run.finishReason = chunk.done_reason ?? 'stop';
          if (typeof chunk.prompt_eval_count === 'number') run.inputTokens = chunk.prompt_eval_count;
          if (typeof chunk.eval_count === 'number' && chunk.eval_count > 0) run.outputTokens = chunk.eval_count;
        }
      }
    }
  }

  async _streamOpenAI(messages, { maxTokens, emit, run }) {
    const resp = await this._post('/chat/completions', {
      model: this._loadedModelId,
      messages,
      stream: true,
      temperature: 0.1,
      top_p: 1.0,
      max_tokens: maxTokens || 1024,
      frequency_penalty: 0.5,
      presence_penalty: 0,
    }, /* ollama */ false);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    if (!resp.body) throw new Error('Streaming response has no body');

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // SSE: `data: <json>\n\n`; some servers use a single newline;
    // [DONE] marks end-of-stream in the OpenAI dialect.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = takeSSEFrames(buffer);
      buffer = rest;
      for (const data of frames) {
        let chunk;
        try { chunk = JSON.parse(data); } catch {
          // eslint-disable-next-line no-console
          console.warn('[RemoteLLM] dropped malformed SSE frame:', data.slice(0, 200));
          continue;
        }
        const text = chunk.choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text.length > 0) emit(text);
        const fr = chunk.choices?.[0]?.finish_reason;
        if (fr) run.finishReason = fr;
        const usage = chunk.usage;
        if (usage && typeof usage.prompt_tokens === 'number') run.inputTokens = usage.prompt_tokens;
      }
    }
  }

  _post(path, body, ollama) {
    const base = ollama ? toOllamaBase(this._endpoint) : this._endpoint;
    return fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this._abortCtrl.signal,
    });
  }

  _setStatus(s, msg = '') {
    this._status    = s;
    this._statusMsg = msg;
    for (const fn of this._statusListeners) fn(s, msg);
  }
}
