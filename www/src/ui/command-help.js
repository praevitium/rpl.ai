// Command names whose manual heading is spelled differently (√ for SQRT, PCAR for CHARPOL).
export const ALIASES = new Map([
  ['SQRT',    '√'],
  ['-',       '–'],
  ['HMS-',    'HMS–'],
  ['Σ-',      'Σ–'],
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

// Headings carry a gloss, like "!(Factorial)", that isn't part of the command name.
export function headingKey(raw) {
  return String(raw == null ? '' : raw).trim().replace(/\s*\(.*\)\s*$/, '').trim();
}

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
      const key = headingKey(h2.firstChild?.textContent);
      if (!key) continue;
      const upper = key.toUpperCase();
      if (map.has(upper)) continue;
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
  _loadPromise.catch(() => { _loadPromise = null; });
  return _loadPromise;
}

export async function referenceSection(name) {
  await _loadSections();
  const key = String(name ?? '').toUpperCase();
  const aliased = ALIASES.get(key);
  const frag = _sectionsByName.get(key) ?? (aliased ? _sectionsByName.get(aliased.toUpperCase()) : undefined);
  return frag ? frag.cloneNode(true) : null;
}
