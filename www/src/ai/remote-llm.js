/* =================================================================
   RemoteLLM — drop-in replacement for LLM that talks to an OpenAI-
   compatible HTTP endpoint instead of running WebLLM in a worker.

   Targets Ollama's `/v1` endpoints (`POST /chat/completions`,
   `GET /models`) but also works with any other server that mirrors
   that subset of the OpenAI API.

   Public surface mirrors LLM exactly so chat-bot.js can swap one for
   the other without conditional plumbing:
     status, statusMsg, loadedModelId, lastStats
     onStatus(fn), onProgress(fn), onStats(fn)
     load(modelId), generate(messages, {onToken, maxTokens}), abort()

   Notable differences vs the WebLLM worker path:
   - load() does a quick GET /models probe to surface bad URL / down
     server up front; doesn't actually pre-warm the model.
   - generate() uses fetch with stream:true and parses SSE manually.
   - abort() uses AbortController on the in-flight fetch — no worker
     postMessage round-trip needed.
   - Progress events never fire (no weights to download); the
     onProgress subscription exists only so the LLM consumer doesn't
     need to special-case which impl it has. */

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

/** Assemble the post-stream stats object from a run's raw measurements.
 *  Derives totalMs/ttftMs and the decode throughput (tokens per second
 *  over the decode window) from the three timestamps; `firstTokenAt`
 *  null means no token ever arrived, so ttft and decodeTps stay null.
 *  A zero-length decode window yields null decodeTps (no divide-by-zero).
 *  Pure — generate() passes its captured timings and counters in. */
export function summarizeRun({
  t0, firstTokenAt, t1,
  inputChars, inputMessages, outputChars, outputTokens,
  finishReason, aborted,
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
 *  no usable entry is present — a missing/non-object map, no matching
 *  key, or a non-positive / non-number value — so load() can fall back
 *  to chat-bot.js's default budget. */
export function pickContextLength(modelInfo) {
  const info = modelInfo ?? {};
  const ctxKey = Object.keys(info).find((k) => k.endsWith('.context_length'));
  if (ctxKey && typeof info[ctxKey] === 'number' && info[ctxKey] > 0) {
    return info[ctxKey];
  }
  return null;
}

export class RemoteLLM {
  constructor(endpoint = '') {
    // Always store the OpenAI-compat base (with /v1).  /chat/completions
    // and /models are appended directly; Ollama-native probes derive the
    // server root via toOllamaBase() at the call site.
    this._endpoint  = toOpenAIBase(endpoint);
    this._status    = 'idle';
    this._statusMsg = '';
    this._statusListeners   = new Set();
    this._progressListeners = new Set();
    this._statsListeners    = new Set();
    this._lastStats         = null;

    this._loadingModelId = null;
    this._loadedModelId  = null;
    // Max context tokens reported by the server for the loaded model.
    // Filled by load() via Ollama's /api/show (when available); null
    // when the server doesn't expose this (e.g. plain OpenAI-compat).
    // Read by chat-bot.js's effectiveBudget() to size the history
    // trimmer.
    this._contextTokens = null;

    // Single in-flight fetch's AbortController.  abort() trips it.
    this._abortCtrl = null;
  }

  /* ---- Public API ---- */

  get status()    { return this._status; }
  get statusMsg() { return this._statusMsg; }
  get endpoint()  { return this._endpoint; }
  get lastStats() { return this._lastStats; }
  get loadedModelId() { return this._loadedModelId ?? null; }
  get contextTokens() { return this._contextTokens; }

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
   *  We don't pre-load weights — Ollama keeps them resident itself. */
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
      // GET /models is the lightest weight probe.  Ollama returns a
      // JSON list; servers that don't implement it (rare) will 404
      // and we'll fail-fast here rather than wait for the first
      // generate to discover the URL is wrong.
      const resp = await fetch(this._endpoint + '/models', { method: 'GET' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${this._endpoint}/models`);
      }
      // Best-effort: warn (in console) if the modelId isn't in the
      // returned list.  Don't hard-fail — some servers don't list
      // every callable model, and the user might know better.
      try {
        const body = await resp.json();
        const ids = (body?.data ?? []).map((m) => m.id).filter(Boolean);
        if (ids.length && !ids.includes(modelId)) {
          // eslint-disable-next-line no-console
          console.warn('[RemoteLLM] model', modelId,
                       'not in /models response; available:', ids);
        }
      } catch { /* not JSON / unexpected shape — ignore */ }

      // Best-effort: probe Ollama's `/api/show` for the model's
      // actual max context length.  The response shape includes a
      // `model_info` map with one `<arch>.context_length` entry
      // (e.g. `qwen2.context_length`); we look up whichever key ends
      // in `.context_length`.  Non-Ollama servers will 404 here and
      // we silently fall through — chat-bot.js's effectiveBudget
      // applies a default in that case.
      try {
        const r = await fetch(toOllamaBase(this._endpoint) + '/api/show', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: modelId }),
        });
        if (r.ok) {
          const data = await r.json();
          const ctx = pickContextLength(data?.model_info);
          if (ctx !== null) {
            this._contextTokens = ctx;
            // eslint-disable-next-line no-console
            console.log('[RemoteLLM] /api/show: contextTokens =', this._contextTokens);
          }
        }
      } catch { /* server didn't expose /api/show — use default */ }

      this._loadedModelId  = modelId;
      this._loadingModelId = null;
      this._setStatus('ready', `Ready (remote)`);
    } catch (err) {
      this._loadingModelId = null;
      this._setStatus('error', `Remote endpoint unreachable: ${err.message ?? err}`);
      throw err;
    }
  }

  async generate(messages, { onToken, maxTokens } = {}) {
    if (this._status !== 'ready') {
      // eslint-disable-next-line no-console
      console.warn('[RemoteLLM] generate rejected: status=', this._status);
      throw new Error('Model not ready');
    }
    this._abortCtrl = new AbortController();

    const inputChars = messages.reduce(
      (n, m) => n + (m.content?.length ?? 0), 0);

    const t0 = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    let firstTokenAt = null;
    let outputChars  = 0;
    let outputTokens = 0;
    let finishReason = null;
    let aborted      = false;

    try {
      const resp = await fetch(this._endpoint + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this._loadedModelId,
          messages,
          stream: true,
          temperature: 0.1,
          top_p: 1.0,
          max_tokens: maxTokens || 256,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        }),
        signal: this._abortCtrl.signal,
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
      if (!resp.body) {
        throw new Error('Streaming response has no body');
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // SSE parsing: server-sent events are `data: <json>\n\n`.  Some
      // servers separate events with a single newline; tolerate both.
      // [DONE] sentinel marks end-of-stream in the OpenAI dialect.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = takeSSEFrames(buffer);
        buffer = rest;
        for (const data of frames) {
          let chunk;
          try {
            chunk = JSON.parse(data);
          } catch {
            // eslint-disable-next-line no-console
            console.warn('[RemoteLLM] dropped malformed SSE frame:', data.slice(0, 200));
            continue;
          }
          const text = chunk.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text.length > 0) {
            if (firstTokenAt === null) {
              firstTokenAt = (typeof performance !== 'undefined' && performance.now)
                ? performance.now() : Date.now();
            }
            outputChars += text.length;
            outputTokens++;
            try { onToken?.(text); } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[RemoteLLM] onToken threw:', err);
            }
          }
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError' || this._abortCtrl?.signal.aborted) {
        aborted = true;
      } else {
        this._abortCtrl = null;
        throw err;
      }
    } finally {
      // Caller can call abort() between turns; clearing keeps the
      // next generate from observing a stale signal.
      this._abortCtrl = null;
    }

    const t1 = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const stats = summarizeRun({
      t0, firstTokenAt, t1,
      inputChars, inputMessages: messages.length,
      outputChars, outputTokens, finishReason, aborted,
    });
    this._lastStats = stats;
    for (const fn of this._statsListeners) {
      try { fn(stats); } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[RemoteLLM] stats listener threw:', err);
      }
    }
  }

  abort() {
    try { this._abortCtrl?.abort(); } catch { /* no-op */ }
  }

  /* ---- Internal ---- */

  _setStatus(s, msg = '') {
    this._status    = s;
    this._statusMsg = msg;
    for (const fn of this._statusListeners) fn(s, msg);
  }
}
