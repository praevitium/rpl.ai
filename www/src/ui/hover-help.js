import { lookup } from '../rpl/ops.js';
import { loadCommandReference, findReferenceEntry, shortDescription } from './command-reference.js';

const WORD_BREAK = /[\s{}[\]()"`'«»,]/;
const HOVER_DELAY_MS = 400;

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

const HIDE_GRACE_MS = 450;

export function installCommandHover(host, wordAtEvent, { onOpenReference } = {}) {
  let entries = null;
  loadCommandReference().then((m) => { entries = m; }).catch(() => {});

  const tip = document.createElement('div');
  tip.className = 'cmd-hover hidden';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  let showTimer = null;
  let hideTimer = null;
  let shownWord = null;
  let mutedTitle = null;
  const hideNow = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    tip.classList.add('hidden');
    shownWord = null;
    if (mutedTitle) {
      mutedTitle.el.title = mutedTitle.title;
      mutedTitle = null;
    }
  };
  const hideSoon = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideNow, HIDE_GRACE_MS);
  };
  const show = (ev, word) => {
    const text = commandHelpText(word, entries);
    if (!text) return;
    const titled = ev.target.closest?.('[title]');
    if (titled) {
      mutedTitle = { el: titled, title: titled.title };
      titled.title = '';
    }
    tip.textContent = text;
    if (onOpenReference) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'cmd-hover-ref';
      open.textContent = 'Reference ›';
      tip.appendChild(open);
    }
    shownWord = word;
    tip.classList.remove('hidden');
    tip.style.left = `${Math.max(8, Math.min(ev.clientX + 12, window.innerWidth - 8 - tip.offsetWidth))}px`;
    tip.style.top = `${ev.clientY + 18}px`;
  };

  host.addEventListener('mousemove', (ev) => {
    const word = wordAtEvent(ev);
    if (word && word === shownWord) { clearTimeout(hideTimer); return; }
    clearTimeout(showTimer);
    if (shownWord) hideSoon();
    if (word) showTimer = setTimeout(() => { hideNow(); show(ev, word); }, HOVER_DELAY_MS);
  });
  host.addEventListener('mouseleave', hideSoon);
  host.addEventListener('keydown', hideNow);
  tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tip.addEventListener('mouseleave', hideSoon);
  tip.addEventListener('mousedown', (ev) => ev.preventDefault());
  tip.addEventListener('click', (ev) => {
    if (!ev.target.closest('.cmd-hover-ref')) return;
    const word = shownWord;
    hideNow();
    onOpenReference?.(word);
  });
  window.addEventListener('scroll', hideNow, true);
}
