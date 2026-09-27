import { escapeHtml } from './display.js';

export class Toasts {
  constructor(el) { this.el = el; }

  show(message, { action = '', onAction = null, timeout = 3200, error = false } = {}) {
    if (!this.el) return;
    const t = document.createElement('div');
    t.className = `toast${error ? ' err' : ''}`;
    t.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button type="button">${escapeHtml(action)}</button>` : ''}`;
    const remove = () => t.remove();
    t.querySelector('button')?.addEventListener('click', () => { remove(); onAction?.(); });
    this.el.appendChild(t);
    while (this.el.children.length > 3) this.el.firstElementChild.remove();
    setTimeout(remove, action ? Math.max(timeout, 5000) : timeout);
  }
}
