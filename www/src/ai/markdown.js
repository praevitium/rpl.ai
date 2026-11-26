// Markdown in the assistant's replies and the tutor's cards, rendered to DOM: paragraphs, lists, tables, quotes, code
// fences, Mermaid diagrams and KaTeX math, the last two loaded only when a reply holds them.
import { markScrollEdges } from '../ui/display.js';

export function elem(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
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

// Wide math, tables and code scroll sideways and fade at the edge they continue past, as stack levels do.
export function markEdgesIn(root) {
  for (const el of root.querySelectorAll('.cb-scroll')) markScrollEdges(el);
}

function renderMathInto(target, expr, displayMode) {
  const fallback = elem(displayMode ? 'div' : 'span', {
    className: displayMode ? 'cb-math-fallback cb-math-display' : 'cb-math-fallback',
    textContent: displayMode ? `$$${expr}$$` : `$${expr}$`,
  });
  target.appendChild(fallback);
  ensureKaTeX().then((katex) => {
    try {
      const wrap = elem(displayMode ? 'div' : 'span', { className: displayMode ? 'cb-math-display cb-scroll' : 'cb-math-inline' });
      wrap.innerHTML = katex.renderToString(expr, { displayMode, throwOnError: false, output: 'html' });
      fallback.replaceWith(wrap);
      const scroller = wrap.closest('.cb-scroll');
      if (scroller) {
        markScrollEdges(scroller);
        document.fonts?.ready.then(() => markScrollEdges(scroller));
      }
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
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  text.split(/(```[\s\S]*?```)/g).forEach((part, i) => {
    if (i % 2 === 0) { appendInlineMarkdown(frag, part); return; }
    const { lang, code } = parseFencedBlock(part);
    if (lang === 'mermaid') renderMermaidInto(frag, code.trimEnd());
    else frag.appendChild(elem('pre', { className: 'cb-scroll' })).appendChild(elem('code', { textContent: code.trimEnd() }));
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
  const hm = line.match(/^(#{1,6})\s+(.+)/);
  if (hm) return { kind: 'heading', level: hm[1].length, content: hm[2] };
  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) return { kind: 'rule' };
  const qm = line.match(/^\s{0,3}>\s?(.*)/);
  if (qm) return { kind: 'quote', content: qm[1] };
  const lim = line.match(/^\s*[-*+]\s+(.*)/);
  if (lim) return { kind: 'bullet', content: lim[1] };
  const nlim = line.match(/^\s*(\d+)[.)]\s+(.*)/);
  if (nlim) return { kind: 'ordered', number: Number(nlim[1]), content: nlim[2] };
  if (line.trim() === '') return { kind: 'blank' };
  return { kind: 'text', content: line };
}

// A row's cells, split at pipes that aren't escaped; null for a line without one.
function tableCells(line) {
  const row = line?.trim() ?? '';
  if (!/(^|[^\\])\|/.test(row)) return null;
  const cells = row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
  if (row.startsWith('|')) cells.shift();
  if (/(?<!\\)\|$/.test(row)) cells.pop();
  return cells;
}

/** A GitHub-style table at lines[i]: a header row, a delimiter row of dashes
 *  (colons set each column's alignment), then rows up to a line without a
 *  pipe, each padded or cut to the header's width.  `end` is the line after it. */
export function parseTableAt(lines, i) {
  const header = tableCells(lines[i]);
  const delimiter = tableCells(lines[i + 1]);
  if (!header?.length || delimiter?.length !== header.length || !delimiter.every((c) => /^:?-+:?$/.test(c))) return null;
  const align = delimiter.map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : c.startsWith(':') ? 'left' : ''));
  const rows = [];
  let end = i + 2;
  for (let cells; (cells = tableCells(lines[end])); end++) rows.push(header.map((_, j) => cells[j] ?? ''));
  return { header, align, rows, end };
}

function appendTable(frag, { header, align, rows }) {
  const table = frag.appendChild(elem('div', { className: 'cb-table cb-scroll' })).appendChild(elem('table'));
  const addRow = (section, cells, tag) => {
    const tr = section.appendChild(elem('tr'));
    cells.forEach((cell, j) => {
      const td = tr.appendChild(elem(tag));
      if (align[j]) td.style.textAlign = align[j];
      // A table row is one line of Markdown, so models break a cell's lines with <br>.
      cell.split(/<br\s*\/?>/i).forEach((line, k) => {
        if (k) td.appendChild(elem('br'));
        appendSpans(td, line);
      });
    });
  };
  addRow(table.appendChild(elem('thead')), header, 'th');
  const body = table.appendChild(elem('tbody'));
  for (const row of rows) addRow(body, row, 'td');
}

// A list item's indent in spaces, a tab counting four: more than the open item's nests under it.
export function listIndent(line) {
  return line.match(/^\s*/)[0].replace(/\t/g, '    ').length;
}

const endsInParagraph = (line) => {
  const c = classifyMarkdownLine(line);
  return c.kind === 'text' || (c.kind === 'quote' && endsInParagraph(c.content));
};

/** A quote's lines from lines[i] on, without their >.  A plain line after its
 *  open paragraph carries that paragraph on, as CommonMark's lazy continuation
 *  does.  `end` is the line after it. */
export function quoteLinesAt(lines, i) {
  const inner = [];
  for (; i < lines.length; i++) {
    const q = classifyMarkdownLine(lines[i]);
    if (q.kind === 'quote') inner.push(q.content);
    else if (q.kind === 'text' && inner.length && endsInParagraph(inner.at(-1))) inner.push(q.content);
    else break;
  }
  return { inner, end: i };
}

function appendInlineMarkdownLines(frag, text) {
  let p = null;
  let lists = [];
  const flushP = () => { if (p) { frag.appendChild(p); p = null; } };
  const newList = (parent, tag, c) => {
    const list = parent.appendChild(elem(tag));
    if (c.kind === 'ordered' && c.number !== 1) list.start = c.number;
    return list;
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const table = parseTableAt(lines, i);
    if (table) {
      flushP();
      lists = [];
      appendTable(frag, table);
      i = table.end - 1;
      continue;
    }
    const c = classifyMarkdownLine(lines[i]);
    if (c.kind !== 'bullet' && c.kind !== 'ordered' && c.kind !== 'blank') lists = [];
    if (c.kind === 'text') {
      if (!p) p = elem('p');
      else p.appendChild(document.createTextNode(' '));
      appendSpans(p, c.content);
      continue;
    }
    flushP();
    if (c.kind === 'heading') {
      appendSpans(frag.appendChild(elem(`h${Math.min(c.level + 2, 6)}`)), c.content);
    } else if (c.kind === 'rule') {
      frag.appendChild(elem('hr'));
    } else if (c.kind === 'quote') {
      const { inner, end } = quoteLinesAt(lines, i);
      i = end - 1;
      appendInlineMarkdownLines(frag.appendChild(elem('blockquote')), inner.join('\n'));
    } else if (c.kind !== 'blank') {
      const tag = c.kind === 'bullet' ? 'UL' : 'OL';
      const indent = listIndent(lines[i]);
      while (lists.length > 1 && lists.at(-1).indent > indent) lists.pop();
      const top = lists.at(-1);
      if (top && indent > top.indent) {
        lists.push({ list: newList(top.list.lastElementChild, tag, c), indent });
      } else if (top?.list.tagName !== tag) {
        const parent = lists.length > 1 ? lists.at(-2).list.lastElementChild : frag;
        const list = lists.length < 2 && parent.lastChild?.tagName === tag ? parent.lastChild : newList(parent, tag, c);
        lists[Math.max(lists.length - 1, 0)] = { list, indent };
      }
      appendSpans(lists.at(-1).list.appendChild(elem('li')), c.content);
    }
  }
  flushP();
}

/** Inline spans in document order: text, code, math, bold, em, link.  The
 *  leftmost opener wins.  `$…$` needs a non-space just inside each `$`,
 *  so prose dollars ("costs $5 and $10") stay text, and an escaped `\$`
 *  never delimits: KaTeX gets it inside math, prose gets a bare `$`.
 *  __Bold__ and _em_ also take underscores, never inside a word such as
 *  snake_case or 1_m, and an escaped `\*` or `\_` is a bare mark.
 *  Bold, em and a link's text keep their markdown, which appendSpans parses
 *  in turn; a link must go to an http(s) or mailto address, or it stays text.
 *  A bare http(s) address is a link too, without the punctuation that ends a sentence. */
export function parseInlineSpans(text) {
  const re = /(`([^`]+)`|\\\(([\s\S]+?)\\\)|(?<!\\)\$(?=\S)((?:\\[^\n]|[^\\$\n])+?)(?<=\S)\$|(?<!\\)\*\*([^*]+)\*\*|(?<!\\)\*([^*]+)\*|\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)(?:[^\s()]|\([^\s()]*\))+)\)|(https?:\/\/(?:[^\s<>()]|\([^\s<>()]*\))*(?:[^\s<>().,;:!?'"*\]]|\([^\s<>()]*\)))|(?<![\w\\])__(?=\S)([^_\n]+?)(?<=\S)__(?!\w)|(?<![\w\\])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?!\w))/g;
  const prose = s => s.replace(/\\([$*_])/g, '$1');
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
    else if (m[5] !== undefined) spans.push({ type: 'bold', content: m[5] });
    else if (m[6] !== undefined) spans.push({ type: 'em', content: m[6] });
    else if (m[7] !== undefined) spans.push({ type: 'link', content: m[7], href: m[8] });
    else if (m[9] !== undefined) spans.push({ type: 'url', content: m[9] });
    else if (m[10] !== undefined) spans.push({ type: 'bold', content: m[10] });
    else if (m[11] !== undefined) spans.push({ type: 'em', content: m[11] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    spans.push({ type: 'text', content: prose(text.slice(last)) });
  }
  return spans;
}

const SPAN_TAGS = { bold: 'strong', em: 'em' };

function appendSpans(parent, text) {
  for (const { type, content, href } of parseInlineSpans(text)) {
    if (type === 'text') parent.appendChild(document.createTextNode(content));
    else if (type === 'math') renderMathInto(parent, content.trim(), false);
    else if (type === 'code') parent.appendChild(elem('code', { textContent: content }));
    else if (type === 'link') appendSpans(parent.appendChild(elem('a', { href, target: '_blank', rel: 'noopener noreferrer' })), content);
    else if (type === 'url') parent.appendChild(elem('a', { href: content, textContent: content, target: '_blank', rel: 'noopener noreferrer' }));
    else appendSpans(parent.appendChild(elem(SPAN_TAGS[type])), content);
  }
}

export function renderInlineMarkdown(text) {
  const frag = document.createDocumentFragment();
  appendSpans(frag, text);
  return frag;
}
