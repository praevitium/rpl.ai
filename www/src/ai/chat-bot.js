/* =================================================================
   ChatBot — completely decoupled AI assistant.

   The calculator initialises one instance at startup and passes in
   a `tools` object and a `getContext` function.  ChatBot never
   imports anything from rpl/ or the rest of the UI.

   Constructor options:
     tools: {
       run(text: string): void   — type text into the entry and commit.
                                   ALWAYS requires user confirmation.
     }
     getContext(): {
       stack: string[]   — formatted stack lines, index 0 = level 1
       angleMode: string — 'RAD' | 'DEG' | 'GRD'
       displayMode: string
       dir: string       — current directory path
     }

   Public API:
     mount(containerEl)          — render into a DOM element
     open() / close()            — lifecycle (optional, for animation hooks)

   Tool-call loop:
     1. Build messages array (with current context injected into user msg).
     2. Generate.  Stream tokens into a live bubble.
     3. When done, scan for <tool_call>...</tool_call> in the response.
     4. If found:
          - run / any future mutating tool → show ▶ Confirm button.
          - get_stack → execute automatically, feed result back.
     5. Add tool response to history as { role:'tool', content:'...' }.
     6. Loop (up to MAX_ITER to prevent runaway).
   ================================================================= */

import { LLM } from './llm.js';
import { RemoteLLM, toOpenAIBase, toOllamaBase } from './remote-llm.js';
import { SYSTEM_PROMPT_COMBINED } from './system-prompt.js';

// Diagnostic logging — every flow-control transition in this module
// goes through these helpers so the console transcript reads as a
// single chronological narrative.  Filter the DevTools console by
// `[ChatBot]` to see the entire chat lifecycle for a session.
//
// The prefix is intentional: `[ChatBot]` for orchestration code in
// this file, `[LLM]` for the main-thread worker bridge in llm.js,
// `[llm-worker]` for the worker itself.  Together those three tags
// cover every JS-level transition between "user typed" and "tokens
// rendered" — useful when a turn appears to hang and you need to
// localise where in the chain it stopped.
function dlog(...args)  { /* eslint-disable-next-line no-console */ console.log('[ChatBot]', ...args); }
function dwarn(...args) { /* eslint-disable-next-line no-console */ console.warn('[ChatBot]', ...args); }
function dgroup(label)  { /* eslint-disable-next-line no-console */ console.groupCollapsed('[ChatBot]', label); }
function dgroupEnd()    { /* eslint-disable-next-line no-console */ console.groupEnd(); }

// Hard cap on LLM iterations per user turn.  A single user message
// kicks off an agentic loop: the model emits prose + JSON tool calls,
// the orchestrator dispatches them, folds the results into history,
// and re-prompts.  The loop ends when the model emits no tool calls
// (its "workflow complete" signal), the user cancels a confirm, or
// this cap fires.  Six is enough for any realistic chained workflow
// (read → decide → write → verify → close, with one spare) and tight
// enough to bail quickly when a model gets stuck repeating itself.
const MAX_TURN_ITERATIONS = 6;

// Stall timeout (ms) for the single combined LLM call.  WebLLM 0.2.x
// has a known failure mode where chat.completions.create can wedge
// in its prefill path with no tokens, no error, no done — the main-
// thread promise hangs and the user sees a forever-streaming bubble.
//
// This is a *stall* timeout, not a wall-clock cap: the timer resets
// on every streamed token, so a model that's just slow but producing
// output runs to completion.  Only true silence triggers the abort.
//
// On stall: _llm.abort() is fired, which makes the worker break out
// of its for-await loop and post `done`.  _runLoop's fullText-handling
// code then degrades gracefully — finalises whatever prose streamed
// (with a "(reply stalled)" hint), and skips tool dispatch since an
// empty/partial fullText doesn't yield a parseable JSON brace block.
const STALL_TIMEOUT_MS = 45000;

// Reserve for the model's own response — we don't want the prompt to
// fill the entire context window, otherwise there's no room for the
// generated tokens.  ~1024 tokens (~4000 chars at ~4 chars/token) is
// generous for our typical reply length (a sentence + a few JSON
// blocks ≈ 200 tokens) but leaves headroom for unusually long replies
// without bumping into the model's hard context cap.
const RESPONSE_RESERVE_CHARS = 4000;

// Per-model history budget, in characters of prompt (system + kept
// history).  Computed from the active model's contextTokens entry in
// MODELS, minus a reserve for the response itself.  See callers
// (_trimHistoryForBudget, _renderStats) — both call effectiveBudget()
// fresh each turn so a model swap mid-session updates the cap.
//
// Why a budget at all: every LLM turn rebuilds the entire prompt
// from scratch (no KV-cache reuse across calls — see resetChat() in
// the worker).  Prefill cost grows roughly quadratically with input
// length, so an unbounded conversation makes each turn slower than
// the last.  Capping the prompt keeps turn latency stable AND
// guarantees we never exceed the configured context window.
//
// Why per-model: each MODELS entry has its own contextTokens (see
// the catalog).  A 2K-context model like TinyLlama gets a tiny
// budget; a 16K-context model like Llama 3.2 3B gets nearly 12K
// chars to play with.  Computing this dynamically means the trimmer
// matches whatever the user picked from the picker.
function effectiveBudget(llm) {
  const ctxTokens = activeContextTokens(llm);
  // Tokens → chars: rough 4 chars/token for English / Latin-script.
  // We err on the small side (use 4) so we under-count tokens-per-
  // char, leaving headroom in case a turn happens to be denser.
  const ctxChars = ctxTokens * 4;
  // Floor at zero — pathological, but guards arithmetic if the
  // model's window is somehow smaller than the response reserve.
  return Math.max(0, ctxChars - RESPONSE_RESERVE_CHARS);
}

/* ---- Lazy loaders for KaTeX + Mermaid ------------------------------
   Both libs are vendored under www/vendor/{katex,mermaid}/ but only
   imported on demand the first time the assistant emits a math expr
   or a ```mermaid fence.  Keeps the chat UI's cold-start cost from
   paying for libraries the user may never trigger.  Resolved
   modules are cached on first call; subsequent renders are sync-fast.
   ------------------------------------------------------------------ */

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
        // startOnLoad would auto-scan the page; we render on demand
        // via mermaid.render() so this must be false.
        m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
        resolve(m);
      };
      s.onerror = () => reject(new Error('failed to load vendor/mermaid/mermaid.min.js'));
      document.head.appendChild(s);
    }).catch((err) => { _mermaidPromise = null; throw err; });
  }
  return _mermaidPromise;
}

/** Render a KaTeX expression into a freshly-created span/div.  Falls
 *  back to plain text in a code-style element if KaTeX hasn't loaded
 *  yet OR if the expression has a parse error — the user sees the
 *  source rather than an empty box.  `displayMode` true for $$…$$. */
function renderMathInto(target, expr, displayMode) {
  // Synchronous fallback first so something appears immediately even
  // before the lazy import resolves.  Replaced once KaTeX is ready.
  const fallback = document.createElement(displayMode ? 'div' : 'span');
  fallback.className = displayMode ? 'cb-math-fallback cb-math-display' : 'cb-math-fallback';
  fallback.textContent = (displayMode ? '$$' : '$') + expr + (displayMode ? '$$' : '$');
  target.appendChild(fallback);
  ensureKaTeX().then((katex) => {
    try {
      const html = katex.renderToString(expr, {
        displayMode,
        throwOnError: false,
        output: 'html',
      });
      const wrap = document.createElement(displayMode ? 'div' : 'span');
      wrap.className = displayMode ? 'cb-math-display' : 'cb-math-inline';
      wrap.innerHTML = html;
      fallback.replaceWith(wrap);
    } catch {
      // Keep the fallback — better than a broken render.
    }
  }).catch(() => { /* keep fallback */ });
}

/** Build a placeholder div for a mermaid diagram and kick off its
 *  async render.  The placeholder shows the source as a code block
 *  until mermaid loads; on success we swap in the rendered SVG.  Each
 *  diagram gets a unique id because mermaid.render() insists on one. */
let _mermaidCounter = 0;
function renderMermaidInto(parent, source) {
  const wrap = document.createElement('div');
  wrap.className = 'cb-mermaid';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = source;
  pre.appendChild(code);
  wrap.appendChild(pre);
  parent.appendChild(wrap);
  ensureMermaid().then(async (m) => {
    const id = `cb-mermaid-${++_mermaidCounter}`;
    try {
      const { svg } = await m.render(id, source);
      wrap.innerHTML = svg;
    } catch (err) {
      const errEl = document.createElement('div');
      errEl.className = 'cb-mermaid-error';
      errEl.textContent = `mermaid: ${err && err.message ? err.message : 'render failed'}`;
      wrap.appendChild(errEl);
    }
  }).catch(() => { /* keep source pre */ });
}

/* ---- Simple markdown → DOM renderer --------------------------------
   Handles the subset the assistant actually uses: headers, bold,
   italic, inline code, fenced code blocks, bullet lists, plus
   KaTeX math ($…$ and $$…$$) and ```mermaid diagrams.
   Action / tool_call fences are stripped before this renderer sees
   the text — they get their own widget.
   ------------------------------------------------------------------ */

function renderMarkdown(text) {
  const frag = document.createDocumentFragment();

  // Split on fenced code blocks first so we don't mangle their contents.
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (part.startsWith('```')) {
      // Fenced block — extract optional language tag.
      const inner = part.slice(3, -3);
      const nlIdx = inner.indexOf('\n');
      const lang  = nlIdx >= 0 ? inner.slice(0, nlIdx).trim().toLowerCase() : '';
      const code  = nlIdx >= 0 ? inner.slice(nlIdx + 1) : inner;
      if (lang === 'mermaid') {
        renderMermaidInto(frag, code.trimEnd());
      } else {
        const pre   = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = code.trimEnd();
        pre.appendChild(codeEl);
        frag.appendChild(pre);
      }
    } else {
      // Plain text segment — inline formatting only.
      appendInlineMarkdown(frag, part);
    }
  }
  return frag;
}

function appendInlineMarkdown(frag, text) {
  // Pull out display math ($$…$$) before the line-based pass — these
  // are block-level and shouldn't be glued into a surrounding <p>.
  // We also accept \[…\] as a synonym (some models emit LaTeX
  // delimiters rather than dollar pairs).
  const blockSplit = text.split(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/g);
  if (blockSplit.length > 1) {
    for (const seg of blockSplit) {
      if (!seg) continue;
      if (seg.startsWith('$$') && seg.endsWith('$$')) {
        renderMathInto(frag, seg.slice(2, -2).trim(), /* displayMode */ true);
      } else if (seg.startsWith('\\[') && seg.endsWith('\\]')) {
        renderMathInto(frag, seg.slice(2, -2).trim(), /* displayMode */ true);
      } else {
        appendInlineMarkdownLines(frag, seg);
      }
    }
    return;
  }
  appendInlineMarkdownLines(frag, text);
}

function appendInlineMarkdownLines(frag, text) {
  // Process line by line so we can detect list items and headers.
  const lines = text.split('\n');
  let p = null; // current paragraph

  const flushP = () => { if (p) { frag.appendChild(p); p = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      flushP();
      const h = document.createElement(`h${hm[1].length + 2}`); // h3–h5
      appendSpans(h, hm[2]);
      frag.appendChild(h);
      continue;
    }

    // Bullet list item
    const lim = line.match(/^\s*[-*]\s+(.*)/);
    if (lim) {
      flushP();
      // Wrap consecutive items in a <ul> if the previous sibling isn't one.
      let ul = frag.lastChild;
      if (!ul || ul.tagName !== 'UL') {
        ul = document.createElement('ul');
        frag.appendChild(ul);
      }
      const li = document.createElement('li');
      appendSpans(li, lim[1]);
      ul.appendChild(li);
      continue;
    }

    // Numbered list item
    const nlim = line.match(/^\s*\d+\.\s+(.*)/);
    if (nlim) {
      flushP();
      let ol = frag.lastChild;
      if (!ol || ol.tagName !== 'OL') {
        ol = document.createElement('ol');
        frag.appendChild(ol);
      }
      const li = document.createElement('li');
      appendSpans(li, nlim[1]);
      ol.appendChild(li);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      flushP();
      continue;
    }

    // Regular line → accumulate into paragraph
    if (!p) { p = document.createElement('p'); }
    if (p.childNodes.length > 0) {
      p.appendChild(document.createTextNode(' '));
    }
    appendSpans(p, line);
  }
  flushP();
}

/** Append inline-formatted spans (bold, italic, code, $math$) to a
 *  parent.  Inline math is `$…$` or `\(…\)`; the `$` form requires
 *  a non-space char immediately after the opening `$` to avoid eating
 *  bare dollar signs in prose ("costs $5 and $10"). */
function appendSpans(parent, text) {
  // Order: code (so `…$x$…` inside backticks doesn't math-ify), then
  // inline math (\(…\) and $…$), then **bold**, then *italic*.
  const re = /(`([^`]+)`|\\\(([\s\S]+?)\\\)|\$(?=\S)([^$\n]+?)(?<=\S)\$|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    if (m[2] !== undefined) {
      const s = document.createElement('code');
      s.textContent = m[2];
      parent.appendChild(s);
    } else if (m[3] !== undefined) {
      renderMathInto(parent, m[3].trim(), /* displayMode */ false);
    } else if (m[4] !== undefined) {
      renderMathInto(parent, m[4].trim(), /* displayMode */ false);
    } else if (m[5] !== undefined) {
      const s = document.createElement('strong');
      s.textContent = m[5];
      parent.appendChild(s);
    } else if (m[6] !== undefined) {
      const s = document.createElement('em');
      s.textContent = m[6];
      parent.appendChild(s);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parent.appendChild(document.createTextNode(text.slice(last)));
  }
}

/* ---- Model-output parsing ----------------------------------------- */

/** Walk `text` and return every `{"name":"…","arguments":…}` block in
 *  document order.  The model is told to emit one bare-JSON tool call
 *  per action; when it wants to chain steps it just lists them one
 *  per line.  Each call is found by anchoring on the `{<ws>"name"` shape
 *  and walking braces manually so nested objects inside `arguments`
 *  don't confuse the matcher.  Malformed candidates (unbalanced braces,
 *  invalid JSON, missing string `name`) are skipped silently — better
 *  than throwing, since the model occasionally emits half-formed JSON
 *  on the way to the real ones.
 *
 *  Returns an array of `{name, arguments}` objects (possibly empty).
 *  The same regex shape is used by _runLoop's streaming detector to
 *  know when to start hiding tokens from the user-facing bubble — the
 *  detector only needs the FIRST occurrence; the parser needs all. */
function parseAllToolCalls(text) {
  const calls = [];
  const anchor = /\{\s*"name"\s*:/g;
  let m;
  while ((m = anchor.exec(text)) !== null) {
    const start = m.index;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) break;   // unclosed brace, give up — partial stream
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (obj && typeof obj.name === 'string') {
        calls.push({ name: obj.name, arguments: obj.arguments ?? {} });
      }
    } catch { /* malformed — skip */ }
    // Advance past this object before re-running the anchor regex so
    // we don't re-match the same `{"name":` if JSON.parse rejected it.
    anchor.lastIndex = end + 1;
  }
  return calls;
}

/** Parse a `SUGGEST: [...]` block out of the model's combined-response
 *  output.  The model is told to use this section — separate from the
 *  tool-call JSON blocks above it — to propose follow-up questions
 *  the user might ask next.  These are rendered as clickable chips,
 *  NOT executed as actions; clicking a chip re-submits its text as a
 *  new user message.
 *
 *  Format: a single line `SUGGEST: ["q1", "q2", "q3"]` (JSON array
 *  of short strings) optionally preceded/followed by whitespace.
 *  Lenient: accepts the array anywhere after the SUGGEST anchor,
 *  walks brackets manually so escape sequences inside strings don't
 *  confuse the matcher, falls back to extracting double-quoted
 *  tokens if JSON.parse rejects the slice (small models occasionally
 *  emit smart quotes or stray commas).  Returns up to three trimmed
 *  non-empty strings, or null if nothing matched. */
function parseSuggestions(text) {
  if (!text) return null;
  const anchor = /\bSUGGEST\s*:/i.exec(text);
  if (!anchor) return null;
  const after = text.slice(anchor.index + anchor[0].length);
  const lo = after.indexOf('[');
  if (lo < 0) return null;
  let depth = 0;
  let hi = -1;
  for (let i = lo; i < after.length; i++) {
    const c = after[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) { hi = i; break; }
    }
  }
  if (hi < 0) return null;
  const slice = after.slice(lo, hi + 1);
  const tryParse = (raw) => {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      const out = arr
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .slice(0, 3);
      return out.length ? out : null;
    } catch { return null; }
  };
  let items = tryParse(slice);
  if (items) return items;
  // Fallback — pull every double-quoted token from the slice.
  const quoted = [...slice.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
    .map(m => m[1].trim())
    .filter(Boolean)
    .slice(0, 3);
  return quoted.length ? quoted : null;
}

/** Find the earliest offset in `text` where the hideable
 *  machine-readable section starts — the first occurrence of either
 *  a JSON tool-call anchor (`{"name":`) or a `SUGGEST:` marker.
 *  Used by _runLoop's streaming detector to know when to stop
 *  appending streamed tokens to the user-facing bubble (both
 *  JSON and SUGGEST are orchestrator-only; the user shouldn't see
 *  raw structured output flicker in their chat).  Returns -1 when
 *  neither marker is present yet (still pure prose). */
function findMachineSectionStart(text) {
  const jsonM = text.match(/\{\s*"name"\s*:/);
  const sugM  = text.match(/\bSUGGEST\s*:/i);
  const jIdx = jsonM ? jsonM.index : -1;
  const sIdx = sugM  ? sugM.index  : -1;
  if (jIdx < 0) return sIdx;
  if (sIdx < 0) return jIdx;
  return Math.min(jIdx, sIdx);
}

/** Strip `<think>…</think>` (and `<thinking>…</thinking>`) reasoning
 *  blocks from a model response.  Reasoning-tuned models like Qwen3
 *  and the DeepSeek-R1 family emit a hidden chain-of-thought before
 *  their visible answer; without stripping, that internal monologue
 *  leaks into:
 *    1. the user-facing bubble (visual noise, sometimes contradicts
 *       the final answer mid-thought),
 *    2. the tool-call and SUGGEST parsers (a `{"name":...` shape
 *       inside the reasoning would be misread as a real tool call),
 *    3. the history we push for the next turn (wastes context and
 *       can confuse subsequent prompts).
 *
 *  The stripper handles three shapes:
 *    - complete `<think>…</think>` pairs   → removed entirely
 *    - open `<think>` with no close yet    → everything from the
 *      open tag onward is dropped (mid-stream we don't want to
 *      show a partial reasoning trace)
 *    - no tags at all                       → passthrough
 *
 *  Both `<think>` and `<thinking>` spellings are recognised; tag
 *  matching is case-insensitive.
 */
function stripThinkBlocks(text) {
  if (!text) return text;
  // First: collapse every complete pair.  Greedy [\s\S] handles
  // newlines (which `.` doesn't, even with /m).
  let out = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  // Then: drop a trailing open-but-unclosed reasoning block.  This
  // is the mid-stream case — tokens are still arriving inside the
  // block; suppress them until the close tag lands and the previous
  // replace catches the pair on the next pass.
  out = out.replace(/<think(?:ing)?>[\s\S]*$/i, '');
  return out;
}

/* ---- Starter chips ------------------------------------------------- */

/** Initial suggestion chips, shown alongside the greeting once the
 *  model is ready.  Kept short and concrete so the user sees what kinds
 *  of things the assistant can actually do. */
const STARTER_CHIPS = [
  'Compute the sum of 3 and 5',
  'Solve for X: X^2-3*X+2 = 0',
  'Take the derivative of x^3+3*x+1',
];

/* ---- Model catalog ------------------------------------------------
   Curated subset of WebLLM's prebuiltAppConfig.model_list (see
   https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) chosen
   to span small-fast → large-smart so users with different hardware
   can pick what fits.  All entries are q4f16_1 quantization (the
   standard for WebGPU); all are instruction-tuned (no base models).

   Per-entry fields:
     id, label, size, note — self-explanatory.
     isDefault              — sticky-default for first-time mount.
     contextTokens          — context_window_size we pass to
                              CreateMLCEngine.  Each value is chosen
                              to be at-or-below the model's known
                              wasm-library compile-time max while
                              giving us enough headroom to fit our
                              ~3K-token system prompt + several turns
                              of history.  Tune individual entries up
                              if a model is silently truncating the
                              system prompt; tune down if a model
                              fails to load with "kv_cache too large".

   Adding/removing models: paste a `model_id:` line from the WebLLM
   config and fill in the fields above.  Sizes are approximate
   download size (≈ on-disk Cache Storage size after download), not
   VRAM requirement.

   --- Why these contextTokens values, briefly ---
   We're in testing phase comparing models, so we want each one
   running at "as much context as it can actually use" rather than
   the lowest common denominator.  WebLLM's compile-time defaults
   tend to be 4K for browser memory safety, well below most modern
   models' native maxes (32K-128K).  These values try to surface
   each model's real capability while staying inside what the
   prebuilt wasm libs were compiled for and what typical browser
   WebGPU contexts (~6 GB VRAM) can hold.

   If a model fails to load with "kv_cache too large" or similar,
   drop its value to 4096; if a model silently misbehaves on long
   prompts (e.g. the system prompt gets clipped), bump it up.
   ------------------------------------------------------------------ */
const MODELS = [
  // Code-tuned variants
  { id: 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC',    label: 'Qwen2.5 Coder 0.5B',     size: '~400 MB',  contextTokens: 32768, note: 'Smallest — fast but weakest reasoning; code-tuned' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',    label: 'Qwen2.5 Coder 1.5B',     size: '~1.3 GB',  contextTokens: 32768, note: 'Sweet spot for low-end GPUs — strong at structured output', isDefault: true },

  // Original (instruction-tuned) Qwen models, 500 MB – 2 GB
  { id: 'Qwen3-0.6B-q4f16_1-MLC',                     label: 'Qwen3 0.6B',             size: '~500 MB',  contextTokens: 32768, note: 'Newer Qwen generation — tiny' },
  { id: 'Qwen3.5-0.8B-q4f16_1-MLC',                   label: 'Qwen3.5 0.8B',           size: '~650 MB',  contextTokens: 32768, note: 'Latest Qwen3.5 — small' },
  { id: 'Qwen2-1.5B-Instruct-q4f16_1-MLC',            label: 'Qwen2 1.5B',             size: '~1.0 GB',  contextTokens: 32768, note: 'Original Qwen2 instruction-tuned' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',          label: 'Qwen2.5 1.5B',           size: '~1.0 GB',  contextTokens: 32768, note: 'Qwen2.5 base instruct (non-Coder)' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC',                     label: 'Qwen3 1.7B',             size: '~1.4 GB',  contextTokens: 32768, note: 'Newer Qwen generation, mid-size' },
  { id: 'Qwen3.5-2B-q4f16_1-MLC',                     label: 'Qwen3.5 2B',             size: '~1.6 GB',  contextTokens: 32768, note: 'Latest Qwen3.5 — largest under 2 GB' },
];

/** Tool-name aliases for common synonyms small models reach for.
 *  Maps an emitted-but-unregistered name to the actual registry key.
 *  Resolved at dispatch time before the unknown-tool retry kicks in
 *  — saves a full LLM round-trip when the model just used a near-
 *  synonym ("add_to_stack" → "push_to_stack").
 *
 *  Add entries here whenever a session shows the model emitting a
 *  consistent variant.  Skip ambiguous synonyms (e.g. raw "add" —
 *  could mean push, could mean the `+` operator) because resolving
 *  those silently to the wrong tool is worse than a retry. */
const TOOL_ALIASES = Object.freeze({
  // push variants
  'add_to_stack':       'push_to_stack',
  'push':               'push_to_stack',
  'put_on_stack':       'push_to_stack',
  'stack_push':         'push_to_stack',
  // read variants — get_stack
  'show_stack':         'get_stack',
  'read_stack':         'get_stack',
  'list_stack':         'get_stack',
  'view_stack':         'get_stack',
  // read variants — get_editor
  'show_editor':        'get_editor',
  'read_editor':        'get_editor',
  'view_editor':        'get_editor',
  'get_buffer':         'get_editor',
  // read variants — get_vars
  'list_variables':     'get_vars',
  'list_vars':          'get_vars',
  'show_vars':          'get_vars',
  'show_variables':     'get_vars',
  // read variants — recall_var
  'recall':             'recall_var',
  'recall_variable':    'recall_var',
  'get_var':            'recall_var',
  'get_variable':       'recall_var',
  'read_var':           'recall_var',
  // editor write variants
  'append_editor':      'append_to_editor',
  'editor_append':      'append_to_editor',
  'type_into_editor':   'append_to_editor',
  'editor_clear':       'clear_editor',
  'wipe_editor':        'clear_editor',
  'reset_editor':       'clear_editor',
  // run variants
  'execute':            'run',
  'execute_rpl':        'run',
  'run_rpl':            'run',
});

/** Look up the per-model contextTokens for the currently-loaded model.
 *  Falls back to 4096 (a safe WebLLM default) when no model is loaded
 *  or the loaded id isn't in our catalog. */
function activeContextTokens(llm) {
  const id = llm?.loadedModelId;
  if (!id) return 4096;
  // RemoteLLM exposes the server-side model name as loadedModelId.
  // It also fills `contextTokens` from Ollama's /api/show probe at
  // load time; when present, use that (the model's true max).
  // Plain OpenAI-compat servers don't expose this so we fall back to
  // the default below.  Detected by duck-typing on `endpoint` —
  // RemoteLLM has it, the worker LLM doesn't.
  if (typeof llm?.endpoint === 'string') {
    return llm.contextTokens || REMOTE_CONTEXT_TOKENS_DEFAULT;
  }
  const entry = MODELS.find((m) => m.id === id);
  return entry?.contextTokens ?? 4096;
}

const DEFAULT_MODEL_ID  = MODELS.find((m) => m.isDefault)?.id ?? MODELS[0].id;
const MODEL_STORAGE_KEY = 'rpl5050.chatbot.modelId';

// Sentinel id used in MODEL_STORAGE_KEY to mean "use the saved remote
// endpoint config" instead of one of the in-browser MODELS entries.
// Picked to be obviously not a real WebLLM model id so the
// `MODELS.find(...)` lookup safely returns undefined.
const REMOTE_MODEL_ID    = '__remote__';
const REMOTE_CONFIG_KEY  = 'rpl5050.chatbot.remote';
// Default context-token budget assumed for remote models — Ollama
// servers typically run with 8K-32K windows and the user can resize
// it server-side, so we pick a generous middle ground.  This only
// affects the history-trimming budget shown in the stats line; the
// server enforces the real limit.
const REMOTE_CONTEXT_TOKENS_DEFAULT = 16384;

function loadRemoteConfig() {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (cfg && typeof cfg.url === 'string' && typeof cfg.model === 'string'
        && cfg.url.trim() && cfg.model.trim()) {
      return { url: cfg.url.trim(), model: cfg.model.trim() };
    }
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

/** Fetch the list of models exposed by a remote endpoint.  Tries
 *  Ollama's `/api/tags` first (rich metadata: size, parameter count,
 *  quantization) and falls back to OpenAI-compat `/v1/models` (id only).
 *
 *  Input `url` is whatever the user typed in the Base URL field.  We
 *  derive both `<base>/api/tags` (after stripping any trailing `/v1`)
 *  AND `<typedUrl>/models` so either endpoint shape works.
 *
 *  Returns `{ models: [{id, size, params, quant}], source: 'ollama'|'openai' }`.
 *  Throws if neither probe returns a usable model list. */
async function fetchRemoteModels(url) {
  const openaiBase = toOpenAIBase(url);
  const ollamaBase = toOllamaBase(url);

  // Try Ollama native first — richer metadata and the URL shape most
  // users will actually have configured for this app.
  try {
    const r = await fetch(ollamaBase + '/api/tags', { method: 'GET' });
    if (r.ok) {
      const body = await r.json();
      const models = (body?.models ?? []).map((m) => ({
        id:     m.name || m.model,
        size:   typeof m.size === 'number' ? m.size : null,
        params: m.details?.parameter_size ?? null,
        quant:  m.details?.quantization_level ?? null,
      })).filter((m) => m.id);
      if (models.length) return { models, source: 'ollama' };
    }
  } catch { /* fall through to OpenAI-compat probe */ }

  // OpenAI-compat fallback.  No size/param/quant exposed by the spec —
  // just id.  We still surface them so the user can pick a model.
  const r2 = await fetch(openaiBase + '/models', { method: 'GET' });
  if (!r2.ok) throw new Error(`HTTP ${r2.status} from ${openaiBase}/models`);
  const body2 = await r2.json();
  const models = (body2?.data ?? []).map((m) => ({
    id: m.id, size: null, params: null, quant: null,
  })).filter((m) => m.id);
  if (!models.length) throw new Error('Endpoint returned no models');
  return { models, source: 'openai' };
}

/** Format a byte count as a short human-readable string, e.g. 1.3 GB.
 *  Used in the remote-model dropdown options.  Returns '' for null. */
function formatBytes(n) {
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + ' MB';
  return (n / 1e3).toFixed(0) + ' KB';
}

// First-run consent gate.  The chatbot is a research preview that
// downloads multi-GB model weights, runs WebGPU inference on the
// user's device, and proposes calculator commands that mutate state.
// We surface those facts in a one-time notice and require an
// explicit Enable click before any of the chat UI mounts.  The flag
// is versioned (`.v1`) so the notice can be re-shown if its terms
// change materially in a future revision.
const CONSENT_KEY = 'rpl5050.chatbot.consented.v1';
function hasConsented() {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}
function setConsented() {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* private mode */ }
}

// One-shot migration key.  Premium-tier models (≥7B) consistently
// stall in the WebLLM 0.2.x runtime — see the worker comment around
// resetChat() — so we drop any previously-saved selection in that
// tier exactly once and fall back to DEFAULT_MODEL_ID.  After this
// runs, the user's explicit re-pick of a premium model from the
// picker sticks (we don't re-migrate); the migration flag's purpose
// is solely to break the "stall → reload → still 7B → stall again"
// loop for users who picked a too-large model before we knew better.
const PREMIUM_DROP_MIGRATION_KEY = 'rpl5050.chatbot.migrated.dropPremium.v1';
const STALL_RISK_MODEL_IDS = [
  'Qwen2.5-7B-Instruct-q4f16_1-MLC',
  'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
  'Llama-3.1-8B-Instruct-q4f16_1-MLC',
];

function loadSavedModelId() {
  try {
    if (!localStorage.getItem(PREMIUM_DROP_MIGRATION_KEY)) {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved && STALL_RISK_MODEL_IDS.includes(saved)) {
        localStorage.removeItem(MODEL_STORAGE_KEY);
        // eslint-disable-next-line no-console
        console.warn(
          '[ChatBot] migration: dropped saved model', saved,
          '— premium-tier (≥7B) models stall on browser WebGPU.',
          'Falling back to', DEFAULT_MODEL_ID + '.',
          'Re-pick from the picker if you really want this model.',
        );
      }
      localStorage.setItem(PREMIUM_DROP_MIGRATION_KEY, '1');
    }
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch { return null; }
}
function saveModelId(id) {
  try { localStorage.setItem(MODEL_STORAGE_KEY, id); } catch { /* private mode */ }
}

/* ================================================================
   ChatBot class
   ================================================================ */

export class ChatBot {
  /**
   * @param {object} opts
   * @param {object} opts.tools — Calculator-side callback bag.  Each
   *   field corresponds to a primitive operation that one or more tools
   *   exposed to the model dispatch into.  Members:
   *     run(text:string):void          — type RPL into the editor and ENTER
   *     appendToEditor(text:string)    — insert at cursor, no commit
   *     clearEditor():void             — empty the editor buffer
   *     getEditor():string             — current editor contents
   *     listVars():string[]            — variable names in current dir
   *     recallVar(name:string):any     — value of named variable (or undefined)
   * @param {function} opts.getContext — () => { stack, angleMode, displayMode, dir }
   */
  constructor({ tools, getContext }) {
    this._tools      = tools;
    this._getContext = getContext;
    this._llm        = new LLM();
    this._history    = [];   // conversation turns (messages array)
    this._container  = null; // DOM element we're mounted into
    this._messagesEl = null; // scrollable message list
    this._inputEl    = null; // textarea
    this._sendBtn    = null;
    this._stopBtn    = null;
    this._statusEl   = null;
    this._progressEl = null;
    this._generating = false;
    this._pendingConfirm = null; // { resolve } | null — awaiting user confirmation
    // Queue of user messages submitted while a turn is in progress.
    // Drained one-at-a-time by the active _submit() after its
    // _runLoop finishes; cleared by _newChat / _abort to discard
    // pending work alongside the current turn.
    this._queue = [];
    // Monotonic counter incremented every time we start (or kill) a
    // _runLoop turn.  Each loop captures its own turnId locally and
    // bails out silently if it discovers _runId has moved past it —
    // that's how _newChat aborts in-flight generation cleanly without
    // race-condition history corruption.
    this._runId = 0;

    // Tool registry — the single source of truth for what the model can
    // call.  Each entry is { confirm, summary(args), handler(args) }.
    // Read-only tools (confirm:false) execute automatically; mutating
    // tools render a confirmation widget and pause the loop on
    // _pendingConfirm until the user clicks Run or Cancel.  Adding a new
    // tool means: register it here, document it in SYSTEM_PROMPT, and
    // (if it needs a new calculator primitive) add a callback in
    // app.js's `tools` bag.
    this._registry = this._buildRegistry();

    this._wireLLMListeners();
  }

  /** Subscribe the ChatBot's status/progress/stats handlers to whatever
   *  is currently in `this._llm`.  Called after construction and after
   *  every swap between the local LLM (WebLLM worker) and a RemoteLLM
   *  (HTTP endpoint) — both expose the same listener surface, but each
   *  instance has its own listener set so we re-subscribe on swap. */
  _wireLLMListeners() {
    this._llm.onStatus((status, msg) => this._onStatus(status, msg));
    this._llm.onProgress((info) => this._onProgress(info));
    this._llm.onStats((stats) => this._onStats(stats));
  }

  /** Ensure `this._llm` is the right kind for the requested target.
   *  `kind` is 'local' (WebLLM worker) or 'remote' (HTTP endpoint).
   *  No-op if already the right kind AND, for remote, the configured
   *  endpoint URL hasn't changed.  When swapping, aborts any in-flight
   *  generation, recreates the instance, and re-wires listeners. */
  _ensureLLMKind(kind, endpoint = '') {
    const isRemote = this._llm instanceof RemoteLLM;
    if (kind === 'remote') {
      if (isRemote && this._llm.endpoint === toOpenAIBase(endpoint)) return;
    } else {
      if (!isRemote) return;
    }
    try { this._llm.abort(); } catch { /* no-op */ }
    this._llm = kind === 'remote' ? new RemoteLLM(endpoint) : new LLM();
    this._wireLLMListeners();
  }

  /* ---- Tool registry ---- */

  _buildRegistry() {
    const tools = this._tools;
    const ctx   = () => this._getContext();
    return {
      // ---- Read-only (auto, no confirmation) ----
      get_stack: {
        confirm: false,
        summary: () => ({ label: '🔍 get_stack', code: '' }),
        handler: () => {
          const c = ctx();
          return {
            stack: c.stack,
            angleMode: c.angleMode,
            displayMode: c.displayMode,
            dir: c.dir,
          };
        },
      },
      get_editor: {
        confirm: false,
        summary: () => ({ label: '🔍 get_editor', code: '' }),
        handler: () => ({ buffer: tools.getEditor() }),
      },
      get_vars: {
        confirm: false,
        summary: () => ({ label: '🔍 get_vars', code: '' }),
        handler: () => ({ vars: tools.listVars(), dir: ctx().dir }),
      },
      recall_var: {
        confirm: false,
        summary: ({ name } = {}) => ({ label: `🔍 recall_var ${name ?? ''}`, code: '' }),
        handler: ({ name } = {}) => {
          const v = tools.recallVar(String(name ?? ''));
          return v === undefined
            ? { name, exists: false }
            : { name, exists: true, value: String(v) };
        },
      },

      // ---- Mutating (require user confirmation) ----
      run: {
        confirm: true,
        summary: ({ text } = {}) => ({ label: '▶ Run RPL', code: String(text ?? '') }),
        handler: ({ text } = {}) => {
          tools.run(String(text ?? ''));
          const c = ctx();
          return { success: true, stack: c.stack };
        },
      },
      // Friendly alias for `run` when the user just wants to push
      // literals (numbers, lists, vectors, Symbolics) onto the stack.
      // The implementation is identical to `run` — small chat-tuned
      // models reliably misroute "put 3 on the stack" to recall_var,
      // so naming the action explicitly steers the picker.  `value`
      // is whatever RPL literal text the user wants pushed; spaces
      // separate multiple pushes ("3 5" pushes two numbers).
      push_to_stack: {
        confirm: true,
        summary: ({ value } = {}) => ({ label: '▲ Push to stack', code: String(value ?? '') }),
        handler: ({ value } = {}) => {
          tools.run(String(value ?? ''));
          const c = ctx();
          return { success: true, stack: c.stack };
        },
      },
      append_to_editor: {
        confirm: true,
        summary: ({ text } = {}) => ({ label: '✎ Append to editor', code: String(text ?? '') }),
        handler: ({ text } = {}) => {
          tools.appendToEditor(String(text ?? ''));
          return { success: true, buffer: tools.getEditor() };
        },
      },
      clear_editor: {
        confirm: true,
        summary: () => ({ label: '✗ Clear editor', code: '' }),
        handler: () => {
          tools.clearEditor();
          return { success: true, buffer: tools.getEditor() };
        },
      },
    };
  }

  /* ---- Lifecycle ---- */

  /** Render the chat UI into `el`.  Call once.
   *
   *  Model load policy:
   *   - First-ever mount with no saved model → show the picker;
   *     don't auto-download anything.  The user picks explicitly so
   *     they're not surprised by a several-hundred-MB download on
   *     opening the panel.
   *   - Mount with a saved model id in localStorage → auto-load
   *     that model.  Subsequent loads of the same id hit Cache
   *     Storage and complete in seconds.
   *   - Saved id no longer in MODELS (e.g. user wiped their setting,
   *     or we removed a model) → fall back to picker.
   */
  mount(el) {
    this._container = el;
    el.innerHTML = '';
    el.classList.add('cb-root');

    // First-run consent gate.  Until the user has explicitly enabled
    // the assistant, we render only the disclosure notice and an
    // Enable button — no model picker, no streaming UI, no worker
    // launch (the LLM instance exists but does nothing until load()
    // is called).  Once the user accepts, the gate is replaced with
    // the regular UI in-place; the consent flag is persisted in
    // localStorage so the gate doesn't re-appear on every page load.
    if (!hasConsented()) {
      dlog('mount: consent not yet given — rendering gate');
      el.appendChild(this._buildConsentGate());
      return;
    }

    el.appendChild(this._buildUI());
    this._initialiseModelLoad();
  }

  /** Resolve which model to load on first mount.  Pulled out of mount()
   *  so the consent-gate Enable handler can call it after swapping in
   *  the regular UI. */
  _initialiseModelLoad() {
    if (this._llm.status === 'idle') {
      const saved = loadSavedModelId();
      if (saved === REMOTE_MODEL_ID) {
        const cfg = loadRemoteConfig();
        if (cfg) {
          this._startLoadRemote(cfg);
          return;
        }
        // Saved sentinel but no config — fall through to picker.
      }
      const known = saved && MODELS.some((m) => m.id === saved);
      if (known) {
        this._startLoad(saved);
      } else {
        this._showPicker();
      }
    }
  }

  /** First-run notice + Enable button.  Replaces the regular chat UI
   *  until the user clicks Enable.  The notice covers the four
   *  practical points a new user needs before the assistant runs:
   *  research-preview status, on-device execution, weight-download
   *  size, and the explicit-confirmation guarantee on mutating
   *  actions.  Tone is professional / informational — no marketing,
   *  no emoji garlands. */
  _buildConsentGate() {
    const wrap = document.createElement('div');
    wrap.className = 'cb-consent';

    const title = document.createElement('h2');
    title.className = 'cb-consent-title';
    title.textContent = 'AI Assistant — Research Preview';
    wrap.appendChild(title);

    const intro = document.createElement('p');
    intro.className = 'cb-consent-intro';
    intro.textContent =
      'This panel hosts an experimental on-device assistant that can answer ' +
      'questions about RPL syntax and propose calculator commands on your behalf. ' +
      'Please review the notes below before enabling it.';
    wrap.appendChild(intro);

    const list = document.createElement('ul');
    list.className = 'cb-consent-list';
    const points = [
      'Replies are generated by a small language model and may be inaccurate, incomplete, or out of date. Verify any output you intend to act on.',
      'Inference runs locally in your browser via WebGPU. Conversations and calculator state are not transmitted to any external service.',
      'The first time you select a model, its weights download from the WebLLM CDN (typically 0.4–2.5 GB depending on model). Subsequent sessions reuse the browser cache.',
      'Any action that mutates the calculator — running RPL, storing variables, editing the entry line — surfaces a confirmation card with the proposed command. Nothing executes without your explicit click.',
    ];
    for (const text of points) {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    }
    wrap.appendChild(list);

    const footer = document.createElement('p');
    footer.className = 'cb-consent-footer';
    footer.textContent =
      'Click Enable to continue. This preference is remembered for future sessions; ' +
      'clearing the site’s storage will restore the notice.';
    wrap.appendChild(footer);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cb-consent-accept';
    button.textContent = 'Enable assistant';
    button.addEventListener('click', () => {
      dlog('mount: user enabled assistant — persisting consent and swapping in chat UI');
      setConsented();
      // Replace the gate with the regular UI in-place.  We're already
      // mounted into _container, so just clear and rebuild.
      this._container.innerHTML = '';
      this._container.appendChild(this._buildUI());
      this._initialiseModelLoad();
    });
    wrap.appendChild(button);

    return wrap;
  }

  /* ---- UI construction ---- */

  _buildUI() {
    const root = document.createElement('div');
    root.className = 'cb-inner';

    // — Header row: status text on the left, BETA badge in the
    // middle, "New chat" button on the right.  Status indicates model
    // load state; the BETA badge flags this whole feature as a
    // research preview so users don't expect production-grade
    // behaviour from a 1B-param on-device LLM; New chat resets the
    // conversation in-place without unloading the model.
    const header = document.createElement('div');
    header.className = 'cb-header';

    this._statusEl = document.createElement('div');
    this._statusEl.className = 'cb-status';

    const betaBadge = document.createElement('span');
    betaBadge.className = 'cb-beta-badge';
    betaBadge.textContent = 'BETA';
    betaBadge.title = 'On-device LLM is a research preview — replies may be wrong; always verify before running tool calls.';

    this._newChatBtn = document.createElement('button');
    this._newChatBtn.type = 'button';
    this._newChatBtn.className = 'cb-newchat-btn';
    this._newChatBtn.title = 'Start a new conversation';
    this._newChatBtn.setAttribute('aria-label', 'New chat');
    this._newChatBtn.textContent = '✱ New';
    this._newChatBtn.addEventListener('click', () => this._newChat());

    header.appendChild(this._statusEl);
    header.appendChild(betaBadge);
    header.appendChild(this._newChatBtn);

    this._progressEl = document.createElement('div');
    this._progressEl.className = 'cb-progress hidden';

    const progressBar = document.createElement('div');
    progressBar.className = 'cb-progress-bar';
    this._progressBarFill = document.createElement('div');
    this._progressBarFill.className = 'cb-progress-fill';
    progressBar.appendChild(this._progressBarFill);
    this._progressLabel = document.createElement('span');
    this._progressLabel.className = 'cb-progress-label';
    this._progressEl.appendChild(progressBar);
    this._progressEl.appendChild(this._progressLabel);

    // Load button — surfaced if a load fails.  Hidden by default;
    // _onStatus('error') unhides it as "Retry".  Re-running the same
    // model id retries; the picker is the way to switch models.
    this._loadBtn = document.createElement('button');
    this._loadBtn.className = 'cb-load-btn hidden';
    this._loadBtn.textContent = 'Retry';
    this._loadBtn.title = 'Retry loading the selected model.';
    this._loadBtn.addEventListener('click', () => {
      const id = loadSavedModelId() ?? DEFAULT_MODEL_ID;
      if (id === REMOTE_MODEL_ID) {
        const cfg = loadRemoteConfig();
        if (cfg) { this._startLoadRemote(cfg); return; }
      }
      this._startLoad(id);
    });

    // "Pick a different model" affordance — visible alongside Retry
    // on error, and also surfaced from the header once a model is
    // ready so the user can switch later.
    this._switchModelBtn = document.createElement('button');
    this._switchModelBtn.className = 'cb-switch-model-btn hidden';
    this._switchModelBtn.textContent = '⇄ Pick a different model';
    this._switchModelBtn.title = 'Show the model picker.';
    this._switchModelBtn.addEventListener('click', () => this._showPicker());

    // — Picker (hidden by default; populated by _showPicker())
    this._pickerEl = document.createElement('div');
    this._pickerEl.className = 'cb-picker hidden';

    // — Messages list
    this._messagesEl = document.createElement('div');
    this._messagesEl.className = 'cb-messages';

    // — Stats line.  Hidden until the first turn lands a stats packet
    // (see _onStats); shows last-turn timing/token counts on top and
    // cumulative session totals on the bottom.  Sits above the input
    // row so the user sees performance feedback without scrolling.
    this._statsEl = document.createElement('div');
    this._statsEl.className = 'cb-stats hidden';
    this._statsEl.title = 'Inference stats — most recent turn and cumulative session totals.';

    // — Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'cb-input-row';

    this._inputEl = document.createElement('textarea');
    this._inputEl.className = 'cb-input';
    this._inputEl.placeholder = 'Ask about RPL, commands, maths…';
    this._inputEl.rows = 1;          // height matches the send button (40px)
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });
    // Auto-grow vertically as the user types.  Reset to single-line
    // height first so deleting content can shrink the box again, then
    // expand to fit the wrapped content.  The CSS max-height caps it
    // so the textarea never eats the whole panel.
    this._autoGrowInput = () => {
      const el = this._inputEl;
      // Reset first so deletes can shrink it back; box-sizing: border-box
      // means we add the top+bottom border to scrollHeight, otherwise the
      // last line gets clipped by 2 px.
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight + 2) + 'px';
    };
    this._inputEl.addEventListener('input', this._autoGrowInput);

    this._sendBtn = document.createElement('button');
    this._sendBtn.className = 'cb-send-btn';
    this._sendBtn.textContent = '▶';
    this._sendBtn.title = 'Send (Enter)';
    this._sendBtn.disabled = true;
    this._sendBtn.addEventListener('click', () => this._submit());

    this._stopBtn = document.createElement('button');
    this._stopBtn.className = 'cb-stop-btn hidden';
    this._stopBtn.textContent = '■ Stop';
    this._stopBtn.addEventListener('click', () => this._abort());

    inputRow.appendChild(this._inputEl);
    inputRow.appendChild(this._sendBtn);

    root.appendChild(header);
    root.appendChild(this._progressEl);
    root.appendChild(this._loadBtn);
    root.appendChild(this._switchModelBtn);
    root.appendChild(this._pickerEl);
    root.appendChild(this._messagesEl);
    root.appendChild(this._statsEl);
    root.appendChild(this._stopBtn);
    root.appendChild(inputRow);

    this._setUIState('idle');
    return root;
  }

  /* ---- Model picker --------------------------------------------------
     Renders MODELS as a vertical list.  Clicking a row picks + loads
     that model and persists the selection to localStorage.  The
     picker hides itself once loading begins; _showPicker() can be
     called again from the header / error state to change models. */

  _showPicker() {
    if (!this._pickerEl) return;
    this._pickerEl.innerHTML = '';
    this._pickerEl.classList.remove('hidden');

    // Header row with the blurb and a close button so the user can
    // back out without selecting.  Dismiss is always allowed — even
    // before any model has been loaded — but in that case the chat
    // input stays disabled and the "Pick a model" button stays
    // surfaced so they can re-open the picker.
    const head = document.createElement('div');
    head.className = 'cb-picker-head';

    const blurb = document.createElement('p');
    blurb.className = 'cb-picker-blurb';
    blurb.textContent =
      'Pick a model. Each runs entirely on your device via WebGPU. '
      + 'First load downloads the weights (one-time per model) and caches them in the browser.';
    head.appendChild(blurb);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cb-picker-close';
    closeBtn.title = 'Dismiss the picker';
    closeBtn.setAttribute('aria-label', 'Dismiss the picker');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this._dismissPicker());
    head.appendChild(closeBtn);

    this._pickerEl.appendChild(head);

    const isLocalLLM = !(this._llm instanceof RemoteLLM);
    const activeId = isLocalLLM
      ? (this._llm.loadedModelId ?? loadSavedModelId())
      : loadSavedModelId();

    const select = document.createElement('select');
    select.className = 'cb-picker-select';
    for (const m of MODELS) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.label} — ${m.size}`;
      if (m.id === activeId) opt.selected = true;
      select.appendChild(opt);
    }
    // If activeId didn't match any option (e.g. remote, or stale id),
    // <select> defaults to the first entry — we want that as the
    // initial selection so the note row matches what's shown.
    this._pickerEl.appendChild(select);

    const detail = document.createElement('div');
    detail.className = 'cb-picker-detail';
    const note = document.createElement('div');
    note.className = 'cb-picker-note';
    detail.appendChild(note);

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'cb-picker-load-btn';
    detail.appendChild(loadBtn);
    this._pickerEl.appendChild(detail);

    const refreshDetail = () => {
      const m = MODELS.find((x) => x.id === select.value) ?? MODELS[0];
      const isActive = isLocalLLM && this._llm.loadedModelId === m.id;
      note.textContent = isActive ? `${m.note} · loaded` : m.note;
      loadBtn.textContent = isActive ? 'Loaded' : 'Load';
      loadBtn.disabled = isActive;
    };
    select.addEventListener('change', refreshDetail);
    refreshDetail();

    loadBtn.addEventListener('click', () => {
      if (this._generating) return;
      const id = select.value;
      if (isLocalLLM && id === this._llm.loadedModelId) {
        this._pickerEl.classList.add('hidden');
        return;
      }
      saveModelId(id);
      this._pickerEl.classList.add('hidden');
      // Reset the visible conversation when switching models —
      // the new model has different priors and the prior chat
      // history would be confusing in that context.
      this._history = [];
      if (this._messagesEl) this._messagesEl.innerHTML = '';
      this._removeActiveChips();
      this._startLoad(id);
    });

    this._renderRemoteSection();
  }

  /* ---- Remote-endpoint section ----------------------------------------
     Lives under the local-model list inside the picker.  Two states:

       - No saved config: a single "+ Add Ollama-compatible endpoint"
         button that swaps into an inline form (URL + model name).
       - Saved config:    a row showing the configured URL + model name
         that loads on click, with edit/remove buttons.

     Persistence is in localStorage under REMOTE_CONFIG_KEY; the
     active-row indicator follows the same `cb-picker-row-active` class
     the local list uses, so a remote row "looks active" identically. */

  _renderRemoteSection() {
    const wrap = document.createElement('div');
    wrap.className = 'cb-remote-section';

    const heading = document.createElement('div');
    heading.className = 'cb-remote-heading';
    heading.textContent = 'Or use a remote OpenAI-compatible endpoint (e.g. Ollama)';
    wrap.appendChild(heading);

    const cfg = loadRemoteConfig();
    const savedId = loadSavedModelId();
    const isActive = savedId === REMOTE_MODEL_ID
      && this._llm instanceof RemoteLLM
      && this._llm.loadedModelId === cfg?.model;

    if (cfg) {
      const row = document.createElement('div');
      row.className = 'cb-picker-row cb-remote-row';
      if (isActive) row.classList.add('cb-picker-row-active');

      const top = document.createElement('div');
      top.className = 'cb-picker-row-top';
      const name = document.createElement('span');
      name.className = 'cb-picker-name';
      name.textContent = cfg.model;
      const url = document.createElement('span');
      url.className = 'cb-picker-size';
      url.textContent = cfg.url;
      top.appendChild(name);
      top.appendChild(url);
      row.appendChild(top);

      const note = document.createElement('div');
      note.className = 'cb-picker-note';
      note.textContent = isActive
        ? 'Custom endpoint · loaded'
        : 'Custom endpoint — click to connect';
      row.appendChild(note);

      const btnRow = document.createElement('div');
      btnRow.className = 'cb-remote-btns';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'cb-remote-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._renderRemoteForm(cfg);
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'cb-remote-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._generating) return;
        clearRemoteConfig();
        // If the removed endpoint was the active selection, fall back
        // to the default local model so we don't end up with nothing
        // selected.
        if (loadSavedModelId() === REMOTE_MODEL_ID) {
          saveModelId(DEFAULT_MODEL_ID);
        }
        this._showPicker();
      });
      btnRow.appendChild(editBtn);
      btnRow.appendChild(removeBtn);
      row.appendChild(btnRow);

      row.addEventListener('click', () => {
        if (this._generating) return;
        if (isActive) { this._pickerEl.classList.add('hidden'); return; }
        saveModelId(REMOTE_MODEL_ID);
        this._pickerEl.classList.add('hidden');
        this._history = [];
        if (this._messagesEl) this._messagesEl.innerHTML = '';
        this._removeActiveChips();
        this._startLoadRemote(cfg);
      });

      wrap.appendChild(row);
    } else {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'cb-remote-add';
      addBtn.textContent = '+ Add custom endpoint';
      addBtn.addEventListener('click', () => this._renderRemoteForm(null));
      wrap.appendChild(addBtn);
    }

    this._pickerEl.appendChild(wrap);
  }

  /** Render an inline form to enter / edit the remote endpoint config.
   *  `seed` is the existing config (for edit) or null (for add).  On
   *  Save the form is replaced with the regular row via _showPicker().
   *
   *  When the user types a Base URL (debounced) the form fetches the
   *  list of available models from the server and populates a
   *  dropdown alphabetically.  Ollama's `/api/tags` is preferred for
   *  its size + parameter-count + quantization metadata; OpenAI-compat
   *  servers fall through to `/v1/models` (id only). */
  _renderRemoteForm(seed) {
    if (!this._pickerEl) return;

    // Replace the entire remote section; leave the local list above it
    // alone so the user can still pick a local model from the form.
    const existing = this._pickerEl.querySelector('.cb-remote-section');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'cb-remote-section cb-remote-form';

    const heading = document.createElement('div');
    heading.className = 'cb-remote-heading';
    heading.textContent = seed ? 'Edit endpoint' : 'Add OpenAI-compatible endpoint';
    wrap.appendChild(heading);

    const help = document.createElement('div');
    help.className = 'cb-remote-help';
    help.textContent =
      'For local Ollama, the URL is typically http://localhost:11434/v1. '
      + 'Models you have pulled appear in the dropdown once the URL is reachable.';
    wrap.appendChild(help);

    const urlLabel = document.createElement('label');
    urlLabel.className = 'cb-remote-label';
    urlLabel.textContent = 'Base URL';
    wrap.appendChild(urlLabel);
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'cb-remote-input';
    urlInput.placeholder = 'http://localhost:11434/v1';
    // Default to the local-Ollama URL when adding a new endpoint —
    // it's by far the most common case, and the auto-fetch at the
    // bottom of this method will probe it immediately so models
    // appear in the dropdown without the user typing anything.
    urlInput.value = seed?.url ?? 'http://localhost:11434/v1';
    wrap.appendChild(urlInput);

    const modelLabel = document.createElement('label');
    modelLabel.className = 'cb-remote-label';
    modelLabel.textContent = 'Model';
    wrap.appendChild(modelLabel);
    const modelSelect = document.createElement('select');
    modelSelect.className = 'cb-remote-input cb-picker-select';
    modelSelect.disabled = true;
    const placeholder = document.createElement('option');
    placeholder.textContent = '(enter a URL to load available models)';
    placeholder.value = '';
    modelSelect.appendChild(placeholder);
    wrap.appendChild(modelSelect);

    const statusEl = document.createElement('div');
    statusEl.className = 'cb-remote-help';
    wrap.appendChild(statusEl);

    const errEl = document.createElement('div');
    errEl.className = 'cb-remote-err';
    wrap.appendChild(errEl);

    // Debounced URL → model-list fetch.  Each keystroke reschedules the
    // timer; a token incremented per fetch is checked after the await
    // so a stale response from an earlier URL doesn't overwrite the
    // current one's models.
    let fetchToken = 0;
    let debounceTimer = null;
    const refreshModels = async (preferredId) => {
      const url = urlInput.value.trim();
      if (!url) {
        modelSelect.innerHTML = '';
        modelSelect.appendChild(placeholder);
        modelSelect.disabled = true;
        statusEl.textContent = '';
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        modelSelect.disabled = true;
        statusEl.textContent = '';
        return;
      }
      const myToken = ++fetchToken;
      modelSelect.disabled = true;
      statusEl.textContent = 'Loading models…';
      errEl.textContent = '';
      try {
        const { models, source } = await fetchRemoteModels(url);
        if (myToken !== fetchToken) return;   // stale — newer fetch in flight
        models.sort((a, b) => a.id.localeCompare(b.id));
        modelSelect.innerHTML = '';
        for (const m of models) {
          const opt = document.createElement('option');
          opt.value = m.id;
          const meta = [m.params, formatBytes(m.size), m.quant]
            .filter(Boolean).join(', ');
          opt.textContent = meta ? `${m.id} (${meta})` : m.id;
          modelSelect.appendChild(opt);
        }
        if (preferredId) {
          const match = [...modelSelect.options].find((o) => o.value === preferredId);
          if (match) modelSelect.value = preferredId;
        }
        modelSelect.disabled = false;
        statusEl.textContent =
          `${models.length} model${models.length === 1 ? '' : 's'} from `
          + (source === 'ollama' ? 'Ollama /api/tags' : 'OpenAI /v1/models');
      } catch (err) {
        if (myToken !== fetchToken) return;
        modelSelect.innerHTML = '';
        modelSelect.appendChild(placeholder);
        modelSelect.disabled = true;
        statusEl.textContent = '';
        errEl.textContent = `Couldn't reach ${url}: ${err.message}`;
      }
    };
    urlInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refreshModels(seed?.model), 400);
    });
    urlInput.addEventListener('change', () => {
      clearTimeout(debounceTimer);
      refreshModels(seed?.model);
    });

    const btnRow = document.createElement('div');
    btnRow.className = 'cb-remote-btns';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'cb-remote-save';
    saveBtn.textContent = seed ? 'Save & connect' : 'Add & connect';
    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const model = modelSelect.value.trim();
      if (!url) {
        errEl.textContent = 'A URL is required.';
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        errEl.textContent = 'URL must start with http:// or https://';
        return;
      }
      if (!model) {
        errEl.textContent = 'Pick a model from the dropdown.';
        return;
      }
      const cfg = { url: url.replace(/\/+$/, ''), model };
      saveRemoteConfig(cfg);
      saveModelId(REMOTE_MODEL_ID);
      this._pickerEl.classList.add('hidden');
      this._history = [];
      if (this._messagesEl) this._messagesEl.innerHTML = '';
      this._removeActiveChips();
      this._startLoadRemote(cfg);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cb-remote-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._showPicker());

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    wrap.appendChild(btnRow);

    this._pickerEl.appendChild(wrap);
    urlInput.focus();

    // Auto-fetch on first render when a URL is already present (edit
    // mode, browser-restored value, OR the default Ollama URL we
    // prefill above for new endpoints — so models load immediately
    // for the common case of a user running local Ollama).
    if (urlInput.value.trim()) {
      refreshModels(seed?.model);
    }
  }

  _hidePicker() {
    this._pickerEl?.classList.add('hidden');
  }

  /** User-driven dismiss of the picker.  Hides the list and surfaces
   *  the "Pick a model" button so they can re-open it.  Differs from
   *  _hidePicker() (called as part of normal load flow) only in that
   *  it always exposes the re-open button, even when no model is
   *  loaded yet — otherwise the user could end up looking at an empty
   *  panel with no way to bring the picker back. */
  _dismissPicker() {
    this._hidePicker();
    if (this._switchModelBtn) {
      this._switchModelBtn.classList.remove('hidden');
      // Adapt the label to match what's loaded.
      this._switchModelBtn.textContent =
        this._llm.loadedModelId ? '⇄ Pick a different model' : '⇄ Pick a model';
    }
  }

  /** Wipe the conversation and start fresh.  Aborts any in-flight
   *  generation, clears history + the visible bubble list, and re-shows
   *  the starter chips.  The model itself stays loaded — this is purely
   *  a conversation reset, not a model reset. */
  _newChat() {
    dlog('newChat: reset (was generating=', this._generating,
         'history len=', this._history.length, ')');
    // Bump the turn id so an in-flight _runLoop detects the reset and
    // unwinds without writing back into the freshly-cleared history.
    this._runId++;
    if (this._generating) {
      this._llm.abort();
      if (this._pendingConfirm) {
        this._pendingConfirm.resolve(false);
        this._pendingConfirm = null;
      }
    }
    // Discard any messages the user queued during the in-flight turn —
    // a "new chat" reset wipes pending work alongside the current turn.
    this._queue = [];
    this._history = [];
    // Reset cumulative session counters; the stats line goes back
    // to hidden until the first new-turn stats packet lands.
    this._sessionTotals = null;
    if (this._statsEl) {
      this._statsEl.textContent = '';
      this._statsEl.classList.add('hidden');
    }
    this._removeActiveChips();
    if (this._messagesEl) this._messagesEl.innerHTML = '';
    if (this._inputEl) {
      this._inputEl.value = '';
      this._inputEl.style.height = '';        // reset auto-grow
    }

    // If the model is already ready, re-render the greeting + starter
    // chips immediately.  Otherwise the greeting will fire from
    // _onStatus('ready') as before.
    if (this._llm.status === 'ready') {
      const greeting = this._addAssistantBubble(
        'New conversation started. Pick a starter or type your own:',
      );
      this._renderChips(STARTER_CHIPS, greeting);
    }
    this._inputEl?.focus();
  }

  /* ---- Model loading ---- */

  async _startLoad(modelId) {
    if (!modelId) modelId = loadSavedModelId() ?? DEFAULT_MODEL_ID;
    // If we were on a remote endpoint, swap back to the local LLM
    // before loading.  Same listener wiring on both sides so the rest
    // of the UI doesn't need to know which path we're on.
    this._ensureLLMKind('local');
    this._loadBtn.disabled = true;
    this._loadBtn.textContent = 'Loading…';
    this._loadBtn.classList.add('hidden');
    this._switchModelBtn.classList.add('hidden');
    this._hidePicker();
    // Pass the catalog-defined contextTokens for this model so WebLLM
    // configures the KV cache for the size we actually want, instead
    // of falling back to the prebuilt-config default (typically 4K,
    // too small for our system prompt + history).
    const entry = MODELS.find((m) => m.id === modelId);
    const contextTokens = entry?.contextTokens;
    dlog('startLoad: modelId=', modelId, 'contextTokens=', contextTokens ?? '(default)');
    try {
      await this._llm.load(modelId, { contextTokens });
    } catch (err) {
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry';
    }
  }

  /** Connect to a configured Ollama-compatible HTTP endpoint.  Mirrors
   *  _startLoad's UI flow (hide picker, show progress, surface Retry on
   *  failure) but routes through a RemoteLLM instance instead of the
   *  WebLLM worker. */
  async _startLoadRemote(cfg) {
    if (!cfg?.url || !cfg?.model) {
      dwarn('startLoadRemote: missing url/model in cfg', cfg);
      this._showPicker();
      return;
    }
    this._ensureLLMKind('remote', cfg.url.replace(/\/+$/, ''));
    this._loadBtn.disabled = true;
    this._loadBtn.textContent = 'Loading…';
    this._loadBtn.classList.add('hidden');
    this._switchModelBtn.classList.add('hidden');
    this._hidePicker();
    dlog('startLoadRemote: url=', cfg.url, 'model=', cfg.model);
    try {
      await this._llm.load(cfg.model);
    } catch (err) {
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry';
    }
  }

  _onStatus(status, msg) {
    if (status === 'loading') {
      this._statusEl.textContent = msg || 'Loading…';
      this._statusEl.className = 'cb-status cb-status-loading';
      this._progressEl.classList.remove('hidden');
      this._loadBtn.classList.add('hidden');
      this._switchModelBtn.classList.add('hidden');
      this._hidePicker();
    } else if (status === 'ready') {
      const id    = this._llm.loadedModelId;
      const entry = MODELS.find((m) => m.id === id);
      const isRemote = this._llm instanceof RemoteLLM;
      const label = isRemote
        ? `Remote: ${id || 'Ready'}`
        : (entry?.label ?? id ?? '');
      this._statusEl.textContent = `● ${label || 'Ready'}`;
      this._statusEl.className = 'cb-status cb-status-ready';
      this._progressEl.classList.add('hidden');
      this._loadBtn.classList.add('hidden');
      this._switchModelBtn.classList.remove('hidden');
      this._switchModelBtn.textContent = '⇄ Pick a different model';
      this._sendBtn.disabled = false;
      this._hidePicker();
      // Greet on first ready, with starter chips so the user can jump
      // straight into a representative task.
      if (this._history.length === 0) {
        const greeting = this._addAssistantBubble(
          `${label || 'Model'} ready. I can answer questions about RPL, commands, and ` +
          'maths, and suggest calculator actions for you to confirm. ' +
          'Pick a starter or type your own:',
        );
        this._renderChips(STARTER_CHIPS, greeting);
      }
    } else if (status === 'error') {
      this._statusEl.textContent = `✗ ${msg || 'Error'}`;
      this._statusEl.className = 'cb-status cb-status-error';
      this._progressEl.classList.add('hidden');
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry';
      this._loadBtn.classList.remove('hidden');
      this._switchModelBtn.classList.remove('hidden');
    }
  }

  _onProgress({ file, progress }) {
    const pct = Math.round(progress ?? 0);
    this._progressBarFill.style.width = pct + '%';
    const name = (file ?? '').split('/').pop();
    this._progressLabel.textContent = name ? `${name} — ${pct}%` : `${pct}%`;
  }

  /** Per-turn stats handler.  Called once per successful generate
   *  (the stats packet arrives just before `done` from the worker).
   *  Writes a one-line console summary and updates the inline stats
   *  element in the UI so the user sees the numbers without opening
   *  DevTools.  No state mutation — the cumulative session totals
   *  live on this._sessionTotals, updated here. */
  _onStats(stats) {
    if (!stats) return;
    // Cumulative session totals — handy for "how much have I used
    // this conversation".  Reset by _newChat() alongside history.
    if (!this._sessionTotals) {
      this._sessionTotals = { turns: 0, inputChars: 0, outputTokens: 0, totalMs: 0 };
    }
    const t = this._sessionTotals;
    t.turns        += 1;
    t.inputChars   += stats.inputChars   ?? 0;
    t.outputTokens += stats.outputTokens ?? 0;
    t.totalMs      += stats.totalMs      ?? 0;

    dlog('turn stats:',
         'in=', stats.inputChars, 'chars (' + stats.inputMessages + ' msgs, ~' +
         Math.round((stats.inputChars ?? 0) / 4) + ' tok)',
         '· out=', stats.outputTokens, 'tok (' + stats.outputChars + ' chars)',
         '· latency=', Math.round(stats.totalMs ?? 0) + 'ms',
         '(ttft=', stats.ttftMs !== null ? Math.round(stats.ttftMs) + 'ms' : '-',
         'decode=', stats.decodeTps?.toFixed(1) + ' tok/s' ?? '-) ',
         '· session=', t.turns, 'turns,', t.outputTokens, 'out tok');

    this._renderStats(stats);
  }

  /** Update the inline stats element with the latest turn's numbers,
   *  context-budget usage, and cumulative session totals.  Element is
   *  built lazily on first stats arrival; if the element doesn't
   *  exist yet (rare race during initialisation), this just no-ops.
   *
   *  The three lines, top-to-bottom:
   *
   *    1. Last turn — input/output tokens, end-to-end latency, decode
   *       throughput.  Most actionable for "is the model alive and
   *       fast enough?"
   *
   *    2. Context usage — input chars vs HISTORY_BUDGET_CHARS as
   *       both an absolute fraction and a percentage.  When this
   *       approaches 100%, _trimHistoryForBudget will start dropping
   *       the oldest messages — surfacing the number lets the user
   *       see that boundary coming instead of being surprised by it.
   *
   *    3. Session totals — turns and total output tokens since the
   *       last "New chat".
   */
  _renderStats(stats) {
    if (!this._statsEl) return;
    const inChars  = stats.inputChars ?? 0;
    const inTok    = Math.round(inChars / 4);
    const outTok   = stats.outputTokens ?? 0;
    const ms       = Math.round(stats.totalMs ?? 0);
    const tps      = stats.decodeTps !== null && stats.decodeTps !== undefined
      ? stats.decodeTps.toFixed(1) + ' tok/s'
      : '—';
    // Context-budget arithmetic.  We report against the active
    // model's effectiveBudget — the same number that drives the
    // history trimmer — so the percentage tells the user how close
    // they are to history actually getting dropped.  Each model in
    // the catalog has its own contextTokens, so this number changes
    // when the user switches models.
    const budgetChars  = effectiveBudget(this._llm);
    const ctxPct       = budgetChars > 0
      ? Math.min(100, Math.round((inChars / budgetChars) * 100))
      : 0;
    const ctxBudgetTok = Math.round(budgetChars / 4);
    const t        = this._sessionTotals ?? { turns: 0, outputTokens: 0 };
    this._statsEl.textContent =
      `last turn: ~${inTok} in / ${outTok} out tok · ${ms}ms · ${tps}` +
      `\n` +
      `context: ~${inTok} / ~${ctxBudgetTok} tok (${ctxPct}% of budget)` +
      `\n` +
      `session: ${t.turns} turn${t.turns === 1 ? '' : 's'}, ${t.outputTokens} out tok`;
    // Visual cue when the budget is nearly full — the user can tell
    // at a glance that the next turn may drop older history.  Three
    // bands: green/default, amber when 75–95%, red when >95%.
    this._statsEl.classList.remove('cb-stats-warn', 'cb-stats-crit');
    if (ctxPct >= 95) this._statsEl.classList.add('cb-stats-crit');
    else if (ctxPct >= 75) this._statsEl.classList.add('cb-stats-warn');
    this._statsEl.classList.remove('hidden');
  }

  /* ---- Submit / tool-call loop ---- */

  /** Public entry point — submit a message to the chat as if the user
   *  had typed it into the chatbot's textarea and pressed Send.
   *  Used by the calculator's `?<text>` escape-prefix routing in
   *  commitEntry: typing `?how do I factor X^2-1` into the entry
   *  line and pressing ENTER fires `chatBot.sendUserMessage(...)`
   *  with everything after the `?`.
   *
   *  Behaviour matches Send-button submit exactly: blank text and
   *  not-ready model both no-op; mid-turn submissions queue; the
   *  user-bubble lands in the chat in submission order.  No-ops
   *  silently if consent hasn't been granted yet (the caller has
   *  no way to honour the gate from outside, so we just refuse). */
  async sendUserMessage(text) {
    const t = (text ?? '').trim();
    if (!t) {
      dlog('sendUserMessage: empty text, ignored');
      return;
    }
    if (!hasConsented()) {
      dlog('sendUserMessage: consent not given, ignored');
      return;
    }
    // Stuff into the input element so the existing _submit code path
    // does the work — that way queueing, send-button gating, scroll-
    // to-bottom, history push, etc. all behave identically to a
    // user-driven send.  We bypass the focus event (no UI change
    // needed for the textarea on this path) but keep everything
    // else.
    if (this._inputEl) this._inputEl.value = t;
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
    this._inputEl.style.height = '';            // collapse auto-grown height
    this._addUserBubble(text);

    if (this._generating) {
      // A turn is already in flight — queue this message.  The bubble
      // is rendered now (so the user sees their message at the bottom
      // of the chat in submission order); the actual _runLoop call
      // happens when the originating _submit drains the queue in its
      // finally block below.
      this._queue.push(text);
      dlog('submit: queued (queue depth=', this._queue.length, '):', text);
      return;
    }

    dlog('submit: starting turn:', text);
    this._setUIState('generating');
    try {
      await this._runLoop(text);
      // Drain any messages that were queued while we were running.
      // We process them one-at-a-time so each turn sees the
      // calculator state left by the previous turn (and history
      // built up by it), exactly as if the user had waited for each
      // response before sending the next.
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

  /* ---- Single-pass pipeline ---------------------------------------
     One user turn = ONE LLM call.  The model emits prose AND a JSON
     tool call in a single streamed response; the orchestrator
     extracts each part by string-matching the JSON brace-block.

     Single-call design: splitting reply, tool dispatch, and suggestion
     into separate LLM calls would rebuild the full system-prompt +
     history KV cache from scratch each time.  In browser WebGPU
     (small/mid models, 1B-3B), each additional create() risks wedging
     in WebLLM's incremental-prefill path ("Phase 2 silent for minutes,
     zero GPU usage" — see the worker comment around resetChat()).  A
     single streaming call avoids that stall surface, reduces prefill
     cost, and keeps prose and tool call coherent (the model sees both
     in one context window, preventing mismatches between what it says
     and what it dispatches).

     Format the model emits (enforced by SYSTEM_PROMPT_COMBINED):
         <one short prose sentence>
         {"name":"<tool>","arguments":{...}}
     For conceptual questions ("what does SWAP do?"), the JSON is
     omitted entirely and we skip dispatch.

     Display: the streaming bubble shows prose live, but the JSON
     portion is hidden as soon as the parser sees `{"name"` so the
     user never sees raw JSON in their chat.  Full text (incl. JSON)
     is what gets pushed into history — keeping the JSON in history
     reinforces the format on subsequent turns and gives the next-
     turn model a literal example of what it's expected to produce. */
  async _runLoop(userText) {
    const turnId = ++this._runId;
    const stale  = () => this._runId !== turnId;
    dlog('runLoop: enter turnId=', turnId, 'userText=', userText);

    // Inject current calculator state into the user message so every
    // turn starts with fresh stack/dir context.
    const ctx     = this._getContext();
    const ctxNote = this._formatContext(ctx);
    const content = ctxNote ? `${ctxNote}\n\n${userText}` : userText;
    this._history.push({ role: 'user', content });

    // Agentic outer loop — one user turn drives up to
    // MAX_TURN_ITERATIONS LLM calls.  Each iteration: generate a
    // reply, dispatch any tool calls, fold the results into history,
    // re-prompt the model so it can decide the next step.  The model
    // ends the workflow by emitting prose only (no JSON tool calls);
    // we also stop on user-cancel, stale (Stop pressed), or the cap.
    //
    // Cross-iteration state: bubble + SUGGEST chips from the FINAL
    // iteration are what we render once the workflow ends.
    let lastBubble = null;
    let lastSuggestions = null;
    let hitMaxIter = false;
    let outerIter = 0;
    outer: for (; outerIter < MAX_TURN_ITERATIONS; outerIter++) {
      dlog(`runLoop: outer iter ${outerIter + 1}/${MAX_TURN_ITERATIONS}`);

    // Generate-and-validate retry loop.
    //
    // Each iteration: build messages from the current history, stream
    // a response, parse out tool calls + suggestions, alias-resolve
    // the names, then check if any tool name is still unknown to the
    // registry.  If all known: break out and proceed to dispatch.  If
    // some unknown AND we have retries left: push a corrective user
    // message into history and run another iteration so the model can
    // fix its tool name.  After MAX_RETRY_ATTEMPTS the chain proceeds
    // anyway and the unknown-tool path in _dispatchTool surfaces the
    // error to the user — a graceful fallback so a permanently-
    // confused model doesn't trap us in an infinite loop.
    let bubble = null, textEl = null;
    let toolCalls = [];
    let suggestions = null;
    let prose = '';
    let display = '';
    let stalled = false;
    let trimmed = '';
    const MAX_RETRY_ATTEMPTS = 2;     // 1 initial + 1 retry
    let attempt = 0;
    while (attempt < MAX_RETRY_ATTEMPTS) {
      attempt++;

      const systemMsg = { role: 'system', content: SYSTEM_PROMPT_COMBINED };
      const keptHistory = this._trimHistoryForBudget(systemMsg);
      const messages = [systemMsg, ...keptHistory];
      this._logPhase(`combined attempt=${attempt}`, messages);

      // Each attempt builds its own streaming bubble — earlier
      // attempts stay visible in the chat above the retry note so the
      // user sees the full sequence (first reply → retry note → second
      // reply → tool dispatch).  Bubbles from prior attempts are never
      // mutated after their finalise.
      const stream = this._addStreamingBubble();
      bubble = stream.bubble;
      textEl = stream.textEl;
      let fullText = '';
      const watchdog = this._makeStallWatchdog();

      try {
        await this._llm.generate(messages, {
          onToken: (t) => {
            if (typeof t !== 'string' || !t) return;
            watchdog.onToken();
            fullText += t;
            // Strip <think>...</think> reasoning blocks BEFORE
            // computing what the user sees and where the machine-
            // readable section starts.  Reasoning-tuned models like
            // Qwen3 / DeepSeek-R1 emit a hidden chain-of-thought
            // before their visible answer; without stripping it
            // would flicker into the bubble, get fed to the tool-
            // call parser (a stray `{"name":` shape inside the
            // reasoning would be misread as a real tool call), and
            // pollute the history we save for next-turn context.
            // Recomputed each token because mid-stream a `<think>`
            // open tag may swallow tokens until its matching close
            // arrives — the offset of the visible region is not a
            // monotonic prefix of fullText.
            const cleaned = stripThinkBlocks(fullText);
            const idx = findMachineSectionStart(cleaned);
            const visible = idx >= 0
              ? cleaned.slice(0, idx).trim()
              : cleaned.trim();
            textEl.textContent = visible || '…';
          },
        });
      } catch (err) {
        watchdog.stop();
        const cleaned = stripThinkBlocks(fullText).trim();
        const errDisplay = err.message === 'AbortError' ? cleaned : `⚠ ${err.message}`;
        this._finaliseStreamBubble(bubble, textEl, errDisplay, null);
        if (cleaned) this._history.push({ role: 'assistant', content: cleaned });
        dwarn('runLoop: generate threw:', err.message);
        return;
      }
      watchdog.stop();

      // Stale = user hit Stop (or _newChat) mid-stream.  Finalise
      // whatever prose made it through with a "(stopped)" badge
      // and return — no dispatch, no retry.  History push is
      // skipped because the turn was cancelled.  (For _newChat,
      // the messages container gets wiped right after this anyway.)
      if (stale()) {
        const cleaned = stripThinkBlocks(fullText);
        const idx = findMachineSectionStart(cleaned);
        const visiblePart = idx >= 0
          ? cleaned.slice(0, idx).trim()
          : cleaned.trim();
        this._finaliseStreamBubble(bubble, textEl, visiblePart, null,
                                   { state: 'stopped' });
        dlog('runLoop: stale after generate, finalised stopped bubble');
        return;
      }

      stalled = watchdog.isStalled();
      // Cleaned text is the canonical view from this point on — the
      // bubble body, the prose/JSON split, the tool-call and SUGGEST
      // parsers, and the history push all operate on it.  fullText
      // is retained only for the dlog below (so a debugging session
      // can see how much got stripped vs how much was kept).
      const cleanedText  = stripThinkBlocks(fullText);
      trimmed = cleanedText.trim();
      const hideStart = findMachineSectionStart(cleanedText);
      dlog(`runLoop: attempt ${attempt} returned ${fullText.length} chars`,
           `(${cleanedText.length} after stripping <think> blocks),`,
           `stalled=${stalled}, hideStart=${hideStart}`);

      const proseRaw = hideStart >= 0 ? cleanedText.slice(0, hideStart) : cleanedText;
      prose      = proseRaw.trim();
      toolCalls  = parseAllToolCalls(cleanedText);
      suggestions = parseSuggestions(cleanedText);
      // Apply the alias map up front, BEFORE deciding whether to
      // retry — saves a retry round-trip on the most frequent
      // failure mode where the model just used a near-synonym
      // ("add_to_stack" → "push_to_stack").  Retry only fires for
      // names that are unknown even after alias resolution.
      for (const tc of toolCalls) {
        const aliased = TOOL_ALIASES[tc.name];
        if (aliased) {
          dlog('runLoop: alias-resolve', tc.name, '→', aliased);
          tc.name = aliased;
        }
      }
      dlog(`runLoop: attempt ${attempt} extracted ${toolCalls.length} tool call(s)`,
           toolCalls.map(c => c.name),
           'suggestions=', suggestions);

      // Compute the body for THIS attempt's bubble (whether or not
      // we'll retry; the bubble stays visible in the chat regardless).
      if (stalled) {
        display = prose
          || (toolCalls.length > 0
              ? `Partial response — ${toolCalls.length} tool call(s) detected before timeout.`
              : 'Model timed out before producing any output. Consider switching to a smaller model.');
      } else if (prose) {
        display = prose;
      } else if (toolCalls.length > 0) {
        display = toolCalls.length === 1
          ? `Running ${toolCalls[0].name}.`
          : `Running ${toolCalls.length} actions.`;
      } else {
        display = '_(model returned no output — try rephrasing.)_';
      }
      this._finaliseStreamBubble(
        bubble, textEl, display, null,
        stalled ? { state: 'stalled' } : undefined,
      );
      // Push the response to history every attempt — even the ones
      // we're about to retry.  The corrective user message we'll
      // inject below references "your previous response", so the
      // previous response needs to actually be in the conversation
      // log for the model to revise.  Note: `trimmed` is already
      // post-strip-think-blocks (see assignment above), so the
      // model's hidden reasoning trace is NOT included in history —
      // saving context budget AND avoiding accidental influence on
      // subsequent turns from a previous turn's chain-of-thought.
      this._history.push({ role: 'assistant', content: trimmed });

      // Validate tool names against the registry.  An empty toolCalls
      // array (conceptual question, no tool needed) is valid.
      const unknownNames = toolCalls
        .filter((c) => !this._registry[c.name])
        .map((c) => c.name);
      if (unknownNames.length === 0) {
        break;   // All clean — proceed to dispatch.
      }
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        dwarn('runLoop: retries exhausted; proceeding with',
              unknownNames.length, 'unknown tool(s):', unknownNames);
        break;
      }
      // Retry path: corrective user message + visible chip-style note
      // so the user knows what's happening.  Loop iteration will
      // rebuild messages from the now-augmented history.
      const validNames = Object.keys(this._registry);
      this._addRetryNote(
        `Retrying — assistant proposed unknown tool${unknownNames.length === 1 ? '' : 's'}: ${unknownNames.join(', ')}`,
      );
      this._history.push({
        role: 'user',
        content:
          `Your previous response used tool name${unknownNames.length === 1 ? '' : 's'} that don't exist: ` +
          `${unknownNames.map((n) => `"${n}"`).join(', ')}. ` +
          `The ONLY valid tool names are: ${validNames.join(', ')}. ` +
          `Please regenerate the response using a valid tool name. ` +
          `Re-emit the prose preamble + JSON tool call(s) in the same format as before.`,
      });
      dlog('runLoop: retrying attempt=', attempt + 1, 'after unknown:', unknownNames);
    }

    // Carry this iteration's bubble + chips forward so the FINAL
    // iteration's values are what we render at the end of the turn.
    lastBubble = bubble;
    if (suggestions) lastSuggestions = suggestions;

    if (toolCalls.length === 0) {
      // Model emitted prose only — the "workflow complete" signal.
      // Also covers conceptual questions ("what does SWAP do?") on
      // the first iteration: same code path, same exit.
      dlog(`runLoop: iter ${outerIter + 1} produced no tool calls — workflow complete`);
      break outer;
    }

    // Dispatch in document order.  Each iteration awaits the full
    // tool lifecycle (confirm widget render → user click → handler
    // execute → history note).  Three exit conditions stop the
    // chain mid-flight:
    //   1. stale()  — Stop pressed or new chat reset
    //   2. cancel   — _dispatchTool returns false on user-cancelled
    //                 confirm; the user rejected this step, so any
    //                 follow-up steps that depended on it would be
    //                 surprising at best, destructive at worst
    //   3. unknown  — _dispatchTool also returns false on unknown
    //                 tool names, to avoid spamming bubbles for
    //                 every malformed call in a bad chain
    let chainBroken = false;
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      dlog(`runLoop: iter ${outerIter + 1} dispatching tool ${i + 1}/${toolCalls.length}:`, tc.name);
      const ok = await this._dispatchTool(tc);
      if (stale()) {
        dlog('runLoop: stale after tool dispatch, exit (skipped',
             toolCalls.length - i - 1, 'remaining call(s))');
        return;
      }
      if (!ok) {
        dlog('runLoop: dispatch returned false (cancel or unknown), aborting chain (skipped',
             toolCalls.length - i - 1, 'remaining call(s))');
        chainBroken = true;
        break;
      }
    }
    if (chainBroken) break outer;

    // About to iterate again.  Inject a synthetic user turn so the
    // next assistant turn doesn't sit adjacent to the previous one
    // in history — most chat templates (Llama / Qwen / Mistral)
    // require strict user/assistant alternation, and two adjacent
    // assistant messages will silently misbehave on the NEXT prefill.
    // See _pushHistoryNote's comment for the canonical incident.
    //
    // On the LAST allowed iteration, skip the synthetic message and
    // flag hitMaxIter — there'll be no further LLM call, so no
    // alternation to maintain, and the user gets a "cap reached" note.
    if (outerIter + 1 < MAX_TURN_ITERATIONS) {
      this._history.push({
        role: 'user',
        content: '[Continue the workflow if more steps are needed, or respond with prose only — no JSON tool calls — to indicate the workflow is complete.]',
      });
    } else {
      hitMaxIter = true;
    }
    }   // end outer:

    if (hitMaxIter) {
      this._addRetryNote(`Reached workflow iteration cap (${MAX_TURN_ITERATIONS}); stopping.`);
    }

    // Render follow-up suggestions (if any) as chips below the
    // turn's output.  Click-handler is _sendChip, which submits the
    // chip text as a new user message — so the model gets a fresh
    // turn with the user's stated intent.  Suggestions are NOT
    // dispatched automatically; that's the whole point of routing
    // them through the chip-suggestion channel rather than the
    // tool-call channel.
    if (!stale() && lastSuggestions?.length) {
      dlog('runLoop: rendering', lastSuggestions.length, 'suggestion chip(s)');
      this._renderChips(lastSuggestions, lastBubble);
    }
    dlog(`runLoop: turnId=`, turnId, `complete after ${outerIter + 1} iter(s)`);
  }

  /** Dispatch a parsed tool call through the registry.  Renders a
   *  confirm widget for mutating tools, executes, then appends a
   *  natural-language summary of what happened to history (so the
   *  *next* user turn's model sees coherent prose alongside its
   *  previous JSON tool call, not just raw structured output).
   *
   *  Returns:
   *   - `true`  on success (confirmed + ran, or read-only auto-exec —
   *     including handler failures, since "ran but errored" is still
   *     a definitive outcome the chain shouldn't preempt)
   *   - `false` if the user cancelled the confirm widget — a signal
   *     to the caller (multi-call dispatch loop in _runLoop) that the
   *     user has rejected this action and any chained follow-up
   *     actions should NOT run either
   *
   *   Unknown tools also return `false` so a chain doesn't keep
   *   producing diagnostic bubbles for each malformed call.
   */
  async _dispatchTool(toolCall) {
    // Cheap pre-pass: rewrite common synonyms to their actual
    // registry name BEFORE looking up the tool.  Saves a full
    // unknown-tool / retry round-trip on the most frequent failure
    // mode where the model says e.g. `add_to_stack` instead of
    // `push_to_stack`.  Logged when it fires so the trace shows the
    // remap; the rewritten name is what gets dispatched and recorded
    // in the history note.
    const aliasedName = TOOL_ALIASES[toolCall.name];
    if (aliasedName) {
      dlog('dispatchTool: alias rewrite', toolCall.name, '→', aliasedName);
      toolCall = { ...toolCall, name: aliasedName };
    }

    const tool = this._registry[toolCall.name];
    const args = toolCall.arguments ?? {};
    dlog('dispatchTool: name=', toolCall.name, 'args=', args,
         'confirm=', !!tool?.confirm, 'known=', !!tool);

    if (!tool) {
      dwarn('dispatchTool: unknown tool', toolCall.name);
      this._addAssistantBubble(`_(unknown tool: \`${toolCall.name}\`.)_`);
      this._pushHistoryNote(`(Tried to use unknown tool "${toolCall.name}".)`);
      return false;
    }

    if (tool.confirm) {
      const summary = tool.summary(args);
      // `complete` flips the widget out of "Running…" once the
      // handler returns.  Without this call the button stays stuck
      // on the interim label forever, even though the tool has
      // actually finished executing.  Cancel path is handled by the
      // cancel button's own click listener (it sets "✗ Cancelled"
      // before resolve(false)), so we only call complete() on the
      // run path.
      // Rerun closure — captured here so the widget can re-invoke the
      // same handler+args after the initial confirmation flow has
      // completed.  Pushes a fresh history note each rerun so the
      // conversation log reflects every actual execution (the user
      // explicitly asked for the action to happen again).
      const rerun = async () => {
        try {
          const result = await tool.handler(args);
          const note = this._summariseToolResult(toolCall.name, args, result);
          this._pushHistoryNote(note);
          dlog('dispatchTool: rerun success', toolCall.name);
        } catch (err) {
          this._pushHistoryNote(`(Re-running ${toolCall.name} failed: ${err.message}.)`);
          dwarn('dispatchTool: rerun handler threw for', toolCall.name, err);
          throw err;
        }
      };
      const { complete } = this._addToolWidgetBubble({
        name: toolCall.name, ...summary, onRerun: rerun,
      });
      dlog('dispatchTool: awaiting user confirmation for', toolCall.name);
      const confirmed = await new Promise((resolve) => {
        this._pendingConfirm = { resolve };
      });
      this._pendingConfirm = null;
      if (!confirmed) {
        dlog('dispatchTool: user cancelled', toolCall.name, '— chain will stop');
        this._pushHistoryNote(`(User cancelled the proposed ${toolCall.name} action.)`);
        return false;
      }
      dlog('dispatchTool: user confirmed, executing', toolCall.name);
      try {
        const result = await tool.handler(args);
        complete(true, '✓ Done');
        const note = this._summariseToolResult(toolCall.name, args, result);
        this._pushHistoryNote(note);
        dlog('dispatchTool: success', toolCall.name, 'note=', note);
      } catch (err) {
        complete(false, `✗ ${err.message ?? 'Failed'}`);
        this._pushHistoryNote(`(Running ${toolCall.name} failed: ${err.message}.)`);
        dwarn('dispatchTool: handler threw for', toolCall.name, err);
      }
      return true;
    }

    // Read-only — execute silently.
    dlog('dispatchTool: read-only auto-exec', toolCall.name);
    try {
      const result = await tool.handler(args);
      const note = this._summariseToolResult(toolCall.name, args, result);
      this._pushHistoryNote(note);
      dlog('dispatchTool: read-only success', toolCall.name, 'note=', note);
    } catch (err) {
      this._pushHistoryNote(`(Reading ${toolCall.name} failed: ${err.message}.)`);
      dwarn('dispatchTool: read-only handler threw for', toolCall.name, err);
    }
    return true;
  }

  /** Append a short natural-language note to history as if the
   *  assistant said it.  Tiny models parse plain prose far better than
   *  structured `<tool_response>` JSON, so we collapse tool execution
   *  into one human-readable sentence per turn. */
  _pushHistoryNote(text) {
    if (!text) return;
    // CRITICAL: fold the note INTO the preceding assistant message
    // when one exists, instead of pushing a new assistant entry.
    //
    // Why: Llama / Qwen / most chat templates expect strict
    // user-assistant alternation.  Two back-to-back assistant
    // messages (the model's reply with embedded JSON, then a
    // separate tool-result note) trip the template — sometimes
    // visible as MessageOrderError, more often as silent
    // misbehaviour where the *next* turn produces empty / nonsense
    // output.  This was the cause of "prompts after the first tool
    // run don't work at all" reports: turn 2's prompt looked like
    // [system, user(t1), assistant(t1+json), assistant(tool_note),
    // user(t2)] — the chat template can't render the consecutive
    // assistants and the model effectively sees garbage.
    //
    // Folding the note into the previous assistant turn keeps the
    // sequence strictly alternating.  When the most recent entry
    // isn't an assistant (e.g. an unknown-tool note arrived first),
    // we fall back to a fresh assistant push — that case still has
    // two adjacent assistants if the model speaks again, but it's
    // a minor edge case and the fold catches the common path.
    const last = this._history[this._history.length - 1];
    if (last && last.role === 'assistant') {
      last.content = last.content
        ? `${last.content}\n${text}`
        : text;
    } else {
      this._history.push({ role: 'assistant', content: text });
    }
  }

  /** Convert a tool's structured result into a one-line English
   *  summary the model can grok.  Falls back to JSON for unknown
   *  shapes — better that than nothing. */
  _summariseToolResult(name, args, result) {
    const r = result ?? {};
    if (name === 'run' && r.success) {
      const stack = Array.isArray(r.stack) ? r.stack : [];
      const head  = stack.slice(0, 3).map((v, i) => `${i + 1}: ${v}`).join(', ');
      return stack.length
        ? `(Ran \`${args.text}\`. Stack now: ${head}${stack.length > 3 ? ', …' : ''}.)`
        : `(Ran \`${args.text}\`. Stack is empty.)`;
    }
    if (name === 'push_to_stack' && r.success) {
      const stack = Array.isArray(r.stack) ? r.stack : [];
      const head  = stack.slice(0, 3).map((v, i) => `${i + 1}: ${v}`).join(', ');
      return stack.length
        ? `(Pushed \`${args.value}\`. Stack now: ${head}${stack.length > 3 ? ', …' : ''}.)`
        : `(Pushed \`${args.value}\`. Stack is empty.)`;
    }
    if (name === 'append_to_editor' && r.success) {
      return `(Editor now contains: \`${r.buffer}\`.)`;
    }
    if (name === 'clear_editor' && r.success) {
      return '(Editor cleared.)';
    }
    if (name === 'get_stack') {
      const stack = Array.isArray(r.stack) ? r.stack : [];
      return stack.length
        ? `(Stack: ${stack.slice(0, 3).map((v, i) => `${i + 1}: ${v}`).join(', ')}.)`
        : '(Stack is empty.)';
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
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[ChatBot] → Phase ${label}`);
    // eslint-disable-next-line no-console
    console.log('messages:', messages);
    // eslint-disable-next-line no-console
    console.log('total chars:', messages.reduce((n, m) => n + (m.content?.length ?? 0), 0));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  /** Select which messages from `this._history` to send on the next
   *  turn, given the HISTORY_BUDGET_CHARS cap.
   *
   *  Policy (matches the contract requested in chat):
   *   - The system prompt is ALWAYS included (passed in as `systemMsg`
   *     so we can subtract its size from the budget).
   *   - All history messages are included by default; only when the
   *     total would exceed the budget do we drop messages.
   *   - When dropping, OLDER messages go first.  The most recent turn
   *     is sacrosanct — it's the one the user just typed and the
   *     assistant's reply directly follows from it — and is included
   *     even when it alone exceeds the budget.
   *
   *  Implementation walks history newest-to-oldest, accumulating
   *  characters until the budget is hit; then reverses to chronological
   *  order so the model sees the conversation in the natural reading
   *  direction.  We don't try to keep user/assistant pairs together —
   *  if a tool-result note ends up orphaned from its preceding
   *  assistant turn, the model will re-orient on the next user turn
   *  anyway, and the alternative (skipping pairs) wastes budget on
   *  preserving boundaries the model doesn't strictly need.
   *
   *  Returns a new array (does NOT mutate this._history). */
  _trimHistoryForBudget(systemMsg) {
    const totalBudget = effectiveBudget(this._llm);
    const budget = totalBudget - (systemMsg.content?.length ?? 0);
    if (budget <= 0) {
      // Pathological: system prompt alone already exceeds the
      // active model's effective budget (i.e. the model's context
      // window minus the response reserve).  Send only the most
      // recent message so the turn at least happens; loud warning
      // so the user can switch to a model with more context.
      dwarn('history-trim: system prompt alone is', systemMsg.content?.length, 'chars',
            '(>= budget', totalBudget, ') — sending only the latest message;',
            'consider switching to a model with a larger contextTokens setting');
      return this._history.slice(-1);
    }
    const kept = [];
    let total = 0;
    for (let i = this._history.length - 1; i >= 0; i--) {
      const m = this._history[i];
      const size = m.content?.length ?? 0;
      // Always include the most recent message even if it alone blows
      // the budget — kept.length === 0 forces the first iteration in.
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

  /** Build a stall watchdog for the active generate() call.
   *
   *  Returns { onToken, stop, isStalled } — the caller should:
   *   - call onToken() from inside their generate()'s onToken cb to
   *     reset the silence timer on each streamed token,
   *   - call stop() in their finally block to clear the timer,
   *   - check isStalled() after generate() resolves to know whether
   *     the phase ran to completion or was aborted by the watchdog.
   *
   *  When `stallMs` of silence elapses with no tokens, the watchdog
   *  fires _llm.abort() to break the worker's for-await stream.
   *  That makes the worker post `done`, which resolves the generate
   *  promise normally — so phases don't need a separate catch path
   *  for stall, just a post-resolve isStalled() check if they want
   *  to surface "stalled" in the UI.
   */
  _makeStallWatchdog(stallMs = STALL_TIMEOUT_MS) {
    dlog('watchdog: armed (stallMs=', stallMs, ')');
    const state = { stalled: false, timer: null };
    const reset = () => {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.stalled = true;
        dwarn(`watchdog: FIRED after ${stallMs}ms of silence — calling _llm.abort()`);
        this._llm.abort();
      }, stallMs);
    };
    reset();   // start the clock; counts the prefill window too
    return {
      onToken:   reset,
      stop:      () => {
        clearTimeout(state.timer);
        dlog('watchdog: stopped (stalled=', state.stalled, ')');
      },
      isStalled: () => state.stalled,
    };
  }

  _abort() {
    dwarn('abort: stop pressed (generating=', this._generating,
          'pendingConfirm=', !!this._pendingConfirm,
          'queueDepth=', this._queue.length, ')');
    // Bump _runId BEFORE we abort the in-flight generate.  Each phase
    // captures its own turnId locally; bumping the canonical _runId
    // makes every subsequent `stale()` check inside _runLoop and the
    // active phase fire and unwind early — without this, abort only
    // cancels the *current* generate() call, the phase's post-resolve
    // code still runs, and _runLoop happily proceeds to the next
    // phase as if nothing happened.  With the bump, the chain is:
    //   abort → worker breaks stream → main resolves generate →
    //   phase's stale() check returns true → phase returns null →
    //   _runLoop's stale() check returns → _submit's finally runs →
    //   UI back to idle.
    this._runId++;
    this._llm.abort();
    // Also resolve any pending confirmation as cancelled.
    if (this._pendingConfirm) {
      this._pendingConfirm.resolve(false);
      this._pendingConfirm = null;
    }
    // Stop = halt EVERYTHING — drop any queued messages too, so the
    // user isn't surprised by them being processed after they hit
    // stop on the visibly-active turn.
    this._queue = [];
  }

  /* ---- Context formatting ---- */

  _formatContext(ctx) {
    if (!ctx) return '';
    const lines = ['[Calculator state]'];
    // Stack is rendered multi-line with an explicit "1: = top"
    // annotation.  Two reasons for this format:
    //
    //   1. RPN convention: level 1 is the TOP of the stack (the most
    //      recently pushed value, the one the next binary op consumes
    //      first).  But visually on the HP50 display, level 1 sits at
    //      the BOTTOM of the screen with deeper levels above it — a
    //      classic "stacks are upside-down" gotcha.  Telling the
    //      model "1: = top, deeper levels are below" up front
    //      prevents it from guessing the wrong direction when a user
    //      says "swap the top two" or "the bottom of the stack".
    //
    //   2. Multi-line layout puts each level on its own row so the
    //      model can match levels to operations more easily than a
    //      space-separated single line where the levels visually run
    //      together.  Costs a few extra tokens per turn for a much
    //      clearer mental model — worth it.
    if (ctx.stack?.length > 0) {
      lines.push('Stack (level 1 is the TOP of stack — operators consume from level 1 first; higher numbers are deeper):');
      for (let i = 0; i < ctx.stack.length; i++) {
        const marker =
          i === 0                       ? '   ← top of stack' :
          i === ctx.stack.length - 1    ? '   ← bottom of stack' : '';
        lines.push(`  ${i + 1}: ${ctx.stack[i]}${marker}`);
      }
    } else {
      lines.push('Stack: (empty)');
    }
    const flags = [];
    if (ctx.angleMode)   flags.push(`Angle: ${ctx.angleMode}`);
    if (ctx.displayMode) flags.push(`Display: ${ctx.displayMode}`);
    if (ctx.dir)         flags.push(`Dir: ${ctx.dir}`);
    if (flags.length) lines.push(flags.join('  '));
    return lines.join('\n');
  }

  /* ---- Bubble helpers ---- */

  _addUserBubble(text) {
    // Any active chips belong to the previous turn — drop them before
    // the new user bubble lands so they don't sit awkwardly above.
    this._removeActiveChips();
    const el = document.createElement('div');
    el.className = 'cb-bubble cb-bubble-user';
    el.textContent = text;
    this._messagesEl.appendChild(el);
    this._scrollBottom();
  }

  _addAssistantBubble(markdownText) {
    const el = document.createElement('div');
    el.className = 'cb-bubble cb-bubble-assistant';
    el.appendChild(renderMarkdown(markdownText));
    this._messagesEl.appendChild(el);
    this._scrollBottom();
    return el;
  }

  /** Inline retry-status row, shown between the failed attempt's
   *  bubble and the retry's bubble.  Quieter visual treatment than a
   *  full bubble — it's a system-level indication, not part of the
   *  user/assistant conversation flow.  Class lives in calc.css. */
  _addRetryNote(text) {
    const el = document.createElement('div');
    el.className = 'cb-retry-note';
    el.textContent = `↻ ${text}`;
    this._messagesEl.appendChild(el);
    this._scrollBottom();
    return el;
  }

  // (Previously: _renderInlinePill — animated status pill with a live
  // token counter, used while Phase 2 / Phase 3 ran silently.  Removed
  // along with the three-phase pipeline; the single combined call
  // streams its output into a regular bubble, so the live token feedback
  // is the bubble's own text update.  CSS for .cb-inline-pill* in
  // calc.css is left in place in case the pill machinery is needed
  // again — it has no callers and is harmless until then.)

  /** A bubble that contains only a tool-call confirmation widget — no
   *  prose.  The prose lives in the streaming reply bubble that
   *  preceded this one; the proposed action gets its own card so the
   *  Run / Cancel buttons are visually distinct from the model's
   *  natural-language explanation.
   *  Returns `{ bubble, complete }` — `complete(ok, label)` flips the
   *  widget out of its in-flight "Running…" state once the handler
   *  finishes; see `_buildToolCallWidget`'s docstring for the
   *  contract. */
  _addToolWidgetBubble({ name, label, code, onRerun }) {
    const bubble = document.createElement('div');
    bubble.className = 'cb-bubble cb-bubble-assistant cb-bubble-tool';
    const { widget, complete } = this._buildToolCallWidget({
      name, label, code, onRerun,
    });
    bubble.appendChild(widget);
    this._messagesEl.appendChild(bubble);
    this._scrollBottom();
    return { bubble, complete };
  }

  /** Create an in-progress streaming bubble.  Returns refs to update it. */
  _addStreamingBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'cb-bubble cb-bubble-assistant cb-bubble-streaming';

    const textEl = document.createElement('span');
    textEl.className = 'cb-stream-text';
    textEl.textContent = '…';
    bubble.appendChild(textEl);

    const cursor = document.createElement('span');
    cursor.className = 'cb-cursor';
    bubble.appendChild(cursor);

    this._messagesEl.appendChild(bubble);
    this._scrollBottom();
    return { bubble, textEl };
  }

  /** Replace the streaming span with rendered markdown + optional tool-call widget. */
  _finaliseStreamBubble(bubble, _textEl, cleanText, toolCall, opts = {}) {
    bubble.classList.remove('cb-bubble-streaming');
    bubble.innerHTML = '';

    if (cleanText) {
      const mdFrag = renderMarkdown(cleanText);
      bubble.appendChild(mdFrag);
    }

    if (toolCall) {
      // Legacy path — current pipeline always passes toolCall=null
      // here and renders the widget in a separate bubble via
      // _addToolWidgetBubble.  Kept for symmetry; the `complete`
      // handle is intentionally unused because nothing in this code
      // path awaits the tool.
      const { widget } = this._buildToolCallWidget(toolCall);
      bubble.appendChild(widget);
    }

    // Distinct visual treatment when a finalisation is the result of
    // a watchdog timeout or a user-stop.  The CSS class adds a
    // coloured left border + tinted background and the badge spells
    // out the cause inside the bubble — so the stall is obvious at a
    // glance, not buried in the body text the way the prior italic-
    // underscore hint was.  `opts.state` is one of:
    //   'stalled' — watchdog fired (model went silent past
    //                STALL_TIMEOUT_MS); user did not press Stop
    //   'stopped' — user pressed Stop or hit New Chat mid-stream
    //   undefined — normal completion, no decoration
    if (opts.state === 'stalled' || opts.state === 'stopped') {
      bubble.classList.add(opts.state === 'stalled'
        ? 'cb-bubble-stalled'
        : 'cb-bubble-stopped');
      const badge = document.createElement('div');
      badge.className = 'cb-bubble-status-badge';
      badge.textContent = opts.state === 'stalled'
        ? `⚠ Timed out — model went silent for ${Math.round(STALL_TIMEOUT_MS / 1000)}s. ${cleanText ? 'Partial output shown above.' : 'No output produced.'}`
        : `■ Stopped by user. ${cleanText ? 'Partial output shown above.' : 'No output produced.'}`;
      bubble.appendChild(badge);
    }

    this._scrollBottom();
  }

  /* ---- Suggestion chips ----
     Chips render *under* the most recent assistant bubble.  Only one
     strip is visible at a time — submitting (or clicking another chip)
     removes the previous strip.  Clicking a chip submits it as the
     user's next message. */

  /** Render a horizontal strip of chips below the messages list, or
   *  immediately after `after` if given.  Returns the strip element so
   *  callers can position other content relative to it. */
  _renderChips(items, after = null) {
    this._removeActiveChips();
    if (!items || items.length === 0) return null;

    const wrap = document.createElement('div');
    wrap.className = 'cb-chips';
    for (const item of items) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cb-chip';
      chip.textContent = item;
      chip.addEventListener('click', () => this._sendChip(item));
      wrap.appendChild(chip);
    }

    if (after && after.parentNode === this._messagesEl) {
      this._messagesEl.insertBefore(wrap, after.nextSibling);
    } else {
      this._messagesEl.appendChild(wrap);
    }
    this._activeChipsEl = wrap;
    this._scrollBottom();
    return wrap;
  }

  _removeActiveChips() {
    if (this._activeChipsEl?.parentNode) {
      this._activeChipsEl.parentNode.removeChild(this._activeChipsEl);
    }
    this._activeChipsEl = null;
  }

  _sendChip(text) {
    if (this._llm.status !== 'ready') return;
    // No _generating guard — _submit() handles re-entry by queueing,
    // so a chip click during an active turn now enqueues like any
    // other user message instead of being dropped.
    this._removeActiveChips();
    this._inputEl.value = text;
    this._submit();
  }

  /** Build a tool-call confirmation widget.
   *
   *  Returns `{ widget, complete }` rather than a bare DOM node:
   *    - `widget`   — the element to insert into the message list.
   *    - `complete(ok, label)` — call this AFTER the tool handler
   *      finishes (or throws) to flip the button out of its
   *      "✓ Running…" state.  Without it the button is stuck on
   *      "Running…" forever, which is misleading because the tool
   *      has actually completed by then — the widget just never got
   *      told.  Cancel and Run-then-await both flow through this
   *      helper so the disabled-state contract stays uniform.
   *
   *  The click handlers themselves only resolve the pending-confirm
   *  promise and disable both buttons — they DO NOT set a final
   *  label.  That's `complete()`'s job, called from `_dispatchTool`
   *  with the actual outcome.  This avoids the previous footgun
   *  where the click handler optimistically wrote "✓ Running…" and
   *  the dispatch path had no way to overwrite it. */
  _buildToolCallWidget({ name, label, code, onRerun }) {
    const widget = document.createElement('div');
    widget.className = 'cb-action-widget';

    const labelEl = document.createElement('div');
    labelEl.className = 'cb-action-label';
    labelEl.textContent = label || `Tool: ${name}`;
    widget.appendChild(labelEl);

    if (code) {
      const pre = document.createElement('pre');
      pre.className = 'cb-action-code';
      pre.textContent = code;
      widget.appendChild(pre);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'cb-action-btns';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'cb-btn-confirm';
    confirmBtn.textContent = '▶ Run';
    // Capture click time so complete() can enforce a 1s minimum
    // disabled window — fast handlers (push a number, clear the
    // editor) otherwise complete in <50 ms and the user gets no
    // visible feedback that anything happened.
    let runStartedAt = null;
    confirmBtn.addEventListener('click', async () => {
      // First click: drive the initial confirmation flow.  Once
      // _pendingConfirm has been resolved, _completed flips to true
      // (after complete() runs); subsequent clicks then go through
      // the rerun branch below, which re-invokes the captured handler
      // directly without involving the dispatch loop.
      if (this._pendingConfirm) {
        runStartedAt = Date.now();
        confirmBtn.disabled = true;
        cancelBtn.disabled  = true;
        this._pendingConfirm.resolve(true);
        return;
      }
      if (_completed && onRerun) {
        runStartedAt = Date.now();
        confirmBtn.disabled = true;
        // Reset for another complete() cycle.
        _completed = false;
        widget.classList.remove('cb-action-done', 'cb-action-failed');
        try {
          await onRerun();
          complete(true);
        } catch {
          complete(false);
        }
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cb-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (!this._pendingConfirm) return;
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      cancelBtn.textContent = '✗ Cancelled';
      this._pendingConfirm.resolve(false);
    });

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn);
    widget.appendChild(btnRow);

    // Mark the widget done.  Called from _dispatchTool with the
    // outcome of the handler so the user sees a definite end state
    // rather than the in-flight "Running…" label.  Idempotent — safe
    // to call multiple times; only the first call has visible
    // effect.
    let _completed = false;
    const complete = (ok /* , _finalLabel */) => {
      if (_completed) return;
      _completed = true;
      // Enforce a min 1s disabled window so fast handlers still flash
      // the interim state visibly.  After that, relabel to "↻ Rerun"
      // and re-enable so the user can re-execute the same action; the
      // widget also picks up a done/failed CSS class for distinction.
      const elapsed   = Date.now() - (runStartedAt ?? Date.now());
      const remaining = Math.max(0, 1000 - elapsed);
      setTimeout(() => {
        confirmBtn.disabled = onRerun ? false : true;
        confirmBtn.textContent = '↻ Rerun';
        widget.classList.add(ok ? 'cb-action-done' : 'cb-action-failed');
      }, remaining);
    };

    return { widget, complete };
  }

  /* ---- UI state ---- */

  _setUIState(state) {
    this._generating = (state === 'generating');
    // Send button is gated only on model readiness — NOT on
    // _generating — so the user can submit additional messages while
    // a turn is in flight.  _submit() routes those into _queue, and
    // the active _submit drains the queue when its current turn
    // finishes.  Input stays enabled for the same reason.
    if (this._sendBtn) this._sendBtn.disabled = this._llm.status !== 'ready';
    if (this._stopBtn) this._stopBtn.classList.toggle('hidden', !this._generating);
    if (this._inputEl) this._inputEl.disabled = false;
  }

  _scrollBottom() {
    if (this._messagesEl) {
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    }
  }
}
