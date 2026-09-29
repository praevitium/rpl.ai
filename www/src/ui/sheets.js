import { icon } from './icons.js';
import { escapeHtml } from './display.js';
import { ACTIONS, KEYMAP, CONTEXT_LABELS, chordText, isMacPlatform } from './actions.js';
import { STORAGE_KEY as STACK_STORAGE_KEY, BACKUPS_KEY } from '../rpl/persist.js';
import { UI_PREFS_KEY, THEMES, THEME_LABELS, TUTOR_STYLES } from './ui-prefs.js';
import { REMOTE_CONFIG_KEY as CHAT_REMOTE_KEY, CONSENT_KEY as CHAT_CONSENT_KEY } from '../ai/chat-bot.js';
import { state as calcState } from '../rpl/state.js';
import { VERSION, BUILD, SHA } from '../build-info.js';
import { pickFile } from './drawer.js';


const SETTINGS_PAGES = Object.freeze(['appearance', 'assistant', 'data']);

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

  _open(kind) {
    this.kind = kind;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'sheet-wrap';
      this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
      this.el.addEventListener('click', (e) => this._onClick(e));
      this.host.appendChild(this.el);
    }
    this._render();
    requestAnimationFrame(() => this.el?.querySelector('.sheet-nav button[aria-pressed="true"], .sheet-c button, .sheet-c input')?.focus({ preventScroll: true }));
  }

  _render() {
    const sheet = (title, content, nav = '') => `<div class="sheet" role="dialog" aria-modal="true" aria-label="${title}"><div class="sheet-h"><b>${title}</b><button type="button" class="icon-btn sm" data-sh="close" title="Close (Esc)" aria-label="Close">${icon('x', 'sm')}</button></div><div class="sheet-b${nav ? '' : ' single'}">${nav}<div class="sheet-c">${content}</div></div></div>`;
    if (this.kind === 'shortcuts') {
      this.el.innerHTML = sheet('Keyboard shortcuts', this._shortcutsHtml());
      return;
    }
    if (this.kind === 'about') {
      this.el.innerHTML = sheet('About rpl.ai', this._aboutHtml());
      return;
    }
    const nav = SETTINGS_PAGES.map((p) => `<button type="button" data-sh="page" data-page="${p}" aria-pressed="${p === this.page}">${icon({ appearance: 'sliders', assistant: 'spark', data: 'folder' }[p], 'sm')}${{ appearance: 'Appearance', assistant: 'Assistant', data: 'Data' }[p]}</button>`).join('');
    this.el.innerHTML = sheet('Settings', this._settingsPageHtml(), `<nav class="sheet-nav">${nav}</nav>`);
  }

  _settingsPageHtml() {
    const { app } = this;
    if (this.page === 'appearance') {
      const tgl = (setting, on, label) => `<button type="button" class="tgl" role="switch" aria-pressed="${on}" aria-label="${escapeHtml(label)}" data-sh="toggle" data-setting="${setting}"></button>`;
      return `<h4>Appearance</h4><p>How the calculator looks. Muscle memory — key positions and behavior — never changes.</p>
        <div class="set stack"><b>Theme</b><span>Graphite and Paper follow your system by default; Classic LCD reimagines the original 131×80 display.</span>
          <div class="chipset" role="radiogroup" aria-label="Theme">${THEMES.map((t) => `<button type="button" class="chip${app.prefs.theme === t ? ' on' : ''}" data-sh="theme" data-theme="${t}" role="radio" aria-checked="${app.prefs.theme === t}">${escapeHtml(THEME_LABELS[t])}</button>`).join('')}</div>
        </div>
        <div class="set"><b>Pretty math</b><span>Show expressions, matrices and lists on the stack in textbook form.</span>${tgl('textbook', !!calcState.textbookMode, 'Pretty math')}</div>
        <div class="set"><b>Soft keys in Minimal view</b><span>Keep the soft-menu row visible for menu work.</span>${tgl('minimalMenu', app.prefs.minimalMenu, 'Soft keys in Minimal view')}</div>
        <div class="set"><b>Keyboard-shortcut hints</b><span>Show each key's physical-keyboard shortcut on the keypad.</span>${tgl('hints', app.prefs.hints, 'Keyboard-shortcut hints')}</div>`;
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
    const b = e.target.closest('[data-sh]');
    if (!b || !this.el.contains(b)) return;
    const { app } = this;
    switch (b.dataset.sh) {
      case 'close': this.close(); return;
      case 'page': this.page = b.dataset.page; this._confirmReset = false; this._render(); return;
      case 'theme': app.setTheme(b.dataset.theme); this._render(); return;
      case 'open-assistant': this.close(); app.drawers.open('assistant'); return;
      case 'tutor-style': app.setTutorStyle(b.dataset.style); this._render(); return;
      case 'toggle': this._toggle(b.dataset.setting, b.getAttribute('aria-pressed') !== 'true'); this._render(); return;
      case 'backup': app.exportSnapshot(); return;
      case 'install': app.runAction('app.install'); return;
      case 'restore': pickFile('application/json,.json', (f) => app.importSnapshotFromFile(f)); return;
      case 'reset': this._confirmReset = true; this._render(); return;
      case 'reset-confirm': this.resetEverything(); return;
    }
  }

  _toggle(setting, on) {
    const { app } = this;
    if (setting === 'textbook') app.setTextbook(on);
    else if (setting === 'minimalMenu') app.setMinimalMenu(on);
    else if (setting === 'hints') { app.setPrefs({ hints: on }); app.keypad.update(); }
  }

  resetEverything() {
    const KEYS = [STACK_STORAGE_KEY, BACKUPS_KEY, UI_PREFS_KEY, CHAT_REMOTE_KEY, CHAT_CONSENT_KEY, 'hp50.ui.sidePanel', 'hp50.ui.chrome'];
    try { for (const k of KEYS) localStorage.removeItem(k); } catch { /* private mode: nothing to clear */ }
    location.reload();
  }
}

function actionLabel(id) {
  const LABELS = {
    'palette.open': 'Search everything', 'edit.undo': 'Undo', 'edit.redo': 'Redo', 'edit.paste': 'Paste',
    'assistant.ask': 'Ask the assistant', 'writer.equation': 'Equation writer', 'writer.matrix': 'Matrix writer',
    'drawer.toggle': 'Show or hide the drawer', 'keypad.toggle': 'Show or hide the keypad',
    'view.minimal': 'Minimal view', 'settings.open': 'Settings', 'shortcuts.open': 'Keyboard shortcuts',
    'ui.escape': 'Cancel, close, or dismiss', 'menu.prev': 'Previous menu page', 'menu.next': 'Next menu page',
    'softkey.press': 'Soft key', 'softkey.store': 'Soft key, ↰ store', 'softkey.recall': 'Soft key, ↱ recall',
    'line.newline': 'New line', 'stack.dup': 'DUP', 'stack.drop': 'DROP', 'stack.swap': 'SWAP',
    'level.selectFirst': 'Select level 1', 'level.editFirst': 'Edit level 1', 'level.up': 'Move selection up',
    'level.down': 'Move selection down', 'level.rollUp': 'Move the level up', 'level.rollDown': 'Move the level down',
    'level.edit': 'Edit', 'level.drop': 'Drop', 'level.copy': 'Copy', 'level.pick': 'PICK',
    'eqw.fraction': 'Fraction', 'eqw.power': 'Exponent', 'eqw.group': 'Parentheses', 'eqw.next': 'Next box',
    'eqw.extend': 'Extend selection', 'writer.commit': 'Push, or finish the edit', 'matrix.nextCell': 'Next cell', 'plot.pan': 'Pan', 'plot.zoomIn': 'Zoom in',
    'plot.zoomOut': 'Zoom out', 'plot.reset': 'Reset view', 'plot.trace': 'Trace', 'plot.fullscreen': 'Full screen',
    'palette.move': 'Choose a result', 'palette.run': 'Run it', 'palette.reference': 'Open the reference',
  };
  return LABELS[id] ?? ACTIONS[id]?.label ?? id;
}
