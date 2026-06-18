/* =================================================================
   Command help popup.

   Lazily fetches docs/hp50-commands.html on the first request, parses
   each <h2 id="cmd-…"> block out of it, and shows the matching block
   as an overlay over the calculator area.  Triggered by a right-click
   on a Commands-tab button; dismissed with the × button, the Esc key,
   or a click on the backdrop outside the content card.

   The popup is owned by the SidePanel and mounted inside #calculator
   so its `position: absolute; inset: 0` exactly covers the calc area
   without overlapping the side panel itself.
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

/** Visited-name history transition for `show()`.  Truncates any forward
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

export class CommandHelp {
  constructor({ host }) {
    this.host = host;
    this._currentName = null;
    // Visited-name navigation history.  `_history` is an ordered list
    // of display names (whatever was passed to show()).  `_historyIdx`
    // points at the entry currently rendered.  `show()` truncates any
    // forward entries and appends; goBack / goForward and the history
    // dropdown move the cursor without truncating.
    this._history = [];
    this._historyIdx = -1;

    const el = document.createElement('div');
    el.className = 'cmd-help-popup hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="cmd-help-bar">
        <button type="button" class="cmd-help-nav cmd-help-back"
                aria-label="Back" title="Back" disabled>‹</button>
        <button type="button" class="cmd-help-nav cmd-help-fwd"
                aria-label="Forward" title="Forward" disabled>›</button>
        <select class="cmd-help-history" aria-label="History"
                title="History"></select>
        <button type="button" class="cmd-help-close"
                aria-label="Close" title="Close (Esc)">×</button>
      </div>
      <div class="cmd-help-inner"></div>
    `;
    this.host.appendChild(el);
    this.el = el;
    this._inner = el.querySelector('.cmd-help-inner');
    this._backBtn = el.querySelector('.cmd-help-back');
    this._fwdBtn  = el.querySelector('.cmd-help-fwd');
    this._histSel = el.querySelector('.cmd-help-history');

    this._backBtn.addEventListener('click', () => this.goBack());
    this._fwdBtn .addEventListener('click', () => this.goForward());
    // `change` fires only on commit (click / Enter / blur after keyboard
    // navigation), so we also listen for `input` — fires the moment the
    // <select>'s value flips during arrow-key navigation, which lets the
    // popup update live while the dropdown has focus.  Both events are
    // routed through one idempotent handler so a single value change
    // doesn't render twice.
    const onSelectNav = () => {
      const idx = Number(this._histSel.value);
      if (!Number.isFinite(idx)) return;
      if (idx < 0 || idx >= this._history.length) return;
      if (idx === this._historyIdx) return;
      this._historyIdx = idx;
      this._render(this._history[idx]);
    };
    this._histSel.addEventListener('input',  onSelectNav);
    this._histSel.addEventListener('change', onSelectNav);

    el.querySelector('.cmd-help-close').addEventListener('click', () => this.hide());
    // Backdrop click (anywhere on the popup background that isn't the
    // inner content card or the toolbar) dismisses.
    el.addEventListener('click', (ev) => {
      if (ev.target === el) this.hide();
    });
    // Cross-link click inside the rendered content — See Also tokens
    // are pre-linkified during section parsing; intercept here so we
    // don't follow the empty `href="#"`.
    this._inner.addEventListener('click', (ev) => {
      const a = ev.target.closest?.('.cmd-help-link');
      if (!a) return;
      ev.preventDefault();
      this.show(a.dataset.cmd);
    });
    // Esc closes when the popup is open.  Capture phase so we win against
    // any keypad/entry handlers attached to window.
    this._onKey = (ev) => {
      if (ev.key !== 'Escape') return;
      if (this.el.classList.contains('hidden')) return;
      ev.stopPropagation();
      ev.preventDefault();
      this.hide();
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  async show(name) {
    if (!name) return;
    const key = String(name).toUpperCase();
    if (this._currentName === key && !this.el.classList.contains('hidden')) {
      return;
    }
    const { history, idx } = pushHistory(this._history, this._historyIdx, name);
    this._history = history;
    this._historyIdx = idx;
    await this._render(name);
  }

  goBack() {
    if (this._historyIdx <= 0) return;
    this._historyIdx -= 1;
    this._render(this._history[this._historyIdx]);
  }

  goForward() {
    if (this._historyIdx >= this._history.length - 1) return;
    this._historyIdx += 1;
    this._render(this._history[this._historyIdx]);
  }

  /** Look up `name` (with alias fallback), paint its content into the
   *  popup, and refresh the toolbar enable/select state.  Internal —
   *  callers (show / goBack / goForward / select change) own the
   *  history bookkeeping. */
  async _render(name) {
    const key = String(name).toUpperCase();
    this._currentName = key;
    let sections;
    try {
      await _loadSections();
      sections = _sectionsByName;
    } catch (e) {
      if (this._currentName !== key) return;
      this._inner.textContent = `Failed to load reference: ${e.message}`;
      this._reveal();
      return;
    }
    if (this._currentName !== key) return;
    const aliased = ALIASES.get(key);
    const frag = sections.get(key)
              ?? (aliased ? sections.get(aliased.toUpperCase()) : undefined);
    this._inner.innerHTML = '';
    if (frag) {
      this._inner.appendChild(frag.cloneNode(true));
    } else {
      const empty = document.createElement('div');
      empty.className = 'cmd-help-empty';
      empty.textContent = `No reference entry for "${name}".`;
      this._inner.appendChild(empty);
    }
    this._refreshNav();
    this._reveal();
  }

  _refreshNav() {
    this._backBtn.disabled = this._historyIdx <= 0;
    this._fwdBtn .disabled = this._historyIdx >= this._history.length - 1;
    this._histSel.innerHTML = '';
    if (this._history.length === 0) {
      this._histSel.disabled = true;
      return;
    }
    this._histSel.disabled = false;
    // Newest entries first so the dropdown reads top-down most-recent.
    // `value` keeps its underlying-array index so the change handler
    // still maps directly to `_history[idx]`.
    for (let i = this._history.length - 1; i >= 0; i--) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = this._history[i];
      if (i === this._historyIdx) opt.selected = true;
      this._histSel.appendChild(opt);
    }
  }

  hide() {
    this._currentName = null;
    this.el.classList.add('hidden');
    this.el.setAttribute('aria-hidden', 'true');
  }

  _reveal() {
    this.el.classList.remove('hidden');
    this.el.setAttribute('aria-hidden', 'false');
    this._inner.scrollTop = 0;
  }
}
