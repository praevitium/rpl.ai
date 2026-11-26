// What the assistant's replies carry besides prose: tool calls, the SUGGEST line and think blocks, plus the
// clean-up that turns model-written RPL into what the entry line accepts.
import { hpCodesToGlyphs } from '../rpl/hp-text.js';

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

export function splitReply(text) {
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

export function infixHint(code) {
  return looksInfix(code)
    ? ' Hint: that reads as an INFIX formula; bare RPL is postfix (10 321 ^ 1 -). To evaluate an infix expression wrap it in backticks and append EVAL (or →NUM for a decimal): `(10*(10^321-1)/9)-321` EVAL.'
    : '';
}
