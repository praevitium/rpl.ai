import { allOps, lookup, opCategories } from '../rpl/ops.js';
import {
  state as calcState, subscribe as subscribeState,
  varRecall, varStore, varPurge, goInto, currentPath, makeSubdir,
  getDirectoryByPath, moveCurrentEntry, reorderCurrentEntry, renameCurrentEntry,
} from '../rpl/state.js';
import { TYPES, isStorableHpName } from '../rpl/types.js';
import { UNIT_CATALOG } from '../rpl/units.js';
import { format } from '../rpl/formatter.js';
import {
  exportVariableToFile, parseVariableFile, exportHpTextFile, readFileText,
  listBackups, archiveBackup, restoreBackup, deleteBackup,
} from '../rpl/persist.js';
import { parseHpText } from '../rpl/hp-text.js';
import { referenceSection, pushHistory } from './command-help.js';
import { loadCommandReference, findReferenceEntry, shortDescription, searchCommands } from './command-reference.js';
import { matchPositions, highlightSegments } from './op-search.js';
import { GraphView } from './graph-view.js';
import { icon } from './icons.js';
import { escapeHtml, typeName } from './display.js';
import { MENU_FAMILIES } from './menus.js';
import { shortcutText } from './actions.js';

export const UNIT_SYMBOLS = Object.freeze([
  'm', 'cm', 'mm', 'km', 'in', 'ft', 'yd', 'mi',
  'kg', 'g', 'mg', 'lb', 'oz',
  's', 'ms', 'us', 'ns', 'min', 'h', 'd', 'yr',
  'L', 'mL',
  'A', 'K', 'mol', 'cd',
  'Hz', 'N', 'J', 'W',
  'Pa', 'kPa', 'bar', 'atm',
  'V', 'Ω', 'ohm', 'C',
]);

const _opCategories = opCategories();
export const CATEGORIES = {
  ..._opCategories,
  Units: [...(_opCategories.Units || []), ...UNIT_SYMBOLS],
};

export const CHAR_GROUPS = {
  'Constants': [
    ['π', 'π', 'pi — folds to 3.14159… under APPROX / →NUM'],
    ['e', 'e', 'Euler — folds to 2.71828… under APPROX / →NUM'],
    ['i', 'i', 'imaginary unit — folds to (0, 1) under APPROX / →NUM'],
    ['∞', '∞', 'infinity'],
    ['MAXR', 'MAXR', 'maximum real (9.99999999999e499)'],
    ['MINR', 'MINR', 'minimum real (1e-499)'],
    ['c', 'c', 'speed of light in vacuum'],
    ['h', 'h', 'Planck constant'],
    ['ħ', 'ħ', 'reduced Planck constant (hbar)'],
    ['G', 'G', 'gravitational constant'],
    ['g', 'g', 'standard gravity (9.80665 m/s²)'],
    ['NA', 'NA', 'Avogadro constant'],
    ['k', 'k', 'Boltzmann constant'],
    ['R', 'R', 'universal gas constant'],
    ['Vm', 'Vm', 'molar volume (ideal gas, 0°C 1atm)'],
    ['σ', 'σ', 'Stefan-Boltzmann constant'],
    ['ε0', 'ε0', 'vacuum permittivity'],
    ['μ0', 'μ0', 'vacuum permeability'],
    ['q', 'q', 'elementary charge'],
    ['me', 'me', 'electron rest mass'],
    ['mp', 'mp', 'proton rest mass'],
    ['mn', 'mn', 'neutron rest mass'],
    ['F', 'F', 'Faraday constant'],
    ['α', 'α', 'fine-structure constant'],
    ['a0', 'a0', 'Bohr radius'],
    ['μB', 'μB', 'Bohr magneton'],
    ['μN', 'μN', 'nuclear magneton'],
    ['Rinf', 'Rinf', 'Rydberg constant'],
    ['λc', 'λc', 'Compton wavelength'],
    ['γe', 'γe', 'electron gyromagnetic ratio'],
    ['Z0', 'Z0', 'impedance of free space'],
    ['atm', 'atm', 'standard atmosphere (101325 Pa)'],
    ['T0', 'T0', 'standard temperature (273.15 K)'],
  ],
  'Greek (lowercase)': [
    ['α', 'α', 'alpha'], ['β', 'β', 'beta'], ['γ', 'γ', 'gamma'],
    ['δ', 'δ', 'delta'], ['ε', 'ε', 'epsilon'], ['ζ', 'ζ', 'zeta'],
    ['η', 'η', 'eta'], ['θ', 'θ', 'theta'], ['ι', 'ι', 'iota'],
    ['κ', 'κ', 'kappa'], ['λ', 'λ', 'lambda'], ['μ', 'μ', 'mu'],
    ['ν', 'ν', 'nu'], ['ξ', 'ξ', 'xi'], ['ο', 'ο', 'omicron'],
    ['π', 'π', 'pi'], ['ρ', 'ρ', 'rho'], ['σ', 'σ', 'sigma'],
    ['τ', 'τ', 'tau'], ['υ', 'υ', 'upsilon'], ['φ', 'φ', 'phi'],
    ['χ', 'χ', 'chi'], ['ψ', 'ψ', 'psi'], ['ω', 'ω', 'omega'],
  ],
  'Greek (uppercase)': [
    ['Α', 'Α', 'Alpha'], ['Β', 'Β', 'Beta'], ['Γ', 'Γ', 'Gamma'],
    ['Δ', 'Δ', 'Delta'], ['Ε', 'Ε', 'Epsilon'], ['Ζ', 'Ζ', 'Zeta'],
    ['Η', 'Η', 'Eta'], ['Θ', 'Θ', 'Theta'], ['Ι', 'Ι', 'Iota'],
    ['Κ', 'Κ', 'Kappa'], ['Λ', 'Λ', 'Lambda'], ['Μ', 'Μ', 'Mu'],
    ['Ν', 'Ν', 'Nu'], ['Ξ', 'Ξ', 'Xi'], ['Ο', 'Ο', 'Omicron'],
    ['Π', 'Π', 'Pi'], ['Ρ', 'Ρ', 'Rho'], ['Σ', 'Σ', 'Sigma'],
    ['Τ', 'Τ', 'Tau'], ['Υ', 'Υ', 'Upsilon'], ['Φ', 'Φ', 'Phi'],
    ['Χ', 'Χ', 'Chi'], ['Ψ', 'Ψ', 'Psi'], ['Ω', 'Ω', 'Omega'],
  ],
  'Math / comparison': [
    ['∞', '∞', 'infinity'], ['π', 'π', 'pi constant'],
    ['√', '√', 'sqrt'], ['∂', '∂', 'partial derivative'],
    ['∫', '∫', 'integral'], ['∑', '∑', 'sum'], ['∏', '∏', 'product'],
    ['Δ', 'Δ', 'delta / change'],
    ['≠', '≠', 'not equal'], ['≤', '≤', 'less/equal'],
    ['≥', '≥', 'greater/equal'], ['≈', '≈', 'approx equal'],
    ['±', '±', 'plus-minus'], ['·', '·', 'dot'], ['×', '×', 'times'],
    ['÷', '÷', 'divide'], ['°', '°', 'degree'],
    ['∠', '∠', 'angle — polar / cylindrical separator (R∠θ)'],
  ],
  'Arrows / program': [
    ['→', '→', 'store / local-var arrow'],
    ['←', '←', 'left arrow'], ['↑', '↑', 'up arrow'],
    ['↓', '↓', 'down arrow'], ['↵', '\n', 'newline'],
    ['«', '« ', 'program open'], ['»', ' »', 'program close'],
    ['«»', '«  »', 'program brackets (cursor inside)'],
    ['[ ]', '[ ]', 'list / vector brackets'],
    ['{ }', '{ }', 'list braces'],
    ['::', '::', 'path delimiter'],
    ['_', '_', 'underscore / unit'],
  ],
};

/** The "Other" bucket: every registered op not already shown under a
 *  named category, minus the ASCII arrow aliases (`->NUM`), which each
 *  have a Unicode form in their proper category.  `registered` and
 *  `seen` are upper-cased sets; `filter` is a lower-cased substring. */
export function uncategorizedOps(registered, seen, filter = '') {
  return [...registered]
    .filter(n => !seen.has(n))
    .filter(n => !n.includes('->'))
    .filter(n => !filter || n.toLowerCase().includes(filter))
    .sort();
}

/** Drop zone for a row hovered during a drag: folders split into
 *  before / into / after (25 / 50 / 25 %), other rows into halves. */
export function dropZoneForFraction(frac, isDir) {
  if (isDir) {
    if (frac < 0.25) return 'before';
    if (frac > 0.75) return 'after';
    return 'into';
  }
  return frac < 0.5 ? 'before' : 'after';
}

export function familyCommands(family) {
  if (family.category === 'Other') {
    const seen = new Set(Object.values(_opCategories).flat().map((n) => n.toUpperCase()));
    return uncategorizedOps(new Set(allOps()), seen);
  }
  return _opCategories[family.category] ?? [];
}

export function signatureOf(entry) {
  const first = String(entry?.io ?? '').split('\n')[0].replace(/`/g, "'").trim();
  return first.length > 42 ? `${first.slice(0, 41)}…` : first;
}

const DRAWERS = Object.freeze([
  { id: 'assistant', icon: 'spark', label: 'Assistant' },
  { id: 'catalog', icon: 'book', label: 'Catalog' },
  { id: 'vars', icon: 'folder', label: 'Variables' },
  { id: 'history', icon: 'clock', label: 'History' },
  { id: 'plot', icon: 'plot', label: 'Plot' },
  { id: 'chars', icon: 'omega', label: 'Characters', short: 'Chars' },
]);

const DRAWER_MIN_WIDTH = 280;
const DRAWER_MAX_WIDTH = 720;

export class Drawers {
  constructor({ rail, el, scrim, app }) {
    this.rail = rail;
    this.el = el;
    this.scrim = scrim;
    this.app = app;
    this.current = null;
    this.cat = { q: '', family: null, ref: null, history: [], idx: -1 };
    this.charsQuery = '';
    this.varsQuery = '';
    this.historyQuery = '';
    this.reference = null;
    this._graph = null;
    this._chat = null;
    this._dragName = null;
    this._renderRail();
    this.rail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-drawer]');
      if (b) this.toggle(b.dataset.drawer);
    });
    this.scrim.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => this._onClick(e));
    this.el.addEventListener('input', (e) => this._onInput(e));
    this.el.addEventListener('submit', (e) => this._onSubmit(e));
    this.el.addEventListener('keydown', (e) => this._onKeyDown(e));
    this._bindRunPreviews();
    this._bindVarsDrag();
    subscribeState(() => {
      if (this.current === 'vars') this._renderVarsList();
      if (this.current === 'vars') this._renderHeadSub();
    });
    app.entry.subscribeHistory(() => { if (this.current === 'history') this._renderHistoryList(); });
  }

  get prefs() { return this.app.prefs; }

  _bindRunPreviews() {
    const runButton = (e) => e.target.closest?.('[data-dw="cmd-run"], [data-dw="ref-run"]');
    this.el.addEventListener('pointerover', (e) => {
      const run = runButton(e);
      if (run && e.pointerType === 'mouse') this.app.previewCommand(run.dataset.cmd);
    });
    this.el.addEventListener('pointerout', (e) => {
      const run = runButton(e);
      if (run && !run.contains(e.relatedTarget)) this.app.clearPreview();
    });
    this.el.addEventListener('focusin', (e) => {
      const run = runButton(e);
      if (run?.matches(':focus-visible')) this.app.previewCommand(run.dataset.cmd);
    });
    this.el.addEventListener('focusout', (e) => { if (runButton(e)) this.app.clearPreview(); });
  }

  isOpen() { return this.current !== null; }

  open(id) {
    if (!DRAWERS.some((d) => d.id === id)) return;
    this.current = id;
    this.app.setPrefs({ drawer: id, lastDrawer: id });
    this.render();
    this._focusDefault();
  }

  close() {
    if (!this.current) return;
    const leaving = this.current;
    this.current = null;
    this.app.setPrefs({ drawer: null });
    this.render();
    if (leaving === 'plot') this.app.setPlotFocus?.(false);
  }

  toggle(id = null) {
    const target = id ?? (this.current ? null : this.prefs.lastDrawer ?? 'catalog');
    if (!target || this.current === target) { this.close(); return; }
    this.open(target);
  }

  refresh() { if (this.current) this._renderBody(); }

  get graph() {
    if (!this._graph) this._graph = new GraphView({ app: this.app });
    return this._graph;
  }

  openGraph(kind, stack) {
    this.open('plot');
    this.graph.applyPlotOp(kind, stack);
  }

  showReference(name) {
    this.cat.ref = name;
    const { history, idx } = pushHistory(this.cat.history, this.cat.idx, name);
    this.cat.history = history;
    this.cat.idx = idx;
    if (this.current !== 'catalog') this.open('catalog');
    else this._renderBody();
  }

  _renderRail() {
    this.rail.innerHTML = DRAWERS.map((d) => `<button type="button" data-drawer="${d.id}" aria-pressed="${this.current === d.id}" title="${escapeHtml(d.label)}">${icon(d.icon)}<span>${escapeHtml(d.short ?? d.label)}</span>${d.id === 'assistant' ? '<i class="dot off" aria-hidden="true"></i>' : ''}</button>`).join('');
  }

  setAssistantConnected(on) {
    this.rail.querySelector('[data-drawer="assistant"] .dot')?.classList.toggle('off', !on);
  }

  render() {
    const id = this.current;
    this.rail.querySelectorAll('[data-drawer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.drawer === id)));
    this.el.classList.toggle('open', !!id);
    this.el.classList.toggle('wide', !!id && this.prefs.drawerWide);
    this.scrim.classList.toggle('on', !!id);
    if (Number.isFinite(this.prefs.drawerWidth) && !this.prefs.drawerWide) this.el.style.setProperty('--drawer-w', `${this.prefs.drawerWidth}px`);
    else this.el.style.removeProperty('--drawer-w');
    if (!id) { this.el.innerHTML = ''; return; }
    const meta = DRAWERS.find((d) => d.id === id);
    const tabs = `<div class="dw-tabs" role="tablist">${DRAWERS.map((d) => `<button type="button" data-dw="tab" data-drawer-tab="${d.id}" aria-pressed="${d.id === id}">${icon(d.icon, 'sm')}${escapeHtml(d.short ?? d.label)}</button>`).join('')}</div>`;
    const extra = this._headActions(id);
    const wideBtn = id === 'assistant' || id === 'plot' ? '' : `<button type="button" class="icon-btn sm" data-dw="wide" title="${this.prefs.drawerWide ? 'Narrower' : 'Wider'}" aria-label="${this.prefs.drawerWide ? 'Narrower' : 'Wider'}">${icon(this.prefs.drawerWide ? 'collapse' : 'expand', 'sm')}</button>`;
    this.el.innerHTML = `<div class="drawer-grip" aria-hidden="true"></div>${tabs}<div class="dw-head"><div class="dw-title">${icon(meta.icon)}<span>${escapeHtml(meta.label)}</span><small class="dw-sub"></small></div>${extra}${wideBtn}<button type="button" class="icon-btn sm" data-dw="close" title="Close${shortcutText('drawer.toggle') ? ` (${shortcutText('drawer.toggle')})` : ''}" aria-label="Close">${icon('x', 'sm')}</button></div><div class="dw-body"></div>`;
    this._bindGrip(this.el.querySelector('.drawer-grip'));
    this._renderHeadSub();
    this._renderBody();
  }

  _headActions(id) {
    if (id === 'plot') {
      const focused = this.app.plotFocus;
      return `<button type="button" class="icon-btn sm" data-dw="plot-focus" title="${focused ? 'Back to the drawer' : 'Expand to fill the window'}" aria-label="${focused ? 'Back to the drawer' : 'Expand'}">${icon(focused ? 'collapse' : 'expand', 'sm')}</button><button type="button" class="icon-btn sm" data-dw="plot-full" title="Full screen" aria-label="Full screen">${icon('full', 'sm')}</button>`;
    }
    if (id === 'assistant') {
      const mode = this.prefs.assistantMode;
      return `<div class="as-mode" role="radiogroup" aria-label="Assistant mode"><button type="button" data-dw="as-mode" data-mode="ask" role="radio" aria-checked="${mode === 'ask'}" title="Questions about RPL, maths and physics">Ask</button><button type="button" data-dw="as-mode" data-mode="tutor" role="radio" aria-checked="${mode === 'tutor'}" title="Walk me through a problem step by step">${icon('cap', 'sm')}Tutor</button></div>`;
    }
    if (id === 'history') {
      return `<button type="button" class="icon-btn sm" data-dw="hist-sort" title="${this.prefs.historySort === 'newest' ? 'Newest first' : 'Oldest first'}: click to flip" aria-label="Sort">${icon(this.prefs.historySort === 'newest' ? 'down' : 'up', 'sm')}</button><button type="button" class="icon-btn sm" data-dw="hist-clear" title="Clear the history" aria-label="Clear the history">${icon('trash', 'sm')}</button>`;
    }
    return '';
  }

  _renderHeadSub() {
    const sub = this.el.querySelector('.dw-sub');
    if (!sub) return;
    if (this.current === 'catalog') sub.textContent = `${allOps().filter((n) => !n.includes('->')).length} commands`;
    else if (this.current === 'vars') sub.textContent = currentPath().join(' › ');
    else sub.textContent = '';
  }

  _body() { return this.el.querySelector('.dw-body'); }

  _renderBody() {
    const body = this._body();
    if (!body) return;
    const id = this.current;
    if (id === 'assistant') return this._renderAssistant(body);
    if (id === 'plot') return this._renderPlot(body);
    if (id === 'catalog') return this._renderCatalog(body);
    if (id === 'vars') return this._renderVars(body);
    if (id === 'history') return this._renderHistory(body);
    if (id === 'chars') return this._renderChars(body);
  }

  _focusDefault() {
    if (typeof window === 'undefined' || window.innerWidth < 520) return;
    requestAnimationFrame(() => {
      const target = this.el.querySelector('[data-q]') ?? this.el.querySelector('.cb-input');
      target?.focus({ preventScroll: true });
    });
  }

  _renderAssistant(body) {
    if (!this._chat) {
      if (!this.app.chatBot) { body.innerHTML = '<div class="empty-note">Starting the assistant…</div>'; return; }
      this._chat = document.createElement('div');
      this._chat.className = 'cb-panel-wrap fill';
      this.app.chatBot.mount(this._chat);
    }
    body.innerHTML = '';
    body.appendChild(this._chat);
  }

  _renderPlot(body) {
    body.innerHTML = '';
    body.appendChild(this.graph.el);
    this.graph.el.classList.add('fill');
    this.graph.resize?.();
  }

  async _ensureReference() {
    if (this.reference) return this.reference;
    try { this.reference = await loadCommandReference(); }
    catch { this.reference = new Map(); }
    if (this.current === 'catalog') this._renderCatalogList();
    return this.reference;
  }

  _renderCatalog(body) {
    if (this.cat.ref) { this._renderReference(body); return; }
    body.innerHTML = `<div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="cat" placeholder="Search commands and what they do" aria-label="Search commands" value="${escapeHtml(this.cat.q)}" autocomplete="off" spellcheck="false"></label></div><div class="dw-list"></div>`;
    this._renderCatalogList();
    this._ensureReference();
  }

  _renderCatalogList() {
    const list = this._body()?.querySelector('.dw-list');
    if (!list) return;
    const q = this.cat.q.trim();
    if (q) {
      const rows = searchCommands(q, { names: allOps(), entries: this.reference, categories: CATEGORIES, limit: 40 });
      list.innerHTML = rows.length
        ? `<div class="sec-h">${rows.length} match${rows.length === 1 ? '' : 'es'}</div>${rows.map((r) => this._cmdRow(r.name, q)).join('')}`
        : `<div class="empty-note">Nothing matches “${escapeHtml(q)}”. Try a word from what the command does, like “derivative” or “swap”.</div>`;
      return;
    }
    if (!this.cat.family) {
      list.innerHTML = `<div class="sec-h">Families</div><div class="cat-cats">${MENU_FAMILIES.map((f) => `<button type="button" data-dw="cat-family" data-family="${f.id}"><b>${escapeHtml(f.title)}</b><span>${familyCommands(f).length} commands</span></button>`).join('')}</div>`;
      return;
    }
    const family = MENU_FAMILIES.find((f) => f.id === this.cat.family);
    const names = familyCommands(family);
    const units = family.id === 'UNITS'
      ? `<div class="sec-h">Insert a unit</div><div class="unit-grid">${UNIT_SYMBOLS.filter((u) => UNIT_CATALOG.has(u)).map((u) => `<button type="button" data-dw="unit" data-unit="${escapeHtml(u)}" title="Attach _${escapeHtml(u)} to the number you are typing, or to level 1">${escapeHtml(u)}</button>`).join('')}</div>`
      : '';
    list.innerHTML = `<div class="cat-crumb"><button type="button" class="mini" data-dw="cat-back" title="All families" aria-label="All families">${icon('chl', 'sm')}</button><b>${escapeHtml(family.title)}</b><span class="badge">${names.length}</span></div>${names.map((n) => this._cmdRow(n)).join('')}${units}`;
  }

  _cmdRow(name, query = '') {
    const entry = this.reference ? findReferenceEntry(this.reference, name) : null;
    const available = !!lookup(name);
    const label = query ? highlightSegments(name, matchPositions(query, name)).map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('') || escapeHtml(name) : escapeHtml(name);
    const sig = entry ? signatureOf(entry) : '';
    const desc = entry ? shortDescription(entry, 120) : (available ? '' : 'Not available in rpl.ai');
    return `<div class="cmd-row${available ? '' : ' stub'}" data-dw="cmd" data-cmd="${escapeHtml(name)}" role="button" tabindex="0" title="Open the reference for ${escapeHtml(name)}"><div class="nm"><span>${label}</span>${sig ? `<span class="sig">${escapeHtml(sig)}</span>` : ''}</div>${desc ? `<div class="ds">${escapeHtml(desc)}</div>` : ''}<div class="acts">${available ? `<button type="button" class="mini" data-dw="cmd-run" data-cmd="${escapeHtml(name)}" title="Run ${escapeHtml(name)}" aria-label="Run ${escapeHtml(name)}">${icon('play', 'sm')}</button>` : ''}</div></div>`;
  }

  async _renderReference(body) {
    const name = this.cat.ref;
    const entry = (await this._ensureReference()) && findReferenceEntry(this.reference, name);
    if (this.cat.ref !== name || this.current !== 'catalog') return;
    const available = !!lookup(name);
    const sig = entry ? signatureOf(entry) : '';
    body.innerHTML = `<div class="ref">
      <div class="ref-top"><button type="button" class="mini" data-dw="ref-back" title="Back" aria-label="Back">${icon('chl', 'sm')}</button><h4>${escapeHtml(entry?.name ?? name)}</h4>${entry?.type ? `<span class="badge">${escapeHtml(entry.type)}</span>` : ''}</div>
      ${entry ? `<div class="sum">${escapeHtml(shortDescription(entry, 400))}</div>` : ''}
      ${sig ? `<div><div class="lbl">Stack</div><pre class="ref-sig">${escapeHtml(entry.io.replace(/`/g, "'"))}</pre></div>` : ''}
      <div class="acts">${available ? `<button type="button" class="btn pri" data-dw="ref-run" data-cmd="${escapeHtml(name)}">${icon('play', 'sm')}Run ${escapeHtml(name)}</button><button type="button" class="btn" data-dw="ref-insert">Insert in the command line</button>` : `<span class="badge">Not available in rpl.ai</span>`}<button type="button" class="btn ghost" data-dw="ref-ask">${icon('spark', 'sm')}Ask about it</button></div>
      <div class="ref-doc"></div>
    </div>`;
    const doc = body.querySelector('.ref-doc');
    try {
      const frag = await referenceSection(name);
      if (this.cat.ref !== name) return;
      if (frag) doc.appendChild(frag);
      else doc.innerHTML = `<p class="ref-empty">The HP 50g manual has no page for ${escapeHtml(name)}.</p>`;
    } catch (e) {
      doc.innerHTML = `<p class="ref-empty">Couldn't load the reference: ${escapeHtml(e.message)}</p>`;
    }
  }

  _renderVars(body) {
    body.innerHTML = `<div class="path-bar" data-path-bar></div><div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="vars" placeholder="Filter variables" aria-label="Filter variables" value="${escapeHtml(this.varsQuery)}" autocomplete="off" spellcheck="false"></label></div><div class="dw-list vr-list"></div><div class="vars-foot">
      <button type="button" class="btn" data-dw="vars-newdir">${icon('folder', 'sm')}New folder</button>
      <button type="button" class="btn" data-dw="vars-upload" title="Add a variable from a .json file or an HP text file (.rpl / .txt, named after the file)">${icon('up', 'sm')}Upload</button>
      <button type="button" class="btn" data-dw="vars-export-rpl" title="Download this directory as an HP text file (DIR … END)">${icon('down', 'sm')}Export .rpl</button>
      <button type="button" class="btn ghost" data-dw="vars-export" title="Download the stack and the whole HOME tree as JSON">${icon('down', 'sm')}Back up everything</button>
      <button type="button" class="btn ghost" data-dw="vars-import" title="Replace the stack and HOME tree from a JSON backup (undoable)">${icon('up', 'sm')}Restore from file</button>
    </div><div class="sec-h">Backups<span class="badge" data-backup-count></span></div><form class="backup-new" data-form="archive"><input type="text" name="name" placeholder="Backup name" aria-label="Backup name" spellcheck="false" autocomplete="off"><select name="port" aria-label="Port" title="Port 0 lives in this browser; ports 1–3 are separate slots">${[0, 1, 2, 3].map((p) => `<option value="${p}">:${p}:</option>`).join('')}</select><button type="submit" class="btn" title="Save the stack and HOME tree (same as :n:name ARCHIVE)">Archive</button></form><div class="dw-backups"></div>`;
    this._renderVarsList();
  }

  _renderVarsList() {
    const body = this._body();
    const bar = body?.querySelector('[data-path-bar]');
    const list = body?.querySelector('.vr-list');
    if (!bar || !list) return;
    const path = currentPath();
    bar.innerHTML = path.map((seg, i) => `${i ? '<span class="sep" aria-hidden="true">›</span>' : ''}<button type="button" data-dw="path" data-index="${i}" aria-current="${i === path.length - 1}" title="${i === path.length - 1 ? `You are in ${escapeHtml(seg)}` : `Go to ${escapeHtml(seg)}; drop a variable here to move it`}">${escapeHtml(seg)}</button>`).join('');
    const q = this.varsQuery.trim().toLowerCase();
    const entries = [...calcState.current.entries.entries()].filter(([name]) => !q || name.toLowerCase().includes(q));
    if (!entries.length) {
      list.innerHTML = `<div class="empty-note">${q ? 'No variable matches.' : 'This directory is empty. Store a value with <span class="kc">STO</span> (for example <code>42 `X` STO</code>), or upload a file.'}</div>`;
    } else {
      list.innerHTML = entries.map(([name, value]) => this._varRow(name, value)).join('');
    }
    this._renderBackups();
  }

  _varRow(name, value) {
    const isDir = value.type === TYPES.DIRECTORY;
    const n = escapeHtml(name);
    const preview = isDir ? `${value.entries.size} item${value.entries.size === 1 ? '' : 's'}` : format(value);
    const acts = isDir
      ? `<button type="button" class="mini" data-dw="var-open" data-name="${n}" title="Open ${n}" aria-label="Open ${n}">${icon('chr', 'sm')}</button>`
      : `<button type="button" class="mini" data-dw="var-rcl" data-name="${n}" title="Recall ${n} without running it" aria-label="Recall ${n}">${icon('down', 'sm')}</button><button type="button" class="mini" data-dw="var-edit" data-name="${n}" title="Edit ${n}" aria-label="Edit ${n}">${icon('edit', 'sm')}</button>`;
    return `<div class="vr${isDir ? ' dir' : ''}" draggable="true" data-drag-name="${n}" data-dw="var" data-name="${n}" role="button" tabindex="0" title="${isDir ? `Open ${n}` : `${n}: click to ${value.type === TYPES.PROGRAM ? 'run' : 'put on the stack'}`}">
      <span class="grip" aria-hidden="true">${icon('grip', 'sm')}</span>
      <div class="main"><div class="nm">${isDir ? icon('folder', 'sm') : ''}<span class="nm-text">${n}</span><span class="badge">${escapeHtml(isDir ? 'Folder' : typeName(value))}</span></div><div class="pv">${escapeHtml(preview.length > 120 ? `${preview.slice(0, 119)}…` : preview)}</div></div>
      <div class="acts">${acts}<button type="button" class="mini" data-dw="var-move" data-name="${n}" title="Move ${n} to another folder or place" aria-label="Move ${n}">${icon('folder', 'sm')}</button><button type="button" class="mini" data-dw="var-rename" data-name="${n}" title="Rename ${n}" aria-label="Rename ${n}">${icon('edit', 'sm')}</button><button type="button" class="mini" data-dw="var-download" data-name="${n}" title="Download ${n}" aria-label="Download ${n}">${icon('down', 'sm')}</button><button type="button" class="mini danger" data-dw="var-delete" data-name="${n}" title="Delete ${n} (undoable)" aria-label="Delete ${n}">${icon('trash', 'sm')}</button></div>
    </div>`;
  }

  _renderBackups() {
    const wrap = this._body()?.querySelector('.dw-backups');
    const count = this._body()?.querySelector('[data-backup-count]');
    if (!wrap) return;
    let backups = [];
    let unavailable = '';
    try { backups = listBackups(); } catch (e) { unavailable = e.message; }
    if (count) count.textContent = backups.length ? String(backups.length) : '';
    wrap.innerHTML = unavailable || !backups.length
      ? `<div class="empty-note">${escapeHtml(unavailable || 'No backups yet. Name one above, or run :0:name ARCHIVE.')}</div>`
      : backups.map(({ port, name, savedAt, depth }) => {
        const key = escapeHtml(`${port}:${name}`);
        return `<div class="vr" data-dw="backup-restore" data-key="${key}" role="button" tabindex="0" title="Restore :${key} (replaces the stack and HOME tree; undoable)"><span class="grip" aria-hidden="true">${icon('clock', 'sm')}</span><div class="main"><div class="nm">:${key}</div><div class="pv">${depth} level${depth === 1 ? '' : 's'} · ${escapeHtml(new Date(savedAt).toLocaleString())}</div></div><div class="acts"><button type="button" class="mini danger" data-dw="backup-delete" data-key="${key}" title="Delete :${key}" aria-label="Delete backup :${key}">${icon('trash', 'sm')}</button></div></div>`;
      }).join('');
  }

  _renderHistory(body) {
    body.innerHTML = `<div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="history" placeholder="Filter history" aria-label="Filter history" value="${escapeHtml(this.historyQuery)}" autocomplete="off" spellcheck="false"></label></div><div class="dw-list"></div>`;
    this._renderHistoryList();
  }

  _renderHistoryList() {
    const list = this._body()?.querySelector('.dw-list');
    if (!list) return;
    const { entry } = this.app;
    const q = this.historyQuery.trim().toLowerCase();
    const hist = entry.getHistory();
    const ordered = this.prefs.historySort === 'newest' ? hist.slice().reverse() : hist.slice();
    const rows = ordered.filter((s) => !q || s.toLowerCase().includes(q));
    const errors = entry.getErrorLog().slice().reverse().filter((e) => !q || `${e.message} ${e.input}`.toLowerCase().includes(q));
    const errHtml = errors.length
      ? `<div class="sec-h">Errors<button type="button" data-dw="errors-clear">Clear</button></div>${errors.map((e) => `<div class="hr err"${e.input ? ` data-dw="hist-recall" data-text="${escapeHtml(e.input)}" role="button" tabindex="0" title="Put it back in the command line"` : ''}><div class="in-t">${escapeHtml(e.input || e.message)}</div><div class="out">${escapeHtml(e.input ? e.message : '')} · ${escapeHtml(new Date(e.at).toLocaleTimeString())}</div><div class="acts">${e.input ? `<button type="button" class="mini" data-dw="hist-recall" data-text="${escapeHtml(e.input)}" title="Recall" aria-label="Recall">${icon('undo', 'sm')}</button>` : ''}<button type="button" class="mini" data-dw="err-explain" data-text="${escapeHtml(`${e.input ? `${e.input}: ` : ''}${e.message}`)}" title="Ask the assistant what went wrong" aria-label="Explain">${icon('spark', 'sm')}</button></div></div>`).join('')}`
      : '';
    const histHtml = rows.length
      ? `<div class="sec-h">Entries</div>${rows.map((t) => `<div class="hr" data-dw="hist-recall" data-text="${escapeHtml(t)}" role="button" tabindex="0" title="Put it back in the command line"><div class="in-t">${escapeHtml(t)}</div><div class="acts"><button type="button" class="mini" data-dw="hist-run" data-text="${escapeHtml(t)}" title="Run it again" aria-label="Run again">${icon('play', 'sm')}</button><button type="button" class="mini danger" data-dw="hist-delete" data-text="${escapeHtml(t)}" title="Delete" aria-label="Delete">${icon('x', 'sm')}</button></div></div>`).join('')}`
      : `<div class="empty-note">${hist.length ? 'No entry matches.' : 'Everything you enter shows up here, ready to recall or run again.'}</div>`;
    list.innerHTML = errHtml + histHtml;
  }

  _renderChars(body) {
    body.innerHTML = `<div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="chars" placeholder="Filter characters and constants" aria-label="Filter characters" value="${escapeHtml(this.charsQuery)}" autocomplete="off" spellcheck="false"></label></div><div class="dw-list"></div>`;
    this._renderCharsList();
  }

  _renderCharsList() {
    const list = this._body()?.querySelector('.dw-list');
    if (!list) return;
    const q = this.charsQuery.trim().toLowerCase();
    const html = Object.entries(CHAR_GROUPS).map(([group, items]) => {
      const matches = items.filter(([label, , title]) => !q || `${label} ${title ?? ''}`.toLowerCase().includes(q));
      if (!matches.length) return '';
      return `<div class="sec-h">${escapeHtml(group)}</div><div class="cgrid">${matches.map(([label, text, title]) => `<button type="button" data-dw="char" data-text="${escapeHtml(text)}" title="${escapeHtml(title ?? label)}"><b>${escapeHtml(label)}</b><span>${escapeHtml((title ?? '').split(' — ')[0])}</span></button>`).join('')}</div>`;
    }).join('');
    list.innerHTML = html || '<div class="empty-note">No character matches.</div>';
  }

  _onInput(e) {
    const q = e.target.closest?.('[data-q]');
    if (!q) return;
    const value = q.value;
    if (q.dataset.q === 'cat') { this.cat.q = value; this._renderCatalogList(); }
    else if (q.dataset.q === 'vars') { this.varsQuery = value; this._renderVarsList(); }
    else if (q.dataset.q === 'history') { this.historyQuery = value; this._renderHistoryList(); }
    else if (q.dataset.q === 'chars') { this.charsQuery = value; this._renderCharsList(); }
  }

  _onKeyDown(e) {
    const q = e.target.closest?.('[data-q]');
    if (q && e.key === 'Escape') {
      if (q.value) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); e.stopPropagation(); e.preventDefault(); }
      return;
    }
    if (q && e.key === 'Enter' && q.dataset.q === 'cat') {
      const first = this._body()?.querySelector('.cmd-row');
      if (first) { e.preventDefault(); this.showReference(first.dataset.cmd); }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-dw]')) {
      e.preventDefault();
      e.target.click();
    }
  }

  _onSubmit(e) {
    const form = e.target.closest('[data-form="archive"]');
    if (!form) return;
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const port = form.elements.port.value;
    this._archive(port, name);
  }

  _archive(port, name) {
    const { app } = this;
    if (!isStorableHpName(name)) { app.notifyError(`Backups need a variable-style name; “${name}” isn't one.`); return; }
    try {
      const exists = listBackups().some((b) => b.port === port && b.name === name);
      archiveBackup(port, name, app.stack);
      app.toast(`${exists ? 'Replaced' : 'Archived'} :${port}:${name}`);
    } catch (e) {
      app.notifyError(`Archive failed: ${e.message}`);
    }
    this._renderBackups();
  }

  _onClick(e) {
    const t = e.target.closest('[data-dw]');
    const link = e.target.closest('.cmd-help-link');
    if (link && this.el.contains(link)) { e.preventDefault(); this.showReference(link.dataset.cmd); return; }
    if (!t || !this.el.contains(t)) return;
    const { app } = this;
    const { entry } = app;
    const act = t.dataset.dw;
    const name = t.dataset.name;
    switch (act) {
      case 'close': this.close(); return;
      case 'tab': this.open(t.dataset.drawerTab); return;
      case 'wide': app.setPrefs({ drawerWide: !this.prefs.drawerWide }); this.render(); return;
      case 'plot-focus': app.setPlotFocus(!app.plotFocus); return;
      case 'as-mode': app.setAssistantMode(t.dataset.mode); return;
      case 'plot-full': this.graph.fullscreen(); return;
      case 'hist-sort': app.setPrefs({ historySort: this.prefs.historySort === 'newest' ? 'oldest' : 'newest' }); this.render(); return;
      case 'hist-clear': entry.clearHistory(); this._renderHistoryList(); app.toast('Cleared the history'); return;
      case 'cat-family': this.cat.family = t.dataset.family; this._renderCatalogList(); this._body().scrollTop = 0; return;
      case 'cat-back': this.cat.family = null; this._renderCatalogList(); return;
      case 'cmd': this.showReference(t.dataset.cmd); return;
      case 'cmd-run': e.stopPropagation(); app.runCommandFromUI(t.dataset.cmd); return;
      case 'unit': app.insertUnit(t.dataset.unit); return;
      case 'ref-back':
        if (this.cat.idx > 0) { this.cat.idx -= 1; this.cat.ref = this.cat.history[this.cat.idx]; }
        else { this.cat.ref = null; this.cat.history = []; this.cat.idx = -1; }
        this._renderBody();
        return;
      case 'ref-run': app.runCommandFromUI(this.cat.ref); return;
      case 'ref-insert': entry.type(`${entry.buffer && !/\s$/.test(entry.buffer) ? ' ' : ''}${this.cat.ref} `); entry.focus(); return;
      case 'ref-ask': app.askAssistant(`Explain the ${this.cat.ref} command: what it takes from the stack, what it returns, and a short example I can try.`); return;
      case 'char':
        if (app.inputMode === 'equation') app.equationEditor.typeText(t.dataset.text);
        else if (app.inputMode === 'matrix') app.matrixEditor.insertSymbol(t.dataset.text);
        else entry.type(t.dataset.text);
        return;
      case 'hist-recall': entry.recall(t.dataset.text); entry.focus(); return;
      case 'hist-run': e.stopPropagation(); entry.recall(t.dataset.text); app.commitEntry(); return;
      case 'hist-delete': e.stopPropagation(); entry.removeHistory(t.dataset.text); this._renderHistoryList(); return;
      case 'errors-clear': entry.clearErrorLog(); this._renderHistoryList(); return;
      case 'err-explain': e.stopPropagation(); app.askAssistant(`I got this error on the calculator: ${t.dataset.text}. What went wrong and how do I fix it?`); return;
      case 'path': app.navigateToPathSegment(Number(t.dataset.index)); return;
      case 'var': this._activateVar(name); return;
      case 'var-open': e.stopPropagation(); this._activateVar(name); return;
      case 'var-rcl': e.stopPropagation(); this._recallVar(name); return;
      case 'var-edit': e.stopPropagation(); app.editVariable(name); return;
      case 'var-rename': e.stopPropagation(); this._beginRename(t.closest('.vr'), name); return;
      case 'var-move': e.stopPropagation(); this._moveMenu(t, name); return;
      case 'var-download': e.stopPropagation(); this._download(name); return;
      case 'var-delete': e.stopPropagation(); this._deleteVar(name); return;
      case 'vars-newdir': this._newFolder(t); return;
      case 'vars-upload': this._upload(); return;
      case 'vars-export-rpl': this._exportRpl(); return;
      case 'vars-export': app.exportSnapshot(); return;
      case 'vars-import': this._import(); return;
      case 'backup-restore': this._restoreBackup(t.dataset.key); return;
      case 'backup-delete': e.stopPropagation(); this._deleteBackup(t.dataset.key); return;
    }
  }

  _activateVar(name) {
    const { app } = this;
    const value = calcState.current.entries.get(name);
    if (value === undefined) return;
    if (value.type === TYPES.DIRECTORY) {
      if (app.entry.buffer.trim()) app.commitEntry();
      goInto(name);
      return;
    }
    if (app.entry.isAlgebraic()) { app.entry.type(name); return; }
    app.pressVariable(name);
  }

  _recallVar(name) {
    const { app } = this;
    const v = varRecall(name);
    if (v === undefined) return;
    if (app.entry.buffer.trim()) app.commitEntry();
    app.entry._snapForUndo();
    app.stack.push(v);
  }

  _download(name) {
    const v = calcState.current.entries.get(name);
    if (v === undefined) return;
    try { this.app.toast(`Saved ${exportVariableToFile(name, v)}`); }
    catch (e) { this.app.notifyError(`Download failed: ${e.message}`); }
  }

  _deleteVar(name) {
    const { app } = this;
    const v = calcState.current.entries.get(name);
    if (v === undefined) return;
    app.entry._snapForUndo();
    try {
      varPurge(name);
      app.toast(`Deleted ${name}`, { action: 'Undo', onAction: () => app.runAction('edit.undo') });
    } catch (e) {
      app.entry._dropNoOpUndoStep();
      app.notifyError(v.type === TYPES.DIRECTORY
        ? `${name} isn't empty. Open it and delete what's inside first (HP PURGE works the same way).`
        : `Couldn't delete ${name}: ${e.message}`);
    }
  }

  _newFolder(anchor) {
    const { app } = this;
    const html = `<form data-newdir><h6>New folder</h6><div style="padding:4px 6px 6px"><input type="text" name="name" placeholder="Name, like PROJECTS" aria-label="Folder name" spellcheck="false" autocomplete="off" style="width:100%;height:32px;border-radius:8px;border:1px solid var(--line2);background:var(--well);color:var(--ink);padding:0 9px;font:13px/1 var(--font-mono)"></div><div class="note">Same as <code>\`NAME\` CRDIR</code>.</div><div style="display:flex;justify-content:flex-end;gap:6px;padding:6px"><button type="submit" class="btn pri">Create</button></div></form>`;
    const pop = app.popover.open(anchor, html, { label: 'New folder' });
    const form = pop.querySelector('form');
    requestAnimationFrame(() => form.elements.name.focus());
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const dir = form.elements.name.value.trim();
      if (!isStorableHpName(dir)) { app.notifyError(`“${dir}” isn't a valid name. Use letters and digits, starting with a letter.`); return; }
      app.entry._snapForUndo();
      try { makeSubdir(dir); app.popover.close(); app.toast(`Created ${dir}`, { action: 'Undo', onAction: () => app.runAction('edit.undo') }); }
      catch (err) { app.entry._dropNoOpUndoStep(); app.notifyError(err.message); }
    });
  }

  _pickFile(accept, onFile) {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = accept;
    picker.addEventListener('change', () => { const f = picker.files?.[0]; if (f) onFile(f); });
    picker.click();
  }

  _upload() {
    const { app } = this;
    this._pickFile('application/json,.json,.rpl,.txt,text/plain', async (file) => {
      try {
        const { name, value } = /\.json$/i.test(file.name)
          ? await parseVariableFile(file)
          : this._readHpTextUpload(file.name, await readFileText(file));
        if (calcState.current.entries.has(name)) { app.notifyError(`${name} already exists here. Rename or delete it first.`); return; }
        if (value?.type === TYPES.DIRECTORY) value.parent = calcState.current;
        app.entry._snapForUndo();
        varStore(name, value);
        app.toast(`Added ${name}`, { action: 'Undo', onAction: () => app.runAction('edit.undo') });
      } catch (e) {
        app.notifyError(`Upload failed: ${e.message}`);
      }
    });
  }

  _readHpTextUpload(filename, text) {
    const name = filename.replace(/\.[^.]*$/, '');
    if (!isStorableHpName(name)) throw new Error(`${filename}: rename the file to a valid variable name`);
    return { name, value: parseHpText(text, name) };
  }

  _exportRpl() {
    const dir = calcState.current;
    try { this.app.toast(`Saved ${exportHpTextFile(dir.name, dir)}`); }
    catch (e) { this.app.notifyError(`Export failed: ${e.message}`); }
  }

  _import() {
    this._pickFile('application/json,.json', (file) => this.app.importSnapshotFromFile(file));
  }

  _restoreBackup(key) {
    const { app } = this;
    const sep = key.indexOf(':');
    const port = key.slice(0, sep);
    const name = key.slice(sep + 1);
    app.entry._snapForUndo();
    try {
      restoreBackup(port, name, app.stack);
      app.toast(`Restored :${key}`, { action: 'Undo', onAction: () => app.runAction('edit.undo') });
    } catch (e) {
      app.entry._dropNoOpUndoStep();
      app.notifyError(`Restore failed: ${e.message}`);
    }
  }

  _deleteBackup(key) {
    const sep = key.indexOf(':');
    try { deleteBackup(key.slice(0, sep), key.slice(sep + 1)); this.app.toast(`Deleted backup :${key}`); }
    catch (e) { this.app.notifyError(`Delete failed: ${e.message}`); }
    this._renderBackups();
  }

  _beginRename(row, oldName) {
    const nameEl = row?.querySelector('.nm-text');
    if (!nameEl || row.classList.contains('editing')) return;
    row.classList.add('editing');
    row.draggable = false;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `New name for ${oldName}`);
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (commit && next && next !== oldName) {
        if (!isStorableHpName(next)) { this.app.notifyError(`“${next}” isn't a valid name.`); this._renderVarsList(); return; }
        this.app.entry._snapForUndo();
        try { renameCurrentEntry(oldName, next); return; }
        catch (e) { this.app.entry._dropNoOpUndoStep(); this.app.notifyError(`Rename failed: ${e.message}`); }
      }
      this._renderVarsList();
    };
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  _bindVarsDrag() {
    const el = this.el;
    const clear = () => el.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-end, .dragging').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-end', 'dragging'));
    const targetAt = (ev) => {
      const crumb = ev.target.closest?.('.path-bar button[data-index]');
      if (crumb && crumb.getAttribute('aria-current') !== 'true') return { kind: 'crumb', index: Number(crumb.dataset.index), el: crumb, zone: 'into' };
      const row = ev.target.closest?.('.vr[data-drag-name]');
      if (row) {
        const name = row.dataset.dragName;
        if (name === this._dragName) return null;
        const rect = row.getBoundingClientRect();
        const zone = dropZoneForFraction(rect.height ? (ev.clientY - rect.top) / rect.height : 0.5, row.classList.contains('dir'));
        return { kind: zone === 'into' ? 'into' : 'reorder', name, zone, el: row };
      }
      const list = ev.target.closest?.('.vr-list');
      return list ? { kind: 'end', el: list, zone: 'end' } : null;
    };
    el.addEventListener('dragstart', (ev) => {
      const row = ev.target.closest?.('.vr[data-drag-name]');
      if (!row) return;
      this._dragName = row.dataset.dragName;
      row.classList.add('dragging');
      try { ev.dataTransfer.setData('text/plain', this._dragName); ev.dataTransfer.effectAllowed = 'move'; }
      catch { /* setData can throw outside a trusted drag */ }
    });
    el.addEventListener('dragend', () => { this._dragName = null; clear(); });
    el.addEventListener('dragover', (ev) => {
      if (!this._dragName) return;
      const target = targetAt(ev);
      el.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-end').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-end'));
      if (!target) return;
      ev.preventDefault();
      target.el.classList.add(`drop-${target.zone}`);
    });
    el.addEventListener('drop', (ev) => {
      if (!this._dragName) return;
      ev.preventDefault();
      const target = targetAt(ev);
      const name = this._dragName;
      this._dragName = null;
      clear();
      if (target) this._performDrop(name, target);
    });
  }

  _performDrop(name, target) {
    const { app } = this;
    app.entry._snapForUndo();
    try {
      if (target.kind === 'crumb') {
        const dir = getDirectoryByPath(currentPath().slice(0, target.index + 1));
        if (!dir) throw new Error('that folder no longer exists');
        moveCurrentEntry(name, dir);
      } else if (target.kind === 'into') {
        moveCurrentEntry(name, calcState.current.entries.get(target.name));
      } else if (target.kind === 'reorder') {
        let before = target.name;
        if (target.zone === 'after') {
          const keys = [...calcState.current.entries.keys()];
          before = keys[keys.indexOf(target.name) + 1] ?? null;
        }
        reorderCurrentEntry(name, before);
      } else {
        reorderCurrentEntry(name, null);
      }
    } catch (e) {
      app.entry._dropNoOpUndoStep();
      app.notifyError(`Move failed: ${e.message}`);
    }
  }

  _moveMenu(anchor, name) {
    const path = currentPath();
    const entries = [...calcState.current.entries.entries()];
    const keys = entries.map(([key]) => key);
    const at = keys.indexOf(name);
    const targets = {
      ...(path.length > 1 ? { up: { label: `Up to ${path.at(-2)}`, kind: 'crumb', index: path.length - 2 } } : {}),
      ...Object.fromEntries(entries.filter(([key, v]) => v.type === TYPES.DIRECTORY && key !== name)
        .map(([key]) => [`into:${key}`, { label: `Into ${key}`, kind: 'into', name: key }])),
      ...(at > 0 ? { earlier: { label: 'Earlier in the list', kind: 'reorder', name: keys[at - 1], zone: 'before' } } : {}),
      ...(at < keys.length - 1 ? { later: { label: 'Later in the list', kind: 'reorder', name: keys[at + 1], zone: 'after' } } : {}),
    };
    const html = `<h6>Move ${escapeHtml(name)}</h6>${Object.entries(targets).map(([value, t]) => `<button type="button" class="opt" data-v="${escapeHtml(value)}"><span class="ck">${icon(t.kind === 'reorder' ? (value === 'earlier' ? 'up' : 'down') : 'folder', 'sm')}</span><b>${escapeHtml(t.label)}</b></button>`).join('')}`;
    this.app.popover.open(anchor, html, {
      label: `Move ${name}`,
      onClick: (target) => {
        this.app.popover.close({ restoreFocus: false });
        const chosen = targets[target.dataset.v];
        if (chosen) this._performDrop(name, chosen);
      },
    });
  }

  _bindGrip(grip) {
    if (!grip) return;
    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const startX = ev.clientX;
      const startW = this.el.getBoundingClientRect().width;
      grip.classList.add('dragging');
      grip.setPointerCapture?.(ev.pointerId);
      const move = (e) => {
        const w = Math.max(DRAWER_MIN_WIDTH, Math.min(DRAWER_MAX_WIDTH, startW + e.clientX - startX));
        this.el.style.setProperty('--drawer-w', `${w}px`);
      };
      const up = () => {
        grip.classList.remove('dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.app.setPrefs({ drawerWidth: Math.round(this.el.getBoundingClientRect().width), drawerWide: false });
        this._graph?.resize?.();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', () => {
      this.el.style.removeProperty('--drawer-w');
      this.app.setPrefs({ drawerWidth: null });
    });
  }
}
