import { escapeHtml } from './display.js';

export class Toasts {
  constructor(el) { this.el = el; }

  // A toast with a key replaces the one before it with that key; a transient one also goes at the next press outside
  // the toasts, so a note under it keeps its place while a finger presses that note's button.
  // The message is text, or a node such as a tutor step's title with its math.
  show(message, { action = '', onAction = null, timeout = 3200, error = false, key = '', transient = false } = {}) {
    if (!this.el) return;
    if (key) this.dismiss(key);
    const t = document.createElement('div');
    t.className = `toast${error ? ' err' : ''}`;
    if (key) t.dataset.key = key;
    t.innerHTML = `<span></span>${action ? `<button type="button">${escapeHtml(action)}</button>` : ''}`;
    t.firstChild.append(message);
    const remove = () => t.remove();
    t.querySelector('button')?.addEventListener('click', () => { remove(); onAction?.(); });
    this.el.appendChild(t);
    if (transient) {
      const away = (ev) => {
        if (t.isConnected && ev.target.closest?.('.toast')) return;
        remove();
        document.removeEventListener('pointerdown', away, true);
      };
      document.addEventListener('pointerdown', away, true);
    }
    while (this.el.children.length > 3) this.el.firstElementChild.remove();
    const life = action ? Math.max(timeout, 5000) : timeout;
    if (Number.isFinite(life)) setTimeout(remove, life);
  }

  dismiss(key) {
    this.el?.querySelector(`[data-key="${key}"]`)?.remove();
  }
}
