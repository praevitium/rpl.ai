import { lookup } from '../rpl/ops.js';
import { loadCommandReference, findReferenceEntry, shortDescription } from './command-reference.js';

const WORD_BREAK = /[\s{}[\]()"`«»,]/;
const HOVER_DELAY_MS = 400;

/** The whitespace/delimiter-bounded word around `pos`, or null inside a string. */
export function commandWordAt(text, pos) {
  const src = String(text ?? '');
  if (pos < 0 || pos > src.length) return null;
  if ((src.slice(0, pos).match(/"/g) ?? []).length % 2 === 1) return null;
  let from = pos;
  let to = pos;
  while (from > 0 && !WORD_BREAK.test(src[from - 1])) from--;
  while (to < src.length && !WORD_BREAK.test(src[to])) to++;
  return from === to ? null : src.slice(from, to);
}

/** `NAME — AUR one-liner` for a registered command, else null. */
export function commandHelpText(word, entries) {
  if (!word || !lookup(word)) return null;
  const ref = entries ? findReferenceEntry(entries, word) : null;
  const summary = ref ? shortDescription(ref) : '';
  return summary ? `${word.toUpperCase()} — ${summary}` : word.toUpperCase();
}

function textWordAtPoint(x, y) {
  const caret = document.caretPositionFromPoint?.(x, y);
  if (caret) return commandWordAt(caret.offsetNode.textContent, caret.offset);
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? commandWordAt(range.startContainer.textContent, range.startOffset) : null;
}

export function entryWordAtEvent(entry) {
  return (ev) => {
    const pos = entry.posAtCoords(ev.clientX, ev.clientY);
    return pos == null ? null : commandWordAt(entry.buffer, pos);
  };
}

export function stackWordAtEvent(ev) {
  return ev.target.closest?.('.value-text') ? textWordAtPoint(ev.clientX, ev.clientY) : null;
}

export function installCommandHover(host, wordAtEvent) {
  let entries = null;
  loadCommandReference().then((m) => { entries = m; }).catch(() => {});

  const tip = document.createElement('div');
  tip.className = 'cmd-hover hidden';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  let timer = null;
  let mutedTitle = null;
  const hide = () => {
    clearTimeout(timer);
    tip.classList.add('hidden');
    if (mutedTitle) {
      mutedTitle.el.title = mutedTitle.title;
      mutedTitle = null;
    }
  };
  const show = (ev) => {
    const text = commandHelpText(wordAtEvent(ev), entries);
    if (!text) return;
    const titled = ev.target.closest?.('[title]');
    if (titled) {
      mutedTitle = { el: titled, title: titled.title };
      titled.title = '';
    }
    tip.textContent = text;
    tip.classList.remove('hidden');
    tip.style.left = `${Math.max(8, Math.min(ev.clientX + 12, window.innerWidth - 8 - tip.offsetWidth))}px`;
    tip.style.top = `${ev.clientY + 18}px`;
  };

  host.addEventListener('mousemove', (ev) => {
    hide();
    timer = setTimeout(() => show(ev), HOVER_DELAY_MS);
  });
  host.addEventListener('mouseleave', hide);
  host.addEventListener('keydown', hide);
  window.addEventListener('scroll', hide, true);
}
