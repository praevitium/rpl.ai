import { currentPath, state as calcState } from '../rpl/state.js';
import { icon } from './icons.js';
import { escapeHtml, binaryBaseLabel } from './display.js';
import { MODES, modeById, modesSummary, DISPLAY_DIGITS_CHOICES } from './modes.js';
import { shortcutText } from './actions.js';

const kbd = (actionId) => {
  const text = shortcutText(actionId);
  return text ? ` (${text})` : '';
};

function modeMenuHtml(mode) {
  const current = mode.current();
  const rows = mode.options.map((o) => `
    <button type="button" class="opt${o.value === current ? ' on' : ''}" role="menuitemradio" aria-checked="${o.value === current}" data-v="${escapeHtml(o.value)}">
      <span class="ck">${o.value === current ? icon('check', 'sm') : ''}</span><b>${escapeHtml(o.label)}</b><em>${escapeHtml(o.value.length > 1 ? o.value : '')}</em>
      <span>${escapeHtml(o.detail)}</span>
    </button>`).join('');
  const digits = mode.digits && current !== 'STD'
    ? `<hr><h6>Digits</h6><div class="grid">${DISPLAY_DIGITS_CHOICES.map((d) => `<button type="button" data-digits="${d}" data-v="${current}" class="${d === calcState.displayDigits ? 'on' : ''}">${d}</button>`).join('')}</div>`
    : '';
  return `<h6>${escapeHtml(mode.title)}</h6>${rows}${digits}`;
}

export class AppBar {
  constructor({ el, app }) {
    this.el = el;
    this.app = app;
    el.addEventListener('click', (e) => this._onClick(e));
  }

  render() {
    const path = currentPath();
    const crumbs = path.map((seg, i) => {
      const last = i === path.length - 1;
      return `${i ? '<span class="sep" aria-hidden="true">›</span>' : ''}<button type="button" data-act="crumb" data-i="${i}" aria-current="${last}" title="${last ? `You are in ${escapeHtml(seg)}` : `Go to ${escapeHtml(seg)}`}">${escapeHtml(seg)}</button>`;
    }).join('');
    const chips = MODES.map((m) => `<button type="button" class="mode-chip" data-act="mode" data-m="${m.id}" title="${escapeHtml(m.title)}: ${escapeHtml(m.chip())}. Click to change." aria-haspopup="menu" aria-expanded="false">${escapeHtml(m.chip())}${icon('chd')}</button>`).join('');
    const { prefs } = this.app;
    this.el.innerHTML = `
      <button type="button" class="icon-btn narrow-only" data-act="drawer.toggle" title="Tools${kbd('drawer.toggle')}" aria-label="Tools">${icon('grid')}</button>
      <div class="brand"><svg aria-hidden="true"><use href="#i-mark"/></svg><span class="word">rpl<span class="ai">.ai</span></span></div>
      <nav class="crumbs" aria-label="Directory">${crumbs}</nav>
      <div class="sp"></div>
      <div class="modes" role="group" aria-label="Calculator modes">${chips}<button type="button" class="mode-chip summary" data-act="modes-all" title="Calculator modes" aria-haspopup="menu" aria-expanded="false">${escapeHtml(modesSummary())}${icon('chd')}</button></div>
      <div class="sp"></div>
      <button type="button" class="search-btn" data-act="palette.open" title="Search commands, settings, variables and help${kbd('palette.open')}">${icon('search', 'sm')}<span>Search commands, settings…</span><span class="kbd">${escapeHtml(shortcutText('palette.open'))}</span></button>
      <button type="button" class="icon-btn wide-only" data-act="edit.undo" title="Undo${kbd('edit.undo')}" aria-label="Undo" ${this.app.canUndo() ? '' : 'disabled'}>${icon('undo')}</button>
      <button type="button" class="icon-btn wide-only" data-act="edit.redo" title="Redo${kbd('edit.redo')}" aria-label="Redo" ${this.app.canRedo() ? '' : 'disabled'}>${icon('redo')}</button>
      <button type="button" class="icon-btn wide-only" data-act="keypad.toggle" aria-pressed="${prefs.keypad !== 'hidden'}" title="Keypad${kbd('keypad.toggle')}" aria-label="Keypad">${icon('keypad')}</button>
      <button type="button" class="icon-btn wide-only" data-act="view.minimal" title="Minimal view: status line, stack and command line only${kbd('view.minimal')}" aria-label="Minimal view">${icon('screen')}</button>
      <button type="button" class="icon-btn wide-only" data-act="settings.open" title="Settings${kbd('settings.open')}" aria-label="Settings">${icon('sliders')}</button>
      <button type="button" class="icon-btn wide-only" data-act="help" title="Help and keyboard shortcuts" aria-label="Help" aria-haspopup="menu" aria-expanded="false">${icon('help')}</button>
      <button type="button" class="icon-btn narrow-only" data-act="more" title="More" aria-label="More" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button>`;
  }

  updateHistory() {
    this.el.querySelector('[data-act="edit.undo"]')?.toggleAttribute('disabled', !this.app.canUndo());
    this.el.querySelector('[data-act="edit.redo"]')?.toggleAttribute('disabled', !this.app.canRedo());
  }

  openModeMenu(id, anchor) {
    const mode = modeById(id);
    if (!mode) return;
    const onClick = (target) => {
      if (target.dataset.digits != null) {
        mode.set(target.dataset.v, Number(target.dataset.digits));
        this.app.popover.close();
        return;
      }
      mode.set(target.dataset.v);
      if (mode.digits && target.dataset.v !== 'STD') open();
      else this.app.popover.close();
    };
    const open = () => this.app.popover.open(anchor, modeMenuHtml(mode), { label: mode.title, onClick });
    open();
  }

  _openAllModes(anchor) {
    const html = MODES.map((m) => {
      const current = m.current();
      return `<h6>${escapeHtml(m.title)}</h6><div class="grid">${m.options.map((o) => `<button type="button" data-m="${m.id}" data-v="${escapeHtml(o.value)}" class="${o.value === current ? 'on' : ''}" title="${escapeHtml(o.detail)}">${escapeHtml(m.id === 'base' ? binaryBaseLabel(o.value) : o.value)}</button>`).join('')}</div>`;
    }).join('');
    this.app.popover.open(anchor, html, {
      label: 'Calculator modes',
      onClick: (target) => {
        modeById(target.dataset.m)?.set(target.dataset.v);
        this._openAllModes(anchor);
      },
    });
  }

  _helpMenu(anchor, withAppItems = false) {
    const item = (action, ico, label) => `<button type="button" class="opt" data-act="${action}"><span class="ck">${icon(ico, 'sm')}</span><b>${escapeHtml(label)}</b><em>${escapeHtml(shortcutText(action))}</em></button>`;
    const appItems = withAppItems ? [
      item('edit.undo', 'undo', 'Undo'),
      item('edit.redo', 'redo', 'Redo'),
      item('keypad.toggle', 'keypad', this.app.prefs.keypad === 'hidden' ? 'Show keypad' : 'Hide keypad'),
      item('view.minimal', 'screen', 'Minimal view'),
      item('settings.open', 'sliders', 'Settings'),
      '<hr>',
    ].join('') : '';
    const html = `${appItems}${item('help.tour', 'play', 'Take the tour')}${item('shortcuts.open', 'keypad', 'Keyboard shortcuts')}${item('catalog.open', 'book', 'Command reference')}${item('assistant.ask', 'spark', 'Ask the assistant')}${item('assistant.tutor', 'cap', 'Walk me through a problem')}${this.app.isInstalledApp() ? '' : item('app.install', 'down', 'Install as an app')}${item('about.open', 'info', 'About rpl.ai')}`;
    this.app.popover.open(anchor, html, {
      label: 'Help',
      onClick: (target) => {
        this.app.popover.close({ restoreFocus: false });
        this.app.runAction(target.dataset.act);
      },
    });
  }

  _onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !this.el.contains(b)) return;
    const { app } = this;
    switch (b.dataset.act) {
      case 'crumb': app.navigateToPathSegment(Number(b.dataset.i)); return;
      case 'mode': this.openModeMenu(b.dataset.m, b); return;
      case 'modes-all': this._openAllModes(b); return;
      case 'help': this._helpMenu(b); return;
      case 'more': this._helpMenu(b, true); return;
      default: app.runAction(b.dataset.act);
    }
  }
}
