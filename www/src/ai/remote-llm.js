/* RemoteLLM talks to an Ollama or OpenAI-compatible HTTP endpoint.  A
   server that answers Ollama's /api/version gets the native /api/chat
   protocol, which sizes num_ctx itself (Ollama's small default context
   silently truncates the system prompt) and passes tools and think when
   the model supports them; anything else gets /v1/chat/completions. */

export function isOllamaCloudUrl(url) {
  try {
    const parsed = new URL(String(url).includes('://') ? String(url) : `http://${url}`);
    const host = parsed.hostname.toLowerCase();
    return host === 'ollama.com' || host.endsWith('.ollama.com');
  } catch {
    return false;
  }
}

// Browsers treat loopback as a secure origin, so an https page may call it over plain http.
function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === '[::1]' || /^127(\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateHost(hostname) {
  return isLoopbackHost(hostname) || hostname.endsWith('.local')
    || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(hostname);
}

export const LOCAL_ACCESS_ASKING = 'Waiting for your browser: if it asks whether this page may access apps and services on this device, choose Allow.';
export const LOCAL_ACCESS_BLOCKED = 'Your browser is blocking this page from reaching apps on this device. '
  + 'Click the icon to the left of the address, allow Apps on device (Local network access in older Chrome, '
  + 'Device apps and services in Firefox), then try again.';

// Chrome 142+ and Firefox 153+ hold a public page's requests to this device or the
// local network until the user answers a permission prompt. Null where that doesn't apply.
export async function localAccessPermission(url, origin = globalThis.location?.origin ?? '') {
  let target;
  let page;
  try {
    target = new URL(toOllamaBase(url)).hostname;
    page = new URL(origin).hostname;
  } catch {
    return null;
  }
  if (!isPrivateHost(target) || isLoopbackHost(page)) return null;
  const names = isLoopbackHost(target) ? ['loopback-network', 'local-network-access'] : ['local-network', 'local-network-access'];
  for (const name of names) {
    try {
      return (await globalThis.navigator.permissions.query({ name })).state;
    } catch { /* this browser names it differently, or has no such permission */ }
  }
  return null;
}

// WebKit is the exception: Safari and every iOS browser treat http://localhost as mixed content.
function isWebKitBrowser(userAgent) {
  return /iPhone|iPad|iPod/.test(userAgent)
    || (/Version\/[\d.]+.*Safari\//.test(userAgent) && !/Chrome|Chromium|Android/.test(userAgent));
}

function canonicalEndpoint(typed) {
  let s = String(typed || '').trim().replace(/\/+$/, '');
  if (s && isOllamaCloudUrl(s) && s.startsWith('http://')) {
    s = `https://${s.slice('http://'.length)}`;
  }
  return s;
}

/** The OpenAI-compatible base (`…/v1`) for a bare host, `…/v1` or Ollama's `…/api`. */
export function toOpenAIBase(typed) {
  let s = canonicalEndpoint(typed);
  if (!s) return '';
  s = s.replace(/\/api$/, '');
  if (!/\/v1$/.test(s)) s += '/v1';
  return s;
}

/** The Ollama server root; callers append `/api/<endpoint>`. */
export function toOllamaBase(typed) {
  return canonicalEndpoint(typed)
    .replace(/\/v1$/, '')
    .replace(/\/api$/, '');
}

export function ollamaCloudAdvice(origin = globalThis.location?.origin ?? '') {
  return 'Browsers can\'t call ollama.com\'s API from a web page, and Ollama asks that API keys stay out of browser code. '
    + 'Cloud models work through your own Ollama instead: run `ollama signin` on that machine, '
    + 'pick a model whose name ends in -cloud or :cloud, and connect to that Ollama here (for example http://localhost:11434), '
    + `adding this page's origin${origin ? ` (${origin})` : ''} to OLLAMA_ORIGINS there.`;
}

/** Browsers report a refused origin, a closed port and a bad host all as
 *  "Failed to fetch"; a no-cors probe separates "answered" from "nothing there". */
export async function explainConnectionError(url, err, origin = globalThis.location?.origin ?? '',
  userAgent = globalThis.navigator?.userAgent ?? '') {
  if (!(err instanceof TypeError)) return err?.message ?? String(err);
  if (isOllamaCloudUrl(url)) return ollamaCloudAdvice(origin);
  const base = toOllamaBase(url);
  let host = base;
  let loopback = false;
  try {
    const parsed = new URL(base);
    host = parsed.host;
    loopback = isLoopbackHost(parsed.hostname);
  } catch { /* keep the typed text */ }
  const plainFromHttps = origin.startsWith('https:') && base.startsWith('http:');
  if (plainFromHttps && !loopback) {
    return `This page is served over HTTPS, so the browser blocks plain-HTTP requests to ${host}. `
      + 'Open the app over http, or serve the endpoint over https.';
  }
  if (plainFromHttps && isWebKitBrowser(userAgent)) {
    return `Safari, and every browser on iPhone and iPad, blocks HTTPS pages from calling ${host} over plain HTTP. `
      + 'Use Chrome, Edge or Firefox on a computer, or run rpl.ai from localhost (npm run serve).';
  }
  const access = await localAccessPermission(url, origin);
  if (access === 'denied') return LOCAL_ACCESS_BLOCKED;
  if (access === 'prompt') {
    return 'Your browser asked whether this page may access apps and services on this device, '
      + 'and the request stopped without an answer. Try again and choose Allow.';
  }
  try {
    await fetch(`${base}/api/version`, { mode: 'no-cors' });
  } catch {
    let pageIsLocal = false;
    try { pageIsLocal = isLoopbackHost(new URL(origin).hostname); } catch { /* no page origin */ }
    return `Nothing answered at ${host}. Check the address and port${loopback ? ' and' : ','} that Ollama is running`
      + `${loopback ? '' : ', and that it listens on the network (OLLAMA_HOST=0.0.0.0)'}.`
      + (pageIsLocal ? '' : ' If the browser asked whether this site may reach apps on your device or local network, '
        + 'allow it; if you declined, change it in the site settings.');
  }
  return `${host} answered but refused this page's origin (${origin}). `
    + `Add ${origin} to OLLAMA_ORIGINS where Ollama runs, then restart Ollama.`;
}

export function bearerHeaders(apiKey, extra = {}) {
  const headers = { ...extra };
  const key = String(apiKey || '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** Complete `data:` payloads from an SSE buffer (blank lines and [DONE]
 *  skipped); the unfinished last line comes back as `rest`. */
export function takeSSEFrames(buffer) {
  const frames = [];
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data !== '[DONE]') frames.push(data);
  }
  return { frames, rest: buffer };
}

/** Complete lines of Ollama's NDJSON stream; the unfinished tail comes back as `rest`. */
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

/** `firstTokenAt` null means no token arrived; `inputTokens` is the
 *  server's prompt count when it reports one (Ollama), else null. */
export function summarizeRun({
  t0, firstTokenAt, t1,
  inputChars, inputMessages, outputChars, outputTokens,
  finishReason, aborted, inputTokens = null,
}) {
  const decodeMs = firstTokenAt !== null ? t1 - firstTokenAt : null;
  return {
    inputChars,
    inputMessages,
    inputTokens,
    outputTokens,
    outputChars,
    totalMs: t1 - t0,
    ttftMs: firstTokenAt !== null ? firstTokenAt - t0 : null,
    decodeTps: decodeMs > 0 ? outputTokens / (decodeMs / 1000) : null,
    finishReason,
    aborted,
  };
}

// Ollama's model_info key is prefixed with the architecture: `qwen2.context_length`.
export function pickContextLength(modelInfo) {
  const info = modelInfo ?? {};
  const ctxKey = Object.keys(info).find((k) => k.endsWith('.context_length'));
  return ctxKey && typeof info[ctxKey] === 'number' && info[ctxKey] > 0 ? info[ctxKey] : null;
}

/** Floored at 8K so the system prompt fits, capped at the model's maximum.
 *  It must not change mid-session: Ollama reloads the model when num_ctx does. */
export function chooseNumCtx(requested, modelMax) {
  const MIN = 8192;
  let n = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : MIN;
  if (n < MIN) n = MIN;
  if (Number.isFinite(modelMax) && modelMax > 0 && n > modelMax) n = modelMax;
  return n;
}

/** `{ name, arguments }` from an Ollama tool call or an OpenAI one with
 *  stringified arguments; null when there is no function name. */
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

const httpError = (status, text) => new Error(`HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ''}`);

function callListener(label, fn, value) {
  try { fn?.(value); } catch (err) {
    console.warn(`[RemoteLLM] ${label} threw:`, err);
  }
}

function parseChunk(text, kind) {
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[RemoteLLM] dropped malformed ${kind}:`, text.slice(0, 200));
    return null;
  }
}

async function readStream(resp, onText) {
  if (!resp.body) throw new Error('Streaming response has no body');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    onText(decoder.decode(value, { stream: true }));
  }
}

export class RemoteLLM {
  /** `opts`: contextTokens (the num_ctx to request and the history budget),
   *  think (let a thinking model reason first; default true), apiKey. */
  constructor(endpoint = '', opts = {}) {
    this._endpoint  = toOpenAIBase(endpoint);
    this._status    = 'idle';
    this._statusMsg = '';
    this._statusListeners   = new Set();
    this._statsListeners    = new Set();
    this._lastStats         = null;

    this._loadedModelId  = null;
    this._requestedContext = opts.contextTokens ?? null;
    this._think = opts.think !== false;
    this._apiKey = String(opts.apiKey || '').trim();
    this._isOllama = false;
    this._capabilities = [];
    this._contextTokens = null;

    this._abortCtrl = null;
  }

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
  get options() {
    return { contextTokens: this._requestedContext, think: this._think, apiKey: this._apiKey };
  }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }
  onStats(fn) {
    this._statsListeners.add(fn);
    return () => this._statsListeners.delete(fn);
  }

  /** Probes the endpoint and the model; the server keeps the weights resident. */
  async load(modelId) {
    if (!modelId) throw new Error('load() requires a modelId');
    if (!this._endpoint) throw new Error('Endpoint URL not configured');
    if (this._status === 'ready' && this._loadedModelId === modelId) return;
    this._setStatus('loading', `Connecting to ${this._endpoint}…`);
    const access = await localAccessPermission(this._endpoint);
    if (access === 'denied') {
      this._setStatus('error', LOCAL_ACCESS_BLOCKED);
      throw new Error(LOCAL_ACCESS_BLOCKED);
    }
    if (access === 'prompt') this._setStatus('loading', LOCAL_ACCESS_ASKING);
    try {
      const ollamaBase = toOllamaBase(this._endpoint);
      const shown = (await this._answersAsOllama(ollamaBase)) ? await this._showModel(ollamaBase, modelId) : null;
      if (shown) {
        this._isOllama = true;
        this._capabilities = Array.isArray(shown.capabilities) ? shown.capabilities : [];
        const maxContext = pickContextLength(shown.model_info);
        this._contextTokens = chooseNumCtx(this._requestedContext, maxContext);
        console.log('[RemoteLLM] Ollama model', modelId,
                    'capabilities=', this._capabilities,
                    'maxContext=', maxContext,
                    'num_ctx=', this._contextTokens);
      } else {
        const resp = await this._fetch(this._endpoint + '/models', { method: 'GET' });
        if (resp.status === 401) throw new Error('HTTP 401 — check the API key');
        if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${this._endpoint}/models`);
        try {
          const body = await resp.json();
          const ids = (body?.data ?? []).map((m) => m.id).filter(Boolean);
          if (ids.length && !ids.includes(modelId)) {
            console.warn('[RemoteLLM] model', modelId, 'not in /models response; available:', ids);
          }
        } catch { /* not a model list: the chat request will tell */ }
        this._isOllama = false;
        this._capabilities = [];
        this._contextTokens = this._requestedContext || null;
      }

      this._loadedModelId = modelId;
      this._setStatus('ready', this._isOllama ? 'Ready (Ollama)' : 'Ready (remote)');
    } catch (err) {
      this._setStatus('error', await explainConnectionError(this._endpoint, err));
      throw err;
    }
  }

  async _answersAsOllama(base) {
    try {
      const r = await this._fetch(base + '/api/version', { method: 'GET' });
      const body = r.ok ? await r.json().catch(() => null) : null;
      return typeof body?.version === 'string';
    } catch {
      return false;
    }
  }

  async _showModel(base, modelId) {
    const r = await this._fetch(base + '/api/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId }),
    });
    if (r.status === 404) {
      throw new Error(`Model "${modelId}" is not available on the server (pull it first)`);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${base}/api/show`);
    return r.json();
  }

  /** Streams one reply and resolves to `{ toolCalls, finishReason }`; native
   *  tool calls and `onThinking` reasoning come only from Ollama. */
  async generate(messages, { onToken, onThinking, maxTokens, tools } = {}) {
    if (this._status !== 'ready') {
      console.warn('[RemoteLLM] generate rejected: status=', this._status);
      throw new Error('Model not ready');
    }
    this._abortCtrl = new AbortController();
    const run = {
      t0: now(), firstTokenAt: null, outputChars: 0, outputTokens: 0,
      finishReason: null, aborted: false, inputTokens: null, toolCalls: [],
      inputChars: messages.reduce((n, m) => n + (m.content?.length ?? 0), 0),
    };
    const firstToken = () => {
      if (run.firstTokenAt === null) run.firstTokenAt = now();
    };
    const emit = (text) => {
      if (typeof text !== 'string' || !text) return;
      firstToken();
      run.outputChars += text.length;
      run.outputTokens++;
      callListener('onToken', onToken, text);
    };
    const think = (text) => {
      if (typeof text !== 'string' || !text) return;
      firstToken();
      callListener('onThinking', onThinking, text);
    };

    try {
      if (this._isOllama) {
        await this._streamOllama(messages, { maxTokens, tools, emit, think, run });
      } else {
        await this._streamOpenAI(messages, { maxTokens, emit, run });
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !this._abortCtrl?.signal.aborted) throw err;
      run.aborted = true;
    } finally {
      this._abortCtrl = null;
    }

    const stats = summarizeRun({ ...run, t1: now(), inputMessages: messages.length });
    this._lastStats = stats;
    for (const fn of this._statsListeners) callListener('stats listener', fn, stats);
    return { toolCalls: run.toolCalls, finishReason: run.finishReason };
  }

  abort() {
    this._abortCtrl?.abort();
  }

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

    const url = `${toOllamaBase(this._endpoint)}/api/chat`;
    let resp = await this._post(url, body);
    let errText = resp.ok ? '' : await resp.text().catch(() => '');
    // Some models claim tool support and then reject tools: retry once without.
    if (!resp.ok && body.tools && /does not support tools/i.test(errText)) {
      console.warn('[RemoteLLM] model rejected tools; retrying without');
      this._capabilities = this._capabilities.filter((c) => c !== 'tools');
      delete body.tools;
      resp = await this._post(url, body);
      if (!resp.ok) errText = await resp.text().catch(() => errText);
    }
    if (!resp.ok) throw httpError(resp.status, errText);

    let buffer = '';
    await readStream(resp, (text) => {
      const { lines, rest } = takeNDJSONLines(buffer + text);
      buffer = rest;
      for (const line of lines) {
        const chunk = parseChunk(line, 'NDJSON line');
        if (!chunk) continue;
        if (chunk.error) throw new Error(String(chunk.error));
        const msg = chunk.message ?? {};
        think(msg.thinking);
        emit(msg.content);
        for (const tc of Array.isArray(msg.tool_calls) ? msg.tool_calls : []) {
          const norm = normalizeToolCall(tc);
          if (norm) run.toolCalls.push(norm);
        }
        if (chunk.done) {
          run.finishReason = chunk.done_reason ?? 'stop';
          if (typeof chunk.prompt_eval_count === 'number') run.inputTokens = chunk.prompt_eval_count;
          if (typeof chunk.eval_count === 'number' && chunk.eval_count > 0) run.outputTokens = chunk.eval_count;
        }
      }
    });
  }

  async _streamOpenAI(messages, { maxTokens, emit, run }) {
    const resp = await this._post(`${this._endpoint}/chat/completions`, {
      model: this._loadedModelId,
      messages,
      stream: true,
      temperature: 0.1,
      top_p: 1.0,
      max_tokens: maxTokens || 1024,
      frequency_penalty: 0.5,
      presence_penalty: 0,
    });
    if (!resp.ok) throw httpError(resp.status, await resp.text().catch(() => ''));

    let buffer = '';
    await readStream(resp, (text) => {
      const { frames, rest } = takeSSEFrames(buffer + text);
      buffer = rest;
      for (const data of frames) {
        const chunk = parseChunk(data, 'SSE frame');
        if (!chunk) continue;
        const choice = chunk.choices?.[0];
        emit(choice?.delta?.content);
        if (choice?.finish_reason) run.finishReason = choice.finish_reason;
        if (typeof chunk.usage?.prompt_tokens === 'number') run.inputTokens = chunk.usage.prompt_tokens;
      }
    });
  }

  _fetch(url, init = {}) {
    return fetch(url, {
      ...init,
      headers: bearerHeaders(this._apiKey, init.headers),
    });
  }

  _post(url, body) {
    return this._fetch(url, {
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
