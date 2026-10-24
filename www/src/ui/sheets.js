import { icon } from './icons.js';
import { escapeHtml, markScrollEdges } from './display.js';
import { ACTIONS, KEYMAP, CONTEXT_LABELS, chordText, isMacPlatform } from './actions.js';
import { STORAGE_KEY as STACK_STORAGE_KEY, BACKUPS_KEY } from '../rpl/persist.js';
import { UI_PREFS_KEY, THEMES, THEME_LABELS, STACK_SIZES, STACK_SIZE_LABELS, TUTOR_STYLES, KEYPAD_LAYOUTS, KEYPAD_LABELS, SIDES, SIDE_LABELS } from './ui-prefs.js';
import { REMOTE_CONFIG_KEY as CHAT_REMOTE_KEY, CONSENT_KEY as CHAT_CONSENT_KEY } from '../ai/chat-bot.js';
import { state as calcState, testUserFlag, setUserFlag, clearUserFlag, setClockOffset, varStore } from '../rpl/state.js';
import { ROWS, COLS, GOAL, minesAround, step, newField, saveField } from '../rpl/minehunt.js';
import { ELEMENTS } from '../rpl/elements.js';
import { PROPERTIES, propertyValue } from '../rpl/ops/periodic.js';
import { EQ_LIBRARY } from '../rpl/eqlib.js';
import { solveSet, setVariables, libraryEquation } from '../rpl/ops/eqlib.js';
import { printLog, clearPrintLog } from '../rpl/ops/print.js';
import { lookup } from '../rpl/ops/registry.js';
import { format, withFractionMark } from '../rpl/formatter.js';
import { fromTyped } from '../rpl/parser.js';
import { Real, Complex } from '../rpl/types.js';
import { VERSION, BUILD, SHA } from '../build-info.js';
import { pickFile } from './drawer.js';
import { MODES, modeById, DISPLAY_DIGITS_CHOICES } from './modes.js';


const SETTINGS_PAGES = Object.freeze(['appearance', 'calculator', 'assistant', 'data']);
const SETTINGS_PAGE_NAMES = Object.freeze({ appearance: ['sliders', 'Appearance'], calculator: ['keypad', 'Calculator'], assistant: ['spark', 'Assistant'], data: ['folder', 'Data'] });
// The HP's MODES switches: a number is a flag, read on while clear for Beep and last arguments as the HP's form does,
// and a name is an app preference.
const CALC_SWITCHES = Object.freeze([
  [-51, false, 'Decimal comma', 'Show 1,5 and read a typed comma as the decimal mark, with ; between the parts of (1,5; 2).'],
  [-56, true, 'Beep', 'An error beeps, and BEEP plays its tone; with key vibration on, an error buzzes too.'],
  ['keyClick', false, 'Key click', "A short tick as a key or soft key is pressed, for a phone that can't vibrate, such as an iPhone."],
  [-55, true, 'Save last arguments', 'LASTARG brings back the arguments of the last command.'],
  [-41, false, '24-hour clock', 'TSTR and the alarm list write 14:55:00 rather than 02:55:00P.'],
  [-42, false, 'Day first in dates', 'Dates are read and written as DD.MMYYYY rather than MM.DDYYYY.'],
]);
const VIEW_ZOOM_MIN = 0.4;
const VIEW_ZOOM_MAX = 4;

export function clampViewZoom(zoom) {
  return Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, zoom));
}

// The pad's squares, row by row: [dr, dc, arrow, label, digit key, arrow key]; the middle one shows the count.
const MOVES = [
  [-1, -1, '↖', 'Up and left', '7'], [-1, 0, '↑', 'Up', '8', 'ArrowUp'], [-1, 1, '↗', 'Up and right', '9'],
  [0, -1, '←', 'Left', '4', 'ArrowLeft'], null, [0, 1, '→', 'Right', '6', 'ArrowRight'],
  [1, -1, '↙', 'Down and left', '1'], [1, 0, '↓', 'Down', '2', 'ArrowDown'], [1, 1, '↘', 'Down and right', '3'],
];
// A swipe on the field moves one square its way: right first, then round by eighths of a turn, as the screen's y grows down.
const SWIPE_STEPS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const SWIPE_PX = 24;

// The two largest parts of the calculator clock's distance from the device's, as "2 h 5 min ahead of the device clock".
function clockOffsetText(ms) {
  const parts = [];
  let rest = Math.abs(ms);
  for (const [size, label] of [[86400000, 'd'], [3600000, 'h'], [60000, 'min'], [1000, 's']]) {
    const n = Math.floor(rest / size);
    if (n && parts.length < 2) { parts.push(`${n} ${label}`); rest -= n * size; }
  }
  return `${parts.join(' ') || 'Under a second'} ${ms > 0 ? 'ahead of' : 'behind'} the device clock`;
}

const TABLE_ROWS = 60;

// A table value at 8 digits, 12 in a field to edit, with the HP's E for a power of ten.
const tableText = (v, digits = 8) => String(Number(v.toPrecision(digits))).replace('e+', 'E').replace('e', 'E');

export class Sheets {
  constructor({ host, app }) {
    this.host = host;
    this.app = app;
    this.el = null;
    this.kind = null;
    this.page = 'appearance';
    this._confirmReset = false;
    this._returnTo = null;
  }

  isOpen() { return !!this.el; }

  close() {
    if (!this.el) return;
    this._resize?.disconnect();
    this.el.remove();
    this.el = null;
    // As a dialog does, the sheet hands the keyboard back to whatever had it, unless something has taken it since.
    const back = this._returnTo;
    this._returnTo = null;
    if (back?.isConnected && (!document.activeElement || document.activeElement === document.body)) back.focus({ preventScroll: true });
    this._liftNotes();
    this.kind = null;
    this._confirmReset = false;
  }

  // Putting INFORM's form away cancels it, as the HP's CANCEL and ON do, where it had left the program halted unseen.
  dismiss() {
    if (this.kind === 'inform') this.app.cancelInform();
    else this.close();
  }

  openSettings() {
    this.page = 'appearance';
    this._open('settings');
  }

  openShortcuts() { this._open('shortcuts'); }

  openAbout() { this._open('about'); }

  openInform(form) {
    this.form = form;
    this._open('inform');
  }

  // MINEHUNT: the grid, a direction pad, the count of mines around you; arrows or 1–9 move, K saves the game in MHpar.
  openGame(game) {
    this.game = game;
    this.gameMines = game.visible ? -game.mines.size : game.mines.size;
    this._open('game');
    requestAnimationFrame(() => this.el?.querySelector('.mh-grid')?.focus({ preventScroll: true }));
  }

  // PERTBL: the table, a tap on an element its properties, a tap on a property its value on the stack.
  openPeriodicTable() {
    this.ptZ ??= 1;
    this._open('ptable');
  }

  // What PR1, PRST and the other print commands printed, newest at the bottom as on the HP's paper.
  openPrintLog() {
    this.app.toasts?.dismiss('print');
    this._open('print');
  }

  // EQNLIB: the subjects, a subject's sets, a set's equations with Solve.
  openEquationLibrary() {
    this.eqlib ??= { subject: null, set: null };
    this._open('eqlib');
  }

  // TABLE: x from a start by a step with the plotted functions' values beside it, a tap on a value its point on the stack.
  openTable(setup) {
    this.tbl = { ...setup };
    this._open('table');
    requestAnimationFrame(() => this.el?.querySelector('[data-sh="close"]')?.focus({ preventScroll: true }));
  }

  openView(title, html, level) {
    this.view = { title, html, level };
    this._open('view');
    const view = this.el.querySelector('.sheet-view');
    markScrollEdges(view);
    view.addEventListener('scroll', () => markScrollEdges(view), { passive: true });
    zoomOnPinch(view);
  }

  _open(kind) {
    this.kind = kind;
    if (!this.el) {
      this._returnTo = document.activeElement === document.body ? null : document.activeElement;
      this.el = document.createElement('div');
      this.el.className = 'sheet-wrap';
      this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.dismiss(); });
      this.el.addEventListener('click', (e) => this._onClick(e));
      this.el.addEventListener('change', (e) => this._onChange(e));
      this.el.addEventListener('keydown', (e) => (this.kind === 'game' ? this._onGameKey(e) : this._onKeyDown(e)));
      this.el.addEventListener('pointerdown', (e) => { this._swipe = this.kind === 'game' && e.target.closest('.mh-grid') ? [e.clientX, e.clientY] : null; });
      this.el.addEventListener('pointerup', (e) => this._gameSwipe(e));
      this.host.appendChild(this.el);
      this._resize = new ResizeObserver(() => this._liftNotes());
      this._resize.observe(this.el);
    }
    this._render();
    requestAnimationFrame(() => (this.el?.querySelector('.sheet-nav button[aria-pressed="true"], .sheet-c button, .sheet-c input') ?? this.el?.querySelector('[data-sh="close"]'))?.focus({ preventScroll: true }));
  }

  // A note sits at the bottom edge while a sheet is open; over a sheet whose footer reaches that edge it would cover
  // the footer's buttons, so it goes above them.
  _liftNotes() {
    const notes = this.app.toasts?.el;
    if (!notes) return;
    const foot = this.el?.querySelector('.sheet-f')?.getBoundingClientRect();
    const box = notes.offsetParent?.getBoundingClientRect();
    const lift = foot?.height && box && foot.bottom >= box.bottom - 24 ? Math.round(box.bottom - foot.top + 8) : 0;
    notes.style.setProperty('--note-lift', `${lift}px`);
  }

  // A choice redraws the sheet; the keyboard stays on the control it was on.
  _render() {
    const keep = this._focusedControl();
    this._draw();
    this._oneStopPerGroup();
    if (keep) this.el?.querySelector(keep)?.focus({ preventScroll: true });
  }

  // As in any radio group, Tab stops once on the chosen option and the arrow keys choose among them.
  _oneStopPerGroup() {
    for (const group of this.el?.querySelectorAll('[role="radiogroup"]') ?? []) {
      const radios = [...group.querySelectorAll('[role="radio"]')];
      const chosen = radios.find((r) => r.getAttribute('aria-checked') === 'true') ?? radios[0];
      for (const r of radios) r.tabIndex = r === chosen ? 0 : -1;
    }
  }

  _focusedControl() {
    const at = document.activeElement;
    if (!at || at === this.el || !this.el?.contains(at)) return null;
    const attrs = Object.entries(at.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${globalThis.CSS?.escape?.(v) ?? v}"]`);
    return attrs.length ? `${at.tagName.toLowerCase()}${attrs.join('')}` : null;
  }

  _draw() {
    requestAnimationFrame(() => this._liftNotes());
    const sheet = (title, content, nav = '', foot = '', head = '') => `<div class="sheet" role="dialog" aria-modal="true" aria-label="${title}"><div class="sheet-h"><b>${title}</b>${head}<button type="button" class="icon-btn sm" data-sh="close" title="Close (Esc)" aria-label="Close">${icon('x', 'sm')}</button></div><div class="sheet-b${nav ? '' : ' single'}">${nav}<div class="sheet-c">${content}</div></div>${foot && `<div class="sheet-f">${foot}</div>`}</div>`;
    if (this.kind === 'shortcuts') {
      this.el.innerHTML = sheet('Keyboard shortcuts', this._shortcutsHtml());
      return;
    }
    if (this.kind === 'about') {
      this.el.innerHTML = sheet('About rpl.ai', this._aboutHtml());
      return;
    }
    if (this.kind === 'inform') {
      const { title, columns, fields } = this.form;
      const last = fields.filter(Boolean).length - 1;
      let n = 0;
      const field = (f) => (f
        ? `<label class="inf-field"><span>${escapeHtml(f.label)}</span><input type="text" data-inf="${n}" value="${escapeHtml(f.text)}" placeholder="${escapeHtml(f.help)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="${n++ === last ? 'done' : 'next'}"></label>`
        : '<div class="inf-blank"></div>');
      const act = (name, ico, label, cls = '') => `<button type="button" class="btn${cls}" data-sh="${name}">${icon(ico, 'sm')}${label}</button>`;
      this.el.innerHTML = sheet(escapeHtml(title || 'Form'), `<div class="inf-fields" style="--inf-cols:${columns}">${fields.map(field).join('')}</div>`, '', `${act('inform-ok', 'check', 'OK', ' pri')}${act('inform-cancel', 'x', 'Cancel')}${act('inform-reset', 'undo', 'Reset')}`);
      return;
    }
    if (this.kind === 'game') {
      const act = (name, ico, label, extra = '') => `<button type="button" class="btn${extra}" data-sh="${name}">${icon(ico, 'sm')}${label}</button>`;
      const foot = this.game.over ? `${act('mh-new', 'undo', 'Play again', ' pri')}${act('close', 'x', 'Close')}` : `${act('mh-save', 'down', 'Save (K)')}${act('close', 'x', 'Quit')}`;
      this.el.innerHTML = sheet('MINEHUNT', this._gameHtml(), '', foot);
      return;
    }
    if (this.kind === 'ptable') {
      this.el.innerHTML = sheet('Periodic Table', this._tableHtml(), '', `<button type="button" class="btn" data-sh="close">${icon('x', 'sm')}Close</button>`);
      const wrap = this.el.querySelector('.pt-wrap');
      markScrollEdges(wrap);
      wrap.addEventListener('scroll', () => markScrollEdges(wrap), { passive: true });
      return;
    }
    if (this.kind === 'print') {
      const body = printLog.length
        ? `<pre class="pr-log">${escapeHtml(printLog.join('\n'))}</pre>`
        : '<p class="pt-hint">Nothing printed yet. PR1, PRST, PRSTC, PRVAR, PRLCD and CR print here, as the HP prints on paper.</p>';
      const share = typeof navigator.share === 'function' ? `<button type="button" class="btn" data-sh="pr-share">${icon('share', 'sm')}Share</button>` : '';
      const foot = printLog.length
        ? `<button type="button" class="btn" data-sh="pr-copy">${icon('copy', 'sm')}Copy</button>${share}<button type="button" class="btn" data-sh="pr-clear">${icon('trash', 'sm')}Clear</button>`
        : `<button type="button" class="btn" data-sh="close">${icon('x', 'sm')}Close</button>`;
      this.el.innerHTML = sheet('Print log', body, '', foot);
      const content = this.el.querySelector('.sheet-c');
      content.scrollTop = content.scrollHeight;
      return;
    }
    if (this.kind === 'table') {
      const { start, step } = this.tbl;
      const data = this.app.drawers.graph.tableData(start, step, TABLE_ROWS);
      this.tbl.data = data;
      const shown = (v, digits) => (Number.isNaN(v) ? '—' : v === Infinity ? '∞' : v === -Infinity ? '−∞' : escapeHtml(withFractionMark(tableText(v, digits))));
      const field = (key, label, value) => `<label class="tb-field"><span>${label}</span><input type="text" enterkeyhint="done" data-tb="${key}" value="${escapeHtml(withFractionMark(tableText(value, 12)))}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" /></label>`;
      const act = (name, label, title) => `<button type="button" class="btn" data-sh="${name}" title="${title}" aria-label="${title}">${label}</button>`;
      const heads = data.heads.map((h) => `<th scope="col" title="${escapeHtml(withFractionMark(h))}">${escapeHtml(withFractionMark(h))}</th>`).join('');
      const rows = data.rows.map((r, i) => `<tr><td data-sh="tb-pick" data-i="${i}">${shown(r.x, 12)}</td>${r.ys.map((y, j) => `<td data-sh="tb-pick" data-i="${i}" data-j="${j}">${shown(y, 8)}</td>`).join('')}</tr>`).join('');
      const body = `<div class="tb-set">${field('start', 'Start', start)}${field('step', 'Step', step)}<div class="tb-zoom">${act('tb-finer', '÷2', 'Halve the step')}${act('tb-coarser', '×2', 'Double the step')}</div></div>`
        + `<div class="tb-wrap"><table class="tb"><thead><tr><th scope="col">X</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`
        + '<p class="pt-hint">Tap a value to put its point on the stack.</p>';
      const foot = `<button type="button" class="btn" data-sh="tb-earlier">${icon('chu', 'sm')}Earlier</button><button type="button" class="btn" data-sh="tb-later">${icon('chd', 'sm')}Later</button><button type="button" class="btn" data-sh="close">${icon('x', 'sm')}Close</button>`;
      this.el.innerHTML = sheet('Table of values', body, '', foot);
      this.el.querySelector('.sheet-c').classList.add('tb-c');
      const wrap = this.el.querySelector('.tb-wrap');
      markScrollEdges(wrap);
      wrap.addEventListener('scroll', () => markScrollEdges(wrap), { passive: true });
      return;
    }
    if (this.kind === 'eqlib') {
      const { subject, set } = this.eqlib;
      const eqs = subject != null && set != null ? EQ_LIBRARY[subject - 1][1][set - 1][1] : [];
      const foot = `${subject != null ? `<button type="button" class="btn" data-sh="eq-back">${icon('back', 'sm')}Back</button>` : ''}${eqs.length ? `<button type="button" class="btn pri" data-sh="eq-solve">${icon('play', 'sm')}Solve</button>` : ''}<button type="button" class="btn" data-sh="close">${icon('x', 'sm')}Close</button>`;
      this.el.innerHTML = sheet('Equation Library', this._libraryHtml(), '', foot);
      return;
    }
    if (this.kind === 'view') {
      const act = (name, ico, label) => `<button type="button" class="btn" data-sh="view-act" data-act="${name}">${icon(ico, 'sm')}${label}</button>`;
      const { level } = this.view;
      const step = (by, ico, end) => {
        const to = level + by, off = to < 1 || to > this.app.stack.depth, label = off ? end : `Level ${to}`;
        return `<button type="button" class="icon-btn sm" data-sh="view-step" data-step="${by}" title="${label}" aria-label="${label}"${off ? ' disabled' : ''}>${icon(ico, 'sm')}</button>`;
      };
      const acts = level == null ? '' : [act('edit', 'edit', 'Edit'), act('copy', 'copy', 'Copy'), typeof navigator.share === 'function' ? act('share', 'share', 'Share') : ''].join('');
      const steps = level == null ? '' : step(1, 'chu', 'No level above') + step(-1, 'chd', 'No level below');
      this.el.innerHTML = sheet(escapeHtml(this.view.title), `<div class="sheet-view">${this.view.html}</div>`, '', acts, steps);
      return;
    }
    const nav = SETTINGS_PAGES.map((p) => `<button type="button" data-sh="page" data-page="${p}" aria-pressed="${p === this.page}">${icon(SETTINGS_PAGE_NAMES[p][0], 'sm')}${SETTINGS_PAGE_NAMES[p][1]}</button>`).join('');
    this.el.innerHTML = sheet('Settings', this._settingsPageHtml(), `<nav class="sheet-nav">${nav}</nav>`);
  }

  _libraryHtml() {
    const { subject, set } = this.eqlib;
    const row = (sh, n, text, sub) => `<button type="button" class="eq-row" data-sh="${sh}" data-n="${n}"><span>${n}. ${escapeHtml(text)}</span><small>${escapeHtml(sub)}</small></button>`;
    if (subject == null) {
      return `<p class="pt-hint">The HP's Equation Library: ${EQ_LIBRARY.length} subjects. Tap one for its equation sets.</p><div class="eq-list">${EQ_LIBRARY.map(([title, sets], i) => row('eq-subject', i + 1, title, `${sets.length} sets`)).join('')}</div>`;
    }
    const [title, sets] = EQ_LIBRARY[subject - 1];
    if (set == null) {
      return `<p class="pt-hint">${escapeHtml(title)}: tap a set for its equations.</p><div class="eq-list">${sets.map(([t, eqs], i) => row('eq-set', i + 1, t, `${eqs.length} ${eqs.length === 1 ? 'equation' : 'equations'}`)).join('')}</div>`;
    }
    const [t, eqs] = sets[set - 1];
    const { names, known } = setVariables(subject, set);
    const vars = names.map((id) => (known[id] ? `<span class="known">${escapeHtml(id)} = ${format(known[id])}</span>` : `<span>${escapeHtml(id)}</span>`)).join('');
    return `<h5 class="eq-title">${escapeHtml(title)} · ${set}. ${escapeHtml(t)}</h5><div class="eq-eqs">${eqs.map((e, i) => `<button type="button" class="eq-eq" data-sh="eq-push" data-i="${i}">${escapeHtml(e)}</button>`).join('')}</div><p class="eq-vars">${vars}</p><p class="pt-hint">Tap an equation to put it on the stack. Solve puts them all in EQ, its constants known, and opens the solver: type a value and tap its key to store it, hold the key to solve for it. Values are plain numbers in SI units. <code>${subject} ${set} 0 SOLVEQN</code> does the same.</p>`;
  }

  _tableHtml() {
    const e = ELEMENTS[this.ptZ - 1];
    const cells = ELEMENTS.map((el) => `<button type="button" class="pt-cell b-${el[15]}" data-sh="pt-elem" data-z="${el[0]}" style="grid-column:${el[23]};grid-row:${el[24]}" aria-label="${escapeHtml(el[2])}" aria-pressed="${el[0] === this.ptZ}"><small>${el[0]}</small>${el[1]}</button>`).join('');
    const rows = PROPERTIES.map((p, i) => {
      const v = propertyValue(e, p);
      return `<button type="button" class="pt-prop" data-sh="pt-push" data-prop="${i + 1}"${v ? '' : ' disabled'}><span>${i + 1}. ${p[0]}</span><b>${v ? escapeHtml(format(v)) : '–'}</b></button>`;
    }).join('');
    return `<div class="pt-wrap"><div class="pt-grid" role="grid" aria-label="Periodic table">${cells}</div></div><div class="pt-card"><h5>${e[0]} ${escapeHtml(e[2])} <span>${e[1]}</span></h5><p class="pt-hint">Tap a property to put it on the stack, as PTPROP does with its number.</p><div class="pt-props">${rows}</div></div>`;
  }

  _gameHtml() {
    const g = this.game;
    const near = minesAround(g);
    const status = g.over === 'won' ? 'You crossed the field.' : g.over === 'mine' ? 'You stepped on a mine.' : `${near} ${near === 1 ? 'mine' : 'mines'} next to you`;
    const cells = Array.from({ length: ROWS * COLS }, (_, i) => {
      const cls = [i === g.at && 'here', g.visited.has(i) && 'seen', i === GOAL && 'goal', (g.over || g.visible) && g.mines.has(i) && 'mine'].filter(Boolean).join(' ');
      return `<i class="${cls}" data-sh="mh-square" data-square="${i}"></i>`;
    }).join('');
    const pad = MOVES.map((m) => (m
      ? `<button type="button" class="btn mh-k" data-sh="mh-step" data-dr="${m[0]}" data-dc="${m[1]}" aria-label="${m[3]}"${g.over ? ' disabled' : ''}>${m[2]}</button>`
      : `<b class="mh-n" aria-hidden="true">${g.over ? '' : near}</b>`)).join('');
    return `<p class="mh-status" role="status">${status}</p><div class="mh-board"><div class="mh-grid" tabindex="0" aria-label="Battlefield, 8 rows by 16 columns">${cells}</div><div class="mh-pad">${pad}</div></div>`;
  }

  _gameStep(dr, dc) {
    if (this.game.over) return;
    step(this.game, dr, dc);
    this._render();
    this.el.querySelector('.mh-grid')?.focus({ preventScroll: true });
  }

  _saveGame() {
    if (this.game.over) return;
    varStore('MHpar', saveField(this.game));
    this.close();
    this.app.toast('Game saved in MHpar; MINEHUNT picks it up.');
  }

  _settingsPageHtml() {
    const { app } = this;
    if (this.page === 'appearance') {
      const sides = (part, current) => `<div class="chipset" role="radiogroup" aria-label="${part === 'keypad' ? 'Keypad side' : 'Panels side'}">${SIDES.map((s) => `<button type="button" class="chip${current === s ? ' on' : ''}" data-sh="dock" data-part="${part}" data-side="${s}" role="radio" aria-checked="${current === s}">${SIDE_LABELS[s]}</button>`).join('')}</div>`;
      const tgl = (setting, on, label) => `<button type="button" class="tgl" role="switch" aria-pressed="${on}" aria-label="${escapeHtml(label)}" data-sh="toggle" data-setting="${setting}"></button>`;
      return `<h4>Appearance</h4><p>How the calculator looks. Muscle memory — key positions and behavior — never changes.</p>
        <div class="set stack"><b>Theme</b><span>Graphite and Paper follow your system by default; Classic LCD reimagines the original 131×80 display.</span>
          <div class="chipset" role="radiogroup" aria-label="Theme">${THEMES.map((t) => `<button type="button" class="chip${app.prefs.theme === t ? ' on' : ''}" data-sh="theme" data-theme="${t}" role="radio" aria-checked="${app.prefs.theme === t}">${escapeHtml(THEME_LABELS[t])}</button>`).join('')}</div>
        </div>
        <div class="set stack"><b>Stack text size</b><span>How large the stack's values are drawn, pretty math included.</span>
          <div class="chipset" role="radiogroup" aria-label="Stack text size">${STACK_SIZES.map((s) => `<button type="button" class="chip${app.prefs.stackSize === s ? ' on' : ''}" data-sh="stack-size" data-size="${s}" role="radio" aria-checked="${app.prefs.stackSize === s}">${STACK_SIZE_LABELS[s]}</button>`).join('')}</div>
        </div>
        <div class="set stack"><b>Keypad</b><span>Compact keeps the keys an RPN session reaches for most, in five rows; a window too short for the full keypad uses it on its own.</span>
          <div class="chipset" role="radiogroup" aria-label="Keypad">${KEYPAD_LAYOUTS.map((k) => `<button type="button" class="chip${app.prefs.keypad === k ? ' on' : ''}" data-sh="keypad" data-layout="${k}" role="radio" aria-checked="${app.prefs.keypad === k}">${KEYPAD_LABELS[k]}</button>`).join('')}</div>
        </div>
        <div class="set stack dock-set"><b>Panels side</b><span>Which side the rail and its drawer (Catalog, Variables, History…) dock on.</span>${sides('panels', app.prefs.panelsSide)}</div>
        <div class="set stack dock-set"><b>Keypad side</b><span>Which side of the stack the keypad docks on.</span>${sides('keypad', app.prefs.keypadSide)}</div>
        <div class="set"><b>Pretty math</b><span>Show expressions, matrices and lists on the stack in textbook form.</span>${tgl('textbook', !!calcState.textbookMode, 'Pretty math')}</div>
        <div class="set"><b>Soft keys in Minimal view</b><span>Keep the soft-menu row visible for menu work.</span>${tgl('minimalMenu', app.prefs.minimalMenu, 'Soft keys in Minimal view')}</div>
        <div class="set"><b>Pop-up notes</b><span>Notes after an action, with their Undo, and hints. Errors and alarms always show; Undo stays on its key.</span>${tgl('notes', app.prefs.notes, 'Pop-up notes')}</div>
        <div class="set"><b>Keyboard-shortcut hints</b><span>Show each key's physical-keyboard shortcut on the keypad.</span>${tgl('hints', app.prefs.hints, 'Keyboard-shortcut hints')}</div>${typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches ? `
        <div class="set"><b>Vibrate on key presses</b><span>A short buzz when a finger presses a key, one more when a held finger opens a menu or clears the line, and two on an error, as the HP beeps (flag -56 set stops those), where the phone supports it.</span>${tgl('haptics', app.prefs.haptics, 'Vibrate on key presses')}</div>` : ''}${navigator.wakeLock ? `
        <div class="set"><b>Keep the screen on</b><span>The screen stays on while rpl.ai is open, for a long program or a result you keep checking.</span>${tgl('keepAwake', app.prefs.keepAwake, 'Keep the screen on')}</div>` : ''}`;
    }
    if (this.page === 'calculator') return this._calculatorPageHtml();
    if (this.page === 'assistant') {
      const consented = (() => { try { return localStorage.getItem(CHAT_CONSENT_KEY) === '1'; } catch { return false; } })();
      let endpoint = null;
      try { endpoint = JSON.parse(localStorage.getItem(CHAT_REMOTE_KEY) ?? 'null'); } catch { /* ignore */ }
      return `<h4>Assistant</h4><p>The assistant runs against an Ollama or OpenAI-compatible endpoint you choose — nothing is sent anywhere until you connect one.</p>
        <div class="set"><b>Status</b><span>${consented ? (endpoint?.url ? `Connected to ${escapeHtml(endpoint.url)}` : 'Enabled, no endpoint chosen yet') : 'Not yet enabled'}</span><button type="button" class="btn" data-sh="open-assistant">Open the assistant</button></div>
        <div class="set stack"><b>Tutor style</b><span>Socratic asks a question before each explanation and gives hints first; Direct explains every step plainly. Strong models tutor best.</span>
          <div class="chipset" role="radiogroup" aria-label="Tutor style">${TUTOR_STYLES.map((style) => `<button type="button" class="chip${app.prefs.tutorStyle === style ? ' on' : ''}" data-sh="tutor-style" data-style="${style}" role="radio" aria-checked="${app.prefs.tutorStyle === style}">${style === 'socratic' ? 'Socratic' : 'Direct'}</button>`).join('')}</div>
        </div>
        <h5>Diagnostics</h5>
        <p class="muted" style="color:var(--ink3);font-size:12.5px">If a local or LAN Ollama fails to connect, the assistant explains why — a wrong origin, a plain-HTTP page under HTTPS, or nothing answering — and what to change. Ollama Cloud models need <code>ollama signin</code> on the machine running Ollama and a model name ending in <code>-cloud</code> or <code>:cloud</code>; browsers cannot call ollama.com directly. Safari, and every browser on iPhone and iPad, can't reach a local Ollama from the hosted app.</p>`;
    }
    return `<h4>Data</h4><p>Everything the calculator keeps lives in this browser.</p>
      <div class="set"><b>Back up your work</b><span>Save the stack and HOME directory as a JSON file you can restore later.</span><button type="button" class="btn" data-sh="backup">${icon('down', 'sm')}Download a backup</button></div>
      ${app.isInstalledApp() ? '' : `<div class="set"><b>Install as an app</b><span>Runs in its own window, starts from the dock or home screen, and works offline.</span><button type="button" class="btn" data-sh="install">${icon('down', 'sm')}Install</button></div>`}
      <div class="set"><b>Calculator clock</b><span>${calcState.clockOffset
        ? `${clockOffsetText(calcState.clockOffset)}, as →DATE, →TIME or CLKADJ set it.`
        : 'Follows the device clock; →DATE, →TIME and CLKADJ set it apart.'}</span>${calcState.clockOffset ? `<button type="button" class="btn" data-sh="clock-reset">${icon('undo', 'sm')}Use the device clock</button>` : ''}</div>
      <div class="set"><b>Restore from a backup</b><span>Replace the stack and HOME tree from a JSON file (undoable).</span><button type="button" class="btn" data-sh="restore">${icon('up', 'sm')}Choose a file</button></div>
      <div class="set"><b>Reset everything</b><span>Clears the stack, every variable, named backups, layout choices and the assistant connection, then reloads. This cannot be undone.</span>${this._confirmReset
        ? `<button type="button" class="btn danger" data-sh="reset-confirm">Yes, erase everything</button>`
        : `<button type="button" class="btn danger" data-sh="reset">${icon('trash', 'sm')}Reset everything</button>`}</div>`;
  }

  _calculatorPageHtml() {
    const chip = (on, label, data) => `<button type="button" class="chip${on ? ' on' : ''}" data-sh="mode" ${data} role="radio" aria-checked="${on}">${escapeHtml(label)}</button>`;
    const modes = MODES.map((m) => {
      const current = m.current();
      const options = m.options.map((o) => chip(o.value === current, o.label, `data-m="${m.id}" data-v="${o.value}"`)).join('');
      const digits = m.digits && current !== 'STD'
        ? `<div class="chipset" role="radiogroup" aria-label="Digits">${DISPLAY_DIGITS_CHOICES.map((d) => chip(d === calcState.displayDigits, String(d), `data-m="${m.id}" data-v="${current}" data-digits="${d}"`)).join('')}</div>`
        : '';
      const detail = m.options.find((o) => o.value === current)?.detail ?? '';
      return `<div class="set stack"><b>${escapeHtml(m.title)}</b><span>${escapeHtml(detail)}</span><div class="chipset" role="radiogroup" aria-label="${escapeHtml(m.title)}">${options}</div>${digits}</div>`;
    }).join('');
    const switches = CALC_SWITCHES.map(([key, clearIsOn, title, what]) => {
      const flag = typeof key === 'number';
      const on = flag ? testUserFlag(key) !== clearIsOn : !!this.app.prefs[key];
      const data = flag ? `data-sh="flag" data-flag="${key}"` : `data-sh="toggle" data-setting="${key}"`;
      return `<div class="set"><b>${title}</b><span>${escapeHtml(what)}${flag ? ` Flag ${key}.` : ''}</span><button type="button" class="tgl" role="switch" aria-pressed="${on}" aria-label="${escapeHtml(title)}" ${data}></button></div>`;
    }).join('');
    return `<h4>Calculator</h4><p>How the calculator works out and shows numbers, as the HP's MODES form sets it. The MODES menu, the mode button at the top and commands such as DEG or 4 FIX change the same settings, and programs can read them.</p>${modes}${switches}`;
  }

  _shortcutsHtml() {
    const mac = isMacPlatform();
    const groups = new Map();
    for (const b of KEYMAP) {
      if (!groups.has(b.context)) groups.set(b.context, []);
      groups.get(b.context).push(b);
    }
    return [...groups.entries()].map(([ctx, rows]) => {
      const byAction = new Map();
      for (const r of rows) {
        if (!byAction.has(r.action)) byAction.set(r.action, []);
        byAction.get(r.action).push(r.chord);
      }
      return `<div class="sc-g">${escapeHtml(CONTEXT_LABELS[ctx] ?? ctx)}</div>${[...byAction.entries()].map(([action, chords]) => `<div class="sc-row"><b>${escapeHtml(actionLabel(action))}</b><span class="keys-list">${chords.map((c) => `<span class="kbd">${escapeHtml(chordText(c, mac))}</span>`).join('')}</span></div>`).join('')}`;
    }).join('');
  }

  _aboutHtml() {
    return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:6px"><svg class="about-mark" aria-hidden="true"><use href="#i-mark"/></svg><div><h4 style="margin:0">rpl.ai</h4><p style="margin:2px 0 0;color:var(--ink3)">The HP 48/49/50 RPL calculator, rebuilt for the web</p><p class="mono" style="margin:4px 0 0;color:var(--ink3);font-size:12px">Version ${VERSION} · build ${BUILD} · ${SHA}</p></div></div>
      <p>A full RPL stack engine, a computer algebra system, units, plotting, and an assistant that can explain, verify and drive the calculator — all running client-side, installable and usable offline.</p>
      <h5>Open source</h5>
      <p>Built on <a class="ref-link" href="https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html" target="_blank" rel="noopener">Giac</a>, decimal.js, fraction.js, complex.js, CodeMirror 6, KaTeX, and IBM Plex. GPL-3.0-or-later.</p>`;
  }

  _onClick(e) {
    const b = e.target.closest('[data-sh]') ?? e.target.closest('.set')?.querySelector(':scope > .tgl');
    if (!b || !this.el.contains(b)) return;
    const { app } = this;
    switch (b.dataset.sh) {
      case 'close': this.dismiss(); return;
      case 'inform-ok': app.acceptInform(); return;
      case 'inform-cancel': app.cancelInform(); return;
      case 'inform-reset': this._informReset(); return;
      case 'view-act': {
        const { level } = this.view;
        if (b.dataset.act === 'edit') this.close();
        app.levelAction(b.dataset.act, level);
        return;
      }
      case 'view-step': {
        const { step } = b.dataset;
        app.stepView(Number(step));
        (this.el.querySelector(`[data-step="${step}"]:not(:disabled)`) ?? this.el.querySelector('[data-sh="view-step"]:not(:disabled)'))?.focus({ preventScroll: true });
        return;
      }
      case 'page': this.page = b.dataset.page; this._confirmReset = false; this._render(); return;
      case 'theme': app.setTheme(b.dataset.theme); this._render(); return;
      case 'stack-size': app.setStackSize(b.dataset.size); this._render(); return;
      case 'keypad': app.setKeypadLayout(b.dataset.layout); this._render(); return;
      case 'dock': app.setDockSide(b.dataset.part, b.dataset.side); this._render(); return;
      case 'open-assistant': this.close(); app.drawers.open('assistant'); return;
      case 'tutor-style': app.setTutorStyle(b.dataset.style); this._render(); return;
      case 'toggle': this._toggle(b.dataset.setting, b.getAttribute('aria-pressed') !== 'true'); this._render(); return;
      case 'mode': modeById(b.dataset.m)?.set(b.dataset.v, b.dataset.digits == null ? undefined : Number(b.dataset.digits)); this._render(); return;
      case 'flag': {
        const flag = Number(b.dataset.flag);
        (testUserFlag(flag) ? clearUserFlag : setUserFlag)(flag);
        this._render();
        return;
      }
      case 'backup': app.exportSnapshot(); return;
      case 'install': app.runAction('app.install'); return;
      case 'restore': pickFile('application/json,.json', async (f) => { if (await app.importSnapshotFromFile(f)) this.close(); }); return;
      case 'clock-reset': setClockOffset(0); this._render(); return;
      case 'eq-subject': this.eqlib.subject = Number(b.dataset.n); this._render(); return;
      case 'eq-set': this.eqlib.set = Number(b.dataset.n); this._render(); return;
      case 'eq-back':
        if (this.eqlib.set != null) this.eqlib.set = null;
        else this.eqlib.subject = null;
        this._render();
        return;
      case 'tb-finer': this.tbl.step = Number((this.tbl.step / 2).toPrecision(12)); this._render(); return;
      case 'tb-coarser': this.tbl.step = Number((this.tbl.step * 2).toPrecision(12)); this._render(); return;
      case 'tb-earlier': this._tableMove(-TABLE_ROWS / 2); return;
      case 'tb-later': this._tableMove(TABLE_ROWS / 2); return;
      case 'tb-pick': {
        const row = this.tbl.data.rows[Number(b.dataset.i)];
        const y = b.dataset.j == null ? null : row.ys[Number(b.dataset.j)];
        if (y != null && !Number.isFinite(y)) { app.toast('That function has no value there'); return; }
        const value = y == null ? Real(row.x) : Complex(row.x, Number(y.toPrecision(12)));
        app.commitEntryAndPush(value);
        app.toast(`${format(value)} is on the stack`);
        return;
      }
      case 'pr-copy': app.copyText(printLog.join('\n'), 'Copied the print log'); return;
      case 'pr-share': app.shareText(printLog.join('\n')); return;
      case 'pr-clear': clearPrintLog(); this._render(); return;
      case 'eq-push': {
        const v = libraryEquation(this.eqlib.subject, this.eqlib.set, Number(b.dataset.i));
        app.commitEntryAndPush(v);
        app.toast(`${format(v)} is on the stack`);
        return;
      }
      case 'eq-solve': {
        const { subject, set } = this.eqlib;
        this.close();
        app.entry.safeRun(() => app.stack.runOp(() => { solveSet(subject, set); lookup('MSOLVR').fn(app.stack); }), 'SOLVEQN');
        return;
      }
      case 'pt-elem': {
        const wrap = this.el.querySelector('.pt-wrap'), left = wrap?.scrollLeft ?? 0;
        this.ptZ = Number(b.dataset.z);
        this._render();
        this.el.querySelector('.pt-wrap').scrollLeft = left;
        this.el.querySelector('.pt-card')?.scrollIntoView?.({ block: 'nearest' });
        return;
      }
      case 'pt-push': {
        const v = propertyValue(ELEMENTS[this.ptZ - 1], PROPERTIES[Number(b.dataset.prop) - 1]);
        if (!v) return;
        app.commitEntryAndPush(v);
        app.toast(`${format(v)} is on the stack`);
        return;
      }
      case 'mh-step': this._gameStep(Number(b.dataset.dr), Number(b.dataset.dc)); return;
      case 'mh-square': {
        const to = Number(b.dataset.square);
        const dr = Math.floor(to / COLS) - Math.floor(this.game.at / COLS), dc = to % COLS - this.game.at % COLS;
        if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr || dc)) this._gameStep(dr, dc);
        return;
      }
      case 'mh-save': this._saveGame(); return;
      case 'mh-new': this.openGame(newField(this.gameMines)); return;
      case 'reset': this._confirmReset = true; this._render(); return;
      case 'reset-confirm': this.resetEverything(); return;
    }
  }

  _informReset() {
    const fields = this.form.fields.filter(Boolean);
    for (const input of this.el.querySelectorAll('input[data-inf]')) {
      input.value = fields[Number(input.dataset.inf)].reset;
      input.setCustomValidity('');
    }
  }

  _onGameKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const move = MOVES.find((m) => m && (m[4] === e.key || m[5] === e.key));
    if (move) { e.preventDefault(); this._gameStep(move[0], move[1]); }
    else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); this._saveGame(); }
  }

  _gameSwipe(e) {
    const from = this._swipe;
    this._swipe = null;
    if (!from || this.kind !== 'game') return;
    const dx = e.clientX - from[0], dy = e.clientY - from[1];
    if (Math.hypot(dx, dy) < SWIPE_PX) return;
    const [dr, dc] = SWIPE_STEPS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
    this._gameStep(dr, dc);
  }

  // Enter in a form field moves on to the next, and from the last answers the form, as the HP's ENTER does.
  _tableMove(rows) {
    this.tbl.start = Number((this.tbl.start + rows * this.tbl.step).toPrecision(12));
    this._render();
  }

  _onChange(e) {
    const input = this.kind === 'table' && e.target.closest?.('input[data-tb]');
    if (!input) return;
    const value = Number(fromTyped(String(input.value).trim()));
    const ok = Number.isFinite(value) && (input.dataset.tb !== 'step' || value !== 0);
    input.classList.toggle('bad', !ok);
    if (!ok) return;
    this.tbl[input.dataset.tb] = value;
    this._render();
  }

  _onKeyDown(e) {
    const radio = /^Arrow(Left|Right|Up|Down)$/.test(e.key) && e.target.closest?.('[role="radiogroup"] [role="radio"]');
    if (radio) {
      e.preventDefault();
      const radios = [...radio.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
      const next = radios[(radios.indexOf(radio) + (/Left|Up/.test(e.key) ? -1 : 1) + radios.length) % radios.length];
      next.focus();
      next.click();
      return;
    }
    if (this.kind !== 'inform' || e.key !== 'Enter' || !e.target.matches('input[data-inf]')) return;
    e.preventDefault();
    const inputs = [...this.el.querySelectorAll('input[data-inf]')];
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) next.focus();
    else this.app.acceptInform();
  }

  _toggle(setting, on) {
    const { app } = this;
    if (setting === 'textbook') app.setTextbook(on);
    else if (setting === 'minimalMenu') app.setMinimalMenu(on);
    else if (setting === 'hints') { app.setPrefs({ hints: on }); app.keypad.update(); }
    else if (setting === 'haptics') app.setPrefs({ haptics: on });
    else if (setting === 'keyClick') app.setPrefs({ keyClick: on });
    else if (setting === 'notes') app.setPrefs({ notes: on });
    else if (setting === 'keepAwake') { app.setPrefs({ keepAwake: on }); app.keepAwake(); }
  }

  resetEverything() {
    const KEYS = [STACK_STORAGE_KEY, BACKUPS_KEY, UI_PREFS_KEY, CHAT_REMOTE_KEY, CHAT_CONSENT_KEY, 'hp50.ui.sidePanel', 'hp50.ui.chrome'];
    try { for (const k of KEYS) localStorage.removeItem(k); } catch { /* private mode: nothing to clear */ }
    location.reload();
  }
}

// Two fingers (or a trackpad pinch) zoom the value about the point between them, and a double tap toggles 2x about the finger; one finger still scrolls.
function zoomOnPinch(view) {
  const value = view.firstElementChild;
  const scroller = view.closest('.sheet-c');
  let zoom = 1, pinch = null, pinched = false, tap = null;
  const zoomAbout = (next, x, y) => {
    next = clampViewZoom(next);
    const ratio = next / zoom;
    zoom = next;
    value.style.zoom = String(zoom);
    const r = view.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    view.scrollLeft = (view.scrollLeft + x - r.left) * ratio - (x - r.left);
    scroller.scrollTop = (scroller.scrollTop + y - s.top) * ratio - (y - s.top);
    markScrollEdges(view);
  };
  const fingers = (ev) => {
    const [a, b] = ev.touches;
    return { gap: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  };
  const start = (ev) => {
    if (ev.type === 'touchstart') pinched = ev.touches.length > 1;
    pinch = ev.touches.length === 2 ? { gap: fingers(ev).gap, zoom } : null;
  };
  view.addEventListener('touchstart', start, { passive: true });
  view.addEventListener('touchend', start, { passive: true });
  view.addEventListener('touchcancel', start, { passive: true });
  view.addEventListener('touchmove', (ev) => {
    if (!pinch?.gap || ev.touches.length !== 2) return;
    ev.preventDefault();
    const f = fingers(ev);
    zoomAbout(pinch.zoom * f.gap / pinch.gap, f.x, f.y);
  }, { passive: false });
  view.addEventListener('pointerup', (ev) => {
    if (ev.pointerType !== 'touch' || pinched) { tap = null; return; }
    const again = tap && ev.timeStamp - tap.t < 350 && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) < 30;
    tap = again ? null : { t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
    if (again) zoomAbout(zoom > 1 ? 1 : 2, ev.clientX, ev.clientY);
  });
  view.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    zoomAbout(zoom * Math.exp(-ev.deltaY / 100), ev.clientX, ev.clientY);
  }, { passive: false });
}

function actionLabel(id) {
  const LABELS = {
    'palette.open': 'Search everything', 'edit.undo': 'Undo', 'edit.redo': 'Redo', 'edit.paste': 'Paste',
    'assistant.ask': 'Ask the assistant', 'writer.equation': 'Equation writer', 'writer.matrix': 'Matrix writer',
    'drawer.toggle': 'Show or hide the drawer', 'keypad.toggle': 'Show or hide the keypad',
    'view.minimal': 'Minimal view', 'settings.open': 'Settings', 'shortcuts.open': 'Keyboard shortcuts',
    'ui.escape': 'Cancel, close, or dismiss', 'menu.prev': 'Previous menu page', 'menu.next': 'Next menu page',
    'softkey.press': 'Soft key', 'softkey.store': 'Soft key, ↰ layer', 'softkey.recall': 'Soft key, ↱ layer',
    'line.newline': 'New line', 'stack.dup': 'DUP', 'stack.swap': 'SWAP',
    'level.selectFirst': 'Select level 1', 'level.editFirst': 'Edit level 1', 'level.up': 'Move selection up',
    'level.down': 'Move selection down', 'level.rollUp': 'Move the level up', 'level.rollDown': 'Move the level down',
    'level.edit': 'Edit', 'level.drop': 'Drop', 'level.copy': 'Copy', 'level.pick': 'PICK',
    'eqw.fraction': 'Fraction', 'eqw.power': 'Exponent', 'eqw.group': 'Parentheses', 'eqw.next': 'Next box',
    'eqw.extend': 'Extend selection', 'writer.commit': 'Push, or finish the edit', 'matrix.nextCell': 'Next cell', 'matrix.enter': 'Store the cell, or push', 'plot.pan': 'Pan', 'plot.enter': "Push the cursor's point", 'plot.zoomIn': 'Zoom in',
    'plot.zoomOut': 'Zoom out', 'plot.reset': 'Reset view', 'plot.trace': 'Trace', 'plot.table': 'Table of values', 'plot.fullscreen': 'Full screen',
    'palette.move': 'Choose a result', 'palette.run': 'Run it', 'palette.reference': 'Open the reference',
  };
  return LABELS[id] ?? ACTIONS[id]?.label ?? id;
}
