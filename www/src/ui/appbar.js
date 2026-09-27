import { currentPath, state as calcState } from '../rpl/state.js';
import { icon } from './icons.js';
import { escapeHtml } from './display.js';
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
    const { stack, prefs } = this.app;
    const canUndo = stack.hasUndo?.() ?? true;
    const canRedo = stack.hasRedo?.() ?? true;
    this.el.innerHTML = `
      <button type="button" class="icon-btn narrow-only" data-act="tools" title="Tools${kbd('drawer.toggle')}" aria-label="Tools">${icon('grid')}</button>
      <div class="brand"><svg aria-hidden="true"><use href="#i-mark"/></svg><span class="word">rpl<span class="ai">.ai</span></span></div>
      <nav class="crumbs" aria-label="Directory">${crumbs}</nav>
      <div class="sp"></div>
      <div class="modes" role="group" aria-label="Calculator modes">${chips}<button type="button" class="mode-chip summary" data-act="modes-all" title="Calculator modes" aria-haspopup="menu" aria-expanded="false">${escapeHtml(modesSummary())}${icon('chd')}</button></div>
      <div class="sp"></div>
      <button type="button" class="search-btn" data-act="palette" title="Search commands, settings, variables and help${kbd('palette.open')}">${icon('search', 'sm')}<span>Search commands, settings…</span><span class="kbd">${escapeHtml(shortcutText('palette.open'))}</span></button>
      <button type="button" class="icon-btn wide-only" data-act="undo" title="Undo${kbd('edit.undo')}" aria-label="Undo" ${canUndo ? '' : 'disabled'}>${icon('undo')}</button>
      <button type="button" class="icon-btn wide-only" data-act="redo" title="Redo${kbd('edit.redo')}" aria-label="Redo" ${canRedo ? '' : 'disabled'}>${icon('redo')}</button>
      <button type="button" class="icon-btn wide-only" data-act="keypad" aria-pressed="${prefs.keypad !== 'hidden'}" title="Keypad${kbd('keypad.toggle')}" aria-label="Keypad">${icon('keypad')}</button>
      <button type="button" class="icon-btn wide-only" data-act="minimal" title="Minimal view: status line, stack and command line only${kbd('view.minimal')}" aria-label="Minimal view">${icon('screen')}</button>
      <button type="button" class="icon-btn wide-only" data-act="settings" title="Settings${kbd('settings.open')}" aria-label="Settings">${icon('sliders')}</button>
      <button type="button" class="icon-btn wide-only" data-act="help" title="Help and keyboard shortcuts" aria-label="Help" aria-haspopup="menu" aria-expanded="false">${icon('help')}</button>
      <button type="button" class="icon-btn narrow-only" data-act="more" title="More" aria-label="More" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button>`;
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
      return `<h6>${escapeHtml(m.title)}</h6><div class="grid">${m.options.map((o) => `<button type="button" data-m="${m.id}" data-v="${escapeHtml(o.value)}" class="${o.value === current ? 'on' : ''}" title="${escapeHtml(o.detail)}">${escapeHtml(o.value === 'h' ? 'HEX' : o.value === 'd' ? 'DEC' : o.value === 'o' ? 'OCT' : o.value === 'b' ? 'BIN' : o.value)}</button>`).join('')}</div>`;
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
    const item = (act, ico, label, hint = '') => `<button type="button" class="opt" data-act="${act}"><span class="ck">${icon(ico, 'sm')}</span><b>${escapeHtml(label)}</b><em>${escapeHtml(hint)}</em></button>`;
    const appItems = withAppItems ? [
      item('undo', 'undo', 'Undo', shortcutText('edit.undo')),
      item('redo', 'redo', 'Redo', shortcutText('edit.redo')),
      item('keypad', 'keypad', this.app.prefs.keypad === 'hidden' ? 'Show keypad' : 'Hide keypad', shortcutText('keypad.toggle')),
      item('minimal', 'screen', 'Minimal view', shortcutText('view.minimal')),
      item('settings', 'sliders', 'Settings', shortcutText('settings.open')),
      '<hr>',
    ].join('') : '';
    const html = `${appItems}${item('tour', 'play', 'Take the tour')}${item('shortcuts', 'keypad', 'Keyboard shortcuts', shortcutText('shortcuts.open'))}${item('catalog', 'book', 'Command reference')}${item('ask', 'spark', 'Ask the assistant', shortcutText('assistant.ask'))}${item('tutor', 'cap', 'Walk me through a problem')}${item('about', 'info', 'About rpl.ai')}`;
    this.app.popover.open(anchor, html, {
      label: 'Help',
      onClick: (target) => {
        this.app.popover.close({ restoreFocus: false });
        this.app.runAction({
          undo: 'edit.undo', redo: 'edit.redo', keypad: 'keypad.toggle', minimal: 'view.minimal',
          settings: 'settings.open', shortcuts: 'shortcuts.open', ask: 'assistant.ask',
          tour: 'help.tour', tutor: 'assistant.tutor', catalog: 'catalog.open', about: 'about.open',
        }[target.dataset.act] ?? target.dataset.act);
      },
    });
  }

  _onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !this.el.contains(b)) return;
    const { app } = this;
    switch (b.dataset.act) {
      case 'tools': app.runAction('drawer.toggle'); return;
      case 'crumb': app.navigateToPathSegment(Number(b.dataset.i)); return;
      case 'mode': this.openModeMenu(b.dataset.m, b); return;
      case 'modes-all': this._openAllModes(b); return;
      case 'palette': app.runAction('palette.open'); return;
      case 'undo': app.runAction('edit.undo'); return;
      case 'redo': app.runAction('edit.redo'); return;
      case 'keypad': app.runAction('keypad.toggle'); return;
      case 'minimal': app.runAction('view.minimal'); return;
      case 'settings': app.runAction('settings.open'); return;
      case 'help': this._helpMenu(b); return;
      case 'more': this._helpMenu(b, true); return;
    }
  }
}
