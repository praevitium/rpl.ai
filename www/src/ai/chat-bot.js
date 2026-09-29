/* =================================================================
   ChatBot — the AI assistant.  It imports nothing from rpl/ or the UI:
   the calculator passes in a `tools` bag and a `getContext` function.

   Constructor options:
     tools: {
       run(text: string): string        — type RPL into the editor and ENTER;
                                          returns the LCD error text or ''
       evaluate(text: string): object   — dry-run RPL on a scratch copy of the
                                          stack: ok + stack + depth, or ok:false + error
       evaluateOn(text, items): object  — the same dry run on the given stack items
       appendToEditor(text: string)     — insert at cursor, no commit
       clearEditor(): void              — empty the editor buffer
       getEditor(): string              — current editor contents
       listVars(): string[]             — variable names in current dir
       recallVar(name: string): any     — value of named variable (or undefined)
       lookupCommand(name: string)      — text + registered + name from the
                                          command reference ('' text if none)
       searchCommands(query: string)    — ranked rows: name, inApp, description, category
       snapshotState(): any             — opaque whole-calculator snapshot
       restoreState(snap: any): void    — restore a snapshot (turn-level undo)
     }
     getContext(): {
       stack: string[]   — formatted stack lines, index 0 = level 1
       depth: number     — total stack depth (stack[] may be truncated)
       angleMode: string — 'RAD' | 'DEG' | 'GRD'
       displayMode: string
       exactMode: string — 'EXACT' | 'APPROX'
       base: string      — 'DEC' | 'HEX' | 'OCT' | 'BIN'
       casVar: string    — current CAS variable (VX)
       dir: string       — current directory path
       vars: string[]    — variable names in the current directory
       editor: string    — entry-line buffer
       lastError: string — most recent LCD error, or ''
     }

   A turn streams a reply, runs its tool calls without confirmation
   (native calls plus bare {"name":…,"arguments":…} lines found by
   parseAllToolCalls) and re-invokes the model until it answers in
   prose.  A turn that changed the calculator ends with an Undo link.
   ================================================================= */

import {
  RemoteLLM, toOpenAIBase, toOllamaBase, isOllamaCloudUrl, ollamaCloudAdvice, bearerHeaders, explainConnectionError,
} from './remote-llm.js';
import { buildSystemPrompt, TOOL_SCHEMAS } from './system-prompt.js';
import { TutorCard } from './tutor.js';
import { hpCodesToGlyphs } from '../rpl/hp-text.js';

function dlog(...args)  { console.log('[ChatBot]', ...args); }
function dwarn(...args) { console.warn('[ChatBot]', ...args); }

function elem(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

function button(props, onClick) {
  const b = elem('button', { type: 'button', ...props });
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

const MAX_TURN_ITERATIONS = 12;
const MAX_ATTEMPTS = 2;

// Thinking models spend thousands of tokens on hidden reasoning before the visible answer.
const MAX_REPLY_TOKENS = 16384;

// Reset on every streamed token or thinking chunk; only silence aborts.
const STALL_TIMEOUT_MS = 45000;

const RESPONSE_RESERVE_CHARS = 4000;
const CHARS_PER_TOKEN = 4;

const CONTINUE_NOTE = '[Tool results are attached to your previous message. Continue if more steps are needed. When the task is complete, reply with prose only — no tool calls — and only add what is new (results, conclusions, next steps); do not repeat explanations you already gave.]';

export function effectiveBudget(llm) {
  return Math.max(0, activeContextTokens(llm) * CHARS_PER_TOKEN - RESPONSE_RESERVE_CHARS);
}

let _katexPromise = null;
function ensureKaTeX() {
  if (!_katexPromise) {
    _katexPromise = import('../../vendor/katex/katex.mjs')
      .then((m) => m.default)
      .catch((err) => { _katexPromise = null; throw err; });
  }
  return _katexPromise;
}

let _mermaidPromise = null;
function ensureMermaid() {
  if (!_mermaidPromise) {
    _mermaidPromise = new Promise((resolve, reject) => {
      if (globalThis.mermaid) { resolve(globalThis.mermaid); return; }
      const s = document.createElement('script');
      s.src = 'vendor/mermaid/mermaid.min.js';
      s.onload = () => {
        const m = globalThis.mermaid;
        if (!m) { reject(new Error('mermaid global missing after load')); return; }
        m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
        resolve(m);
      };
      s.onerror = () => reject(new Error('failed to load vendor/mermaid/mermaid.min.js'));
      document.head.appendChild(s);
    }).catch((err) => { _mermaidPromise = null; throw err; });
  }
  return _mermaidPromise;
}

function renderMathInto(target, expr, displayMode) {
  const fallback = elem(displayMode ? 'div' : 'span', {
    className: displayMode ? 'cb-math-fallback cb-math-display' : 'cb-math-fallback',
    textContent: displayMode ? `$$${expr}$$` : `$${expr}$`,
  });
  target.appendChild(fallback);
  ensureKaTeX().then((katex) => {
    try {
      const wrap = elem(displayMode ? 'div' : 'span', { className: displayMode ? 'cb-math-display' : 'cb-math-inline' });
      wrap.innerHTML = katex.renderToString(expr, { displayMode, throwOnError: false, output: 'html' });
      fallback.replaceWith(wrap);
    } catch { /* keep the source text */ }
  }).catch(() => {});
}

let _mermaidCounter = 0;
function renderMermaidInto(parent, source) {
  const wrap = parent.appendChild(elem('div', { className: 'cb-mermaid' }));
  wrap.appendChild(elem('pre')).appendChild(elem('code', { textContent: source }));
  ensureMermaid().then(async (m) => {
    try {
      const { svg } = await m.render(`cb-mermaid-${++_mermaidCounter}`, source);
      wrap.innerHTML = svg;
    } catch (err) {
      wrap.appendChild(elem('div', { className: 'cb-mermaid-error', textContent: `mermaid: ${err?.message || 'render failed'}` }));
    }
  }).catch(() => {});
}

export function parseFencedBlock(block) {
  const inner = block.slice(3, -3);
  const nlIdx = inner.indexOf('\n');
  const lang  = nlIdx >= 0 ? inner.slice(0, nlIdx).trim().toLowerCase() : '';
  const code  = nlIdx >= 0 ? inner.slice(nlIdx + 1) : inner;
  return { lang, code };
}

// Odd split parts are the fences; an unclosed fence stays text.
function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  text.split(/(```[\s\S]*?```)/g).forEach((part, i) => {
    if (i % 2 === 0) { appendInlineMarkdown(frag, part); return; }
    const { lang, code } = parseFencedBlock(part);
    if (lang === 'mermaid') renderMermaidInto(frag, code.trimEnd());
    else frag.appendChild(elem('pre')).appendChild(elem('code', { textContent: code.trimEnd() }));
  });
  return frag;
}

// Display math ($$…$$ or \[…\]) is block-level, so it is split out before the line pass.
function appendInlineMarkdown(frag, text) {
  text.split(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/g).forEach((seg, i) => {
    if (i % 2) renderMathInto(frag, seg.slice(2, -2).trim(), true);
    else if (seg) appendInlineMarkdownLines(frag, seg);
  });
}

export function classifyMarkdownLine(line) {
  const hm = line.match(/^(#{1,3})\s+(.+)/);
  if (hm) return { kind: 'heading', level: hm[1].length, content: hm[2] };
  const lim = line.match(/^\s*[-*]\s+(.*)/);
  if (lim) return { kind: 'bullet', content: lim[1] };
  const nlim = line.match(/^\s*\d+\.\s+(.*)/);
  if (nlim) return { kind: 'ordered', content: nlim[1] };
  if (line.trim() === '') return { kind: 'blank' };
  return { kind: 'text', content: line };
}

function appendInlineMarkdownLines(frag, text) {
  let p = null;
  const flushP = () => { if (p) { frag.appendChild(p); p = null; } };
  for (const line of text.split('\n')) {
    const c = classifyMarkdownLine(line);
    if (c.kind === 'text') {
      if (!p) p = elem('p');
      else p.appendChild(document.createTextNode(' '));
      appendSpans(p, c.content);
      continue;
    }
    flushP();
    if (c.kind === 'heading') {
      appendSpans(frag.appendChild(elem(`h${c.level + 2}`)), c.content);
    } else if (c.kind !== 'blank') {
      const tag = c.kind === 'bullet' ? 'UL' : 'OL';
      const list = frag.lastChild?.tagName === tag ? frag.lastChild : frag.appendChild(elem(tag));
      appendSpans(list.appendChild(elem('li')), c.content);
    }
  }
  flushP();
}

/** Inline spans in document order: text, code, math, bold, em.  The
 *  leftmost opener wins.  `$…$` needs a non-space just inside each `$`,
 *  so prose dollars ("costs $5 and $10") stay text, and an escaped `\$`
 *  never delimits: KaTeX gets it inside math, prose gets a bare `$`. */
export function parseInlineSpans(text) {
  const re = /(`([^`]+)`|\\\(([\s\S]+?)\\\)|(?<!\\)\$(?=\S)((?:\\[^\n]|[^\\$\n])+?)(?<=\S)\$|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  const prose = s => s.replace(/\\\$/g, '$');
  const spans = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      spans.push({ type: 'text', content: prose(text.slice(last, m.index)) });
    }
    if (m[2] !== undefined) spans.push({ type: 'code', content: m[2] });
    else if (m[3] !== undefined) spans.push({ type: 'math', content: m[3] });
    else if (m[4] !== undefined) spans.push({ type: 'math', content: m[4] });
    else if (m[5] !== undefined) spans.push({ type: 'bold', content: prose(m[5]) });
    else if (m[6] !== undefined) spans.push({ type: 'em', content: prose(m[6]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    spans.push({ type: 'text', content: prose(text.slice(last)) });
  }
  return spans;
}

const SPAN_TAGS = { code: 'code', bold: 'strong', em: 'em' };

function appendSpans(parent, text) {
  for (const { type, content } of parseInlineSpans(text)) {
    if (type === 'text') parent.appendChild(document.createTextNode(content));
    else if (type === 'math') renderMathInto(parent, content.trim(), false);
    else parent.appendChild(elem(SPAN_TAGS[type], { textContent: content }));
  }
}

/** Index of the `close` that balances the `open` at text[start], skipping
 *  JSON strings: RPL braces inside an argument need not balance.  -1 while
 *  the block is still streaming. */
function matchBalancedEnd(text, start, open, close) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Every `{"name":…,"arguments":…}` object in the text, in order; malformed
 *  candidates are skipped, since models often emit half-formed JSON first. */
export function parseAllToolCalls(text) {
  const calls = [];
  const anchor = /\{\s*"name"\s*:/g;
  let m;
  while ((m = anchor.exec(text)) !== null) {
    const start = m.index;
    const end = matchBalancedEnd(text, start, '{', '}');
    if (end < 0) break;
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (obj && typeof obj.name === 'string') {
        calls.push({ name: obj.name, arguments: obj.arguments ?? {} });
      }
    } catch { /* malformed — skip */ }
    anchor.lastIndex = end + 1;
  }
  return calls;
}

/** Up to three follow-up chips from a `SUGGEST: [...]` line.  When the
 *  array is not valid JSON (smart quotes, stray commas) its quoted strings
 *  are used instead. */
export function parseSuggestions(text) {
  const anchor = /\bSUGGEST\s*:/i.exec(text ?? '');
  if (!anchor) return null;
  const after = text.slice(anchor.index + anchor[0].length);
  const lo = after.indexOf('[');
  const hi = lo < 0 ? -1 : matchBalancedEnd(after, lo, '[', ']');
  if (hi < 0) return null;
  const slice = after.slice(lo, hi + 1);
  const firstThree = (values) => {
    const out = values.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean).slice(0, 3);
    return out.length ? out : null;
  };
  let parsed = null;
  try { parsed = JSON.parse(slice); } catch { /* fall back to the quoted strings */ }
  return (Array.isArray(parsed) && firstThree(parsed))
    || firstThree([...slice.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]));
}

/** Where the tool calls or the SUGGEST line begin (hidden from the bubble), or -1. */
export function findMachineSectionStart(text) {
  const starts = [text.search(/\{\s*"name"\s*:/), text.search(/\bSUGGEST\s*:/i)].filter((i) => i >= 0);
  return starts.length ? Math.min(...starts) : -1;
}

/** Drops <think>/<thinking> blocks, including one still open mid-stream,
 *  so reasoning never reaches the bubble, the parsers or the history. */
export function stripThinkBlocks(text) {
  if (!text) return text;
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<think(?:ing)?>[\s\S]*$/i, '');
}

function splitReply(text) {
  const cleaned = stripThinkBlocks(text);
  const start = findMachineSectionStart(cleaned);
  return { cleaned, prose: (start >= 0 ? cleaned.slice(0, start) : cleaned).trim() };
}

/** Models trained on HP manuals write 'X^2+1', x², √, × and curly quotes;
 *  the entry line wants backticks and ASCII.  Strings are left alone. */
export function normalizeRpl(text) {
  let s = String(text ?? '');
  if (!s) return s;
  s = hpCodesToGlyphs(s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
  // Text that already uses backticks keeps its apostrophes: they are deliberate.
  if (!s.includes('`')) {
    let out = '', inStr = false;
    for (const ch of s) {
      if (ch === '"') inStr = !inStr;
      out += (ch === "'" && !inStr) ? '`' : ch;
    }
    s = out;
  }
  const outside = (fn) => {
    let out = '', inStr = false, buf = '';
    for (const ch of s) {
      if (ch === '"') {
        out += inStr ? buf + '"' : fn(buf) + '"';
        buf = ''; inStr = !inStr;
      } else buf += ch;
    }
    return out + (inStr ? buf : fn(buf));
  };
  s = outside((t) => t
    .replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
    .replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/√\s*\(/g, 'SQRT(').replace(/√\s*([A-Za-z0-9.]+)/g, 'SQRT($1)')
    .replace(/(^|[\s(«]|<<)->(?=[A-Z\s])/g, '$1→'));
  return s;
}

/** True when un-backticked RPL reads as an infix formula (10*(10^321-1)/9);
 *  strings, units and exponent literals don't count. */
export function looksInfix(text) {
  let s = String(text ?? '');
  if (s.includes('`')) return false;
  s = s.replace(/"[^"]*"/g, ' ')
       .replace(/\d(?:\.\d*)?[eE][-+]?\d+/g, '0')
       .replace(/_\S+/g, '')
       .replace(/#[0-9A-Fa-f]+[hdob]?/g, '0');
  return /[\w)][-+*/^][\w(]/.test(s) || /\)\s*[-+*/^]/.test(s) || /[-+*/^]\s*\(/.test(s);
}

function infixHint(code) {
  return looksInfix(code)
    ? ' Hint: that reads as an INFIX formula; bare RPL is postfix (10 321 ^ 1 -). To evaluate an infix expression wrap it in backticks and append EVAL (or →NUM for a decimal): `(10*(10^321-1)/9)-321` EVAL.'
    : '';
}

const STARTER_CHIPS = [
  'Solve X^2-3*X+2 = 0 for X',
  'Differentiate x^3+3*x+1',
  'Is 1234567 prime? If not, factor it',
  'Write a program that sums the stack',
  'What does ROLLD do?',
  'Invert the matrix [[1,2],[3,4]]',
];

// Names small models use for the real tools.  Ambiguous ones (a bare "add"
// could mean push or +) are left out: a retry beats a silent misroute.
export const TOOL_ALIASES = Object.freeze({
  'add_to_stack':       'push_to_stack',
  'push':               'push_to_stack',
  'put_on_stack':       'push_to_stack',
  'stack_push':         'push_to_stack',
  'show_stack':         'get_stack',
  'read_stack':         'get_stack',
  'list_stack':         'get_stack',
  'view_stack':         'get_stack',
  'show_editor':        'get_editor',
  'read_editor':        'get_editor',
  'view_editor':        'get_editor',
  'get_buffer':         'get_editor',
  'list_variables':     'get_vars',
  'list_vars':          'get_vars',
  'show_vars':          'get_vars',
  'show_variables':     'get_vars',
  'recall':             'recall_var',
  'recall_variable':    'recall_var',
  'get_var':            'recall_var',
  'get_variable':       'recall_var',
  'read_var':           'recall_var',
  'append_editor':      'append_to_editor',
  'editor_append':      'append_to_editor',
  'type_into_editor':   'append_to_editor',
  'editor_clear':       'clear_editor',
  'wipe_editor':        'clear_editor',
  'reset_editor':       'clear_editor',
  'execute':            'run',
  'execute_rpl':        'run',
  'run_rpl':            'run',
  'eval':               'evaluate',
  'evaluate_rpl':       'evaluate',
  'dry_run':            'evaluate',
  'preview':            'evaluate',
  'calculate':          'evaluate',
  'compute':            'evaluate',
  'test_rpl':           'evaluate',
  'lookup':             'lookup_command',
  'lookup_cmd':         'lookup_command',
  'command_help':       'lookup_command',
  'help':               'lookup_command',
  'describe_command':   'lookup_command',
  'get_command':        'lookup_command',
  'search':             'search_commands',
  'search_command':     'search_commands',
  'find_command':       'search_commands',
  'find_commands':      'search_commands',
  'list_commands':      'search_commands',
});

// Own-property check: a model calling "toString" must not reach Object.prototype.
export function resolveToolAlias(name) {
  return Object.prototype.hasOwnProperty.call(TOOL_ALIASES, name)
    ? TOOL_ALIASES[name]
    : name;
}

const TUTOR_MAX_STEPS = 8;

export function checkTutorPlan(args, evaluate) {
  const problem = String(args?.problem ?? '').trim();
  const raw = Array.isArray(args?.steps) ? args.steps : [];
  if (!problem) return { accepted: false, error: 'problem is missing: restate the problem in a sentence or two' };
  if (!raw.length || raw.length > TUTOR_MAX_STEPS) return { accepted: false, error: `give between 1 and ${TUTOR_MAX_STEPS} steps` };
  const steps = [];
  let program = '';
  for (const [i, step] of raw.entries()) {
    const title = String(step?.title ?? '').trim();
    const idea = String(step?.idea ?? '').trim();
    if (!title || !idea) return { accepted: false, error: `step ${i + 1} needs a title and an idea` };
    const rpl = normalizeRpl(String(step?.rpl ?? '').trim());
    if (rpl) {
      program = program ? `${program} ${rpl}` : rpl;
      const outcome = evaluate(program);
      if (!outcome?.ok) return { accepted: false, error: `step ${i + 1} (${rpl}) fails on the calculator after the steps before it: ${outcome?.error ?? 'unknown error'}` };
    }
    const hints = (Array.isArray(step?.hints) ? step.hints : []).map((h) => String(h ?? '').trim()).filter(Boolean).slice(0, 3);
    steps.push({ title, idea, rpl, keys: String(step?.keys ?? '').trim(), hints });
  }
  return { accepted: true, plan: { problem, steps } };
}

export function activeContextTokens(llm) {
  return llm?.contextTokens || REMOTE_CONTEXT_TOKENS_DEFAULT;
}

export const REMOTE_CONFIG_KEY = 'rpl5050.chatbot.remote';
// For Ollama this is the num_ctx requested (its own default truncates the
// system prompt); for other servers it only budgets the history.
const REMOTE_CONTEXT_TOKENS_DEFAULT = 32768;
const REMOTE_CONTEXT_CHOICES = [8192, 16384, 32768, 65536];

export function normalizeRemoteConfig(cfg) {
  if (!cfg || typeof cfg.url !== 'string' || typeof cfg.model !== 'string'
      || !cfg.url.trim() || !cfg.model.trim()) return null;
  const ctx = Number(cfg.contextTokens);
  return {
    url: cfg.url.trim(),
    model: cfg.model.trim(),
    contextTokens: Number.isFinite(ctx) && ctx > 0 ? ctx : REMOTE_CONTEXT_TOKENS_DEFAULT,
    think: cfg.think !== false,
    apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '',
  };
}

function loadRemoteConfig() {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_KEY);
    if (!raw) return null;
    return normalizeRemoteConfig(JSON.parse(raw));
  } catch { /* corrupt entry — fall through */ }
  return null;
}
function saveRemoteConfig(cfg) {
  try { localStorage.setItem(REMOTE_CONFIG_KEY, JSON.stringify(cfg)); }
  catch { /* private mode */ }
}
function clearRemoteConfig() {
  try { localStorage.removeItem(REMOTE_CONFIG_KEY); }
  catch { /* private mode */ }
}

// Ollama's /api/tags adds size and quantization; other servers only list /v1/models.
async function fetchRemoteModels(url, apiKey = '') {
  const headers = bearerHeaders(apiKey);
  const get = async (endpoint) => {
    const r = await fetch(endpoint, { method: 'GET', headers });
    if (r.status === 401) throw new Error('HTTP 401 — check the API key');
    return r;
  };
  const fromOllama = async () => {
    const r = await get(`${toOllamaBase(url)}/api/tags`);
    if (!r.ok) return null;
    const body = await r.json();
    const models = (body?.models ?? []).map((m) => ({
      id:     m.name || m.model,
      size:   typeof m.size === 'number' ? m.size : null,
      params: m.details?.parameter_size ?? null,
      quant:  m.details?.quantization_level ?? null,
    })).filter((m) => m.id);
    return models.length ? { models, source: 'ollama' } : null;
  };
  const fromOpenAI = async () => {
    const base = toOpenAIBase(url);
    const r = await get(`${base}/models`);
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${base}/models`);
    const body = await r.json();
    const models = (body?.data ?? []).map((m) => ({
      id: m.id, size: null, params: null, quant: null,
    })).filter((m) => m.id);
    if (!models.length) throw new Error('Endpoint returned no models');
    return { models, source: 'openai' };
  };

  try {
    const native = await fromOllama();
    if (native) return native;
  } catch { /* fall back to the OpenAI-compatible list */ }
  return fromOpenAI();
}

function formatBytes(n) {
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + ' MB';
  return (n / 1e3).toFixed(0) + ' KB';
}

export const CONSENT_KEY = 'rpl5050.chatbot.consented.v1';
function hasConsented() {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}
function setConsented() {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* private mode */ }
}

export class ChatBot {
  constructor({ tools, getContext, onStatus = null }) {
    this._tools      = tools;
    this._getContext = getContext;
    this._onStatusChange = onStatus;
    this._llm        = new RemoteLLM();
    this.mode        = 'ask';
    this.tutorStyle  = 'socratic';
    this._history    = [];
    this._container  = null;
    this._messagesEl = null;
    this._inputEl    = null;
    this._sendBtn    = null;
    this._stopBtn    = null;
    this._statusEl   = null;
    this._generating = false;
    this._queue = [];
    // Every turn, Stop and New chat bump it; a turn that sees a newer id unwinds quietly.
    this._runId = 0;
    this._registry = this._buildRegistry();
    this._wireLLMListeners();
  }

  _wireLLMListeners() {
    this._llm.onStatus((status, msg) => this._onStatus(status, msg));
    this._llm.onStats((stats) => this._onStats(stats));
  }

  _replaceLLM(llm) {
    this._llm.abort();
    this._llm = llm;
    this._wireLLMListeners();
  }

  _ensureRemoteLLM(endpoint, opts = {}) {
    const current = this._llm.options;
    if (this._llm.endpoint === toOpenAIBase(endpoint)
        && current.contextTokens === (opts.contextTokens ?? null)
        && current.think === (opts.think !== false)
        && current.apiKey === String(opts.apiKey || '').trim()) return;
    this._replaceLLM(new RemoteLLM(endpoint, opts));
  }

  /* Each tool is { mutates, summary?, handler, card? }.  Everything runs as
     soon as the model asks; `mutates` picks an action card over a one-line
     trace and earns the turn an Undo link.  A new tool also needs its entry
     in system-prompt.js TOOLS. */
  _buildRegistry() {
    const tools = this._tools;
    const ctx   = () => this._getContext();
    // An empty line would reach ENTER as DUP, so it is refused here.
    const execute = (text, argName) => {
      const code = normalizeRpl(text);
      const error = code.trim() ? tools.run(code) : `No RPL given: the "${argName}" argument is empty or missing`;
      const { stack, depth } = ctx();
      return error
        ? { success: false, error: String(error), stack, depth }
        : { success: true, stack, depth };
    };
    return {
      get_stack: {
        mutates: false,
        handler: () => {
          const c = ctx();
          return {
            stack: c.stack, depth: c.depth,
            angleMode: c.angleMode, displayMode: c.displayMode,
            exactMode: c.exactMode, base: c.base, casVar: c.casVar,
            dir: c.dir, vars: c.vars, editor: c.editor, lastError: c.lastError,
          };
        },
      },
      get_editor: {
        mutates: false,
        handler: () => ({ buffer: tools.getEditor() }),
      },
      get_vars: {
        mutates: false,
        handler: () => ({ vars: tools.listVars(), dir: ctx().dir }),
      },
      recall_var: {
        mutates: false,
        summary: ({ name } = {}) => ({ label: `recall_var ${name ?? ''}`, code: '' }),
        handler: ({ name } = {}) => {
          const v = tools.recallVar(String(name ?? ''));
          return v === undefined
            ? { name, exists: false }
            : { name, exists: true, value: String(v) };
        },
      },
      evaluate: {
        mutates: false,
        summary: ({ text } = {}) => ({ label: 'evaluate', code: normalizeRpl(text) }),
        handler: ({ text } = {}) => tools.evaluate(normalizeRpl(text)),
      },
      lookup_command: {
        mutates: false,
        summary: ({ name } = {}) => ({ label: `lookup_command ${name ?? ''}`, code: '' }),
        handler: ({ name } = {}) => tools.lookupCommand(String(name ?? '')),
      },
      tutor_plan: {
        mutates: false,
        handler: (args = {}) => checkTutorPlan(args, (text) => tools.evaluate(text)),
        card: (result) => (result?.accepted ? this._addTutorCard(result.plan) : null),
      },
      search_commands: {
        mutates: false,
        summary: ({ query } = {}) => ({ label: `search_commands ${query ?? ''}`, code: '' }),
        handler: ({ query } = {}) => ({
          query: String(query ?? ''),
          results: tools.searchCommands(String(query ?? '')),
        }),
      },
      run: {
        mutates: true,
        summary: ({ text } = {}) => ({ label: '▶ Run RPL', code: normalizeRpl(text) }),
        handler: ({ text } = {}) => execute(text, 'text'),
      },
      // Small models misroute "put 3 on the stack" to recall_var unless the action has its own name.
      push_to_stack: {
        mutates: true,
        summary: ({ value } = {}) => ({ label: '▲ Push to stack', code: normalizeRpl(value) }),
        handler: ({ value } = {}) => execute(value, 'value'),
      },
      append_to_editor: {
        mutates: true,
        summary: ({ text } = {}) => ({ label: '✎ Append to editor', code: String(text ?? '') }),
        handler: ({ text } = {}) => {
          tools.appendToEditor(String(text ?? ''));
          return { success: true, buffer: tools.getEditor() };
        },
      },
      clear_editor: {
        mutates: true,
        summary: () => ({ label: '✗ Clear editor', code: '' }),
        handler: () => {
          tools.clearEditor();
          return { success: true, buffer: tools.getEditor() };
        },
      },
    };
  }

  mount(el) {
    this._container = el;
    el.innerHTML = '';
    el.classList.add('cb-root');

    if (!hasConsented()) {
      dlog('mount: consent not yet given — rendering gate');
      el.appendChild(this._buildConsentGate());
      return;
    }

    el.appendChild(this._buildUI());
    this._connectSavedEndpoint();
  }

  _connectSavedEndpoint() {
    if (this._llm.status !== 'idle') return;
    const cfg = loadRemoteConfig();
    if (cfg) {
      this._startLoadRemote(cfg);
      return;
    }
    this._statusEl.textContent = 'No endpoint configured';
    this._statusEl.className = 'cb-status';
    this._showPicker();
  }

  _removeEndpointAndDisconnect() {
    clearRemoteConfig();
    this._replaceLLM(new RemoteLLM());
    this._statusEl.title = '';
    this._loadBtn.classList.add('hidden');
    this._switchModelBtn.classList.add('hidden');
    this._setUIState('idle');
    this._connectSavedEndpoint();
  }

  _buildConsentGate() {
    const wrap = elem('div', { className: 'cb-consent' });
    wrap.appendChild(elem('h2', { className: 'cb-consent-title', textContent: 'AI Assistant — Research Preview' }));
    wrap.appendChild(elem('p', {
      className: 'cb-consent-intro',
      textContent: 'This panel hosts an AI assistant that explains RPL, works through maths '
        + 'problems, and operates the calculator on your behalf. '
        + 'Please review the notes below before enabling it.',
    }));
    const list = wrap.appendChild(elem('ul', { className: 'cb-consent-list' }));
    for (const text of [
      'Replies come from a language model and may be wrong. The assistant checks its work on the calculator, but verify anything important.',
      'The assistant runs on an Ollama or OpenAI-compatible endpoint that you configure. The conversation and calculator state are sent to that server.',
      'The assistant runs calculator actions immediately — pushing values, running commands, storing variables, changing modes. Every action is shown as a card, and each turn has an Undo link that restores the calculator to how it was before.',
    ]) {
      list.appendChild(elem('li', { textContent: text }));
    }
    wrap.appendChild(elem('p', {
      className: 'cb-consent-footer',
      textContent: 'Click Enable to continue. This preference is remembered for future sessions; '
        + 'clearing the site’s storage will restore the notice.',
    }));
    // Swaps the UI in directly: with storage blocked the consent can't persist.
    wrap.appendChild(button({ className: 'cb-consent-accept', textContent: 'Enable assistant' }, () => {
      dlog('mount: user enabled assistant — persisting consent and swapping in chat UI');
      setConsented();
      this._container.innerHTML = '';
      this._container.appendChild(this._buildUI());
      this._connectSavedEndpoint();
    }));
    return wrap;
  }

  _buildUI() {
    const root = elem('div', { className: 'cb-inner' });

    const header = elem('div', { className: 'cb-header' });
    this._statusEl = elem('div', { className: 'cb-status' });
    const betaBadge = elem('span', {
      className: 'cb-beta-badge',
      textContent: 'BETA',
      title: 'Research preview — replies may be wrong; actions run immediately and every turn can be undone.',
    });
    const copyBtn = button({ className: 'cb-newchat-btn', title: 'Copy the conversation as text', textContent: 'Copy' },
      () => this._copyTranscript(copyBtn));
    const newChatBtn = button({ className: 'cb-newchat-btn', title: 'Start a new conversation', textContent: '✱ New' },
      () => this._newChat());
    newChatBtn.setAttribute('aria-label', 'New chat');
    header.append(this._statusEl, betaBadge, copyBtn, newChatBtn);

    this._loadBtn = button({ className: 'cb-load-btn hidden', textContent: 'Retry', title: 'Retry connecting to the endpoint.' }, () => {
      const cfg = loadRemoteConfig();
      if (cfg) this._startLoadRemote(cfg);
      else this._showPicker();
    });
    this._switchModelBtn = button({
      className: 'cb-switch-model-btn hidden',
      textContent: 'Endpoint settings',
      title: 'Configure the Ollama / OpenAI-compatible endpoint.',
    }, () => this._showPicker());
    this._pickerEl = elem('div', { className: 'cb-picker hidden' });
    this._messagesEl = elem('div', { className: 'cb-messages' });
    this._statsEl = elem('div', {
      className: 'cb-stats hidden',
      title: 'Inference stats — most recent turn and cumulative session totals.',
    });

    this._inputEl = elem('textarea', { className: 'cb-input', placeholder: this._placeholder(), rows: 1 });
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });
    this._inputEl.addEventListener('input', () => {
      const input = this._inputEl;
      input.style.height = 'auto';
      // border-box sizing: without the 2px border the last line is clipped.
      input.style.height = (input.scrollHeight + 2) + 'px';
    });
    this._sendBtn = button({ className: 'cb-send-btn', textContent: '▶', title: 'Send (Enter)', disabled: true }, () => this._submit());
    this._stopBtn = button({ className: 'cb-stop-btn hidden', textContent: '■ Stop' }, () => this._abort());
    const inputRow = elem('div', { className: 'cb-input-row' });
    inputRow.append(this._inputEl, this._sendBtn);

    root.append(header, this._loadBtn, this._switchModelBtn, this._pickerEl,
      this._messagesEl, this._statsEl, this._stopBtn, inputRow);
    this._setUIState('idle');
    return root;
  }

  _showPicker() {
    if (!this._pickerEl) return;
    this._pickerEl.innerHTML = '';
    this._pickerEl.classList.remove('hidden');

    const head = elem('div', { className: 'cb-picker-head' });
    head.appendChild(elem('p', {
      className: 'cb-picker-blurb',
      textContent: loadRemoteConfig()
        ? 'The assistant runs on the Ollama or OpenAI-compatible endpoint below.'
        : 'Add an Ollama or OpenAI-compatible endpoint below to use the assistant.',
    }));
    const closeBtn = button({ className: 'cb-picker-close', title: 'Close endpoint settings', textContent: '✕' },
      () => this._dismissPicker());
    closeBtn.setAttribute('aria-label', 'Close endpoint settings');
    head.appendChild(closeBtn);
    this._pickerEl.appendChild(head);

    this._renderRemoteSection();
  }

  _renderRemoteSection() {
    const wrap = elem('div', { className: 'cb-remote-section' });
    wrap.appendChild(elem('div', { className: 'cb-remote-heading', textContent: 'Ollama / OpenAI-compatible endpoint' }));
    this._pickerEl.appendChild(wrap);

    const cfg = loadRemoteConfig();
    if (!cfg) {
      wrap.appendChild(button({ className: 'cb-remote-add', textContent: '+ Add endpoint' }, () => this._renderRemoteForm(null)));
      return;
    }
    const isActive = this._llm.loadedModelId === cfg.model;
    const row = elem('div', { className: `cb-picker-row cb-remote-row${isActive ? ' cb-picker-row-active' : ''}` });
    const top = elem('div', { className: 'cb-picker-row-top' });
    top.append(
      elem('span', { className: 'cb-picker-name', textContent: cfg.model }),
      elem('span', { className: 'cb-picker-size', textContent: cfg.url }),
    );
    const knobs = `${cfg.contextTokens / 1024}K context · thinking ${cfg.think ? 'on' : 'off'}`
      + (cfg.apiKey ? ' · API key set' : '');
    const note = elem('div', {
      className: 'cb-picker-note',
      textContent: isActive ? `Endpoint · connected · ${knobs}` : `Endpoint — click to connect · ${knobs}`,
    });
    // Connect has no handler of its own: the click reaches the row.
    const btnRow = elem('div', { className: 'cb-remote-btns' });
    if (!isActive) btnRow.appendChild(button({ className: 'cb-remote-btn cb-remote-btn-primary', textContent: 'Connect' }));
    btnRow.append(
      button({ className: 'cb-remote-btn', textContent: 'Edit' }, (e) => {
        e.stopPropagation();
        this._renderRemoteForm(cfg);
      }),
      button({ className: 'cb-remote-btn', textContent: 'Remove' }, (e) => {
        e.stopPropagation();
        if (!this._generating) this._removeEndpointAndDisconnect();
      }),
    );
    row.append(top, note, btnRow);
    row.addEventListener('click', () => {
      if (this._generating) return;
      if (isActive) this._hidePicker();
      else this._connectFresh(cfg);
    });
    wrap.appendChild(row);
  }

  _renderRemoteForm(seed) {
    if (!this._pickerEl) return;
    this._pickerEl.querySelector('.cb-remote-section')?.remove();

    const wrap = elem('div', { className: 'cb-remote-section cb-remote-form' });
    const label = (textContent, className = 'cb-remote-label') => elem('label', { className, textContent });
    const heading = elem('div', {
      className: 'cb-remote-heading',
      textContent: seed ? 'Edit endpoint' : 'Add Ollama / OpenAI-compatible endpoint',
    });
    const help = elem('div', {
      className: 'cb-remote-help',
      textContent: 'For local Ollama the URL is http://localhost:11434 — models you have pulled '
        + 'appear below once it is reachable. For Ollama\'s cloud models, run `ollama signin` on the machine '
        + 'running Ollama and pick a model whose name ends in -cloud or :cloud; browsers can\'t call ollama.com directly. '
        + 'Any OpenAI-compatible server that accepts browser requests also works. '
        + 'Ollama models that support tools and thinking get native tool calling and reasoning.',
    });
    const urlInput = elem('input', {
      type: 'url',
      className: 'cb-remote-input',
      placeholder: 'http://localhost:11434/v1',
      value: seed?.url ?? 'http://localhost:11434/v1',
    });
    const keyInput = elem('input', {
      type: 'password',
      className: 'cb-remote-input',
      autocomplete: 'off',
      spellcheck: false,
      placeholder: 'API key, if the server needs one',
      value: seed?.apiKey ?? '',
    });
    const modelSelect = elem('select', { className: 'cb-remote-input cb-picker-select', disabled: true });
    const placeholder = elem('option', { textContent: '(enter a URL to load available models)', value: '' });
    modelSelect.appendChild(placeholder);
    const statusEl = elem('div', { className: 'cb-remote-help' });

    // Context is the num_ctx requested; both options are ignored by non-Ollama servers.
    const ctxSelect = elem('select', {
      className: 'cb-remote-input cb-picker-select cb-remote-ctx',
      title: 'Context window to request from Ollama (num_ctx). Larger keeps more conversation but uses more memory.',
    });
    for (const n of REMOTE_CONTEXT_CHOICES) {
      ctxSelect.appendChild(elem('option', { value: String(n), textContent: `${n / 1024}K tokens` }));
    }
    ctxSelect.value = String(REMOTE_CONTEXT_CHOICES.includes(seed?.contextTokens) ? seed.contextTokens : REMOTE_CONTEXT_TOKENS_DEFAULT);
    const ctxLabel = label('Context', 'cb-remote-label cb-remote-opt');
    ctxLabel.appendChild(ctxSelect);
    const thinkBox = elem('input', { type: 'checkbox', checked: seed?.think !== false });
    const thinkLabel = label('', 'cb-remote-label cb-remote-opt cb-remote-check');
    thinkLabel.append(thinkBox, ' Let thinking models reason first');
    thinkLabel.title = 'For models that support it (Qwen3, DeepSeek-R1, gpt-oss…): reason before answering. Slower, but better on multi-step problems.';
    const optsRow = elem('div', { className: 'cb-remote-opts' });
    optsRow.append(ctxLabel, thinkLabel);
    const errEl = elem('div', { className: 'cb-remote-err' });

    // Each refresh takes a token, so a late answer for an older URL is dropped.
    let fetchToken = 0;
    let debounceTimer = null;
    const resetModels = () => {
      modelSelect.innerHTML = '';
      modelSelect.appendChild(placeholder);
      modelSelect.disabled = true;
      statusEl.textContent = '';
    };
    const refreshModels = async (preferredId) => {
      const url = urlInput.value.trim();
      const myToken = ++fetchToken;
      errEl.textContent = '';
      if (isOllamaCloudUrl(url)) {
        resetModels();
        errEl.textContent = ollamaCloudAdvice();
        return;
      }
      if (!url) {
        resetModels();
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        modelSelect.disabled = true;
        statusEl.textContent = '';
        return;
      }
      modelSelect.disabled = true;
      statusEl.textContent = 'Loading models…';
      try {
        const { models, source } = await fetchRemoteModels(url, keyInput.value.trim());
        if (myToken !== fetchToken) return;
        models.sort((a, b) => a.id.localeCompare(b.id));
        modelSelect.innerHTML = '';
        for (const m of models) {
          const meta = [m.params, formatBytes(m.size), m.quant].filter(Boolean).join(', ');
          modelSelect.appendChild(elem('option', { value: m.id, textContent: meta ? `${m.id} (${meta})` : m.id }));
        }
        if ([...modelSelect.options].some((o) => o.value === preferredId)) modelSelect.value = preferredId;
        modelSelect.disabled = false;
        statusEl.textContent = `${models.length} model${models.length === 1 ? '' : 's'} from `
          + (source === 'ollama' ? 'Ollama /api/tags' : 'OpenAI /v1/models');
      } catch (err) {
        if (myToken !== fetchToken) return;
        resetModels();
        const why = await explainConnectionError(url, err);
        if (myToken !== fetchToken) return;
        errEl.textContent = err instanceof TypeError ? why : `Couldn't load models from ${url}: ${why}`;
      }
    };
    urlInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      if (isOllamaCloudUrl(urlInput.value.trim())) refreshModels();
      else debounceTimer = setTimeout(() => refreshModels(seed?.model), 400);
    });
    urlInput.addEventListener('change', () => {
      clearTimeout(debounceTimer);
      refreshModels(seed?.model);
    });
    keyInput.addEventListener('change', () => refreshModels(modelSelect.value || seed?.model));

    const saveBtn = button({ className: 'cb-remote-save', textContent: seed ? 'Save & connect' : 'Add & connect' }, () => {
      const url = urlInput.value.trim();
      const model = modelSelect.value.trim();
      let problem = '';
      if (!url) problem = 'A URL is required.';
      else if (isOllamaCloudUrl(url)) problem = ollamaCloudAdvice();
      else if (!/^https?:\/\//i.test(url)) problem = 'URL must start with http:// or https://';
      else if (!model) problem = 'Pick a model from the dropdown.';
      if (problem) {
        errEl.textContent = problem;
        return;
      }
      const cfg = {
        url: url.replace(/\/+$/, ''), model, apiKey: keyInput.value.trim(),
        contextTokens: Number(ctxSelect.value) || REMOTE_CONTEXT_TOKENS_DEFAULT,
        think: thinkBox.checked,
      };
      saveRemoteConfig(cfg);
      this._connectFresh(cfg);
    });
    const cancelBtn = button({ className: 'cb-remote-btn', textContent: 'Cancel' }, () => this._showPicker());
    const btnRow = elem('div', { className: 'cb-remote-btns' });
    btnRow.append(saveBtn, cancelBtn);

    wrap.append(heading, help, label('Base URL'), urlInput, label('API key'), keyInput,
      label('Model'), modelSelect, statusEl, optsRow, errEl, btnRow);
    this._pickerEl.appendChild(wrap);
    urlInput.focus();
    if (urlInput.value.trim()) refreshModels(seed?.model);
  }

  _connectFresh(cfg) {
    if (this._generating) this._abort();
    this._hidePicker();
    this._history = [];
    if (this._messagesEl) this._messagesEl.innerHTML = '';
    this._removeActiveChips();
    this._startLoadRemote(cfg);
  }

  _hidePicker() {
    this._pickerEl?.classList.add('hidden');
  }

  // Unlike _hidePicker, leaves a button to reopen the panel.
  _dismissPicker() {
    this._hidePicker();
    if (this._switchModelBtn) {
      this._switchModelBtn.classList.remove('hidden');
      this._switchModelBtn.textContent =
        this._llm.loadedModelId ? 'Endpoint settings' : 'Configure endpoint';
    }
  }

  async _copyTranscript(btn) {
    const text = this._messagesEl?.innerText.trim() ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  }

  _newChat() {
    dlog('newChat: reset (was generating=', this._generating,
         'history len=', this._history.length, ')');
    this._runId++;
    if (this._generating) this._llm.abort();
    this._queue = [];
    this._history = [];
    this._sessionTotals = null;
    if (this._statsEl) {
      this._statsEl.textContent = '';
      this._statsEl.classList.add('hidden');
    }
    this._removeActiveChips();
    if (this._messagesEl) this._messagesEl.innerHTML = '';
    if (this._inputEl) {
      this._inputEl.value = '';
      this._inputEl.style.height = '';
    }
    if (this._llm.status === 'ready') {
      this._greetWithStarterChips('New conversation started. Pick a starter or type your own:');
    }
    this._inputEl?.focus();
  }

  _surfaceLoadFailure() {
    if (this._loadBtn) {
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry';
      this._loadBtn.classList.remove('hidden');
    }
    if (this._switchModelBtn) this._switchModelBtn.classList.remove('hidden');
    this._showPicker();
  }

  async _startLoadRemote(cfg) {
    if (!cfg?.url || !cfg?.model) {
      dwarn('startLoadRemote: missing url/model in cfg', cfg);
      this._showPicker();
      return;
    }
    this._ensureRemoteLLM(cfg.url, { contextTokens: cfg.contextTokens, think: cfg.think, apiKey: cfg.apiKey });
    this._loadBtn.disabled = true;
    this._loadBtn.textContent = 'Loading…';
    this._loadBtn.classList.add('hidden');
    this._switchModelBtn.classList.add('hidden');
    this._hidePicker();
    dlog('startLoadRemote: url=', cfg.url, 'model=', cfg.model);
    // A failure has already reached the UI through the 'error' status.
    await this._llm.load(cfg.model).catch(() => {});
  }

  _onStatus(status, msg) {
    this._onStatusChange?.(status);
    if (status === 'loading') {
      this._statusEl.textContent = msg || 'Loading…';
      this._statusEl.className = 'cb-status cb-status-loading';
      this._loadBtn.classList.add('hidden');
      this._switchModelBtn.classList.add('hidden');
      this._hidePicker();
    } else if (status === 'ready') {
      const label = `${this._llm.isOllama ? 'Ollama' : 'Remote'}: ${this._llm.loadedModelId || 'Ready'}`;
      const caps = [];
      if (this._llm.supportsTools) caps.push('native tools');
      if (this._llm.supportsThinking) caps.push(this._llm.thinkEnabled ? 'thinking on' : 'thinking off');
      if (this._llm.contextTokens) caps.push(`${Math.round(this._llm.contextTokens / 1024)}K context`);
      this._statusEl.title = caps.join(' · ');
      this._statusEl.textContent = `● ${label}`;
      this._statusEl.className = 'cb-status cb-status-ready';
      this._loadBtn.classList.add('hidden');
      this._switchModelBtn.classList.remove('hidden');
      this._switchModelBtn.textContent = 'Endpoint settings';
      this._sendBtn.disabled = false;
      this._hidePicker();
      if (this._history.length === 0) {
        this._greetWithStarterChips(
          `${label} ready. I can explain RPL and commands, work through maths ` +
          'problems, and drive the calculator for you — anything I change can be undone ' +
          'with one click. Pick a starter or type your own:',
        );
      }
    } else if (status === 'error') {
      this._statusEl.textContent = `✗ ${msg || 'Error'}`;
      this._statusEl.className = 'cb-status cb-status-error';
      this._surfaceLoadFailure();
    }
  }

  _onStats(stats) {
    if (!stats) return;
    if (!this._sessionTotals) this._sessionTotals = { turns: 0, outputTokens: 0 };
    const t = this._sessionTotals;
    t.turns += 1;
    t.outputTokens += stats.outputTokens ?? 0;
    dlog('turn stats:',
         `in=${stats.inputChars} chars (${stats.inputMessages} msgs)`,
         `out=${stats.outputTokens} tok (${stats.outputChars} chars)`,
         `latency=${Math.round(stats.totalMs ?? 0)}ms`,
         `ttft=${stats.ttftMs !== null ? `${Math.round(stats.ttftMs)}ms` : '-'}`,
         `decode=${stats.decodeTps != null ? `${stats.decodeTps.toFixed(1)} tok/s` : '-'}`,
         `session=${t.turns} turns, ${t.outputTokens} out tok`);
    this._renderStats(stats);
  }

  // Context use is measured against the same budget the history trimmer uses.
  _renderStats(stats) {
    if (!this._statsEl) return;
    // Ollama reports the real prompt size; other servers get the chars/4 estimate.
    const inTok  = stats.inputTokens ?? Math.round((stats.inputChars ?? 0) / CHARS_PER_TOKEN);
    const outTok = stats.outputTokens ?? 0;
    const ms     = Math.round(stats.totalMs ?? 0);
    const tps    = stats.decodeTps != null ? stats.decodeTps.toFixed(1) + ' tok/s' : '—';
    const ctxBudgetTok = Math.round(effectiveBudget(this._llm) / CHARS_PER_TOKEN);
    const ctxPct       = ctxBudgetTok > 0
      ? Math.min(100, Math.round((inTok / ctxBudgetTok) * 100))
      : 0;
    const t = this._sessionTotals ?? { turns: 0, outputTokens: 0 };
    this._statsEl.textContent =
      `last turn: ~${inTok} in / ${outTok} out tok · ${ms}ms · ${tps}\n` +
      `context: ~${inTok} / ~${ctxBudgetTok} tok (${ctxPct}% of budget)\n` +
      `session: ${t.turns} turn${t.turns === 1 ? '' : 's'}, ${t.outputTokens} out tok`;
    this._statsEl.classList.remove('cb-stats-warn', 'cb-stats-crit');
    if (ctxPct >= 95) this._statsEl.classList.add('cb-stats-crit');
    else if (ctxPct >= 75) this._statsEl.classList.add('cb-stats-warn');
    this._statsEl.classList.remove('hidden');
  }

  setDraft(text) {
    if (!this._inputEl) return;
    this._inputEl.value = String(text ?? '');
    this._inputEl.focus();
    this._inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Sends as if typed: queued while a turn runs, ignored before consent or mount.
  async sendUserMessage(text) {
    const t = String(text ?? '').trim();
    if (!t || !hasConsented() || !this._inputEl) {
      dlog('sendUserMessage: ignored (empty, no consent, or not mounted)');
      return;
    }
    this._inputEl.value = t;
    return this._submit();
  }

  async _submit() {
    const text = this._inputEl.value.trim();
    if (!text) {
      dlog('submit: empty text, ignored');
      return;
    }
    if (this._llm.status !== 'ready') {
      dlog('submit: model not ready (status=', this._llm.status, '), ignored');
      return;
    }

    this._inputEl.value = '';
    this._inputEl.style.height = '';
    this._addUserBubble(text);

    if (this._generating) {
      this._queue.push(text);
      dlog('submit: queued (queue depth=', this._queue.length, '):', text);
      return;
    }

    dlog('submit: starting turn:', text);
    this._setUIState('generating');
    try {
      await this._runLoop(text);
      // One at a time, so each queued turn sees the state the previous one left.
      while (this._queue.length > 0) {
        const next = this._queue.shift();
        dlog('submit: draining queued turn (remaining=', this._queue.length, '):', next);
        await this._runLoop(next);
      }
    } finally {
      dlog('submit: returning to idle (history len=', this._history.length, ')');
      this._setUIState('idle');
    }
  }

  setMode(mode, { tutorStyle } = {}) {
    this.mode = mode === 'tutor' ? 'tutor' : 'ask';
    if (tutorStyle) this.tutorStyle = tutorStyle;
    if (this._inputEl) this._inputEl.placeholder = this._placeholder();
  }

  _placeholder() {
    return this.mode === 'tutor' ? 'Paste a problem, or ask about a step…' : 'Ask about RPL, commands, maths…';
  }

  _addTutorCard(plan) {
    const card = new TutorCard({
      plan,
      tools: {
        run: (text) => this._tools.run(normalizeRpl(text)),
        snapshot: () => this._tools.snapshotState(),
        restore: (snap) => this._tools.restoreState(snap),
        evaluateOn: (text, items) => this._tools.evaluateOn(normalizeRpl(text), items),
        currentStack: () => this._getContext().stack,
      },
      renderMarkdown,
      onFinish: (kind) => this._sendChip(kind === 'similar' ? 'Give me a similar problem to practise, and walk me through it.' : 'Recap the whole solution in a few lines.'),
    });
    return this._place(card.el);
  }

  /* The history keeps each reply's full text, tool-call JSON included
     (native calls are written back in the same shape): it shows the model
     the format it is expected to produce. */
  async _runLoop(userText) {
    const turnId = ++this._runId;
    const stale  = () => this._runId !== turnId;
    dlog('runLoop: enter turnId=', turnId, 'userText=', userText);

    let snapshot = null;
    try { snapshot = this._tools.snapshotState?.() ?? null; } catch (err) {
      dwarn('runLoop: snapshotState threw:', err);
    }
    let mutated = false;
    const history = this._history;
    const ctxNote = this._formatContext(this._getContext());
    history.push({ role: 'user', content: ctxNote ? `${ctxNote}\n\n${userText}` : userText });

    const nativeTools = this._llm.supportsTools === true;
    const systemMsg = {
      role: 'system',
      content: buildSystemPrompt({ nativeTools, tutor: this.mode === 'tutor' ? { style: this.tutorStyle } : null }),
    };

    let lastBubble = null;
    let lastSuggestions = null;
    let iterations = 0;
    turn: while (true) {
      iterations++;
      dlog(`runLoop: iteration ${iterations}/${MAX_TURN_ITERATIONS}`);
      const reply = await this._generateReply(history, systemMsg, nativeTools, stale);
      if (!reply) return this._closeInterruptedTurn(history, mutated && snapshot, lastBubble);
      if (reply.bubble) lastBubble = reply.bubble;
      if (reply.suggestions) lastSuggestions = reply.suggestions;
      const { toolCalls } = reply;
      if (toolCalls.length === 0) break;

      // A call naming an unknown tool ends the chain: its follow-ups can't be trusted.
      for (let i = 0; i < toolCalls.length; i++) {
        const outcome = await this._dispatchTool(toolCalls[i]);
        if (stale()) {
          dlog('runLoop: stale after tool dispatch, exit (skipped', toolCalls.length - i - 1, 'remaining call(s))');
          return this._closeInterruptedTurn(history, (mutated || outcome.mutated) && snapshot, outcome.card ?? lastBubble);
        }
        if (outcome.mutated) mutated = true;
        if (outcome.card) lastBubble = outcome.card;
        if (!outcome.ok) {
          dlog('runLoop: unknown tool, aborting chain (skipped', toolCalls.length - i - 1, 'remaining call(s))');
          break turn;
        }
      }

      if (iterations >= MAX_TURN_ITERATIONS) {
        this._addRetryNote(`Reached workflow iteration cap (${MAX_TURN_ITERATIONS}); stopping.`);
        break;
      }
      // Most chat templates need strict user/assistant alternation.
      history.push({ role: 'user', content: CONTINUE_NOTE });
    }

    if (!stale() && mutated && snapshot) {
      lastBubble = this._addUndoRow(snapshot, lastBubble) ?? lastBubble;
    }
    if (!stale() && lastSuggestions?.length) {
      this._renderChips(lastSuggestions, lastBubble);
    }
    dlog('runLoop: turnId=', turnId, `complete after ${iterations} iteration(s)`);
  }

  /** Streams one reply into a live bubble, regenerating once when it names
   *  an unknown tool.  Resolves to { bubble, toolCalls, suggestions }, or
   *  null when the turn was interrupted. */
  async _generateReply(history, systemMsg, nativeTools, stale) {
    let reply = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const messages = [systemMsg, ...this._trimHistoryForBudget(systemMsg)];
      this._logPhase(`combined attempt=${attempt}`, messages);

      const { bubble, textEl } = this._addStreamingBubble();
      let fullText = '';
      let thinkingChars = 0;
      const watchdog = this._makeStallWatchdog();
      const paint = () => {
        const { prose } = splitReply(fullText);
        if (prose) {
          textEl.textContent = prose;
          bubble.classList.remove('cb-bubble-thinking');
        } else if (thinkingChars > 0) {
          textEl.textContent = 'Thinking…';
          bubble.classList.add('cb-bubble-thinking');
        } else {
          textEl.textContent = '…';
        }
      };

      let result;
      try {
        result = await this._llm.generate(messages, {
          maxTokens: MAX_REPLY_TOKENS,
          tools: nativeTools ? TOOL_SCHEMAS : undefined,
          onToken: (t) => {
            if (typeof t !== 'string' || !t) return;
            watchdog.onToken();
            fullText += t;
            paint();
          },
          // Reasoning never reaches the transcript, but it keeps the watchdog alive.
          onThinking: (t) => {
            if (typeof t !== 'string' || !t) return;
            watchdog.onToken();
            thinkingChars += t.length;
            paint();
          },
        });
      } catch (err) {
        watchdog.stop();
        this._finaliseStreamBubble(bubble, `⚠ ${err.message}`);
        const cleaned = stripThinkBlocks(fullText).trim();
        if (cleaned) history.push({ role: 'assistant', content: cleaned });
        dwarn('runLoop: generate threw:', err.message);
        return null;
      }
      watchdog.stop();
      if (result?.finishReason === 'length') this._addRetryNote('Reply was cut off at the token limit.');
      const nativeCalls = Array.isArray(result?.toolCalls) ? result.toolCalls : [];

      if (stale()) {
        this._finaliseStreamBubble(bubble, splitReply(fullText).prose, 'stopped');
        dlog('runLoop: stale after generate, finalised stopped bubble');
        return null;
      }

      const stalled = watchdog.isStalled();
      const { cleaned, prose } = splitReply(fullText);
      const toolCalls = [...nativeCalls, ...parseAllToolCalls(cleaned)];
      for (const tc of toolCalls) {
        const aliased = resolveToolAlias(tc.name);
        if (aliased !== tc.name) {
          dlog('runLoop: alias-resolve', tc.name, '→', aliased);
          tc.name = aliased;
        }
      }
      const suggestions = parseSuggestions(cleaned);
      dlog(`runLoop: attempt ${attempt} returned ${fullText.length} chars`,
           `(${thinkingChars} thinking chars, ${nativeCalls.length} native call(s)), stalled=${stalled};`,
           'tool calls:', toolCalls.map((c) => c.name), 'suggestions:', suggestions);

      let content = cleaned.trim();
      if (nativeCalls.length) {
        const lines = nativeCalls.map((c) => JSON.stringify({ name: c.name, arguments: c.arguments ?? {} })).join('\n');
        content = content ? `${content}\n${lines}` : lines;
      }

      let display = prose;
      if (!display && stalled) {
        display = toolCalls.length > 0
          ? `Partial response — ${toolCalls.length} tool call(s) detected before timeout.`
          : 'Model timed out before producing any output. Consider switching to a smaller model.';
      } else if (!display && toolCalls.length === 0) {
        display = '_(model returned no output — try rephrasing.)_';
      }
      // Tool calls without prose leave no bubble: their cards are the record.
      if (display) this._finaliseStreamBubble(bubble, display, stalled ? 'stalled' : null, Boolean(prose || toolCalls.length));
      else bubble.remove();
      // Kept even before a retry, so the correction can refer to it.
      history.push({ role: 'assistant', content });
      reply = { bubble: display ? bubble : null, toolCalls, suggestions };

      const unknownNames = toolCalls.filter((c) => !this._registry[c.name]).map((c) => c.name);
      if (unknownNames.length === 0) break;
      if (attempt >= MAX_ATTEMPTS) {
        dwarn('runLoop: retries exhausted; proceeding with', unknownNames.length, 'unknown tool(s):', unknownNames);
        break;
      }
      const s = unknownNames.length === 1 ? '' : 's';
      this._addRetryNote(`Retrying — assistant proposed unknown tool${s}: ${unknownNames.join(', ')}`);
      history.push({
        role: 'user',
        content:
          `Your previous response used tool name${s} that don't exist: ` +
          `${unknownNames.map((n) => `"${n}"`).join(', ')}. ` +
          `The ONLY valid tool names are: ${Object.keys(this._registry).join(', ')}. ` +
          `Please regenerate the response using a valid tool name. ` +
          `Re-emit the prose preamble + tool call(s) in the same format as before.`,
      });
      dlog('runLoop: retrying attempt=', attempt + 1, 'after unknown:', unknownNames);
    }
    return reply;
  }

  _closeInterruptedTurn(history, undoSnapshot, lastBubble) {
    if (history !== this._history) return;
    if (history.at(-1)?.role === 'user') history.push({ role: 'assistant', content: '(reply interrupted)' });
    if (undoSnapshot) this._addUndoRow(undoSnapshot, lastBubble);
  }

  /** Runs one call (names already alias-resolved) and folds a prose summary
   *  into history.  Returns { ok: false for an unknown tool, mutated, card }. */
  async _dispatchTool(toolCall) {
    const { name } = toolCall;
    const tool = this._registry[name];
    const args = toolCall.arguments ?? {};
    dlog('dispatchTool: name=', name, 'args=', args, 'mutates=', !!tool?.mutates, 'known=', !!tool);

    if (!tool) {
      dwarn('dispatchTool: unknown tool', name);
      const card = this._addAssistantBubble(`_(unknown tool: \`${name}\`.)_`);
      this._pushHistoryNote(`(Tried to use unknown tool "${name}".)`);
      return { ok: false, mutated: false, card };
    }

    const summary = tool.summary ? tool.summary(args) : { label: name, code: '' };
    const runOnce = async () => {
      const result = await tool.handler(args);
      const note = this._summariseToolResult(name, args, result);
      this._pushHistoryNote(note);
      dlog('dispatchTool:', name, 'note=', note);
      return result;
    };

    if (tool.mutates) {
      const { card, showResult } = this._addActionCard({
        ...summary,
        onRerun: async () => {
          const result = await runOnce();
          this._pushHistoryNote('(The user re-ran the previous action by hand.)');
          return result;
        },
      });
      try {
        showResult(await runOnce());
      } catch (err) {
        showResult({ success: false, error: err.message ?? 'Failed' });
        this._pushHistoryNote(`(Running ${name} failed: ${err.message}.)`);
        dwarn('dispatchTool: handler threw for', name, err);
      }
      return { ok: true, mutated: true, card };
    }

    let card;
    try {
      const result = await runOnce();
      card = tool.card?.(result) ?? this._addToolTrace(summary, this._traceSummary(name, result));
    } catch (err) {
      card = this._addToolTrace(summary, `✗ ${err.message ?? 'failed'}`);
      this._pushHistoryNote(`(Reading ${name} failed: ${err.message}.)`);
      dwarn('dispatchTool: read handler threw for', name, err);
    }
    return { ok: true, mutated: false, card };
  }

  _traceSummary(name, result) {
    const r = result ?? {};
    const count = (n, word, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;
    switch (name) {
      case 'evaluate':
        return r.ok ? `→ ${r.stack?.[0] || '(empty)'}` : `✗ ${r.error}`;
      case 'lookup_command':
        return r.text ? (r.registered ? 'found' : 'found (not implemented here)') : 'no entry';
      case 'search_commands':
        return count((r.results ?? []).length, 'match', 'matches');
      case 'recall_var':
        return r.exists ? `= ${r.value}` : 'not defined';
      case 'get_vars':
        return count((r.vars ?? []).length, 'variable');
      case 'get_stack':
        return count(r.depth ?? (r.stack ?? []).length, 'level');
      case 'get_editor':
        return r.buffer ? `"${r.buffer}"` : 'empty';
      case 'tutor_plan':
        return r.accepted ? `${r.plan.steps.length} steps` : `✗ ${r.error}`;
      default:
        return '';
    }
  }

  // Folds the note into the previous assistant message: most chat templates
  // (Llama, Qwen) break on two assistant messages in a row.
  _pushHistoryNote(text) {
    if (!text) return;
    const last = this._history.at(-1);
    if (last?.role === 'assistant') {
      last.content = last.content ? `${last.content}\n${text}` : text;
    } else {
      this._history.push({ role: 'assistant', content: text });
    }
  }

  // Small models read one plain sentence far better than structured results.
  _summariseToolResult(name, args, result) {
    const r = result ?? {};
    const levels = (stack, depth, n) => {
      const total = depth ?? stack.length;
      return stack.slice(0, n).map((v, i) => `${i + 1}: ${v}`).join(', ')
        + (total > n ? `, … (${total} levels)` : '');
    };
    const stackText = (stack, depth, n = 4) => (Array.isArray(stack) && stack.length
      ? `Stack now: ${levels(stack, depth, n)}`
      : 'Stack is empty');
    if (name === 'run' || name === 'push_to_stack') {
      const code = normalizeRpl(name === 'run' ? args.text : args.value);
      const verb = name === 'run' ? 'Ran' : 'Pushed';
      if (r.success === false) {
        return `(${verb} \`${code}\` — FAILED with calculator error: "${r.error}". ` +
               `The line was rejected and the stack is unchanged (${stackText(r.stack, r.depth, 3)}). ` +
               `Fix the RPL before trying again.${infixHint(code)})`;
      }
      return `(${verb} \`${code}\`. ${stackText(r.stack, r.depth)}.)`;
    }
    if (name === 'tutor_plan') {
      return r.accepted
        ? `(tutor_plan accepted: the student now sees ${r.plan.steps.length} steps and works through them with Show me or on their own keys. Don't reveal the final answer.)`
        : `(tutor_plan REJECTED: ${r.error}. Fix that step and call tutor_plan again.)`;
    }
    if (name === 'evaluate') {
      const code = normalizeRpl(args.text);
      if (r.ok === false) {
        return `(evaluate \`${code}\` → ERROR: ${r.error}. Nothing changed. Fix the RPL before running it.${infixHint(code)})`;
      }
      return Array.isArray(r.stack) && r.stack.length
        ? `(evaluate \`${code}\` → ${levels(r.stack, r.depth, 4)}. Dry run only — the real stack is unchanged.)`
        : `(evaluate \`${code}\` → empty stack. Dry run only.)`;
    }
    if (name === 'lookup_command') {
      if (!r.text) {
        return `(No reference entry for "${r.name || args.name}"${r.registered ? ' — the command IS implemented here; try search_commands for related names' : ' — try search_commands to find the right name'}.)`;
      }
      return `(Reference for ${r.name}${r.registered ? '' : ' [NOT implemented in this calculator]'}:\n${r.text})`;
    }
    if (name === 'search_commands') {
      const rows = Array.isArray(r.results) ? r.results : [];
      if (!rows.length) return `(No commands matched "${r.query ?? args.query}".)`;
      const lines = rows.map((x) =>
        `${x.name}${x.inApp ? '' : ' [not implemented here]'}${x.description ? ` — ${x.description}` : ''}${x.category ? ` [${x.category}]` : ''}`);
      return `(Commands matching "${r.query ?? args.query}":\n${lines.join('\n')})`;
    }
    if (name === 'append_to_editor' && r.success) {
      return `(Editor now contains: \`${r.buffer}\`.)`;
    }
    if (name === 'clear_editor' && r.success) {
      return '(Editor cleared.)';
    }
    if (name === 'get_stack') {
      const parts = [stackText(r.stack, r.depth, 8)];
      const modes = [];
      if (r.angleMode)   modes.push(`angle ${r.angleMode}`);
      if (r.displayMode) modes.push(`display ${r.displayMode}`);
      if (r.exactMode)   modes.push(`CAS ${r.exactMode}`);
      if (r.base && r.base !== 'DEC') modes.push(`base ${r.base}`);
      if (r.casVar)      modes.push(`CAS variable ${r.casVar}`);
      if (modes.length)  parts.push(`Modes: ${modes.join(', ')}`);
      if (r.dir)         parts.push(`Directory: ${r.dir}`);
      if (Array.isArray(r.vars)) parts.push(r.vars.length ? `Variables: ${r.vars.join(' ')}` : 'No variables');
      if (r.editor)      parts.push(`Entry line: \`${r.editor}\``);
      if (r.lastError)   parts.push(`Last error: ${r.lastError}`);
      return `(${parts.join('. ')}.)`;
    }
    if (name === 'get_editor') {
      return r.buffer ? `(Editor: \`${r.buffer}\`.)` : '(Editor is empty.)';
    }
    if (name === 'get_vars') {
      const vars = Array.isArray(r.vars) ? r.vars : [];
      return vars.length
        ? `(Variables in ${r.dir ?? 'current dir'}: ${vars.join(', ')}.)`
        : `(No variables in ${r.dir ?? 'current dir'}.)`;
    }
    if (name === 'recall_var') {
      return r.exists
        ? `(${r.name} = ${r.value}.)`
        : `(${r.name} is not defined.)`;
    }
    return `(${name} returned: ${JSON.stringify(result)})`;
  }

  _logPhase(label, messages) {
    console.groupCollapsed(`[ChatBot] → Phase ${label}`);
    console.log('messages:', messages);
    console.log('total chars:', messages.reduce((n, m) => n + (m.content?.length ?? 0), 0));
    console.groupEnd();
  }

  /** The newest messages that fit the budget left after the system prompt;
   *  the latest one is always sent, even when it alone is too big. */
  _trimHistoryForBudget(systemMsg) {
    const totalBudget = effectiveBudget(this._llm);
    const budget = totalBudget - (systemMsg.content?.length ?? 0);
    if (budget <= 0) {
      dwarn('history-trim: system prompt alone is', systemMsg.content?.length, 'chars',
            '(>= budget', totalBudget, ') — sending only the latest message;',
            'raise the endpoint Context setting');
      return this._history.slice(-1);
    }
    const kept = [];
    let total = 0;
    for (let i = this._history.length - 1; i >= 0; i--) {
      const m = this._history[i];
      const size = m.content?.length ?? 0;
      if (kept.length > 0 && total + size > budget) break;
      kept.push(m);
      total += size;
    }
    kept.reverse();
    if (kept.length < this._history.length) {
      dlog('history-trim: dropped', this._history.length - kept.length, 'old message(s),',
           'kept', kept.length, 'recent message(s),', total, 'chars (budget',
           budget, 'available after system prompt)');
    } else {
      dlog('history-trim: full history fits (', this._history.length, 'messages,',
           total, 'chars,', budget - total, 'chars budget remaining)');
    }
    return kept;
  }

  /** Aborts the request after `stallMs` without a token or thinking chunk;
   *  generate() then resolves as aborted, so callers only check isStalled(). */
  _makeStallWatchdog(stallMs = STALL_TIMEOUT_MS) {
    dlog('watchdog: armed (stallMs=', stallMs, ')');
    let stalled = false;
    let timer = null;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        dwarn(`watchdog: FIRED after ${stallMs}ms of silence — calling _llm.abort()`);
        this._llm.abort();
      }, stallMs);
    };
    reset();
    return {
      onToken: reset,
      stop: () => {
        clearTimeout(timer);
        dlog('watchdog: stopped (stalled=', stalled, ')');
      },
      isStalled: () => stalled,
    };
  }

  // The new run id makes the running turn unwind after its current await;
  // queued messages are dropped too.
  _abort() {
    dwarn('abort: stop pressed (generating=', this._generating,
          'queueDepth=', this._queue.length, ')');
    this._runId++;
    this._llm.abort();
    this._queue = [];
  }

  _formatContext(ctx) {
    if (!ctx) return '';
    const lines = ['[Calculator state]'];
    if (ctx.stack?.length > 0) {
      const depth = ctx.depth ?? ctx.stack.length;
      const shown = ctx.stack.length;
      lines.push(`Stack (${depth} level${depth === 1 ? '' : 's'}${depth > shown ? `, top ${shown} shown` : ''}; level 1 is the TOP — operators consume from level 1 first; higher numbers are deeper):`);
      for (let i = 0; i < shown; i++) {
        const marker =
          i === 0                                ? '   ← top of stack' :
          (i === shown - 1 && depth === shown)   ? '   ← bottom of stack' : '';
        lines.push(`  ${i + 1}: ${ctx.stack[i]}${marker}`);
      }
    } else {
      lines.push('Stack: (empty)');
    }
    const flags = [];
    if (ctx.angleMode)   flags.push(`Angle: ${ctx.angleMode}`);
    if (ctx.displayMode) flags.push(`Display: ${ctx.displayMode}`);
    if (ctx.exactMode)   flags.push(`CAS: ${ctx.exactMode}`);
    if (ctx.base && ctx.base !== 'DEC') flags.push(`Base: ${ctx.base}`);
    if (ctx.casVar && ctx.casVar !== 'x') flags.push(`CAS var: \`${ctx.casVar}\``);
    if (ctx.dir)         flags.push(`Dir: ${ctx.dir}`);
    if (flags.length) lines.push(flags.join('  '));
    if (Array.isArray(ctx.vars)) {
      lines.push(ctx.vars.length
        ? `Variables: ${ctx.vars.join(' ')}`
        : 'Variables: (none)');
    }
    if (ctx.editor)    lines.push(`Entry line (uncommitted): ${ctx.editor}`);
    if (ctx.lastError) lines.push(`Last error shown: ${ctx.lastError}`);
    return lines.join('\n');
  }

  // Appends to the message list, or inserts right after `after` when it is still there.
  _place(node, after = null) {
    if (after?.parentNode === this._messagesEl) this._messagesEl.insertBefore(node, after.nextSibling);
    else this._messagesEl.appendChild(node);
    this._scrollBottom();
    return node;
  }

  _addUserBubble(text) {
    this._removeActiveChips();
    this._greetingEl?.remove();
    this._greetingEl = null;
    this._place(elem('div', { className: 'cb-bubble cb-bubble-user', textContent: text }));
  }

  _greetWithStarterChips(text) {
    this._greetingEl = this._addAssistantBubble(text);
    this._renderChips(STARTER_CHIPS, this._greetingEl);
  }

  _addAssistantBubble(markdownText) {
    const bubble = elem('div', { className: 'cb-bubble cb-bubble-assistant' });
    bubble.appendChild(renderMarkdown(markdownText));
    return this._place(bubble);
  }

  _addRetryNote(text) {
    return this._place(elem('div', { className: 'cb-retry-note', textContent: `↻ ${text}` }));
  }

  /** A mutating call's card: label, RPL, status and a Rerun button.
   *  `showResult(result)` marks it done, or failed with the error inline. */
  _addActionCard({ label, code, onRerun }) {
    const card = elem('div', { className: 'cb-bubble cb-bubble-assistant cb-bubble-tool' });
    const widget = card.appendChild(elem('div', { className: 'cb-action-widget cb-action-running' }));
    const head = widget.appendChild(elem('div', { className: 'cb-action-head' }));
    const status = elem('span', { className: 'cb-action-status', textContent: 'running…' });
    head.append(elem('span', { className: 'cb-action-label', textContent: label }), status);
    if (code) widget.appendChild(elem('pre', { className: 'cb-action-code', textContent: code }));
    const errEl = widget.appendChild(elem('div', { className: 'cb-action-error hidden' }));

    const showResult = (result) => {
      const ok = result?.success !== false;
      const errorText = ok ? '' : result.error;
      widget.classList.remove('cb-action-running', 'cb-action-done', 'cb-action-failed');
      widget.classList.add(ok ? 'cb-action-done' : 'cb-action-failed');
      status.textContent = ok ? '✓ done' : '✗ failed';
      errEl.textContent = errorText || '';
      errEl.classList.toggle('hidden', !errorText);
      rerunBtn.disabled = false;
    };
    const rerunBtn = button({ className: 'cb-btn-rerun', textContent: '↻ Rerun', title: 'Execute this again', disabled: true }, async () => {
      rerunBtn.disabled = true;
      widget.classList.add('cb-action-running');
      status.textContent = 'running…';
      try {
        showResult(await onRerun());
      } catch (err) {
        showResult({ success: false, error: err.message ?? 'Failed' });
      }
    });
    widget.appendChild(elem('div', { className: 'cb-action-btns' })).appendChild(rerunBtn);

    this._place(card);
    return { card, showResult };
  }

  _addToolTrace({ label, code }, outcome) {
    const row = elem('div', { className: 'cb-tool-trace' });
    row.append(
      elem('span', { className: 'cb-tool-trace-icon', textContent: '🔍' }),
      elem('span', { className: 'cb-tool-trace-name', textContent: label }),
    );
    if (code) row.appendChild(elem('code', { className: 'cb-tool-trace-code', textContent: code }));
    if (outcome) row.appendChild(elem('span', { className: 'cb-tool-trace-outcome', textContent: outcome }));
    return this._place(row);
  }

  _addUndoRow(snapshot, after = null) {
    if (typeof this._tools.restoreState !== 'function') return null;
    const row = elem('div', { className: 'cb-undo-row' });
    const btn = button({
      className: 'cb-undo-btn',
      textContent: '↶ Undo this turn',
      title: 'Restore the stack, variables and modes to how they were before the assistant acted',
    }, () => {
      try {
        this._tools.restoreState(snapshot);
        btn.disabled = true;
        btn.textContent = '↶ Undone — calculator restored';
        this._pushHistoryNote('(The user pressed Undo: the calculator was restored to its state from before this turn — every action above was reverted.)');
      } catch (err) {
        btn.textContent = `✗ Undo failed: ${err.message ?? err}`;
        dwarn('undo: restoreState threw', err);
      }
    });
    row.appendChild(btn);
    return this._place(row, after);
  }

  _addStreamingBubble() {
    const bubble = elem('div', { className: 'cb-bubble cb-bubble-assistant cb-bubble-streaming' });
    const textEl = elem('span', { className: 'cb-stream-text', textContent: '…' });
    bubble.append(textEl, elem('span', { className: 'cb-cursor' }));
    this._place(bubble);
    return { bubble, textEl };
  }

  /** Renders the final markdown; `state` 'stalled' or 'stopped' adds a badge
   *  saying why the reply ended early. */
  _finaliseStreamBubble(bubble, text, state = null, hadOutput = Boolean(text)) {
    bubble.classList.remove('cb-bubble-streaming', 'cb-bubble-thinking');
    bubble.innerHTML = '';
    if (text) bubble.appendChild(renderMarkdown(text));
    if (state) {
      bubble.classList.add(state === 'stalled' ? 'cb-bubble-stalled' : 'cb-bubble-stopped');
      const cause = state === 'stalled'
        ? `⚠ Timed out — model went silent for ${Math.round(STALL_TIMEOUT_MS / 1000)}s.`
        : '■ Stopped by user.';
      bubble.appendChild(elem('div', {
        className: 'cb-bubble-status-badge',
        textContent: `${cause} ${hadOutput ? 'Partial output shown above.' : 'No output produced.'}`,
      }));
    }
    this._scrollBottom();
  }

  _renderChips(items, after = null) {
    this._removeActiveChips();
    if (!items || items.length === 0) return;
    const wrap = elem('div', { className: 'cb-chips' });
    for (const item of items) {
      wrap.appendChild(button({ className: 'cb-chip', textContent: item }, () => this._sendChip(item)));
    }
    this._activeChipsEl = this._place(wrap, after);
  }

  _removeActiveChips() {
    this._activeChipsEl?.remove();
    this._activeChipsEl = null;
  }

  _sendChip(text) {
    if (this._llm.status !== 'ready') return;
    this._removeActiveChips();
    this._inputEl.value = text;
    this._submit();
  }

  // Send stays enabled during a turn: messages sent meanwhile are queued.
  _setUIState(state) {
    this._generating = (state === 'generating');
    if (this._sendBtn) this._sendBtn.disabled = this._llm.status !== 'ready';
    if (this._stopBtn) this._stopBtn.classList.toggle('hidden', !this._generating);
  }

  _scrollBottom() {
    if (this._messagesEl) {
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    }
  }
}
