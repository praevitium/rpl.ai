import { LLM } from '../www/src/ai/llm.js';
import { assert } from './helpers.mjs';

/* LLM — the main-thread manager wrapping the inference Web Worker, the
   worker-based sibling of RemoteLLM.  It had ZERO coverage: every prior
   AI-lane pin targeted chat-bot.js / remote-llm.js / system-prompt.js,
   so a refactor of LLM's load/generate preconditions, its
   subscribe/unsubscribe contract, or its _onWorkerMessage router would
   pass the whole suite.  The class spins up a real Worker only inside
   load() (after its guards), so the constructor defaults, the two
   load() preconditions, the generate() readiness gate, the listener
   fan-out, and the entire message router are all reachable with no
   Worker — exactly the network-free surface session339 pinned for
   RemoteLLM. */

// session433: constructor seeds the idle/unloaded defaults — the same
// initial getter state RemoteLLM exposes (status idle, no model, no stats).
{
  const l = new LLM();
  assert(l.status === 'idle' && l.statusMsg === '',
         'session433: a fresh LLM is idle with no status message');
  assert(l.loadedModelId === null && l.lastStats === null,
         'session433: a fresh LLM has no loaded model id or stats packet');
}

// session433: load()'s modelId precondition rejects BEFORE any Worker is
// created — the guard is the first statement, so '' / null / undefined all
// reject and the worker stays null (no inference pipeline is spun up).
{
  const l = new LLM();
  let m = '';
  await l.load().catch((e) => { m = e.message; });
  assert(m === 'load() requires a modelId',
         'session433: load() rejects without a modelId before creating a Worker');
  m = '';
  await l.load('').catch((e) => { m = e.message; });
  assert(m === 'load() requires a modelId',
         'session433: load() rejects an empty-string modelId');
  assert(l._worker === null,
         'session433: a rejected load() never instantiates the Worker');
}

// session433: load(sameId) while already ready resolves immediately and
// short-circuits before the Worker branch — the no-op re-load the picker UI
// relies on. (Set the ready/loaded state directly; no Worker round-trip.)
{
  const l = new LLM();
  l._status = 'ready';
  l._loadedModelId = 'mX';
  let resolved = false;
  await l.load('mX').then(() => { resolved = true; });
  assert(resolved && l._worker === null,
         'session433: load(same id while ready) resolves without creating a Worker');
}

// session433: generate() throws the readiness gate before posting to the
// worker when no model has loaded (status !== 'ready') — mirrors RemoteLLM's
// pre-fetch gate.
{
  const l = new LLM();
  let m = '';
  await l.generate([{ role: 'user', content: 'hi' }]).catch((e) => { m = e.message; });
  assert(m === 'Model not ready',
         'session433: generate() rejects on a non-ready model before posting to the worker');
}

// session433: the onStatus subscription contract — the listener fires on a
// status change and the returned unsubscribe function removes it; _setStatus
// updates the getters regardless of listeners (same shape backs
// onProgress/onStats).
{
  const l = new LLM();
  const seen = [];
  const off = l.onStatus((s, msg) => seen.push([s, msg]));
  assert(typeof off === 'function', 'session433: onStatus returns an unsubscribe function');
  l._setStatus('loading', 'hi');
  off();
  l._setStatus('ready', 'done');
  assert(seen.length === 1 && seen[0][0] === 'loading' && seen[0][1] === 'hi',
         'session433: onStatus listener fires once then stops after unsubscribe');
  assert(l.status === 'ready' && l.statusMsg === 'done',
         'session433: _setStatus updates the status/statusMsg getters regardless of listeners');
}

// session433: the CRITICAL ORDERING contract in _onWorkerMessage — a 'ready'
// status updates loadedModelId (from _loadingModelId) and clears the pending
// id BEFORE the status listeners fire, so a listener reading loadedModelId
// during the 'ready' fan-out already sees the new id; the pending load
// promise then resolves.
{
  const l = new LLM();
  l._loadingModelId = 'mY';
  let resolved = false;
  l._loadResolve = () => { resolved = true; };
  let idDuringFanout = 'unset';
  l.onStatus(() => { idDuringFanout = l.loadedModelId; });
  l._onWorkerMessage({ data: { type: 'status', status: 'ready' } });
  assert(l.loadedModelId === 'mY' && l._loadingModelId === null,
         'session433: a ready status promotes _loadingModelId to loadedModelId and clears the pending id');
  assert(idDuringFanout === 'mY',
         'session433: loadedModelId is updated BEFORE the status listeners fire');
  assert(resolved, 'session433: a ready status resolves the pending load promise');
}

// session433: an 'error' status rejects both the pending load and any
// in-flight generation and flips the status to error.
{
  const l = new LLM();
  let le = '';
  let ge = '';
  l._loadReject = (e) => { le = e.message; };
  l._genReject = (e) => { ge = e.message; };
  l._onWorkerMessage({ data: { type: 'status', status: 'error', message: 'boom' } });
  assert(l.status === 'error' && l.statusMsg === 'boom',
         'session433: an error status sets the status/message getters');
  assert(le === 'boom' && ge === 'boom',
         'session433: an error status rejects both the pending load and the in-flight generation');
}

// session433: the progress and token router arms fan out to the right sinks —
// progress to the progress listeners, a token to the active onToken callback.
{
  const l = new LLM();
  const prog = [];
  l.onProgress((p) => prog.push(p));
  l._onWorkerMessage({ data: { type: 'progress', file: 'f', progress: 0.5 } });
  assert(prog.length === 1 && prog[0].file === 'f' && prog[0].progress === 0.5,
         'session433: a progress message fans out to the progress listeners');
  let tok = null;
  l._genOnToken = (t) => { tok = t; };
  l._onWorkerMessage({ data: { type: 'token', text: 'hi' } });
  assert(tok === 'hi', 'session433: a token message invokes the active onToken callback');
}

// session433: a stats message caches lastStats AND fans out to stats
// listeners, and the per-listener try/catch swallows a throwing listener so
// the router itself never throws.
{
  const l = new LLM();
  const ids = [];
  l.onStats((s) => { ids.push(s.id); throw new Error('listener boom'); });
  let routerThrew = false;
  try {
    l._onWorkerMessage({ data: { type: 'stats', id: 7, inputChars: 1, inputMessages: 1, outputTokens: 2, totalMs: 5, decodeTps: 1 } });
  } catch { routerThrew = true; }
  assert(l.lastStats && l.lastStats.id === 7,
         'session433: a stats message caches the packet on lastStats');
  assert(ids.length === 1 && ids[0] === 7 && !routerThrew,
         'session433: a throwing stats listener is caught so the router does not throw');
}

// session433: a 'done' message resolves the pending generation and clears the
// per-generation handlers; an 'error' message rejects it.
{
  const l = new LLM();
  let gr = false;
  l._genResolve = () => { gr = true; };
  l._genOnToken = () => {};
  l._onWorkerMessage({ data: { type: 'done', id: 8 } });
  assert(gr && l._genOnToken === null && l._genResolve === null,
         'session433: a done message resolves the generation promise and clears its handlers');

  const l2 = new LLM();
  let ge = '';
  l2._genReject = (e) => { ge = e.message; };
  l2._onWorkerMessage({ data: { type: 'error', id: 9, message: 'gen fail' } });
  assert(ge === 'gen fail',
         'session433: an error message rejects the in-flight generation');
}

// session433: abort() is a safe no-op when no worker has been created — the
// optional-chaining postMessage guard means it never throws on a fresh LLM.
{
  const l = new LLM();
  let safe = true;
  try { l.abort(); } catch { safe = false; }
  assert(safe, 'session433: abort() is a safe no-op when no worker exists');
}
