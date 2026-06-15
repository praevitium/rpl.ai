#!/usr/bin/env node
/* The script is idempotent — it only matches bare `<pre>` (no
   attributes) and the reflowed output uses `<pre class="cmd-mono">`,
   so re-running is a no-op once the file is converted. */

import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(HERE, '../www/docs/hp50-commands.html');

// `Access:` is intentionally omitted — it documents the physical-keypad
// shortcut path, meaningless on a virtual calc, so it's silently dropped.
const KNOWN_LABELS = new Set([
  'Type', 'Description', 'Flags',
  'Input/Output', 'Input', 'Output', 'Example',
  'Note', 'Result', 'Results', 'See also', 'See Also',
]);
const labelRe = /^([A-Z][A-Za-z][A-Za-z/ ]*):/;

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseSections(body) {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  // The first non-empty line is the bare command name (already shown
  // in the h2 above) — skip it unless it happens to look like a label.
  if (i < lines.length && !labelRe.test(lines[i])) i++;

  const sections = [];
  while (i < lines.length) {
    const m = labelRe.exec(lines[i]);
    if (m) {
      const label = m[1];
      const rest = lines[i].slice(m[0].length);
      // Pad the first content line with spaces equal to where the
      // continuation lines start, so common-indent stripping treats
      // the whole section uniformly.
      const padMatch = /^(\s*)(.*)$/.exec(rest);
      const baseIndent = m[0].length + padMatch[1].length;
      const collected = [' '.repeat(baseIndent) + padMatch[2]];
      i++;
      // Break on ANY label (known or excluded) — otherwise a dropped
      // section like Access would smear into the previous field's body.
      while (i < lines.length) {
        if (labelRe.test(lines[i])) break;
        collected.push(lines[i]);
        i++;
      }
      if (KNOWN_LABELS.has(label)) {
        sections.push({ label, lines: collected });
      }
    } else {
      i++;
    }
  }
  return sections;
}

function commonIndent(lines) {
  const widths = lines
    .filter(l => l.trim() !== '')
    .map(l => l.match(/^ */)[0].length);
  return widths.length ? Math.min(...widths) : 0;
}
function stripIndent(lines, n) {
  return lines.map(l => l.trim() === '' ? '' : l.slice(n));
}
function trimEmpty(lines) {
  let i = 0, j = lines.length - 1;
  while (i <= j && lines[i].trim() === '') i++;
  while (j >= i && lines[j].trim() === '') j--;
  return lines.slice(i, j + 1);
}

function isMonoLine(l) {
  if (/\s→\s/.test(l)) return true;
  if (/\S {3,}\S/.test(l.trimStart())) return true;
  return false;
}

function groupLines(lines) {
  const groups = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    while (cur.lines.length && cur.lines[cur.lines.length - 1].trim() === '') {
      cur.lines.pop();
    }
    if (cur.lines.length) groups.push(cur);
    cur = null;
  };
  for (const l of lines) {
    if (l.trim() === '') {
      // Blanks inside a mono run stay (table header / blank / rows).
      if (cur && cur.kind === 'mono') cur.lines.push(l);
      else close();
      continue;
    }
    const kind = isMonoLine(l) ? 'mono' : 'prose';
    if (!cur || cur.kind !== kind) {
      close();
      cur = { kind, lines: [] };
    }
    cur.lines.push(l);
  }
  close();
  return groups;
}

function renderBullets(lines) {
  let i = 0;
  const intro = [];
  while (i < lines.length && !lines[i].trimStart().startsWith('•')) {
    intro.push(lines[i]);
    i++;
  }
  const items = [];
  let cur = null;
  for (; i < lines.length; i++) {
    const stripped = lines[i].trimStart();
    if (stripped.startsWith('•')) {
      if (cur) items.push(cur);
      cur = [stripped.slice(1).trim()];
    } else {
      if (cur) cur.push(lines[i].trim());
    }
  }
  if (cur) items.push(cur);

  let html = '';
  if (intro.length) {
    const text = intro.map(l => l.trim()).join(' ').replace(/\s+/g, ' ').trim();
    if (text) html += `<p>${text}</p>`;
  }
  if (items.length) {
    html += '<ul class="cmd-bullets">'
          + items.map(parts =>
              `<li>${parts.join(' ').replace(/\s+/g, ' ').trim()}</li>`).join('')
          + '</ul>';
  }
  return html;
}

function renderProseGroup(lines) {
  if (lines.some(l => l.trimStart().startsWith('•'))) {
    return renderBullets(lines);
  }
  if (lines.length === 1) {
    return `<p>${lines[0].trim()}</p>`;
  }
  const text = lines.map(l => l.trim()).join(' ').replace(/\s+/g, ' ').trim();
  return `<p>${text}</p>`;
}

function renderGroup(group, label) {
  if (group.kind === 'mono') {
    if (label === 'Input/Output') {
      const table = buildIOTable(group.lines.join('\n'));
      if (table) return table;
    }
    const kv = buildKVTable(group.lines.join('\n'));
    if (kv) return kv;
    const tbl = buildGenericTable(group.lines.join('\n'));
    if (tbl) return tbl;
    return `<pre class="cmd-mono">${group.lines.join('\n')}</pre>`;
  }
  return renderProseGroup(group.lines);
}

/* Sections that almost always carry PDF-faithful layout — Example's
   code listings rarely have the multi-space cue the line classifier
   uses, so forcing it to a single <pre> keeps the indentation intact.
   `Input/Output:` is handled separately (its mono groups become
   <table>s — see buildIOTable). */
const VERBATIM_LABELS = new Set(['Example']);

/* Stack-diagram blocks have a header row of "Level k/Argument k" /
   "Level 1/Item 1" titles, then data rows with `→` separating inputs
   from outputs.  Cells are 2+ space–separated.  Returns null when
   the body doesn't have an arrow row (caller should keep <pre>). */
function buildIOTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length);
  if (lines.length < 1) return null;
  const rows = lines.map(l => l.split(/ {2,}/));
  let arrowCol = -1;
  for (const r of rows) {
    const idx = r.indexOf('→');
    if (idx !== -1) { arrowCol = idx; break; }
  }
  if (arrowCol === -1) return null;
  // Treat the first row as a header iff it has no arrow.
  const hasHeader = !rows[0].includes('→');
  const header = hasHeader ? [...rows[0]] : null;
  const dataRows = (hasHeader ? rows.slice(1) : rows).map(r => [...r]);
  // Slot an empty cell into the header at the arrow column so its
  // input/output titles line up with the data row's split.
  if (header) {
    while (header.length < arrowCol) header.push('');
    header.splice(arrowCol, 0, '');
  }
  const ncols = Math.max(header ? header.length : 0,
                         ...dataRows.map(r => r.length));
  const pad = r => { while (r.length < ncols) r.push(''); };
  if (header) pad(header);
  dataRows.forEach(pad);

  const cellAttr = (i) => i === arrowCol ? ' class="cmd-io-arrow"' : '';
  let out = '<table class="cmd-io">';
  if (header) {
    out += '<thead><tr>'
        + header.map((c, i) => `<th${cellAttr(i)}>${c}</th>`).join('')
        + '</tr></thead>';
  }
  // Some I/O blocks include `Example N: …` annotation rows after the
  // stack diagram.  Those don't carry a `→`, so we span them across
  // the full width instead of slotting their text into the first cell.
  out += '<tbody>'
       + dataRows.map(r => {
           if (r[arrowCol] !== '→') {
             const text = r.filter(c => c.length).join(' ');
             return `<tr class="cmd-io-span"><td colspan="${ncols}">${text}</td></tr>`;
           }
           return '<tr>' + r.map((c, i) => `<td${cellAttr(i)}>${c}</td>`).join('') + '</tr>';
         }).join('')
       + '</tbody></table>';
  return out;
}

/* Many Example bodies are a stack of `Label:  value` pairs (Example N,
   Command, Result, …).  Render those as a small two-column table rather
   than a wall of preformatted text. */
const KV_LABEL_RE = /^\s*(Example \d+|Example|Command|Result|Results|Output|Input):\s*(.*)$/;
function buildKVTable(text) {
  const lines = text.split('\n').map(l => l.replace(/\s+$/, ''));
  const items = [];
  let cur = null;
  for (const l of lines) {
    if (l.trim() === '') continue;
    const m = KV_LABEL_RE.exec(l);
    if (m) {
      if (cur) items.push(cur);
      cur = { label: m[1], value: m[2] };
    } else if (cur) {
      cur.value = (cur.value + ' ' + l.trim()).trim();
    } else {
      return null;             // text before any label — abort
    }
  }
  if (cur) items.push(cur);
  if (items.length < 2) return null;
  if (items.every(it => /^Example/.test(it.label))) return null;
  let out = '<table class="cmd-kv"><tbody>';
  for (const it of items) {
    if (/^Example/.test(it.label)) {
      out += `<tr class="cmd-kv-section"><th colspan="2">${it.label}${it.value ? ': ' + it.value : ''}</th></tr>`;
    } else {
      out += `<tr><th>${it.label}</th><td>${it.value}</td></tr>`;
    }
  }
  return out + '</tbody></table>';
}

/* Catches PDF-extracted multi-column blocks that aren't I/O stack
   diagrams (no `→`) and aren't code listings (no `«»` / backtick).
   Cells separated by 3+ spaces; first row becomes <thead>.  Rejects
   anything where rows disagree on cell count (likely formula
   fragments, not a table). */
function buildGenericTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length);
  if (lines.length < 2) return null;
  if (text.includes('→') || /[«»]/.test(text) || text.includes('&#x60;')) return null;
  const rows = lines.map(l => l.split(/ {3,}/).map(c => c.trim()).filter(Boolean));
  const ncols = rows[0].length;
  if (ncols < 2 || ncols > 6) return null;
  if (!rows.every(r => r.length === ncols)) return null;
  const thead = '<thead><tr>' + rows[0].map(c => `<th>${c}</th>`).join('') + '</tr></thead>';
  const tbody = '<tbody>'
              + rows.slice(1).map(r =>
                  '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('')
              + '</tbody>';
  return `<table class="cmd-tbl">${thead}${tbody}</table>`;
}

/* When the line classifier splits an I/O section into multiple groups
   (because some PDF-extracted formula fragment landed on a non-mono
   line), we end up with several <table>s and stray <p>/<pre>s inside
   one Input/Output <dd>.  Merge them into a single table whose stray
   prose becomes full-width span rows. */
function mergeIOFragments(bodyHtml) {
  const items = [];
  for (const m of bodyHtml.matchAll(/<(table|p|pre)\b[^>]*>[\s\S]*?<\/\1>/g)) {
    items.push(m[0]);
  }
  if (items.length < 2) return bodyHtml;
  const tableCount = items.filter(it => it.startsWith('<table')).length;
  if (tableCount === 0) return bodyHtml;
  if (tableCount < 2 && tableCount === items.length) return bodyHtml;

  const firstTable = items.find(it => it.startsWith('<table'));
  let ncols = 0;
  const headM = /<thead>([\s\S]*?)<\/thead>/.exec(firstTable);
  if (headM) ncols = (headM[1].match(/<th[^>]*>/g) || []).length;
  if (!ncols) {
    const fr = /<tr[^>]*>([\s\S]*?)<\/tr>/.exec(firstTable);
    if (fr) ncols = (fr[1].match(/<td[^>]*>/g) || []).length;
  }
  if (!ncols) return bodyHtml;

  let thead = '';
  const rows = [];
  for (const it of items) {
    if (it.startsWith('<table')) {
      const tHeadM = /<thead>[\s\S]*?<\/thead>/.exec(it);
      if (tHeadM && !thead) thead = tHeadM[0];
      const tBodyM = /<tbody>([\s\S]*?)<\/tbody>/.exec(it);
      if (tBodyM) {
        for (const tm of tBodyM[1].matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)) rows.push(tm[0]);
      }
    } else if (it.startsWith('<p')) {
      const text = it.replace(/^<p[^>]*>([\s\S]*?)<\/p>$/, '$1').trim();
      if (text) rows.push(`<tr class="cmd-io-span"><td colspan="${ncols}">${text}</td></tr>`);
    } else if (it.startsWith('<pre')) {
      const text = it.replace(/^<pre[^>]*>([\s\S]*?)<\/pre>$/, '$1').trim();
      if (text) rows.push(`<tr class="cmd-io-span"><td colspan="${ncols}"><pre class="cmd-mono">${text}</pre></td></tr>`);
    }
  }
  return `<table class="cmd-io">${thead}<tbody>${rows.join('')}</tbody></table>`;
}

function renderSection({ label, lines }) {
  const indent = commonIndent(lines);
  const stripped = trimEmpty(stripIndent(lines, indent));
  if (stripped.length === 0) return '';
  const slug = slugify(label);
  let body;
  if (VERBATIM_LABELS.has(label)) {
    body = `<pre class="cmd-mono">${stripped.join('\n')}</pre>`;
  } else {
    const groups = groupLines(stripped);
    if (groups.length === 0) return '';
    body = groups.map(g => renderGroup(g, label)).join('\n');
    if (label === 'Input/Output') body = mergeIOFragments(body);
  }
  return `  <dt class="cmd-label cmd-label-${slug}">${label}</dt>\n`
       + `  <dd class="cmd-field cmd-field-${slug}">\n    ${body.replace(/\n/g, '\n    ')}\n  </dd>`;
}

function transformPre(body) {
  const sections = parseSections(body);
  if (sections.length === 0) return `<pre>${body}</pre>`;
  return `<dl class="cmd-body">\n${sections.map(renderSection).join('\n')}\n</dl>`;
}

let html = readFileSync(HTML_PATH, 'utf8');
const before = (html.match(/<pre>/g) || []).length;
html = html.replace(/<pre>([\s\S]*?)<\/pre>/g, (_, body) => transformPre(body));
const after = (html.match(/<pre>/g) || []).length;
writeFileSync(HTML_PATH, html);
console.log(`Reflowed ${HTML_PATH}: ${before} bare <pre> → ${after} (fallbacks).`);
