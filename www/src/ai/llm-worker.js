/* =================================================================
   LLM Web Worker — runs WebLLM (MLC) inference off the main thread.

   Runtime: @mlc-ai/web-llm.

   Bundling: NONE.  Earlier revisions of this worker tried to load
   model files from a bundled copy under www/models/ to avoid runtime
   downloads, but that path tripped over multiple sharp edges (the
   live-server "200-OK HTML 404" trap, npm-version vs modelVersion
   drift, .wasm filename changes between WebLLM releases).  The
   current design just lets WebLLM use its prebuilt upstream URLs:
   weights from huggingface.co/mlc-ai/<model>, .wasm libraries from
   raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs.  WebLLM
   caches downloaded files in the browser's Cache Storage, so the
   download is one-time per model per origin.

   Model selection: the main thread tells us which model to load via
   the `load` message — this worker has no opinion about which model
   to run.  See www/src/ai/chat-bot.js for the curated MODELS list
   and the picker UI.

   Protocol (main → worker):
     { type: 'load', modelId }
       Load and warm the named model.  Sends back status + progress.
     { type: 'generate', id, messages, maxTokens? }
       Run inference on a messages array (OpenAI chat format).
     { type: 'abort' }
       Signal the running generation to stop early.

   Protocol (worker → main):
     { type: 'status', status: 'loading'|'ready'|'error', message, device? }
     { type: 'progress', file, progress, loaded, total }
     { type: 'token', id, text }
     { type: 'done', id }
     { type: 'error', id, message }
   ================================================================= */

/* eslint-disable no-restricted-globals */

// Pinning npm version + the matching .wasm modelVersion together is
// load-bearing.  The npm package version and the compatible
// modelVersion drift independently — at the time of this commit the
// latest published web-llm was 0.2.82 and its compatible modelVersion
// (the path inside binary-mlc-llm-libs) was v0_2_80.  When you bump
// this, verify the new web-llm's `modelVersion` constant in
//   https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@<ver>/lib/config.js
// and check that the resulting .wasm URLs return 200.
import { CreateMLCEngine, prebuiltAppConfig } from 'https://esm.run/@mlc-ai/web-llm@0.2.82';

function engineConfig(initProgressCallback) {
  const config = {
    appConfig: {
      ...prebuiltAppConfig,
      useIndexedDBCache: typeof caches === 'undefined',
    },
  };
  if (initProgressCallback) config.initProgressCallback = initProgressCallback;
  return config;
}

// eslint-disable-next-line no-console
console.log('%c[llm-worker] BOOT — runtime:', 'color:#67e8f9;font-weight:bold',
  'web-llm@0.2.82');

let engine = null;
let _aborted = false;

// Saved load config — used by the recreate-engine-between-turns
// workaround.  Set on every successful loadModel(); cleared if a
// load fails.  Holds the same arguments needed to call
// CreateMLCEngine again silently (no progress UI fanout).
let _lastLoadConfig = null;
// Tracks whether *any* generate has completed since the current
// engine was instantiated.  Once true, we recreate the engine
// before the next generate to dodge the WebLLM 0.2.x stall where
// back-to-back chat.completions.create() calls wedge after the
// first one completes — the second await never returns, no tokens,
// no error, no done.  Recreation flushes whatever internal state
// is making the second call hang.  See `generate()` for the
// recreation site and the comment block there for full context.
let _hasRunGenerate = false;

/* ---- Model loading ---- */

async function loadModel({ modelId, contextTokens }) {
  if (!modelId) {
    self.postMessage({ type: 'status', status: 'error', message: 'No modelId supplied' });
    return;
  }

  self.postMessage({
    type: 'status',
    status: 'loading',
    message: `Initialising ${modelId}…`,
  });
  if (contextTokens) {
    // eslint-disable-next-line no-console
    console.log('[llm-worker] load: contextTokens override =', contextTokens);
  } else {
    // eslint-disable-next-line no-console
    console.log('[llm-worker] load: no contextTokens override (WebLLM default applies)');
  }

  // WebLLM's progress callback shape: { progress: 0..1, text, timeElapsed }
  // We map onto the existing single-bar progress UI by fanning the
  // same number out as both `progress` and `loaded/total`.
  const initProgressCallback = (info) => {
    // eslint-disable-next-line no-console
    console.log('[llm-worker] progress:', info);
    const pct = Math.round((info.progress ?? 0) * 100);
    self.postMessage({
      type: 'progress',
      file: info.text ?? '',
      progress: pct,
      loaded: pct,
      total: 100,
    });
    if (info.text) {
      self.postMessage({ type: 'status', status: 'loading', message: info.text });
    }
  };

  try {
    // Switching models: if `engine` already exists for a previous
    // modelId, just let CreateMLCEngine replace it.  WebLLM cleans
    // up the old WebGPU device internally; no explicit unload needed.
    //
    // Third arg is ChatOptions.  We override context_window_size per
    // model from the catalog — WebLLM's prebuilt defaults are
    // typically 4K for browser memory safety, well below most
    // models' native maxes.  See chat-bot.js MODELS for the values
    // and the rationale comments there.  If we ever want to expose
    // other ChatOptions (sliding_window_size, attention_sink_size,
    // sampling defaults), add them to the chatOpts object below.
    const chatOpts = contextTokens ? { context_window_size: contextTokens } : undefined;
    engine = await CreateMLCEngine(modelId, engineConfig(initProgressCallback), chatOpts);
    // Save the config so the silent-recreation workaround in
    // generate() can rebuild the engine with identical settings.
    // initProgressCallback is intentionally NOT saved — recreations
    // skip progress fanout so the UI doesn't see a fake "loading"
    // pulse before each turn.
    _lastLoadConfig = { modelId, contextTokens };
    // Fresh engine — reset the recreate-needed flag.  The next
    // generate runs against this newly-loaded engine without any
    // recreation overhead.
    _hasRunGenerate = false;
    self.postMessage({
      type: 'status',
      status: 'ready',
      message: `Ready (WebGPU)`,
      device: 'webgpu',
      contextTokens: contextTokens || null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[llm-worker] load failed:', err);
    engine = null;
    _lastLoadConfig = null;
    _hasRunGenerate = false;
    self.postMessage({
      type: 'status',
      status: 'error',
      message: `Failed to load ${modelId}: ${err.message ?? err}`,
    });
  }
}

/** Silent re-instantiation of the engine using the same modelId +
 *  contextTokens that loadModel() last used.  Workaround for the
 *  WebLLM 0.2.x stall where chat.completions.create() hangs forever
 *  on the second back-to-back call against the same engine
 *  instance.  Recreating from scratch sidesteps whatever internal
 *  state is wedging — the cost is ~1s for cached weight load + GPU
 *  shader recompile, paid before each generate after the first.
 *
 *  No initProgressCallback — recreations are silent so the UI
 *  doesn't get a spurious "loading" pulse mid-conversation. */
async function recreateEngineSilently() {
  if (!_lastLoadConfig) return;
  // eslint-disable-next-line no-console
  console.log('[llm-worker] recreate: rebuilding engine to dodge back-to-back create() hang');
  const t0 = (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();
  try {
    if (engine && typeof engine.unload === 'function') {
      await engine.unload();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[llm-worker] recreate: unload threw (continuing):', err);
  }
  const { modelId, contextTokens } = _lastLoadConfig;
  const chatOpts = contextTokens ? { context_window_size: contextTokens } : undefined;
  engine = await CreateMLCEngine(modelId, engineConfig(), chatOpts);
  const ms = ((typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now()) - t0;
  // eslint-disable-next-line no-console
  console.log('[llm-worker] recreate: done in', Math.round(ms), 'ms');
}

/* ---- Generation ---- */

async function generate({ id, messages, maxTokens = 256 }) {
  if (!engine) {
    self.postMessage({ type: 'error', id, message: 'Model not loaded' });
    return;
  }

  // Recreate the engine before any non-first generate to dodge the
  // WebLLM 0.2.x back-to-back create() hang.  See the comment block
  // on `_hasRunGenerate` (top of file) and `recreateEngineSilently()`
  // for the full context.  Recreations cost ~1s of cached-weight
  // reload; they are silent (no progress UI) so the user doesn't
  // see a spurious "loading" pulse before each turn.
  if (_hasRunGenerate) {
    try {
      await recreateEngineSilently();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[llm-worker] recreate failed:', err);
      self.postMessage({
        type: 'error',
        id,
        message: `Engine recreation failed: ${err.message ?? err}`,
      });
      return;
    }
  }

  _aborted = false;

  // Tally input size up front — used both for the diagnostic log and
  // for the per-turn stats payload posted back at end-of-generate.
  let inputChars = 0;
  try {
    inputChars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
    // eslint-disable-next-line no-console
    console.log(`[llm-worker] generate: ${messages.length} messages, ${inputChars} chars total`);
  } catch { /* swallow — diagnostic only */ }

  // High-resolution wall-clock anchor for the per-turn stats.  We
  // measure end-to-end latency (postMessage delivery → first token
  // → done) since that's what the user actually waits for; the
  // engine's own runtimeStatsText() (queried below) gives the
  // narrower prefill / decode timings if WebLLM exposes them.
  const t0 = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
  let firstTokenAt = null;
  let outputChars  = 0;
  let outputTokens = 0;

  // (Previously: engine.resetChat() was called here before every
  // generate.  That was added when the orchestrator ran a 3-phase
  // pipeline where each phase had a DIFFERENT system prompt — the
  // KV cache from phase N's create() was incompatible with phase
  // N+1's, and resetChat() flushed the engine state so each phase
  // got a clean slate.
  //
  // We're now single-phase: every user turn issues exactly one
  // create() call, all with the same system prompt and a strictly
  // appending message array.  In that shape WebLLM's incremental
  // prefill (which reuses the KV cache against the prior call's
  // tokens) is correct and beneficial — calling resetChat() between
  // turns appears to actually CAUSE a hang on the next create()
  // call instead of preventing one.  Observed live in a Qwen2.5
  // Coder 0.5B session where turn 2's create() never returned.
  //
  // If we ever reintroduce multi-phase prompts, this is the place
  // resetChat() would go back.)

  try {
    // Sampling tuned for *near-deterministic + accurate* output
    // across all three pipeline phases (Phase 1 prose, Phase 2 JSON
    // tool calls, Phase 3 suggestion arrays).
    //
    // History of this block:
    //   v1 (transformers.js):       do_sample:false, repetition_penalty:1.05
    //   v2 (WebLLM, first attempt): temperature:0,   frequency_penalty:0
    //                               → Phase 2 hung in deterministic
    //                               token loops on small models
    //                               (1B-class), invisibly because
    //                               Phase 2 doesn't stream a visible
    //                               bubble.
    //   v3 (this):                  temperature:0.1, frequency_penalty:0.5
    //                               → tiny noise breaks self-loops
    //                               while staying effectively
    //                               deterministic for short outputs;
    //                               higher freq penalty discourages
    //                               JSON-token-thrash without breaking
    //                               valid JSON.
    //
    // top_p / top_k are ignored when temperature is very low but we
    // set them explicitly for clarity.
    // eslint-disable-next-line no-console
    console.log('[llm-worker] generate id=', id, '— calling chat.completions.create…');
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.1,
      top_p: 1.0,
      max_tokens: maxTokens,
      frequency_penalty: 0.5,
      presence_penalty: 0,
    });
    // eslint-disable-next-line no-console
    console.log('[llm-worker] generate id=', id, '— stream created, entering for-await loop');

    let chunkCount = 0;
    let finishReason = null;
    for await (const chunk of stream) {
      chunkCount++;
      if (_aborted) {
        // eslint-disable-next-line no-console
        console.log('[llm-worker] generate id=', id, '— _aborted=true at chunk', chunkCount, ', breaking');
        break;
      }
      const text = chunk.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        if (firstTokenAt === null) {
          firstTokenAt = (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
        }
        outputChars += text.length;
        outputTokens++;          // 1 chunk ≈ 1 token in WebLLM's stream
        self.postMessage({ type: 'token', id, text });
      }
      const fr = chunk.choices?.[0]?.finish_reason;
      if (fr) {
        finishReason = fr;
        break;
      }
    }
    const t1 = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const totalMs   = t1 - t0;
    const ttftMs    = firstTokenAt !== null ? firstTokenAt - t0 : null;
    const decodeMs  = firstTokenAt !== null ? t1 - firstTokenAt : null;
    const decodeTps = (decodeMs && decodeMs > 0)
      ? (outputTokens / (decodeMs / 1000))
      : null;

    // Some WebLLM builds expose runtimeStatsText() with engine-side
    // prefill/decode TPS (more accurate than our wall-clock estimate
    // since it excludes JS overhead).  Best-effort — guard against
    // builds that don't have it.
    let runtimeStats = null;
    try {
      if (typeof engine.runtimeStatsText === 'function') {
        runtimeStats = await engine.runtimeStatsText();
      }
    } catch { /* swallow — diagnostic only */ }

    // eslint-disable-next-line no-console
    console.log('[llm-worker] generate id=', id, '— stream complete:',
                'chunks=', chunkCount,
                'outputTokens=', outputTokens,
                'outputChars=', outputChars,
                'totalMs=', Math.round(totalMs),
                'ttftMs=', ttftMs !== null ? Math.round(ttftMs) : null,
                'decodeTPS=', decodeTps !== null ? decodeTps.toFixed(1) : null,
                'finish_reason=', finishReason,
                'aborted=', _aborted);
    if (runtimeStats) {
      // eslint-disable-next-line no-console
      console.log('[llm-worker] runtimeStats:', runtimeStats);
    }

    // Post the structured stats packet BEFORE done so the main
    // thread can update its UI display before _genResolve runs and
    // the next phase fires.
    self.postMessage({
      type: 'stats',
      id,
      inputChars,
      inputMessages: messages.length,
      outputTokens,
      outputChars,
      totalMs,
      ttftMs,
      decodeTps,
      finishReason,
      aborted: _aborted,
      runtimeStats,
    });
    self.postMessage({ type: 'done', id });
  } catch (err) {
    if (_aborted) {
      // eslint-disable-next-line no-console
      console.log('[llm-worker] generate id=', id, '— threw during abort (expected), posting done');
      self.postMessage({ type: 'done', id });
    } else {
      // eslint-disable-next-line no-console
      console.error('[llm-worker] generate id=', id, '— ERROR:', err);
      self.postMessage({ type: 'error', id, message: err.message ?? String(err) });
    }
  } finally {
    // Mark this engine instance as "used".  The next generate call
    // will recreate the engine before running, sidestepping the
    // back-to-back create() hang.  Set in finally so it covers
    // success, abort-mid-stream, and error paths uniformly.
    _hasRunGenerate = true;
  }
}

/* ---- Message dispatcher ---- */

self.onmessage = async (e) => {
  const { type, ...data } = e.data;

  switch (type) {
    case 'load':
      await loadModel(data);
      break;
    case 'generate':
      await generate(data);
      break;
    case 'abort':
      // eslint-disable-next-line no-console
      console.log('[llm-worker] abort received — setting _aborted=true and calling interruptGenerate');
      _aborted = true;
      try {
        engine?.interruptGenerate?.();
        // eslint-disable-next-line no-console
        console.log('[llm-worker] interruptGenerate returned (no throw)');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[llm-worker] interruptGenerate threw:', err);
      }
      break;
    default:
      // eslint-disable-next-line no-console
      console.warn('[llm-worker] unknown message type:', type);
  }
};
