import { icon } from './icons.js';
import { escapeHtml } from './display.js';
import { MENU_GROUPS, menuById } from './menus.js';

const PREVIEW_HOVER_MS = 220;

export class MenuBar {
  constructor({ el, app }) {
    this.el = el;
    this.app = app;
    this._previewTimer = 0;
    el.addEventListener('mousedown', (e) => { if (e.target.closest('.sk')) e.preventDefault(); });
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
      const sk = e.target.closest('.sk[data-i]');
      if (!sk || e.button !== 0 || sk.disabled) return;
      e.preventDefault();
      this._press(sk);
    });
    el.addEventListener('click', (e) => {
      const sk = e.target.closest('.sk[data-i]');
      if (sk) { if (e.detail === 0 && !sk.disabled) this._press(sk); return; }
      const b = e.target.closest('[data-mb]');
      if (!b) return;
      if (b.dataset.mb === 'prev') app.prevMenuPage();
      else if (b.dataset.mb === 'next') app.nextMenuPage();
      else if (b.dataset.mb === 'pick') this.openPicker(b);
    });
  }

  _schedulePreview(i) {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this.app.previewSoftKey(i), PREVIEW_HOVER_MS);
  }

  _endPreview() {
    clearTimeout(this._previewTimer);
    this.app.clearPreview();
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
      return `<button type="button" class="sk ${cls}${slot.dir ? ' dir' : ''}${slot.toggle ? ' tog' : ''}${on ? ' on' : ''}${blocked ? ' blocked' : ''}" data-i="${i}" title="${escapeHtml(title)} (F${i + 1})"><span class="lbl">${escapeHtml(label)}</span><span class="fk" aria-hidden="true">F${i + 1}</span></button>`;
    }).join('');
    const pages = view.pages;
    const dots = pages <= 1 ? '' : pages <= 6
      ? Array.from({ length: pages }, (_, i) => `<i class="${i === view.page ? 'on' : ''}"></i>`).join('')
      : `${view.page + 1}/${pages}`;
    this.el.innerHTML = `<button type="button" class="mb-menu" data-mb="pick" title="Choose a menu: VARS, CST, MODES and every command family" aria-haspopup="menu" aria-expanded="false">${icon('menu', 'sm')}<span class="full">${escapeHtml(view.title)}</span><span class="short">${escapeHtml(view.short)}</span>${pages > 1 ? `<sup>${view.page + 1}/${pages}</sup>` : ''}</button><div class="mb-keys">${keys}</div><div class="mb-pg"><button type="button" data-mb="prev" ${pages > 1 ? '' : 'disabled'} title="Previous page (PgUp)" aria-label="Previous page">${icon('chl', 'sm')}</button><div class="mb-dots" aria-label="Page ${view.page + 1} of ${pages}">${dots}</div><button type="button" data-mb="next" ${pages > 1 ? '' : 'disabled'} title="Next page (PgDn)" aria-label="Next page">${icon('chr', 'sm')}</button></div>`;
  }

  openPicker(anchor) {
    const current = this.app.menuKind;
    const html = MENU_GROUPS.map((g) => `<h6>${escapeHtml(g.title)}</h6><div class="grid">${g.ids.map((id) => {
      const m = menuById(id);
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
