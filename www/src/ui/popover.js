const FOCUSABLE = 'button:not([disabled]), input, select, [tabindex="0"]';

export class Popover {
  constructor(host) {
    this.host = host;
    this.el = null;
    this.anchor = null;
    this._onClose = null;
    this._onDocDown = (e) => {
      if (!this.el) return;
      if (this.el.contains(e.target) || this.anchor?.contains?.(e.target)) return;
      this.close({ restoreFocus: false });
    };
    this._onKey = (e) => {
      if (!this.el) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...this.el.querySelectorAll('.opt:not([disabled]), .grid button, .layers button:not([disabled])')];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next].focus();
    };
  }

  isOpen() { return !!this.el; }

  open(anchor, html, { onClick = null, onClose = null, className = '', label = 'Menu', point = null } = {}) {
    this.close({ restoreFocus: false });
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
    this._place(point);
    if (onClick) {
      el.addEventListener('click', (e) => {
        const target = e.target.closest('[data-v], [data-act]');
        if (target && el.contains(target)) onClick(target, e);
      });
    }
    document.addEventListener('pointerdown', this._onDocDown, true);
    document.addEventListener('keydown', this._onKey, true);
    requestAnimationFrame(() => {
      const first = el.querySelector('.opt.on') ?? el.querySelector(FOCUSABLE);
      first?.focus({ preventScroll: true });
    });
    return el;
  }

  _place(point) {
    const el = this.el;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = point
      ? { left: point.x, right: point.x, top: point.y, bottom: point.y }
      : this.anchor?.getBoundingClientRect?.() ?? { left: vw / 2, right: vw / 2, top: vh / 3, bottom: vh / 3 };
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = Math.min(r.left, vw - w - margin);
    left = Math.max(margin, left);
    let top = r.bottom + 6;
    if (top + h > vh - margin && r.top - h - 6 > margin) top = r.top - h - 6;
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
    const anchor = this.anchor;
    this.anchor = null;
    anchor?.setAttribute?.('aria-expanded', 'false');
    if (restoreFocus && anchor?.focus && document.contains(anchor)) anchor.focus({ preventScroll: true });
    const onClose = this._onClose;
    this._onClose = null;
    onClose?.();
  }
}
