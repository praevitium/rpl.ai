/* =================================================================
   Command reference as plain text — the AI assistant's lookup surface.

   command-help.js parses docs/hp50-commands.html into DOM fragments
   for the on-screen popup.  This module parses the same file into a
   plain-text index (no DOM, so it also runs under Node) so the chat
   assistant can look up what a command does, what it expects on the
   stack, and what it returns, then hand that text to the model.
   ================================================================= */

import { ALIASES, headingKey } from './command-help.js';
import { fuzzyScore } from './op-search.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}

/** Flatten one `<dd class="cmd-field …">` body to readable text.
 *  Paragraphs, list items and `<pre>` lines each land on their own
 *  line; `cmd-io` tables become `args → results` rows and `cmd-kv`
 *  tables become `Command: … / Result: …` lines. */
export function htmlToText(html) {
  let s = String(html ?? '');
  s = s.replace(/<table class="cmd-io">[\s\S]*?<\/table>/g, (t) => {
    const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((m) => m[1])
      .filter((r) => !/<th/.test(r));
    return rows.map((r) => {
      const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => cleanInline(m[1]));
      const arrow = cells.indexOf('→');
      if (arrow < 0) return cells.join(' ');
      const lhs = cells.slice(0, arrow).join(' ') || '(nothing)';
      const rhs = cells.slice(arrow + 1).join(' ') || '(nothing)';
      return `${lhs} → ${rhs}`;
    }).join('\n') + '\n';
  });
  s = s.replace(/<table class="cmd-kv">[\s\S]*?<\/table>/g, (t) => {
    return [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m) => `${cleanInline(m[1])}: ${cleanInline(m[2])}`)
      .join('\n') + '\n';
  });
  s = s.replace(/<li[^>]*>/g, '\n- ').replace(/<\/li>/g, '\n');
  s = s.replace(/<\/(p|pre|div|tr|ul)>/g, '\n');
  s = s.replace(/<br\s*\/?>/g, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function cleanInline(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Parse the whole reference document into a Map keyed by upper-cased
 *  command name.  Each entry:
 *    { name, inApp, type, description, input, output, io, flags,
 *      example, seeAlso: string[] }
 *  Text fields are '' when the section lacks them.  First heading wins
 *  on duplicate names (mirrors command-help.js). */
export function parseCommandReference(html) {
  const map = new Map();
  const src = String(html ?? '');
  const heads = [...src.matchAll(/<h2 id="cmd-[^"]*">([\s\S]*?)<\/h2>/g)];
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const rawName = decodeEntities(h[1].replace(/<span[\s\S]*$/, '')).trim();
    const name = headingKey(rawName);
    if (!name) continue;
    const key = name.toUpperCase();
    if (map.has(key)) continue;
    const bodyStart = h.index + h[0].length;
    const bodyEnd = i + 1 < heads.length ? heads[i + 1].index : src.length;
    const body = src.slice(bodyStart, bodyEnd);
    const entry = {
      name, inApp: /class="in-app"/.test(h[1]),
      type: '', description: '', input: '', output: '', io: '', flags: '',
      example: '', seeAlso: [],
    };
    // A few manual pages run two commands together under one heading
    // (→LIST's section also carries ΔLIST's OCR'd page), so single-
    // valued fields keep their FIRST occurrence; examples accumulate.
    const first = (field, text) => { if (!entry[field]) entry[field] = text; };
    for (const f of body.matchAll(/<dd class="cmd-field cmd-field-([a-z-]+)">([\s\S]*?)<\/dd>/g)) {
      const text = htmlToText(f[2]);
      switch (f[1]) {
        case 'type':         first('type', text); break;
        case 'description':  first('description', text); break;
        case 'input':        first('input', text); break;
        case 'output':       first('output', text); break;
        case 'input-output': first('io', text); break;
        case 'flags':        first('flags', text); break;
        case 'example':
        case 'result':
        case 'results':
        case 'note':
          entry.example = entry.example ? `${entry.example}\n${text}` : text; break;
        case 'see-also':
          if (!entry.seeAlso.length) {
            entry.seeAlso = text.split(/,\s*/).map((t) => t.trim()).filter(Boolean);
          }
          break;
        default: break;
      }
    }
    map.set(key, entry);
  }
  return map;
}

/** Resolve a user/model-typed name against the index, falling back
 *  through the command-help alias table (SQRT → √, INTEG → ∫, …). */
export function findReferenceEntry(entries, name) {
  const key = String(name ?? '').trim().toUpperCase();
  if (!key) return null;
  if (entries.has(key)) return entries.get(key);
  const aliased = ALIASES.get(key);
  if (aliased && entries.has(aliased.toUpperCase())) return entries.get(aliased.toUpperCase());
  const arrow = key.replace(/->/g, '→');
  if (arrow !== key && entries.has(arrow)) return entries.get(arrow);
  return null;
}

function clip(text, max) {
  const t = String(text ?? '');
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/** Compact one-entry text for the model.  `maxChars` bounds the whole
 *  block so a long HP manual page (STO, SOLVE) can't swallow the
 *  context budget; description keeps most of the room. */
export function formatReferenceEntry(entry, { maxChars = 1200 } = {}) {
  if (!entry) return '';
  const lines = [`${entry.name}${entry.type ? ` (${entry.type})` : ''}${entry.inApp ? '' : ' — NOT implemented in this calculator'}`];
  const descBudget = Math.max(200, Math.floor(maxChars * 0.45));
  if (entry.description) lines.push(clip(entry.description, descBudget));
  if (entry.io) lines.push('Stack:', clip(entry.io, 300));
  if (entry.input) lines.push('Input: ' + clip(entry.input, 300));
  if (entry.output) lines.push('Output: ' + clip(entry.output, 200));
  if (entry.flags) lines.push('Flags: ' + clip(entry.flags, 160));
  if (entry.example) lines.push('Example:', clip(entry.example, 300));
  if (entry.seeAlso.length) lines.push('See also: ' + entry.seeAlso.join(', '));
  return clip(lines.join('\n'), maxChars);
}

/** One-line teaser for search-result rows. */
export function shortDescription(entry, max = 110) {
  const d = String(entry?.description ?? '').replace(/^[^:]{0,40}:\s+/, '');
  return clip(d.split(/(?<=\.)\s/)[0] || d, max);
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or',
  'is', 'it', 'that', 'this', 'with', 'from', 'by', 'as', 'at', 'be', 'command',
  'commands', 'function', 'functions', 'op', 'ops', 'operation', 'operations',
  'returns', 'return', 'value', 'values', 'object', 'level', 'argument',
  'how', 'do', 'i', 'what', 'which', 'me', 'my', 'can', 'you', 'there', 'are',
  'any', 'all', 'list', 'show', 'find', 'get']);

function keywords(query) {
  return String(query ?? '').toLowerCase().split(/[^a-z0-9→σδπ√∫%^*+\-/!?]+/i)
    .map((w) => w.trim()).filter((w) => w.length > 1 && !STOP.has(w));
}

// Crude stem so "matrix" meets "matrices" and "derivative" meets
// "derivatives": compare the first five letters.
const stem = (w) => w.slice(0, 5);
const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rank commands against a free-text query.
 *
 *  Signals, combined additively so a name hit still wins over a
 *  description-only hit:
 *    - fuzzy subsequence match of the query (and of each keyword)
 *      against the command name — op-search's scorer; an exact name is
 *      unbeatable,
 *    - a keyword that is a prefix of the name or vice versa ("deriv" ~
 *      "derivative"),
 *    - whole-word keyword hits in the reference description; the first
 *      sentence counts double,
 *    - a category whose title shares a stem with a keyword contributes
 *      every op in that category (lets "matrix commands" work).
 *
 *  `names` is the app's registered op list (allOps()); `entries` the
 *  parsed reference (may be null when the doc hasn't loaded); and
 *  `categories` the side-panel {title: [ops]} map.  Returns up to
 *  `limit` rows `{ name, score, inApp, description, category }`. */
export function searchCommands(query, { names = [], entries = null, categories = {}, limit = 12 } = {}) {
  const q = String(query ?? '').trim();
  const words = keywords(q);
  const stems = words.map(stem);
  const scores = new Map();
  const bump = (name, pts) => scores.set(name, (scores.get(name) ?? 0) + pts);
  const catOf = new Map();
  for (const [title, ops] of Object.entries(categories)) {
    for (const op of ops) if (!catOf.has(op)) catOf.set(op, title);
    const titleWords = title.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem);
    if (stems.some((s) => titleWords.includes(s))) {
      for (const op of ops) bump(op, 6);
    }
  }
  const universe = new Set([...names, ...(entries ? entries.keys() : [])]);
  const probes = words.length > 1 ? [q, ...words] : [q];
  for (const name of universe) {
    let best = -1;
    for (const p of probes) {
      if (!p) continue;
      const s = fuzzyScore(p, name);
      if (s > best) best = s;
    }
    if (best >= 1000) bump(name, 1000);
    else if (best >= 0) bump(name, 10 + best);
    const lower = name.toLowerCase();
    if (lower.length >= 3 && words.some((w) => w.length >= 3 && (lower.startsWith(w) || w.startsWith(lower)))) {
      bump(name, 12);
    }
  }
  if (entries && words.length) {
    for (const [key, e] of entries) {
      const desc = String(e.description).toLowerCase();
      const firstSentence = desc.split(/(?<=\.)\s/)[0] ?? '';
      const hay = `${desc} ${e.input} ${e.output}`.toLowerCase();
      let pts = 0;
      for (const w of words) {
        const re = new RegExp(`\\b${escapeRe(w)}`, 'i');
        if (re.test(firstSentence)) pts += 8;
        else if (re.test(hay)) pts += 4;
      }
      if (pts) bump(key, pts + (e.inApp ? 2 : 0));
    }
  }
  // Commands this calculator doesn't implement only surface on a
  // strong name match — worth reporting ("STORE isn't here, STO is"),
  // not worth flooding the list with manual-only entries.
  const registered = new Set(names.map((n) => n.toUpperCase()));
  const rows = [...scores.entries()]
    .map(([name, score]) => {
      const e = entries ? (entries.get(name.toUpperCase()) ?? null) : null;
      const inApp = registered.has(name.toUpperCase()) || !!e?.inApp;
      return {
        name, score: score + (inApp ? 10 : 0), inApp,
        description: e ? shortDescription(e) : '',
        category: catOf.get(name) ?? catOf.get(name.toUpperCase()) ?? '',
      };
    })
    .filter((r) => r.inApp || r.score >= 20)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows.slice(0, limit);
}

let _loadPromise = null;

/** Fetch + parse docs/hp50-commands.html once (browser only). */
export function loadCommandReference() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const res = await fetch('docs/hp50-commands.html');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseCommandReference(await res.text());
  })();
  _loadPromise.catch(() => { _loadPromise = null; });
  return _loadPromise;
}
