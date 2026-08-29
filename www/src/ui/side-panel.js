/* =================================================================
   Side-panel: Commands / History / Characters / Files

   A slide-in overlay on the right edge of the bezel that replaces
   several shift-layer soft menus (CMD, PRG, CHARS, MTH, CAT, EXP&LN,
   TRIG, CALC, ALG, MATRICES, STAT, CONVERT, UNITS, ARITH, CMPLX).
   Instead of 6 cramped labels on the LCD, the user gets a scrollable,
   tabbed panel.

   Three tabs:

     1. Commands  —  Every registered op, grouped by the same categories
                     used in docs/COMMANDS.md.  Click behavior
                     mirrors a keypad button press: if the command line
                     has content, the op commits the buffer first, then
                     runs.  Inside algebraic entry (unclosed tick), text
                     commands are appended as identifiers instead.

     2. History   —  The Entry command-history ring buffer, newest
                     first.  A sort toggle flips to oldest-first.  Click
                     an entry → recall into the command line for edit.

     3. Characters — Greek letters + math / program glyphs that aren't
                     on the keypad.  Click → `entry.type(char)`.

   The panel is intentionally NOT modal — the user can click inside the
   panel and then keep typing or press keypad buttons.  Only a close
   button (×) or another CAT press dismisses it.
   ================================================================= */

import { allOps, lookup } from '../rpl/ops.js';
import {
  state as calcState, subscribe as subscribeState,
  varRecall, varStore, varPurge, goInto, currentPath,
  getDirectoryByPath, moveCurrentEntry, reorderCurrentEntry,
  renameCurrentEntry,
} from '../rpl/state.js';
import { TYPES, isStorableHpName } from '../rpl/types.js';
import { UNIT_CATALOG } from '../rpl/units.js';
import {
  exportVariableToFile, parseVariableFile,
} from '../rpl/persist.js';
import { CommandHelp } from './command-help.js';

/* -----------------------------------------------------------------
   Command categories.  Keys are the display names; values are arrays
   of op names (must match the registered op names from ops.js).  Ops
   not in this map fall into "Other".  Missing-from-registry names are
   rendered but disabled — lets the catalog double as a roadmap.
   Kept roughly aligned with docs/COMMANDS.md so the two
   stay in sync.
   ----------------------------------------------------------------- */
export const CATEGORIES = {
  'Stack': [
    'DUP', 'DUP2', 'DUPN', 'DUPDUP', 'NDUPN',
    'DROP', 'DROP2', 'DROPN',
    'SWAP', 'OVER', 'UNDER', 'ROT', 'NIP',
    'PICK', 'PICK3', 'UNPICK', 'ROLL', 'ROLLD',
    'DEPTH', 'CLEAR',
    'UNDO', 'REDO', 'LASTSTACK',
    'LAST', 'LASTARG',
  ],
  'Arithmetic': [
    '+', '-', '*', '/', '^',
    'NEG', 'INV', 'ABS', 'SQ', 'SQRT', '√', 'XROOT',
    'FLOOR', 'CEIL', 'IP', 'FP', 'SIGN', 'MOD', 'RND', 'TRNC', 'TRUNC',
    'MIN', 'MAX', 'MINR', 'MAXR',
    'MANT', 'XPON',
    '%', '%CH', '%T',
    'DECR', 'INCR',
    'HMS+', 'HMS-', '→HMS', 'HMS→',
    'D→HMS', 'HMS→D',
    'RAND', 'RDZ',
    '→Q', 'Q→', '→QΠ',
  ],
  'Trig / log / exp / hyperbolic': [
    'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN',
    'LN', 'LOG', 'EXP', 'ALOG', 'LNP1', 'EXPM',
    'SINH', 'COSH', 'TANH', 'ASINH', 'ACOSH', 'ATANH',
    'R→D', 'D→R',
    'DEG', 'RAD', 'GRD', 'GRAD',
  ],
  'Complex / coordinates': [
    'RE', 'IM', 'CONJ', 'ARG',
    'R→C', 'C→R',
    'C→P', 'P→C',
    'RECT', 'CYLIN', 'SPHERE',
    'CMPLX', 'CMPLX?',
  ],
  'Comparisons / logic': [
    '==', '=', 'SAME', '≠', '<>', '<', '>', '≤', '<=', '≥', '>=',
    'AND', 'OR', 'XOR', 'NOT',
    'TRUE', 'FALSE',
  ],
  'Integer / number theory': [
    'GCD', 'LCM', 'FACT', '!',
    'DIVIS', 'FACTORS', 'EULER',
    'ISPRIME?', 'NEXTPRIME', 'PREVPRIME',
    'IABCUV', 'IBERNOULLI', 'ICHINREM', 'IEGCD',
    'EUCLID', 'IDIV2', 'IQUOT', 'IREMAINDER', 'PA2B2',
    // Modular-arithmetic family — share state.casModulo via MODSTO.
    'MODSTO', 'ADDTMOD', 'SUBTMOD', 'MULTMOD', 'POWMOD',
    'INVMOD', 'DIVMOD', 'DIV2MOD', 'GCDMOD', 'EXPANDMOD', 'FACTORMOD',
  ],
  'Probability / combinatorics': [
    'COMB', 'PERM',
    'UTPN', 'UTPC', 'UTPF', 'UTPT',
  ],
  'Polynomials': [
    'FCOEF', 'PCOEF', 'PEVAL', 'HORNER', 'PTAYL',
    'PROOT', 'FROOTS', 'QUOT', 'REMAINDER',
    'CYCLOTOMIC', 'DECOMP',
    // Gröbner-basis ops: structurally polynomial-system manipulation
    // even though they live in the CAS section of HP50 AUR.
    'GBASIS', 'GREDUCE',
  ],
  'CAS / symbolic': [
    'DERIV', 'DERVX', 'INTEG', 'INTVX', 'SUBST', 'PREVAL',
    'EXPAND', 'COLLECT', 'FACTOR', 'SOLVE', 'ISOL', 'DISTRIB',
    'EXPLN', 'LNCOLLECT', 'EPSX0', 'SIMPLIFY',
    'TEXPAND', 'TLIN', 'TCOLLECT', 'TSIMP', 'HALFTAN', 'COSSIN',
    'ACOS2S', 'ASIN2C', 'ASIN2T', 'ATAN2S',
    'TAN2SC', 'TAN2SC2', 'TAN2CS2',
    'HEAVISIDE', 'DIRAC', 'LAPLACE', 'ILAP',
    'LIM', 'LIMIT', 'LIN',
    'PARTFRAC', 'PROPFRAC',
    'EXLR', 'LNAME',
    'VX', 'SVX', 'XNUM', 'XQ',
  ],
  'Special functions': [
    'GAMMA', 'LNGAMMA', 'PSI', 'BETA',
    'ERF', 'ERFC', 'EI', 'CI', 'SI',
    'ZETA', 'LAMBERT',
  ],
  'Vectors / matrices': [
    'SIZE', 'TRN', 'DET', 'NORM', 'CNRM', 'RNRM', 'TRACE', 'COND', 'RANK',
    'DOT', 'CROSS', 'HADAMARD',
    'IDN', 'CON', 'RANM', 'LSQ', 'REF', 'RREF', 'AUGMENT', 'RSD',
    'ROW+', 'ROW-', 'COL+', 'COL-',
    'ROW→', '→ROW', 'COL→', '→COL',
    'RSWP', 'CSWP', 'RCI', 'RCIJ', 'RDM',
    'LU', 'QR', 'LQ', 'CHOLESKY', 'GRAMSCHMIDT',
    'HERMITE', 'LEGENDRE', 'TCHEB', 'TCHEBYCHEFF', 'VANDERMONDE', 'HILBERT',
    'AXL', 'AXM',
    'PCAR', 'CHARPOL', 'EGV', 'EGVL',
    '→V2', '→V3', 'V→',
    '→ARRY', 'ARRY→',
  ],
  'Lists / strings': [
    'GET', 'PUT', 'GETI', 'PUTI', 'HEAD', 'TAIL', 'SUB', 'POS', 'APPEND',
    '→LIST', 'LIST→', 'OBJ→',
    '→STR', 'STR→', 'CHR',
    'REVLIST', 'SORT',
    'REPL', 'SREPL',
    'ΔLIST', 'ΠLIST', 'ΣLIST', 'DLIST', 'PLIST', 'SLIST', 'SUM',
    'MAP', 'SEQ', 'DOLIST', 'DOSUBS', 'STREAM',
    'NSUB', 'ENDSUB',
  ],
  'Statistics': [
    'MEAN', 'MEDIAN', 'VAR', 'SDEV', 'MAD', 'NSIGMA',
    'TOT', 'MAXS', 'MINS',
    'SX', 'SX2', 'SY', 'SY2', 'SXY',
    'ΣX', 'ΣX2', 'ΣY', 'ΣY2', 'ΣXY', 'NΣ',
    'MAXΣ', 'MINΣ',
    'CORR', 'COV',
    'LINFIT', 'LOGFIT', 'EXPFIT', 'PWRFIT', 'BESTFIT',
    'PREDV', 'PREDX',
  ],
  'Variables / directories': [
    'STO', 'RCL', 'PURGE', 'VARS', 'TVARS',
    'CRDIR', 'UPDIR', 'HOME', 'PATH', 'PGDIR', 'ORDER', 'MERGE',
    'STO+', 'STO-', 'STO*', 'STO/',
    'SNEG', 'SINV', 'SCONJ',
  ],
  'Evaluation / program': [
    'EVAL', '→NUM', 'NUM', '→PRG',
    'APPROX', 'EXACT',
    'IFT', 'IFTE',
    'ERRM', 'ERRN', 'ERR0', 'DOERR',
  ],
  'Control flow / debug': [
    'ABORT', 'HALT', 'CONT', 'KILL', 'PROMPT', 'RUN',
    'DBUG', 'SST', 'SST↓',
  ],
  'Flags': [
    'SF', 'CF', 'FS?', 'FC?', 'FS?C', 'FC?C',
    'RCLF', 'STOF',
  ],
  'Display / base': [
    'TEXTBOOK', 'FLAT',
    'STD', 'FIX', 'SCI', 'ENG',
    'HEX', 'DEC', 'OCT', 'BIN', 'CLB',
    'B→R', 'R→B',
    'STWS', 'RCWS',
    'ASR', 'SL', 'SR', 'RL', 'RR',
    'SLB', 'SRB', 'RLB', 'RRB',
  ],
  'Types & tags': [
    'TYPE', 'KIND', 'VTYPE',
    '→TAG', 'DTAG',
  ],
  'Units': [
    // Commands
    'UVAL', 'UBASE', '→UNIT', 'CONVERT',
    // Length
    'm', 'cm', 'mm', 'km', 'in', 'ft', 'yd', 'mi',
    // Mass
    'kg', 'g', 'mg', 'lb', 'oz',
    // Time
    's', 'ms', 'us', 'ns', 'min', 'h', 'd', 'yr',
    // Volume
    'L', 'mL',
    // Electric / thermo / amount / luminous base SI units
    'A', 'K', 'mol', 'cd',
    // Derived SI (mechanical)
    'Hz', 'N', 'J', 'W',
    // Pressure
    'Pa', 'kPa', 'bar', 'atm',
    // Electrical (derived)
    'V', 'Ω', 'ohm', 'C',
  ],
  'System': [
    'MEM', 'BYTES', 'NEWOB',
  ],
};

/* -----------------------------------------------------------------
   Character palette.  Each entry: [label, textToInsert, optional title]
   Titles are keyboard-friendly reminders ("alpha", "infinity", ...).
   ----------------------------------------------------------------- */
export const CHAR_GROUPS = {
  // Constants go first: the ones that fold under →NUM or APPROX (π, e,
  // i, MAXR, MINR) plus the HP50 CONSTANTS-library symbols people
  // commonly type into expressions.  Clicking inserts the glyph the
  // HP50 would print on the bezel.  Most physical constants aren't
  // yet wired to numeric values in this build — they insert as Names
  // and stay symbolic — but having them discoverable here matches the
  // HP50's CONS catalog and avoids scavenger-hunting through the
  // Greek table for a `μ0`.
  'Constants': [
    ['π',   'π',    'pi — folds to 3.14159… under APPROX / →NUM'],
    ['e',   'e',    'Euler — folds to 2.71828… under APPROX / →NUM'],
    ['i',   'i',    'imaginary unit — folds to (0, 1) under APPROX / →NUM'],
    ['∞',   '∞',    'infinity'],
    ['MAXR','MAXR', 'maximum real (9.99999999999e499)'],
    ['MINR','MINR', 'minimum real (1e-499)'],
    // --- HP50 CONSTANTS library (symbolic insertion only for now) ---
    ['c',   'c',    'speed of light in vacuum'],
    ['h',   'h',    'Planck constant'],
    ['ħ',   'ħ',    'reduced Planck constant (hbar)'],
    ['G',   'G',    'gravitational constant'],
    ['g',   'g',    'standard gravity (9.80665 m/s²)'],
    ['NA',  'NA',   'Avogadro constant'],
    ['k',   'k',    'Boltzmann constant'],
    ['R',   'R',    'universal gas constant'],
    ['Vm',  'Vm',   'molar volume (ideal gas, 0°C 1atm)'],
    ['σ',   'σ',    'Stefan-Boltzmann constant'],
    ['ε0',  'ε0',   'vacuum permittivity'],
    ['μ0',  'μ0',   'vacuum permeability'],
    ['q',   'q',    'elementary charge'],
    ['me',  'me',   'electron rest mass'],
    ['mp',  'mp',   'proton rest mass'],
    ['mn',  'mn',   'neutron rest mass'],
    ['F',   'F',    'Faraday constant'],
    ['α',   'α',    'fine-structure constant'],
    ['a0',  'a0',   'Bohr radius'],
    ['μB',  'μB',   'Bohr magneton'],
    ['μN',  'μN',   'nuclear magneton'],
    ['Rinf','Rinf', 'Rydberg constant'],
    ['λc',  'λc',   'Compton wavelength'],
    ['γe',  'γe',   'electron gyromagnetic ratio'],
    ['Z0',  'Z0',   'impedance of free space'],
    ['atm', 'atm',  'standard atmosphere (101325 Pa)'],
    ['T0',  'T0',   'standard temperature (273.15 K)'],
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

/* -----------------------------------------------------------------
   The "Other" bucket: every registered op not already shown under a
   named category.  ASCII arrow aliases (`->NUM`, `HMS->`, …) are
   deliberately hidden — each has a `→NUM` / `→HMS` Unicode form shown
   in its proper category, and listing both doubles the panel for no
   benefit (the ASCII names stay typeable from the entry buffer
   regardless).  `registered` and `seen` are both upper-cased sets;
   `filter` is the lower-cased search substring ('' = no filter).
   ----------------------------------------------------------------- */
export function uncategorizedOps(registered, seen, filter = '') {
  return [...registered]
    .filter(n => !seen.has(n))
    .filter(n => !n.includes('->'))
    .filter(n => !filter || n.toLowerCase().includes(filter))
    .sort();
}

/* -----------------------------------------------------------------
   Drop-zone geometry for a row hovered during a drag.  `frac` is the
   cursor's vertical position within the row (0 = top edge, 1 = bottom).
   Folder rows get a three-zone split — top 25% = before, middle 50% =
   into, bottom 25% = after — so a file can be dropped *into* a folder;
   non-folder rows use a plain top-half/bottom-half before/after split.
   ----------------------------------------------------------------- */
export function dropZoneForFraction(frac, isDir) {
  if (isDir) {
    if (frac < 0.25) return 'before';
    if (frac > 0.75) return 'after';
    return 'into';
  }
  return frac < 0.5 ? 'before' : 'after';
}

/* -----------------------------------------------------------------
   Render helpers.  All DOM construction happens here — the owning
   App just calls `SidePanel.open('commands' | 'history' | 'chars')`.
   ----------------------------------------------------------------- */

export class SidePanel {
  constructor({ root, app }) {
    this.root = root;
    this.app = app;
    this.tab = 'ai';
    this.historySort = 'newest';
    // Set of `${tab}:${sectionTitle}` strings marking sections the
    // user has collapsed.  Absence = open (the default for every new
    // section).  Persists to localStorage via _saveUIState so the
    // layout survives a reload.
    this._collapsedSections = new Set();
    this.el = null;
    // Lazily-loaded popup that overlays the calculator with the
    // command-reference entry for whichever Commands-tab button is
    // hovered.  Mounted into #calculator so its `inset: 0` covers
    // the calc area only — the side panel stays clickable.
    const calcEl = document.getElementById('calculator');
    this.commandHelp = calcEl
      ? new CommandHelp({ host: calcEl })
      : null;
    this._build();
    this._restoreUIState();
  }

  _build() {
    const panel = document.createElement('aside');
    panel.className = 'side-panel hidden';
    panel.id = 'sidePanel';
    panel.innerHTML = `
      <div class="side-panel-resizer" role="separator"
           aria-orientation="vertical" aria-label="Resize panel"
           title="Drag to resize"></div>
      <div class="side-panel-head">
        <div class="side-panel-tabs" role="tablist">
          <button type="button" class="sp-tab" data-tab="ai"       role="tab"
                  title="AI Assistant (BETA)" aria-label="AI Assistant (BETA)">✦</button>
          <button type="button" class="sp-tab" data-tab="commands" role="tab"
                  title="Commands" aria-label="Commands">📖</button>
          <button type="button" class="sp-tab" data-tab="chars"    role="tab"
                  title="Characters" aria-label="Characters">🔤</button>
          <button type="button" class="sp-tab" data-tab="files"    role="tab"
                  title="Files" aria-label="Files">📁</button>
          <button type="button" class="sp-tab" data-tab="history"  role="tab"
                  title="History" aria-label="History">🕐</button>
        </div>
        <button type="button" class="sp-close" title="Close panel" aria-label="Close">×</button>
      </div>
      <div class="side-panel-filter">
        <input type="search" class="sp-filter" placeholder="Filter…" aria-label="Filter" />
        <button type="button" class="sp-expand hidden"
                title="Expand or collapse all sections">⊟ Collapse all</button>
        <button type="button" class="sp-sort hidden" title="Toggle sort">⇅ Newest</button>
      </div>
      <div class="side-panel-body" role="tabpanel"></div>
    `;
    this.el = panel;
    this.root.appendChild(panel);
    this._bindResizer(panel.querySelector('.side-panel-resizer'));

    panel.querySelectorAll('.sp-tab').forEach(btn => {
      btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
    });
    panel.querySelector('.sp-close').addEventListener('click', () => this.close());

    const filter = panel.querySelector('.sp-filter');
    filter.addEventListener('input', () => this._render());

    panel.querySelector('.sp-sort').addEventListener('click', () => {
      this.historySort = this.historySort === 'newest' ? 'oldest' : 'newest';
      const lbl = panel.querySelector('.sp-sort');
      lbl.textContent = this.historySort === 'newest' ? '⇅ Newest' : '⇅ Oldest';
      this._render();
      this._saveUIState();
    });

    // Expand/collapse-all toggle (Commands and Characters tabs).  When
    // ANY section is open the button collapses all; when all are closed
    // it expands all.  Operates on the rendered DOM directly AND on the
    // persisted _collapsedSections set so the choice survives re-renders
    // + reloads.
    panel.querySelector('.sp-expand').addEventListener('click', () => {
      this._toggleAllSections();
    });

    // Delegated click for body items.  Pass the clicked button through
    // to _handleAction so handlers that need to navigate to the parent
    // row (e.g. in-place rename) can do so via btn.closest(...).
    panel.querySelector('.side-panel-body').addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-action]');
      if (!btn) return;
      const { action, value } = btn.dataset;
      this._handleAction(action, value, btn);
    });

    // Right-click on a Commands-tab op button → show the command-
    // reference popup over the calculator.  Suppressing the native
    // context menu here is the whole point of the gesture; left-click
    // still routes through the normal action handler above.  Unit-
    // symbol buttons are skipped (no reference entry for them).
    panel.querySelector('.side-panel-body')
      .addEventListener('contextmenu', (ev) => {
        if (!this.commandHelp) return;
        const btn = ev.target.closest?.('.sp-cmd[data-action="op"]');
        if (!btn) return;
        ev.preventDefault();
        this.commandHelp.show(btn.dataset.value);
      });

    // Files tab mirrors the current directory — any STO/PURGE or
    // CRDIR/UPDIR fires a state event, and we repaint only if the
    // Files tab is the one on screen.
    subscribeState(() => {
      if (this.tab === 'files' && this.isOpen()) this._render();
    });

    // Drag-and-drop for the Files tab.  Listeners are wired once on
    // the panel root with delegation; each rendered row sets
    // `draggable=true` and a `data-drag-name` so dragstart can pick
    // the moving entry's name out without per-row listeners.  Three
    // drop semantics share the same plumbing:
    //   - drop on a sibling file row    → reorder before/after it
    //   - drop on a directory row mid   → move INTO that directory
    //   - drop on a breadcrumb segment  → move into that ancestor
    //   - drop in empty space below the last row → move to end
    panel.addEventListener('dragstart', (ev) => {
      const row = ev.target.closest?.('.sp-file-row');
      if (!row || !row.dataset.dragName) return;
      this._dragName = row.dataset.dragName;
      try {
        ev.dataTransfer.setData('text/plain', row.dataset.dragName);
        ev.dataTransfer.effectAllowed = 'move';
      } catch { /* setData rare-failure on Firefox; safe to ignore */ }
      row.classList.add('sp-dragging');
    });
    panel.addEventListener('dragend', () => {
      this._dragName = null;
      this._clearDropFeedback();
    });
    panel.addEventListener('dragover', (ev) => {
      if (!this._dragName) return;
      const target = this._dropTargetAt(ev);
      this._clearDropFeedback();
      if (!target) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      target.el.classList.add(`sp-drop-${target.zone}`);
    });
    panel.addEventListener('drop', (ev) => {
      if (!this._dragName) return;
      const target = this._dropTargetAt(ev);
      ev.preventDefault();
      const dragged = this._dragName;
      this._dragName = null;
      this._clearDropFeedback();
      if (!target) return;
      this._performDrop(dragged, target);
    });
  }

  /** Resolve the pointer position into a logical drop target.  Returns
   *  one of:
   *    { kind: 'reorder', name, zone: 'before' | 'after' }
   *    { kind: 'into',    name, zone: 'into',  el }
   *    { kind: 'crumb',   index, zone: 'into', el }
   *    { kind: 'end',                 zone: 'before', el }
   *  …or null when the cursor is outside any drop zone or is hovering
   *  over the dragged row itself.  `el` is the DOM node to flag with a
   *  visual cue; for reorder targets it's the row, for crumb it's the
   *  segment button, for end it's the list container.  Three-zone
   *  geometry inside a row: top 25%/50% = before, middle 50% (folders
   *  only) = into, bottom 25% = after.  Non-folder rows use a simple
   *  top-half / bottom-half split. */
  _dropTargetAt(ev) {
    if (!this._dragName) return null;
    const crumb = ev.target.closest?.('.sp-crumb');
    if (crumb && this.el.contains(crumb)) {
      return { kind: 'crumb', index: Number(crumb.dataset.value), zone: 'into', el: crumb };
    }
    const row = ev.target.closest?.('.sp-file-row');
    if (row && this.el.contains(row)) {
      const name = row.dataset.dragName;
      if (!name || name === this._dragName) return null;
      const rect = row.getBoundingClientRect();
      const frac = rect.height > 0 ? (ev.clientY - rect.top) / rect.height : 0.5;
      const isDir = row.classList.contains('sp-file-row-dir');
      const zone = dropZoneForFraction(frac, isDir);
      return zone === 'into'
        ? { kind: 'into', name, zone: 'into', el: row }
        : { kind: 'reorder', name, zone, el: row };
    }
    // Empty space inside the file list → drop at end of current dir.
    const list = ev.target.closest?.('.sp-file-list');
    if (list && this.el.contains(list)) {
      return { kind: 'end', zone: 'before', el: list };
    }
    return null;
  }

  _clearDropFeedback() {
    const cls = ['sp-drop-before', 'sp-drop-after', 'sp-drop-into'];
    for (const el of this.el.querySelectorAll('.' + cls.join(', .'))) {
      el.classList.remove(...cls);
    }
  }

  _performDrop(name, target) {
    const { entry } = this.app;
    if (target.kind === 'crumb') {
      const segs = currentPath().slice(0, target.index + 1);
      const dir = getDirectoryByPath(segs);
      if (!dir) {
        entry.flashError({ message: `Move: target not found` });
        return;
      }
      try { moveCurrentEntry(name, dir); }
      catch (e) { entry.flashError({ message: `Move: ${e.message}` }); }
      return;
    }
    if (target.kind === 'into') {
      const dir = calcState.current.entries.get(target.name);
      try { moveCurrentEntry(name, dir); }
      catch (e) { entry.flashError({ message: `Move: ${e.message}` }); }
      return;
    }
    if (target.kind === 'reorder') {
      let beforeKey = target.name;
      if (target.zone === 'after') {
        const keys = [...calcState.current.entries.keys()];
        const idx = keys.indexOf(target.name);
        beforeKey = idx >= 0 ? (keys[idx + 1] ?? null) : null;
      }
      try { reorderCurrentEntry(name, beforeKey); }
      catch (e) { entry.flashError({ message: `Reorder: ${e.message}` }); }
      return;
    }
    if (target.kind === 'end') {
      try { reorderCurrentEntry(name, null); }
      catch (e) { entry.flashError({ message: `Reorder: ${e.message}` }); }
      return;
    }
  }

  open(tab = 'ai') {
    this.el.classList.remove('hidden');
    this.setTab(tab);
    this._saveUIState();
  }

  close() {
    this.el.classList.add('hidden');
    if (this.commandHelp) this.commandHelp.hide();
    this._saveUIState();
  }

  toggle(tab = 'ai') {
    if (this.isOpen() && this.tab === tab) { this.close(); return; }
    this.open(tab);
  }

  isOpen() {
    return !this.el.classList.contains('hidden');
  }

  /** Re-render the current tab's body if the panel is open.  Safe to
   *  call at any time — no-ops when hidden so callers don't need to
   *  guard with isOpen(). */
  refresh() {
    if (this.isOpen()) this._render();
  }

  setTab(tab) {
    this.tab = tab;
    this.el.querySelectorAll('.sp-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    // Sort toggle only relevant for History
    this.el.querySelector('.sp-sort').classList.toggle('hidden', tab !== 'history');
    // Expand/collapse-all toggle relevant for tabs with category sections
    // worth bulk-toggling (Commands and Characters).
    this.el.querySelector('.sp-expand').classList.toggle(
      'hidden', tab !== 'commands' && tab !== 'chars');
    // The filter bar is unused on the AI tab — hide it so the chatbot
    // gets the full panel height.
    const filterRow = this.el.querySelector('.side-panel-filter');
    if (filterRow) filterRow.classList.toggle('hidden', tab === 'ai');
    // Clear the filter input when switching tabs so stale text from the
    // Commands filter doesn't hide every History entry.
    const filterInput = this.el.querySelector('.sp-filter');
    filterInput.value = '';
    filterInput.placeholder =
      tab === 'commands' ? 'Filter commands…' :
      tab === 'history'  ? 'Filter history…'  :
      tab === 'files'    ? 'Filter files…'    :
                           'Filter characters…';
    this._render();
    this._saveUIState();
  }

  _render() {
    const body = this.el.querySelector('.side-panel-body');
    const filter = this.el.querySelector('.sp-filter').value.trim().toLowerCase();

    // AI tab: preserve the chatbot's live DOM across re-renders by
    // lazily creating a persistent container and re-appending it
    // (avoids destroying conversation history or losing event listeners).
    //
    // Subtlety: the SidePanel is constructed before `app.chatBot` exists
    // (see app.js — SidePanel at L99, ChatBot at L112), and
    // _restoreUIState() may call open()→_render() from inside our own
    // constructor.  We must NOT cache an unmounted container, or
    // subsequent renders will keep re-appending an empty <div> forever.
    // So we only cache after a successful mount, and re-attempt on every
    // render until ChatBot is available.
    if (this.tab === 'ai') {
      if (!this._chatContainer) {
        const container = document.createElement('div');
        container.className = 'cb-panel-wrap';
        if (this.app.chatBot) {
          this.app.chatBot.mount(container);
          this._chatContainer = container;          // cache only on success
        } else {
          // ChatBot not yet constructed — render a placeholder this turn
          // and try again next render.  Don't cache.
          const placeholder = document.createElement('div');
          placeholder.className = 'cb-panel-wrap';
          placeholder.textContent = 'Initialising assistant…';
          body.innerHTML = '';
          body.appendChild(placeholder);
          this._refreshExpandLabel();
          return;
        }
      }
      body.innerHTML = '';
      body.appendChild(this._chatContainer);
      this._refreshExpandLabel();
      return;
    }

    body.innerHTML = '';
    if (this.tab === 'commands') body.appendChild(this._renderCommands(filter));
    else if (this.tab === 'history') body.appendChild(this._renderHistory(filter));
    else if (this.tab === 'files')   body.appendChild(this._renderFiles(filter));
    else body.appendChild(this._renderChars(filter));
    this._refreshExpandLabel();
  }

  /** Build a collapsible `<details>` section with an `.sp-cat` header.
   *  The grid is populated by the caller via the returned element.
   *  Open/closed state persists per-tab across re-renders (and across
   *  reloads via _saveUIState) keyed by `${tab}:${title}`. */
  _makeSection(title, extraGridClass = '') {
    const key = `${this.tab}:${title}`;
    const collapsed = this._collapsedSections && this._collapsedSections.has(key);
    const section = document.createElement('details');
    section.className = 'sp-section';
    section.dataset.sectionKey = key;
    if (!collapsed) section.open = true;
    const summary = document.createElement('summary');
    summary.className = 'sp-cat';
    summary.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'sp-grid' + (extraGridClass ? ' ' + extraGridClass : '');
    section.appendChild(summary);
    section.appendChild(grid);
    // `toggle` fires after the browser has flipped the `open` attribute.
    section.addEventListener('toggle', () => {
      if (section.open) this._collapsedSections.delete(key);
      else this._collapsedSections.add(key);
      this._refreshExpandLabel();
      this._saveUIState();
    });
    return { section, grid };
  }

  /** Bulk expand/collapse every rendered section in the current tab.
   *  Decides direction by the live DOM: if any section is open we
   *  collapse all, otherwise we expand all.  Updates `_collapsedSections`
   *  in lockstep so the choice survives a re-render. */
  _toggleAllSections() {
    const sections = this.el.querySelectorAll('.side-panel-body details.sp-section');
    if (!sections.length) return;
    const anyOpen = [...sections].some(d => d.open);
    const expand = !anyOpen;
    for (const d of sections) {
      d.open = expand;                               // fires `toggle` → updates set
    }
    this._refreshExpandLabel();
  }

  /** Sync the expand/collapse-all button label with the live state of
   *  the rendered sections.  Called after a render and after every
   *  per-section toggle. */
  _refreshExpandLabel() {
    const btn = this.el.querySelector('.sp-expand');
    if (!btn) return;
    const sections = this.el.querySelectorAll('.side-panel-body details.sp-section');
    const anyOpen = [...sections].some(d => d.open);
    btn.textContent = anyOpen ? '⊟ Collapse all' : '⊞ Expand all';
  }

  _renderCommands(filter) {
    const wrap = document.createDocumentFragment();
    const seen = new Set();
    const registered = new Set(allOps().map(s => s.toUpperCase()));

    for (const [cat, names] of Object.entries(CATEGORIES)) {
      const matches = names.filter(n => !filter || n.toLowerCase().includes(filter));
      if (!matches.length) continue;
      const { section, grid } = this._makeSection(cat);
      for (const name of matches) {
        seen.add(name.toUpperCase());
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sp-cmd';
        // A name that isn't an op but IS in the unit catalog becomes a
        // unit-insert button — clicking appends `_<name>` at the cursor
        // so the user can attach it to a pending numeric value.  Kept
        // in the Commands tab's Units section so the ops and the unit
        // symbols they operate on stay colocated (rather than pulling
        // the symbols out into a separate tab).
        if (UNIT_CATALOG.has(name)) {
          b.classList.add('sp-cmd-unit');
          b.dataset.action = 'unit';
          b.dataset.value  = name;
          b.textContent = name;
          b.title = `Insert _${name} (unit tag)`;
        } else {
          const available = registered.has(name.toUpperCase());
          if (!available) b.classList.add('sp-cmd-stub');
          b.dataset.action = 'op';
          b.dataset.value  = name;
          b.textContent = name;
          const baseTitle = available
            ? `Run ${name}`
            : `${name} — not yet implemented`;
          b.title = `${baseTitle}\nRight-click for reference`;
        }
        grid.appendChild(b);
      }
      wrap.appendChild(section);
    }

    const others = uncategorizedOps(registered, seen, filter);
    if (others.length) {
      const { section, grid } = this._makeSection('Other');
      for (const name of others) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sp-cmd';
        b.dataset.action = 'op';
        b.dataset.value  = name;
        b.textContent = name;
        b.title = `Run ${name}\nRight-click for reference`;
        grid.appendChild(b);
      }
      wrap.appendChild(section);
    }

    const container = document.createElement('div');
    container.className = 'sp-commands';
    container.appendChild(wrap);
    return container;
  }

  _renderHistory(filter) {
    const hist = this.app.entry.getHistory();
    const ordered = this.historySort === 'newest' ? hist.slice().reverse() : hist.slice();
    const matched = ordered.filter(s => !filter || s.toLowerCase().includes(filter));

    const container = document.createElement('div');
    container.className = 'sp-history';

    if (matched.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.textContent = hist.length === 0
        ? 'No history yet — commit some entries with ENTER.'
        : 'No matches.';
      container.appendChild(empty);
      return container;
    }

    // Each row is a flex pair: a wide "recall" button on the left
    // (clicking it pulls the text back into the command line, same as
    // before) and a narrow × delete button on the right.  Wrapping in
    // a row gives delete its own click target without making the recall
    // button a nested-button parent (which is invalid HTML and breaks
    // event delegation).  Click delegation in _handleAction routes
    // 'recall' / 'history-delete' independently.
    for (const text of matched) {
      const row = document.createElement('div');
      row.className = 'sp-hist-row';

      const recall = document.createElement('button');
      recall.type = 'button';
      recall.className = 'sp-hist';
      recall.dataset.action = 'recall';
      recall.dataset.value  = text;
      recall.textContent = text;
      recall.title = 'Recall into the command line';
      row.appendChild(recall);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sp-hist-del';
      del.dataset.action = 'history-delete';
      del.dataset.value  = text;
      del.textContent = '×';
      del.title = 'Delete this history entry';
      del.setAttribute('aria-label', 'Delete history entry');
      row.appendChild(del);

      container.appendChild(row);
    }
    return container;
  }

  _renderChars(filter) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-chars';
    for (const [cat, entries] of Object.entries(CHAR_GROUPS)) {
      const matches = entries.filter(([label, _v, title]) => {
        if (!filter) return true;
        const hay = `${label} ${title ?? ''}`.toLowerCase();
        return hay.includes(filter);
      });
      if (!matches.length) continue;
      const { section, grid } = this._makeSection(cat, 'sp-chars-grid');
      for (const [label, text, title] of matches) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sp-char';
        b.dataset.action = 'char';
        b.dataset.value  = text;
        b.textContent = label;
        if (title) b.title = title;
        grid.appendChild(b);
      }
      wrap.appendChild(section);
    }
    return wrap;
  }

  _renderFiles(filter) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-files';

    // IO toolbar: full-tree Export/Import sit alongside a single-variable
    // Upload that drops one entry into the current directory.  Per-row
    // Download / Move / Delete handle the inverse direction (one entry
    // out, or shuffled around).  Click delegation goes through
    // _handleAction('export' | 'import' | 'upload-var').
    const io = document.createElement('div');
    io.className = 'sp-io';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'sp-io-btn';
    exportBtn.dataset.action = 'export';
    exportBtn.textContent = 'Export All';
    exportBtn.title = 'Download stack + HOME tree as JSON';
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'sp-io-btn';
    importBtn.dataset.action = 'import';
    importBtn.textContent = 'Import All';
    importBtn.title = 'Replace stack + HOME tree from a JSON file';
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'sp-io-btn';
    uploadBtn.dataset.action = 'upload-var';
    uploadBtn.textContent = 'Upload';
    uploadBtn.title = 'Add a single variable (or directory) to this directory from a JSON file';
    io.appendChild(exportBtn);
    io.appendChild(importBtn);
    io.appendChild(uploadBtn);
    wrap.appendChild(io);

    // Clickable breadcrumb mirroring the LCD path annunciator — each
    // segment navigates via the app's existing path-click handler so
    // the explorer, VARS menu, and path annunciator stay in lockstep.
    const path = currentPath();
    const crumb = document.createElement('div');
    crumb.className = 'sp-breadcrumb';
    path.forEach((seg, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sp-crumb-sep';
        sep.textContent = '/';
        crumb.appendChild(sep);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-crumb' + (i === path.length - 1 ? ' sp-crumb-current' : '');
      b.dataset.action = 'path';
      b.dataset.value  = String(i);
      b.textContent = seg;
      crumb.appendChild(b);
    });
    wrap.appendChild(crumb);

    // Insertion-order iteration — the user explicitly asked that
    // variables NOT be sorted.  state.current.entries is a Map, which
    // preserves insertion order, and the HP50 ORDER op is the only
    // way to reshuffle (matches the real unit's VARS menu, which
    // ignores alphabetical sort).
    const entries = [...calcState.current.entries.entries()]
      .filter(([name]) => !filter || name.toLowerCase().includes(filter));

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.textContent = filter
        ? 'No matches.'
        : 'Directory is empty — STO a value into a name, or click Upload.';
      wrap.appendChild(empty);
      return wrap;
    }

    const list = document.createElement('div');
    list.className = 'sp-file-list';
    for (const [name, value] of entries) {
      // Each row is a flex container holding the main name button plus
      // three small action buttons (download / move / delete).  Nesting
      // buttons inside .sp-file would be invalid HTML, so the actions
      // live as siblings — event delegation in _handleAction routes
      // each data-action independently.
      const isDir = value.type === TYPES.DIRECTORY;
      const row = document.createElement('div');
      row.className = 'sp-file-row' + (isDir ? ' sp-file-row-dir' : '');
      // Drag source.  `data-drag-name` is what the dragstart delegator
      // pulls out — kept separate from data-action / data-value (used
      // by clicks) so a click on the row still routes through
      // _handleAction without touching the drag plumbing.
      row.draggable = true;
      row.dataset.dragName = name;

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'sp-file' + (isDir ? ' sp-file-dir' : '');
      main.dataset.action = isDir ? 'dir' : 'var';
      main.dataset.value  = name;
      const label = TYPE_LABELS[value.type] ?? value.type;
      main.title = isDir
        ? `Open directory ${name}`
        : `Recall ${name} (${label}) onto the stack`;
      const nameEl = document.createElement('span');
      nameEl.className = 'sp-file-name';
      nameEl.textContent = name;
      const typeEl = document.createElement('span');
      typeEl.className = 'sp-file-type';
      typeEl.textContent = label;
      main.appendChild(nameEl);
      main.appendChild(typeEl);
      row.appendChild(main);

      // ⬇ Download — single-variable JSON.  Works for directories too
      // (the encoder walks the subtree).
      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'sp-file-act';
      dl.dataset.action = 'download-var';
      dl.dataset.value  = name;
      dl.textContent = '⬇';
      dl.title = isDir
        ? `Download directory ${name} as JSON`
        : `Download variable ${name} as JSON`;
      dl.setAttribute('aria-label', `Download ${name}`);
      row.appendChild(dl);

      // ✎ Rename — in-place prompt for a new HP identifier.
      const rn = document.createElement('button');
      rn.type = 'button';
      rn.className = 'sp-file-act';
      rn.dataset.action = 'rename-var';
      rn.dataset.value  = name;
      rn.textContent = '✎';
      rn.title = `Rename ${name}`;
      rn.setAttribute('aria-label', `Rename ${name}`);
      row.appendChild(rn);

      // × Delete — calls PURGE semantics (and refuses non-empty dirs,
      // matching the HP50 firmware behavior).
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sp-file-act sp-file-act-del';
      del.dataset.action = 'purge-var';
      del.dataset.value  = name;
      del.textContent = '×';
      del.title = isDir
        ? `Delete directory ${name} (must be empty)`
        : `Delete variable ${name}`;
      del.setAttribute('aria-label', `Delete ${name}`);
      row.appendChild(del);

      list.appendChild(row);
    }
    wrap.appendChild(list);
    return wrap;
  }

  _handleAction(action, value, btn) {
    const { entry, stack } = this.app;
    if (action === 'op') {
      const op = lookup(value);
      if (!op) { entry.flashError({ message: `${value}: not yet implemented` }); return; }
      // Mirror keypad behaviour exactly — clicks on a panel command
      // are dispatched through `typeOrExecFn`, the same helper the
      // SIN / COS / FACTOR / DERIV keys use.  That gives three
      // input-mode-aware branches:
      //
      //   - inside an unclosed backtick (algebraic entry)
      //       → types `<NAME>(`         so `\`SIN(...)\`` reads like
      //                                  textbook math.
      //   - the buffer has any other content (bare-edit RPN entry)
      //       → types ` <NAME> `        as a whitespace-separated
      //                                  token that parses to a Name.
      //       The leading space is added automatically when the cursor
      //       isn't already on whitespace, so `3 4+SIN` becomes
      //       `3 4+ SIN` and the name stays tokenised.
      //   - empty buffer (stack-direct mode)
      //       → executes the op exactly like a soft-menu press.
      //
      // Pre-fix the panel always hard-committed the buffer + ran the
      // op whenever the user had anything typed, which silently
      // lost edits a user was building.  Routing through the same
      // helper aligns "click in panel" with "press the key" so the
      // user's mental model is one rule, not two.
      entry.typeOrExecFn(value);
      return;
    }
    if (action === 'char') {
      entry.type(value);
      return;
    }
    if (action === 'unit') {
      // Attach a unit tag to the value at the cursor: type `_<unit>`.
      // If the buffer is empty, type the symbol `<unit>` alone —
      // that still parses as a Name the user can then feed to
      // →UNIT etc.  Keeps one path for "insert a unit reference"
      // regardless of whether the user has a pending number.
      entry.type(entry.buffer.length > 0 ? `_${value}` : value);
      return;
    }
    if (action === 'recall') {
      entry.recall(value);
      // Leave the panel open — user typically wants to see the list so
      // they can pick another entry if they got the wrong one.
      return;
    }
    if (action === 'history-delete') {
      // Drop the matching history entry and repaint the History tab so
      // the row disappears immediately.  The recall buffer in the entry
      // line is untouched — a user mid-edit doesn't lose their typing.
      entry.removeHistory(value);
      this._render();
      return;
    }
    if (action === 'dir') {
      // Files: descend into a subdirectory.  goInto fires a state event
      // which triggers our re-render subscription.
      if (entry.buffer.trim().length > 0) entry.enter();
      const ok = goInto(value);
      if (!ok) entry.flashError({ message: `Cannot descend: ${value}` });
      return;
    }
    if (action === 'var') {
      // Files: click a variable.  Mid-algebraic → insert the name so
      // the user can build an expression referencing it; otherwise push
      // the value (RCL semantics).
      if (entry.isAlgebraic()) { entry.type(value); return; }
      if (entry.buffer.trim().length > 0) entry.enter();
      const v = varRecall(value);
      if (v === undefined) { entry.flashError({ message: `Undefined: ${value}` }); return; }
      stack.push(v);
      return;
    }
    if (action === 'path') {
      // Breadcrumb click — reuse the app's existing segment handler so
      // Files, LCD path annunciator, and VARS menu all navigate the
      // same way.
      if (entry.buffer.trim().length > 0) entry.enter();
      this.app.navigateToPathSegment(Number(value));
      return;
    }
    if (action === 'export') {
      this.app.exportSnapshot();
      return;
    }
    if (action === 'import') {
      // Files tab uses a transient <input type="file"> so the picker
      // state (selected-file, etc.) doesn't need to hang off the DOM
      // between clicks.  Re-creating per press also sidesteps the
      // "picking the same file twice in a row fires no change event"
      // browser quirk — fresh element, fresh state.
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'application/json,.json';
      picker.addEventListener('change', async () => {
        const file = picker.files?.[0];
        if (file) await this.app.importSnapshotFromFile(file);
      });
      picker.click();
      return;
    }
    if (action === 'download-var') {
      // Files: per-row Download.  Works for both variables and
      // directories — `encode()` walks the subtree for a Directory.
      const v = calcState.current.entries.get(value);
      if (v === undefined) {
        entry.flashError({ message: `Undefined: ${value}` });
        return;
      }
      try {
        const filename = exportVariableToFile(value, v);
        this.app.entry.flashNotice(`Saved ${filename}`);
      } catch (e) {
        entry.flashError({ message: `Download failed: ${e.message}` });
      }
      return;
    }
    if (action === 'rename-var') {
      // Files: per-row Rename.  Swap the row's name span for an
      // editable input in-place — committing on Enter / blur, cancel
      // on Escape.  Validation + the actual move through
      // renameCurrentEntry happens at commit time; the state-change
      // subscriber re-renders the list so we don't have to patch
      // nameEl back ourselves on success.
      const row = btn?.closest?.('.sp-file-row');
      if (!row) return;
      this._beginRenameInPlace(row, value);
      return;
    }
    if (action === 'purge-var') {
      // Files: per-row Delete.  Confirm before destroying — a single
      // misclick on a directory full of work shouldn't be silent.
      // varPurge throws "Directory not empty" for non-empty subdirs,
      // matching HP50 PURGE semantics; we surface that as a flash
      // error rather than wrapping it.
      const v = calcState.current.entries.get(value);
      if (v === undefined) {
        entry.flashError({ message: `Undefined: ${value}` });
        return;
      }
      const isDir = v.type === TYPES.DIRECTORY;
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const ok = window.confirm(
          isDir ? `Delete directory "${value}"?  (Must be empty.)`
                : `Delete variable "${value}"?`);
        if (!ok) return;
      }
      try {
        varPurge(value);
      } catch (e) {
        entry.flashError({ message: `Delete: ${e.message}` });
      }
      return;
    }
    if (action === 'upload-var') {
      // Files: top-of-tab Upload.  Reads a single-variable JSON file,
      // checks for a name collision in the current directory, and
      // installs it.  Same transient-input pattern as the full-snapshot
      // Import button so the change event fires reliably on a re-pick.
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'application/json,.json';
      picker.addEventListener('change', async () => {
        const file = picker.files?.[0];
        if (!file) return;
        try {
          const { name, value: val } = await parseVariableFile(file);
          if (calcState.current.entries.has(name)) {
            entry.flashError({ message: `Upload: ${name} already exists here` });
            return;
          }
          // Directory uploads need their root parent re-linked to the
          // live current directory; rehydrateVariable left it null.
          if (val && val.type === TYPES.DIRECTORY) {
            val.parent = calcState.current;
          }
          // varStore emits a state event so VARS, breadcrumb, and the
          // Files list all repaint via the existing subscribe()
          // wiring.  The collision check above already cleared the
          // "Directory not allowed" branch, so this never throws here.
          varStore(name, val);
        } catch (e) {
          entry.flashError({ message: `Upload failed: ${e.message}` });
        }
      });
      picker.click();
      return;
    }
  }

  /** Replace the variable name in `row` with an editable input.
   *  Commits on Enter or blur, cancels on Escape.  On commit we
   *  validate the new name as a legal HP identifier and call
   *  renameCurrentEntry; the resulting state event triggers
   *  _render() which rebuilds the file list (so we don't manually
   *  patch nameEl back).  On cancel or no-op, restore the original
   *  text and leave the row alone. */
  _beginRenameInPlace(row, oldName) {
    const nameEl = row.querySelector('.sp-file-name');
    if (!nameEl) return;
    // Already editing → just refocus.
    if (row.classList.contains('sp-file-editing')) {
      nameEl.querySelector('input')?.focus();
      return;
    }
    row.classList.add('sp-file-editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sp-file-name-input';
    input.value = oldName;
    input.spellcheck = false;
    input.autocomplete = 'off';

    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();

    let finalised = false;
    const finalise = (commit) => {
      if (finalised) return;
      finalised = true;
      const newName = input.value.trim();
      // Restore the displayed text first; if rename succeeds the
      // state-change subscriber will rebuild the list anyway.
      row.classList.remove('sp-file-editing');
      nameEl.textContent = oldName;

      if (!commit)                          return;
      if (newName === '' || newName === oldName) return;
      if (!isStorableHpName(newName)) {
        this.app.entry.flashError({ message: `Rename: invalid name: ${newName}` });
        return;
      }
      try {
        renameCurrentEntry(oldName, newName);
      } catch (e) {
        this.app.entry.flashError({ message: `Rename: ${e.message}` });
      }
    };

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter')      { ev.preventDefault(); finalise(true); }
      else if (ev.key === 'Escape'){ ev.preventDefault(); finalise(false); }
      // Stop bubbling so the side panel's global keydown shortcuts
      // (if any) don't intercept characters being typed.
      ev.stopPropagation();
    });
    input.addEventListener('blur', () => finalise(true));
  }

  /* ---- UI persistence: open/tab/sort/width survive a page reload. ----
     Kept separate from the calc-state snapshot in persist.js — UI prefs
     are per-browser and shouldn't travel with an exported .json. */
  _saveUIState() {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
        open: this.isOpen(),
        tab: this.tab,
        historySort: this.historySort,
        width: this._panelWidth,
        collapsed: [...this._collapsedSections],
      }));
    } catch { /* quota or privacy-mode — silently skip */ }
  }

  _restoreUIState() {
    let raw;
    try { raw = localStorage.getItem(UI_STORAGE_KEY); } catch { return; }
    if (!raw) return;
    let st;
    try { st = JSON.parse(raw); } catch { return; }
    if (!st || typeof st !== 'object') return;
    const tab = VALID_TABS.has(st.tab) ? st.tab : 'ai';
    if (st.historySort === 'newest' || st.historySort === 'oldest') {
      this.historySort = st.historySort;
      const lbl = this.el.querySelector('.sp-sort');
      if (lbl) lbl.textContent = st.historySort === 'newest' ? '⇅ Newest' : '⇅ Oldest';
    }
    if (typeof st.width === 'number' && isFinite(st.width)) {
      this._applyWidth(st.width);
    }
    if (Array.isArray(st.collapsed)) {
      this._collapsedSections = new Set(st.collapsed.filter(k => typeof k === 'string'));
    }
    if (st.open) this.open(tab);
    else this.tab = tab;      // remember the tab for the next open()
  }

  /* ---- Drag-to-resize.  The resizer is a thin strip on the panel's
     left edge.  Dragging it updates --panel-width, which drives the
     panel's `width`.  Width is clamped so the panel can't eat the
     calculator or shrink past its tabs; persisted to localStorage so
     the chosen size sticks across reloads. */
  _bindResizer(handle) {
    if (!handle) return;
    const onPointerDown = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      ev.preventDefault();
      const startX = ev.clientX;
      const startW = this._panelWidth || this.el.getBoundingClientRect().width || PANEL_DEFAULT_WIDTH;
      document.body.classList.add('sp-resizing');
      handle.setPointerCapture?.(ev.pointerId);
      const onMove = (e) => {
        // Panel is right-anchored, so rightward drag shrinks it.
        const dx = e.clientX - startX;
        this._applyWidth(startW - dx);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('sp-resizing');
        this._saveUIState();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointerdown', onPointerDown);
    // Double-click resets to default.
    handle.addEventListener('dblclick', () => {
      this._applyWidth(PANEL_DEFAULT_WIDTH);
      this._saveUIState();
    });
  }

  _applyWidth(w) {
    const clamped = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, w));
    this._panelWidth = clamped;
    this.el.style.width = clamped + 'px';
  }
}

const PANEL_DEFAULT_WIDTH = 360;
const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_WIDTH = 800;

const UI_STORAGE_KEY = 'hp50.ui.sidePanel';
const VALID_TABS = new Set(['commands', 'chars', 'files', 'history', 'ai']);

/* Short labels beside each file row.  Kept compact (≤4 chars) so the
   type column doesn't push the name off-screen on narrow panels. */
const TYPE_LABELS = Object.freeze({
  [TYPES.DIRECTORY]: 'DIR',
  [TYPES.PROGRAM]:   'PRG',
  [TYPES.REAL]:      'REAL',
  [TYPES.INTEGER]:   'INT',
  [TYPES.BININT]:    'BIN',
  [TYPES.COMPLEX]:   'CPX',
  [TYPES.STRING]:    'STR',
  [TYPES.NAME]:      'NAM',
  [TYPES.SYMBOLIC]:  'SYM',
  [TYPES.LIST]:      'LIST',
  [TYPES.VECTOR]:    'VEC',
  [TYPES.MATRIX]:    'MAT',
  [TYPES.TAGGED]:    'TAG',
  [TYPES.UNIT]:      'UN',
  [TYPES.GROB]:      'GROB',
});
