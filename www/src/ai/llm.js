/* =================================================================
   LLM — main-thread manager for the inference Web Worker.

   Usage:
     const llm = new LLM();
     llm.onStatus((status, msg) => ...);
     llm.onProgress((info) => ...);     // { file, progress, loaded, total }
     await llm.load(modelId);
     await llm.generate(messages, { onToken: (t) => ... });
     llm.abort();

   Switching models: call load(differentModelId) — the worker will
   re-run CreateMLCEngine with the new id, replacing the WebGPU
   pipeline.  The first time a given model is requested it gets
   downloaded (~0.4-5 GB depending on model); subsequent loads of
   the same model hit the browser's Cache Storage and are instant.
   ================================================================= */

export class LLM {
  constructor() {
    this._worker        = null;
    this._status        = 'idle';   // idle | loading | ready | error
    this._statusMsg     = '';
    this._statusListeners   = new Set();
    this._progressListeners = new Set();
    this._statsListeners    = new Set();
    // Most recent per-turn stats packet from the worker — kept so a
    // late subscriber (or a re-render after status flip) can show
    // the last turn's numbers without waiting for the next call.
    this._lastStats         = null;

    // In-flight load/generate bookkeeping.
    this._loadPromise   = null;
    this._loadResolve   = null;
    this._loadReject    = null;

    this._genId         = 0;
    this._genResolve    = null;
    this._genReject     = null;
    this._genOnToken    = null;

    // Which modelId the load() call is targeting, vs. which one
    // finished loading.  loadedModelId = null until the worker
    // posts its first 'ready' status; it then sticks until a new
    // load() resolves.  Used by chat-bot.js's picker UI.
    this._loadingModelId = null;
    this._loadedModelId  = null;
  }

  /* ---- Public API ---- */

  get status()    { return this._status; }
  get statusMsg() { return this._statusMsg; }

  /** Subscribe to status changes.  Callback: (status, message) => void.
   *  Returns an unsubscribe function. */
  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  /** Subscribe to model download progress.  Callback: ({file, progress, loaded, total}) => void.
   *  Returns an unsubscribe function. */
  onProgress(fn) {
    this._progressListeners.add(fn);
    return () => this._progressListeners.delete(fn);
  }

  /** Subscribe to per-turn inference stats.  Callback fires once per
   *  successful generate(), with a packet shaped:
   *    { id, inputChars, inputMessages, outputTokens, outputChars,
   *      totalMs, ttftMs, decodeTps, finishReason, aborted,
   *      runtimeStats }
   *  Returns an unsubscribe function.  See `lastStats` for the most
   *  recent packet (useful for late subscribers and UI re-renders). */
  onStats(fn) {
    this._statsListeners.add(fn);
    return () => this._statsListeners.delete(fn);
  }

  /** The most recent stats packet, or null if no generate has
   *  completed yet this session. */
  get lastStats() { return this._lastStats; }

  /** Load (or switch to) a model.  Calling with the same id while
   *  ready resolves immediately; calling with a different id while
   *  ready re-loads.  Calling concurrently returns the same
   *  in-flight promise.
   *
   *  `opts.contextTokens` overrides WebLLM's default context window
   *  for this model.  Each model in our catalog has its own value
   *  (see MODELS in chat-bot.js); larger windows let more of the
   *  conversation history reach the model but use more VRAM.
   *  Omit / pass falsy to use WebLLM's prebuilt-config default. */
  load(modelId, opts = {}) {
    if (!modelId) {
      return Promise.reject(new Error('load() requires a modelId'));
    }
    if (this._status === 'ready' && this._loadedModelId === modelId) {
      return Promise.resolve();
    }
    if (this._loadPromise && this._loadingModelId === modelId) {
      return this._loadPromise;
    }

    if (!this._worker) {
      // Cache-buster query param.  Module workers in Chromium-based
      // browsers + live-server's headers + the HTTP cache combine in
      // ways that survive most cache-clear actions; bumping
      // WORKER_VERSION below is the surest way to force a fresh
      // fetch on the next full page reload.  Bump this any time
      // llm-worker.js changes in a way users need to see.
      const WORKER_VERSION = '15';
      const workerUrl = new URL('./llm-worker.js', import.meta.url);
      workerUrl.searchParams.set('v', WORKER_VERSION);
      this._worker = new Worker(workerUrl, { type: 'module' });
      this._worker.onmessage = (e) => this._onWorkerMessage(e);
      this._worker.onerror   = (e) => {
        this._setStatus('error', e.message ?? 'Worker error');
        this._loadReject?.(new Error(e.message ?? 'Worker error'));
        this._loadReject = null;
      };
    }

    this._loadingModelId = modelId;
    this._loadPromise = new Promise((resolve, reject) => {
      // _loadedModelId is updated in _onWorkerMessage *before*
      // _setStatus fires, so listeners observing the 'ready' status
      // see the correct id.  Don't try to update it here — that
      // would run after the status listener and you'd get a stale
      // pill label until the next render.
      this._loadResolve = resolve;
      this._loadReject  = reject;
    });

    this._worker.postMessage({
      type: 'load',
      modelId,
      contextTokens: opts.contextTokens || null,
    });
    return this._loadPromise;
  }

  /** The model id the worker most recently finished loading, or
   *  null if no model is loaded yet.  Useful for the picker UI to
   *  highlight the active row and skip a no-op re-load. */
  get loadedModelId() { return this._loadedModelId ?? null; }

  /** Run inference on a messages array (OpenAI chat format).
   *  Streams tokens via onToken callback.  Resolves when done.
   *  `maxTokens` caps generation length — small values keep the
   *  worst case bounded if the model falls into a repetition loop
   *  (greedy decoding on small models can do that even at
   *  temperature:0).  Defaults to the worker's own default (256). */
  generate(messages, { onToken, maxTokens } = {}) {
    if (this._status !== 'ready') {
      // eslint-disable-next-line no-console
      console.warn('[LLM] generate rejected: status=', this._status);
      return Promise.reject(new Error('Model not ready'));
    }

    const id = ++this._genId;
    this._genOnToken = onToken ?? null;
    // eslint-disable-next-line no-console
    console.log('[LLM] generate: posting id=', id, 'messages=', messages.length,
                'maxTokens=', maxTokens ?? 'default');

    return new Promise((resolve, reject) => {
      this._genResolve = resolve;
      this._genReject  = reject;
      this._worker.postMessage({ type: 'generate', id, messages, maxTokens });
    });
  }

  /** Signal the current generation to stop.  Safe to call even when
   *  no generation is in progress. */
  abort() {
    // eslint-disable-next-line no-console
    console.log('[LLM] abort: posting to worker (genResolve set=', !!this._genResolve, ')');
    this._worker?.postMessage({ type: 'abort' });
  }

  /* ---- Internal ---- */

  _setStatus(s, msg = '') {
    this._status    = s;
    this._statusMsg = msg;
    for (const fn of this._statusListeners) fn(s, msg);
  }

  _onWorkerMessage({ data }) {
    const { type, ...rest } = data;

    if (type === 'status') {
      // eslint-disable-next-line no-console
      console.log('[LLM] worker status →', rest.status, rest.message ? `(${rest.message})` : '');
      // CRITICAL ORDERING: update _loadedModelId BEFORE firing the
      // status listeners.  chat-bot.js's _onStatus reads
      // this.loadedModelId synchronously during the 'ready' fan-out
      // to pick the active row in the picker and to label the
      // status pill — if we updated _loadedModelId after _setStatus,
      // those reads would see the previous model's id (or null on
      // first load), and the UI would lag by one status cycle.
      if (rest.status === 'ready' && this._loadingModelId) {
        this._loadedModelId  = this._loadingModelId;
        this._loadingModelId = null;
      }
      this._setStatus(rest.status, rest.message ?? '');
      if (rest.status === 'ready') {
        this._loadResolve?.();
        this._loadResolve = this._loadReject = null;
      } else if (rest.status === 'error') {
        this._loadReject?.(new Error(rest.message ?? 'Load error'));
        this._loadResolve = this._loadReject = null;
        // Also reject any in-flight generation.
        this._genReject?.(new Error(rest.message ?? 'Load error'));
        this._genResolve = this._genReject = null;
      }
      return;
    }

    if (type === 'progress') {
      for (const fn of this._progressListeners) fn(rest);
      return;
    }

    if (type === 'token') {
      this._genOnToken?.(rest.text);
      return;
    }

    if (type === 'stats') {
      // Worker posts this just before `done`.  Cache it on the
      // instance so chat-bot can read `lastStats` synchronously
      // when finalising the turn, and fan out to subscribers so
      // the UI status line updates without polling.
      this._lastStats = rest;
      // eslint-disable-next-line no-console
      console.log('[LLM] stats id=', rest.id,
                  'in=', rest.inputChars, 'chars (' + rest.inputMessages + ' msgs)',
                  'out=', rest.outputTokens, 'tok',
                  'totalMs=', Math.round(rest.totalMs ?? 0),
                  'decodeTPS=', rest.decodeTps?.toFixed(1) ?? '-');
      for (const fn of this._statsListeners) {
        try { fn(rest); } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[LLM] stats listener threw:', err);
        }
      }
      return;
    }

    if (type === 'done') {
      // eslint-disable-next-line no-console
      console.log('[LLM] worker done id=', rest.id, '— resolving generate promise');
      this._genResolve?.();
      this._genResolve = this._genReject = this._genOnToken = null;
      return;
    }

    if (type === 'error') {
      // eslint-disable-next-line no-console
      console.warn('[LLM] worker error id=', rest.id, 'message=', rest.message);
      this._genReject?.(new Error(rest.message ?? 'Generation error'));
      this._genResolve = this._genReject = this._genOnToken = null;
    }
  }
}
