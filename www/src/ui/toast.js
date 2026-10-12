import { escapeHtml } from './display.js';

export class Toasts {
  constructor(el) { this.el = el; }

  // A toast with a key replaces the one before it with that key.
  show(message, { action = '', onAction = null, timeout = 3200, error = false, key = '' } = {}) {
    if (!this.el) return;
    if (key) this.dismiss(key);
    const t = document.createElement('div');
    t.className = `toast${error ? ' err' : ''}`;
    if (key) t.dataset.key = key;
    t.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button type="button">${escapeHtml(action)}</button>` : ''}`;
    const remove = () => t.remove();
    t.querySelector('button')?.addEventListener('click', () => { remove(); onAction?.(); });
    this.el.appendChild(t);
    while (this.el.children.length > 3) this.el.firstElementChild.remove();
    const life = action ? Math.max(timeout, 5000) : timeout;
    if (Number.isFinite(life)) setTimeout(remove, life);
  }

  dismiss(key) {
    this.el?.querySelector(`[data-key="${key}"]`)?.remove();
  }
}
