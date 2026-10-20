import { icon } from './icons.js';
import { escapeHtml, markScrollEdges } from './display.js';
import { ACTIONS, KEYMAP, CONTEXT_LABELS, chordText, isMacPlatform } from './actions.js';
import { STORAGE_KEY as STACK_STORAGE_KEY, BACKUPS_KEY } from '../rpl/persist.js';
import { UI_PREFS_KEY, THEMES, THEME_LABELS, STACK_SIZES, STACK_SIZE_LABELS, TUTOR_STYLES, KEYPAD_LAYOUTS, KEYPAD_LABELS, SIDES, SIDE_LABELS } from './ui-prefs.js';
import { REMOTE_CONFIG_KEY as CHAT_REMOTE_KEY, CONSENT_KEY as CHAT_CONSENT_KEY } from '../ai/chat-bot.js';
import { state as calcState, testUserFlag, setUserFlag, clearUserFlag, setClockOffset, varStore } from '../rpl/state.js';
import { ROWS, COLS, GOAL, minesAround, step, newField, saveField } from '../rpl/minehunt.js';
import { VERSION, BUILD, SHA } from '../build-info.js';
import { pickFile } from './drawer.js';


const SETTINGS_PAGES = Object.freeze(['appearance', 'assistant', 'data']);
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

export class Sheets {
  constructor({ host, app }) {
    this.host = host;
    this.app = app;
    this.el = null;
    this.kind = null;
    this.page = 'appearance';
    this._confirmReset = false;
  }

  isOpen() { return !!this.el; }

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.kind = null;
    this._confirmReset = false;
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
      this.el = document.createElement('div');
      this.el.className = 'sheet-wrap';
      this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
      this.el.addEventListener('click', (e) => this._onClick(e));
      this.el.addEventListener('keydown', (e) => (this.kind === 'game' ? this._onGameKey(e) : this._onKeyDown(e)));
      this.host.appendChild(this.el);
    }
    this._render();
    requestAnimationFrame(() => this.el?.querySelector('.sheet-nav button[aria-pressed="true"], .sheet-c button, .sheet-c input')?.focus({ preventScroll: true }));
  }

  _render() {
    const sheet = (title, content, nav = '', foot = '') => `<div class="sheet" role="dialog" aria-modal="true" aria-label="${title}"><div class="sheet-h"><b>${title}</b><button type="button" class="icon-btn sm" data-sh="close" title="Close (Esc)" aria-label="Close">${icon('x', 'sm')}</button></div><div class="sheet-b${nav ? '' : ' single'}">${nav}<div class="sheet-c">${content}</div></div>${foot && `<div class="sheet-f">${foot}</div>`}</div>`;
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
        ? `<label class="inf-field"><span>${escapeHtml(f.label)}</span><input type="text" data-inf="${n}" value="${escapeHtml(f.text)}" placeholder="${escapeHtml(f.help)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="${n++ === last ? 'done' : 'next'}"></label>`
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
    if (this.kind === 'view') {
      const act = (name, ico, label) => `<button type="button" class="btn" data-sh="view-act" data-act="${name}">${icon(ico, 'sm')}${label}</button>`;
      const acts = this.view.level == null ? '' : [act('edit', 'edit', 'Edit'), act('copy', 'copy', 'Copy'), typeof navigator.share === 'function' ? act('share', 'share', 'Share') : ''].join('');
      this.el.innerHTML = sheet(escapeHtml(this.view.title), `<div class="sheet-view">${this.view.html}</div>`, '', acts);
      return;
    }
    const nav = SETTINGS_PAGES.map((p) => `<button type="button" data-sh="page" data-page="${p}" aria-pressed="${p === this.page}">${icon({ appearance: 'sliders', assistant: 'spark', data: 'folder' }[p], 'sm')}${{ appearance: 'Appearance', assistant: 'Assistant', data: 'Data' }[p]}</button>`).join('');
    this.el.innerHTML = sheet('Settings', this._settingsPageHtml(), `<nav class="sheet-nav">${nav}</nav>`);
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
    return `<p class="mh-status" role="status">${status}</p><div class="mh-grid" tabindex="0" aria-label="Battlefield, 8 rows by 16 columns">${cells}</div><div class="mh-pad">${pad}</div>`;
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
        <div class="set"><b>Decimal comma</b><span>Show 1,5 and read a typed comma as the decimal mark, with ; between the parts of (1,5; 2). The HP's FM, setting, flag -51.</span>${tgl('fractionComma', testUserFlag(-51), 'Decimal comma')}</div>
        <div class="set"><b>Soft keys in Minimal view</b><span>Keep the soft-menu row visible for menu work.</span>${tgl('minimalMenu', app.prefs.minimalMenu, 'Soft keys in Minimal view')}</div>
        <div class="set"><b>Keyboard-shortcut hints</b><span>Show each key's physical-keyboard shortcut on the keypad.</span>${tgl('hints', app.prefs.hints, 'Keyboard-shortcut hints')}</div>${typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches ? `
        <div class="set"><b>Vibrate on key presses</b><span>A short buzz when a finger presses a key, one more when a held finger opens a menu or clears the line, and two on an error, as the HP beeps (flag -56 set stops those), where the phone supports it.</span>${tgl('haptics', app.prefs.haptics, 'Vibrate on key presses')}</div>` : ''}`;
    }
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
      case 'close': this.close(); return;
      case 'inform-ok': app.acceptInform(); return;
      case 'inform-cancel': app.cancelInform(); return;
      case 'inform-reset': this._informReset(); return;
      case 'view-act': {
        const { level } = this.view;
        if (b.dataset.act === 'edit') this.close();
        app.levelAction(b.dataset.act, level);
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
      case 'backup': app.exportSnapshot(); return;
      case 'install': app.runAction('app.install'); return;
      case 'restore': pickFile('application/json,.json', async (f) => { if (await app.importSnapshotFromFile(f)) this.close(); }); return;
      case 'clock-reset': setClockOffset(0); this._render(); return;
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

  // Enter in a form field moves on to the next, and from the last answers the form, as the HP's ENTER does.
  _onGameKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const move = MOVES.find((m) => m && (m[4] === e.key || m[5] === e.key));
    if (move) { e.preventDefault(); this._gameStep(move[0], move[1]); }
    else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); this._saveGame(); }
  }

  _onKeyDown(e) {
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
    else if (setting === 'fractionComma') (on ? setUserFlag : clearUserFlag)(-51);
    else if (setting === 'minimalMenu') app.setMinimalMenu(on);
    else if (setting === 'hints') { app.setPrefs({ hints: on }); app.keypad.update(); }
    else if (setting === 'haptics') app.setPrefs({ haptics: on });
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
    'eqw.extend': 'Extend selection', 'writer.commit': 'Push, or finish the edit', 'matrix.nextCell': 'Next cell', 'matrix.enter': 'Store the cell, or push', 'plot.pan': 'Pan', 'plot.zoomIn': 'Zoom in',
    'plot.zoomOut': 'Zoom out', 'plot.reset': 'Reset view', 'plot.trace': 'Trace', 'plot.fullscreen': 'Full screen',
    'palette.move': 'Choose a result', 'palette.run': 'Run it', 'palette.reference': 'Open the reference',
  };
  return LABELS[id] ?? ACTIONS[id]?.label ?? id;
}
