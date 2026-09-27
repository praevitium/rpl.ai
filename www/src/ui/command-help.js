/* =================================================================
   Command reference sections.

   Lazily fetches docs/hp50-commands.html on the first request and
   parses each <h2 id="cmd-…"> block out of it; the Catalog drawer
   renders the matching block inline.
   ================================================================= */

/* Panel-name → doc-heading aliases.  The HP50 manual headings use the
   Unicode glyphs (√, –, ≤, …) while the panel labels keep ASCII /
   mnemonic forms (SQRT, -, <=, …).  When a direct lookup misses,
   `show()` falls back through this table.  Keep both sides upper-case
   so the existing key normalization stays one-step. */
export const ALIASES = new Map([
  ['SQRT',    '√'],
  ['-',       '–'],
  ['HMS-',    'HMS–'],
  ['ROW-',    'ROW–'],
  ['COL-',    'COL–'],
  ['STO-',    'STO–'],
  ['<=',      '≤'],
  ['>=',      '≥'],
  ['<>',      '≠'],
  ['LIM',     'LIMIT'],
  ['TCHEB',   'TCHEBYCHEFF'],
  ['CHARPOL', 'PCAR'],
  ['INTEG',   '∫'],
  ['SX',      'ΣX'],
  ['SY',      'ΣY'],
  ['SXY',     'ΣXY'],
  ['SX2',     'ΣX2'],
  ['SY2',     'ΣY2'],
  ['MAXS',    'MAXΣ'],
  ['MINS',    'MINΣ'],
  ['NSIGMA',  'NΣ'],
  ['SLIST',   'ΣLIST'],
  ['PLIST',   'ΠLIST'],
  ['DLIST',   'ΔLIST'],
]);

/** Derive the bare command key a help-doc `<h2>` heading is filed
 *  under.  The HP50 reference headings carry a trailing parenthetical
 *  gloss — "!(Factorial)", "==(Logical Equality)" — that isn't part of
 *  the dispatchable symbol; strip it (and surrounding whitespace) so
 *  the section map keys on "!" / "==".  Headings with no parenthetical
 *  pass through trimmed; empty/whitespace/nullish input yields ''. */
export function headingKey(raw) {
  return String(raw == null ? '' : raw).trim().replace(/\s*\(.*\)\s*$/, '').trim();
}

/** Visited-name history transition for the Catalog's reference view.  Truncates any forward
 *  entries and appends `name`, advancing the cursor — unless `name` is
 *  already the current entry, in which case history and cursor are
 *  returned unchanged (re-issuing the current name is a no-op).  Pure:
 *  returns a fresh `{ history, idx }` on append, the same references on
 *  no-op. */
export function pushHistory(history, idx, name) {
  if (history[idx] === name) return { history, idx };
  const next = history.slice(0, idx + 1);
  next.push(name);
  return { history: next, idx: next.length - 1 };
}

let _loadPromise = null;
let _sectionsByName = null;

async function _loadSections() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const res = await fetch('docs/hp50-commands.html');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const map = new Map();
    const headings = doc.querySelectorAll('h2[id^="cmd-"]');
    for (const h2 of headings) {
      // The h2's first text node is the displayed name (before the
      // in-app/not-in-app badge spans).  May be like "!(Factorial)" or
      // "==(Logical Equality)" — strip the parenthetical to get the
      // bare command symbol the panel knows about.
      const raw = (h2.firstChild?.textContent ?? '').trim();
      if (!raw) continue;
      const key = headingKey(raw);
      if (!key) continue;
      const upper = key.toUpperCase();
      if (map.has(upper)) continue;             // first wins on collisions
      const frag = document.createDocumentFragment();
      const headerClone = h2.cloneNode(true);
      headerClone.querySelectorAll('.back').forEach(b => b.remove());
      headerClone.removeAttribute('id');
      frag.appendChild(headerClone);
      let n = h2.nextElementSibling;
      while (n && n.tagName !== 'H2') {
        frag.appendChild(n.cloneNode(true));
        n = n.nextElementSibling;
      }
      map.set(upper, frag);
    }
    // Second pass: linkify See-Also tokens.  Done now so each cloned
    // fragment served to the popup already has the cross-links — the
    // popup itself just intercepts clicks and re-shows.
    for (const frag of map.values()) {
      for (const dd of frag.querySelectorAll('.cmd-field-see-also')) {
        for (const p of dd.querySelectorAll('p')) {
          const tokens = p.textContent.split(/,\s*/).map(t => t.trim()).filter(Boolean);
          if (tokens.length === 0) continue;
          p.textContent = '';
          tokens.forEach((tok, i) => {
            if (i > 0) p.appendChild(document.createTextNode(', '));
            const a = document.createElement('a');
            a.className = 'cmd-help-link';
            a.href = '#';
            a.dataset.cmd = tok;
            a.textContent = tok;
            p.appendChild(a);
          });
        }
      }
    }
    _sectionsByName = map;
  })();
  return _loadPromise;
}

/** The reference section for `name` (alias-aware) as a fresh fragment,
 *  or null when the manual has no entry for it. */
export async function referenceSection(name) {
  await _loadSections();
  const key = String(name ?? '').toUpperCase();
  const aliased = ALIASES.get(key);
  const frag = _sectionsByName.get(key) ?? (aliased ? _sectionsByName.get(aliased.toUpperCase()) : undefined);
  return frag ? frag.cloneNode(true) : null;
}
