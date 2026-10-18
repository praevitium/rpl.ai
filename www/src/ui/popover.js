const FOCUSABLE = 'button:not([disabled]), input, select, [tabindex="0"]';

const MIN_ABOVE = 100;

export class Popover {
  constructor(host, { onOpen = null } = {}) {
    this.host = host;
    this._onOpen = onOpen;
    this.el = null;
    this.anchor = null;
    this._onClose = null;
    this._point = null;
    // A phone keyboard shrinks the window under an open popover, which would leave its fields behind the keyboard.
    this._onResize = () => { if (this.el) this._place(this._point); };
    this._onDocDown = (e) => {
      if (!this.el) return;
      if (this.el.contains(e.target) || this.anchor?.contains?.(e.target)) return;
      this.close({ restoreFocus: false });
    };
    this._onKey = (e) => {
      if (!this.el) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (this._onArrow) { e.preventDefault(); this._onArrow(e.key === 'ArrowDown' ? 1 : -1); return; }
      const items = [...this.el.querySelectorAll('.opt:not([disabled]), .grid button, .layers button:not([disabled])')];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next].focus();
    };
  }

  isOpen() { return !!this.el; }

  open(anchor, html, { onClick = null, onClose = null, className = '', label = 'Menu', point = null, keepFocus = false, above = false, onArrow = null } = {}) {
    this.close({ restoreFocus: false });
    this._onOpen?.();
    const el = document.createElement('div');
    el.className = `pop ${className}`.trim();
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', label);
    el.innerHTML = html;
    this.host.appendChild(el);
    this.el = el;
    this.anchor = anchor ?? null;
    this._onClose = onClose;
    anchor?.setAttribute?.('aria-expanded', 'true');
    this._point = point;
    this._above = above;
    this._onArrow = onArrow;
    this._place(point);
    if (onClick) {
      el.addEventListener('click', (e) => {
        const target = e.target.closest('[data-v], [data-act]');
        if (target && el.contains(target)) onClick(target, e);
      });
    }
    document.addEventListener('pointerdown', this._onDocDown, true);
    document.addEventListener('keydown', this._onKey, true);
    window.addEventListener('resize', this._onResize);
    // Opened while typing, it leaves the focus on the line so a phone's keyboard stays up.
    if (keepFocus) { el.addEventListener('mousedown', (e) => e.preventDefault()); return el; }
    requestAnimationFrame(() => {
      const first = el.querySelector('.opt.on') ?? el.querySelector(FOCUSABLE);
      first?.focus({ preventScroll: true });
    });
    return el;
  }

  moveTo(point) {
    this._point = point;
    if (this.el) this._place(point);
  }

  _place(point) {
    const el = this.el;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = point
      ? { left: point.x, right: point.x, top: point.y, bottom: point.y }
      : this.anchor?.getBoundingClientRect?.() ?? { left: vw / 2, right: vw / 2, top: vh / 3, bottom: vh / 3 };
    el.style.maxHeight = '';
    const w = el.offsetWidth;
    let h = el.offsetHeight;
    // Asked to sit above its anchor, it gives up height rather than cover the anchor, down to a couple of rows.
    const above = r.top - 6 - margin;
    if (this._above && h > above && above >= MIN_ABOVE) { el.style.maxHeight = `${above}px`; h = el.offsetHeight; }
    let left = Math.min(r.left, vw - w - margin);
    left = Math.max(margin, left);
    let top = r.bottom + 6;
    if ((this._above || top + h > vh - margin) && r.top - h - 6 >= margin) top = r.top - h - 6;
    top = Math.max(margin, Math.min(top, vh - h - margin));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  close({ restoreFocus = true } = {}) {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    document.removeEventListener('pointerdown', this._onDocDown, true);
    document.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('resize', this._onResize);
    const anchor = this.anchor;
    this.anchor = null;
    anchor?.setAttribute?.('aria-expanded', 'false');
    if (restoreFocus && anchor?.focus && document.contains(anchor)) anchor.focus({ preventScroll: true });
    const onClose = this._onClose;
    this._onClose = null;
    onClose?.();
  }
}
