import { icon } from './icons.js';
import { escapeHtml, LONG_PRESS_MS } from './display.js';
import { MENU_GROUPS, menuById } from './menus.js';

const PREVIEW_HOVER_MS = 220;
const SWIPE_PX = 32;

// Greek letters run wider than the mono face's Latin ones.
const letterWidth = (s) => [...s].reduce((n, c) => n + (/[Α-Ωα-ω]/.test(c) ? 1.2 : 1), 0);

// On a narrow screen a long name may break into even lines, so DUPDUP wraps as DUP and DUP.
// --w, the widest word, and --n, the widest line, let the CSS fit the face to the key.
function labelHtml(label) {
  const rows = /\s/.test(label) || label.length <= 5 ? 1 : label.length <= 10 ? 2 : 3;
  const size = Math.ceil(label.length / rows);
  const lines = Array.from({ length: rows }, (_, i) => label.slice(i * size, (i + 1) * size));
  const widest = (parts) => Math.max(...parts.flatMap((part) => part.split(/\s+/)).map(letterWidth));
  // A space breaks only where white-space allows it; a <wbr> after it lets ◀ BACK break in the wide layout too.
  return `<span class="lbl" style="--w:${widest([label])};--n:${widest(lines)}">${lines.map((line) => escapeHtml(line).replace(/ /g, ' <wbr>')).join('<wbr>')}</span>`;
}

const WRITER_MENUS = Object.freeze({ EQW: { short: 'EQW', title: 'The equation writer menu' }, MTRW: { short: 'MTRW', title: 'The matrix writer menu' } });

export class MenuBar {
  constructor({ el, app }) {
    this.el = el;
    this.app = app;
    this._previewTimer = 0;
    // The keys and the page arrows leave the focus where it is, so a phone's keyboard stays up.
    el.addEventListener('mousedown', (e) => { if (e.target.closest('.sk, .mb-pg button')) e.preventDefault(); });
    el.addEventListener('pointerover', (e) => {
      const sk = e.target.closest('.sk[data-i]');
      if (sk && e.pointerType === 'mouse') this._schedulePreview(Number(sk.dataset.i));
    });
    el.addEventListener('pointerout', (e) => {
      const sk = e.target.closest('.sk[data-i]');
      if (sk && !sk.contains(e.relatedTarget)) this._endPreview();
    });
    el.addEventListener('focusin', (e) => {
      const sk = e.target.closest('.sk[data-i]');
      if (sk?.matches(':focus-visible')) this._schedulePreview(Number(sk.dataset.i));
    });
    el.addEventListener('focusout', () => this._endPreview());
    el.addEventListener('pointerdown', (e) => {
      const held = e.pointerType === 'touch' && e.target.closest('[data-mb="next"]:not(:disabled), [data-mb="pick"]');
      if (held) { this._mbHoldStart(held); return; }
      if (e.pointerType === 'touch' && e.target.closest('.mb-keys')) { e.preventDefault(); this._touchStart(e); return; }
      const sk = e.target.closest('.sk[data-i]');
      if (!sk || e.button !== 0 || sk.disabled) return;
      e.preventDefault();
      this._press(sk);
    });
    el.addEventListener('pointermove', (e) => this._touchMove(e));
    el.addEventListener('pointerup', (e) => { this._mbHoldEnd(); this._touchUp(e); });
    el.addEventListener('pointercancel', () => { this._mbHoldEnd(); this._touchEnd(); });
    el.addEventListener('contextmenu', (e) => { if (e.target.closest('.sk[data-i]')) e.preventDefault(); });
    el.addEventListener('click', (e) => {
      const sk = e.target.closest('.sk[data-i]');
      if (sk) { if (e.detail === 0 && !sk.disabled) this._press(sk); return; }
      const b = e.target.closest('[data-mb]');
      if (!b) return;
      if (this._mbHeld) { this._mbHeld = false; return; }
      if (b.dataset.mb === 'next') this._nxt();
      else if (b.dataset.mb === 'pick') this.openPicker(b);
    });
    // The click that follows a finger's lift lands on whatever its key opened there, such as VIEW's Edit.
    const doc = el.ownerDocument;
    doc?.addEventListener('pointerdown', () => { this._lifted = false; }, true);
    doc?.addEventListener('click', (e) => {
      if (!this._lifted) return;
      this._lifted = false;
      if (el.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  _schedulePreview(i) {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this.app.previewSoftKey(i), PREVIEW_HOVER_MS);
  }

  _endPreview() {
    clearTimeout(this._previewTimer);
    this.app.clearPreview();
  }

  // As on the HP, NXT wraps round the pages and left-shift NXT is PREV.
  _nxt() {
    const { app } = this;
    const back = app.layer() === 'L';
    if (app.shift && !app.shiftLocked()) app.setShift(null);
    if (back) app.prevMenuPage();
    else app.nextMenuPage();
  }

  // A finger presses a soft key as it lifts, so it can instead swipe along the row to turn the page (left for NXT,
  // right for PREV) or hold a key with more to offer (a BRCH word's whole structures). Held on a command, a key
  // previews its result as a mouse hovering does, and still runs as the finger lifts unless it slides away.
  _touchStart(e) {
    this._touchEnd();
    const sk = e.target.closest('.sk[data-i]:not(:disabled)');
    const t = { id: e.pointerId, sk, x: e.clientX, y: e.clientY, moved: false, done: false, preview: false };
    const i = Number(sk?.dataset.i);
    const slot = sk ? this.app.menuView().slots[i] : null;
    if (slot?.onHold) {
      t.timer = setTimeout(() => {
        t.done = true;
        this.app.buzzHold();
        this.app.menuView().slots[i]?.onHold(sk);
      }, LONG_PRESS_MS);
    } else if (slot?.command) {
      t.timer = setTimeout(() => { t.preview = true; this.app.previewSoftKey(i); }, LONG_PRESS_MS);
    }
    this._touch = t;
  }

  _touchMove(e) {
    const t = this._touch;
    if (t?.id !== e.pointerId || t.done) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.hypot(dx, dy) > 10) {
      t.moved = true;
      clearTimeout(t.timer);
      if (t.preview) { t.preview = false; this._endPreview(); }
    }
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
    t.done = true;
    if (dx < 0) this.app.nextMenuPage();
    else this.app.prevMenuPage();
  }

  _touchUp(e) {
    const t = this._touch;
    if (t?.id !== e.pointerId) return;
    this._touchEnd();
    if (t.sk && !t.moved && !t.done) {
      this._lifted = true;
      this._press(t.sk);
    }
  }

  _touchEnd() {
    clearTimeout(this._touch?.timer);
    if (this._touch?.preview) this._endPreview();
    this._touch = null;
  }

  _press(sk) {
    this._endPreview();
    sk.classList.add('pressed');
    setTimeout(() => sk.classList.remove('pressed'), 90);
    this.app.pressSoftKey(Number(sk.dataset.i));
  }

  render() {
    const view = this.app.menuView();
    const layer = this.app.layer();
    const keys = view.slots.map((slot, i) => {
      if (!slot?.label) return `<button type="button" class="sk empty" disabled aria-hidden="true" tabindex="-1"><span class="lbl"></span></button>`;
      let label = slot.label;
      let cls = '';
      if (slot.variable && layer === 'L') { label = `STO▸${slot.label}`; cls = 'l'; }
      if (slot.variable && layer === 'R') { label = `RCL ${slot.label}`; cls = 'r'; }
      const on = slot.toggle && slot.on();
      const blocked = slot.blockedReason?.() ?? '';
      const title = blocked || slot.title || slot.label;
      return `<button type="button" class="sk ${cls}${slot.dir ? ' dir' : ''}${slot.toggle ? ' tog' : ''}${on ? ' on' : ''}${blocked ? ' blocked' : ''}" data-i="${i}" title="${escapeHtml(title)} (F${i + 1})">${labelHtml(label)}<span class="fk" aria-hidden="true">F${i + 1}</span></button>`;
    }).join('');
    const pages = view.pages;
    const dots = pages <= 1 ? '' : pages <= 6
      ? Array.from({ length: pages }, (_, i) => `<i class="${i === view.page ? 'on' : ''}"></i>`).join('')
      : `${view.page + 1}/${pages}`;
    const count = pages > 1 ? `<sup>${view.page + 1}/${pages}</sup>` : '';
    this.el.innerHTML = `<button type="button" class="mb-menu" data-mb="pick" title="Choose a menu: VARS, CST, MODES and every command family" aria-haspopup="menu" aria-expanded="false">${icon('menu', 'sm')}<span class="full">${escapeHtml(view.title)}</span><span class="short">${escapeHtml(view.short)}</span>${count}</button><div class="mb-keys">${keys}</div><div class="mb-pg"><div class="mb-dots" aria-label="Page ${view.page + 1} of ${pages}">${dots}</div>${layer === 'L'
      ? `<button type="button" class="l" data-mb="next" ${pages > 1 ? '' : 'disabled'} title="Previous page (PgUp)" aria-label="Previous page">PREV${count}</button>`
      : `<button type="button" data-mb="next" ${pages > 1 ? '' : 'disabled'} title="Next page, round to the first after the last (PgDn); left-shift NXT goes back" aria-label="Next page">NXT${count}</button>`}</div>`;
  }

  // A finger held on NXT lays every key of the menu out at once, so a long menu is one tap, not a page hunt; held on
  // the menu button, it goes back to the menu shown before.
  _mbHoldStart(button) {
    this._mbHoldEnd();
    this._mbHeld = false;
    this._mbTimer = setTimeout(() => {
      this._mbHeld = true;
      this.app.buzzHold();
      if (button.dataset.mb === 'next') this.openAll(button);
      else this.app.showPreviousMenu();
    }, LONG_PRESS_MS);
  }

  _mbHoldEnd() {
    clearTimeout(this._mbTimer);
    this._mbTimer = null;
  }

  openAll(anchor) {
    const view = this.app.menuView();
    const key = (slot, i) => {
      if (!slot) return '';
      const on = typeof slot.on === 'function' ? slot.on() : !!slot.on;
      return `<button type="button" data-v="${i}" class="${on ? 'on' : ''}${slot.dir ? ' dir' : ''}" title="${escapeHtml(slot.title ?? '')}"${slot.blockedReason?.() ? ' disabled' : ''}>${escapeHtml(slot.label)}</button>`;
    };
    // Each row of six is one soft-key page, captioned so the grid reads as the pages do.
    const pages = [];
    for (let i = 0; i < view.items.length; i += 6) pages.push(view.items.slice(i, i + 6).map((slot, k) => key(slot, i + k)).join(''));
    const grids = pages.map((keys, p) => `${pages.length > 1 ? `<h6>Page ${p + 1}</h6>` : ''}<div class="grid">${keys}</div>`).join('');
    this.app.popover.open(anchor, `<h6>${escapeHtml(view.title)}</h6>${grids}`, {
      label: 'Every key',
      keepFocus: true,
      onClick: (target) => {
        this.app.popover.close({ restoreFocus: false });
        this.app.pressMenuSlot(Number(target.dataset.v));
      },
    });
  }

  openPicker(anchor) {
    const current = this.app._menuPinned ? this.app.menuKind : this.app.writerMenuId() ?? this.app.menuKind;
    const writer = this.app.writerMenuId();
    const recent = this.app.prefs.recentMenus.filter((id) => id !== current && menuById(id));
    const groups = [...(recent.length ? [{ title: 'Recent', ids: recent }] : []), ...(writer ? [{ title: 'Writer', ids: [writer] }] : []), ...MENU_GROUPS];
    const html = groups.map((g) => `<h6>${escapeHtml(g.title)}</h6><div class="grid">${g.ids.map((id) => {
      const m = menuById(id) ?? WRITER_MENUS[id];
      return `<button type="button" data-v="${id}" class="${id === current ? 'on' : ''}" title="${escapeHtml(m.title)}">${escapeHtml(m.short)}</button>`;
    }).join('')}</div>`).join('');
    this.app.popover.open(anchor, html, {
      label: 'Menus',
      onClick: (target) => {
        this.app.popover.close({ restoreFocus: false });
        this.app.showMenu(target.dataset.v);
      },
    });
  }
}
