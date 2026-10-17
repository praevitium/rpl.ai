import { escapeHtml } from './display.js';

export const TOUR_STEPS = Object.freeze([
  Object.freeze({ target: '#stackView', title: 'The stack', text: 'Everything you enter lands on level 1, and commands take their arguments from here. Click a level to select it; its actions appear on the row and in the menu bar.', touch: 'Everything you enter lands on level 1, and commands take their arguments from here. Tap a level to select it and its actions appear under it; a finger held on it opens its menu.' }),
  Object.freeze({ target: '#cmdline', title: 'The command line', text: 'Type numbers and commands, then press Enter. Tab completes a command name, and a line that starts with ? goes to the assistant.', touch: 'Type numbers and commands, then press Enter. While your keyboard is up, the strip above it has the keys it lacks, and a line that starts with ? goes to the assistant.' }),
  Object.freeze({ target: '#menubar', title: 'Soft keys', text: 'F1 to F6 run the menu shown here. Hover a key to preview what it will do to the stack; the menu button on the left picks another menu.', touch: 'Tap a key to run the menu shown here, or hold it to preview what it will do to the stack; held, a BRCH, UNITS or variable key offers what its shifted forms do. NXT, or a swipe along the keys, turns the page (hold NXT for the whole menu), and the menu button on the left picks another menu (hold it for the one you had before).' }),
  Object.freeze({ target: '#inputTop', title: 'Writers', text: 'Equation lets you type maths the way you write it, with results worked out as you go. Matrix is for grids.' }),
  Object.freeze({ target: '#appbar .modes, #statusLine .ann-status', title: 'Modes', text: 'Angle, number format, exact or approximate, complex numbers, coordinates and base. Click a chip to see what each option does.', touch: 'Angle, number format, exact or approximate, complex numbers, coordinates and base. Tap one to see what each option does.' }),
  Object.freeze({ target: '#rail, #appbar [data-act="drawer.toggle"], #statusLine [data-status="menu"]', title: 'Tools', text: 'The assistant and its tutor, the catalog of every command, your variables, history, plots and special characters.' }),
]);

const GAP = 6;
const MARGIN = 8;

// Where Popover should put a w × h card so it doesn't hide the target it explains: below or above it,
// inside it when the target is big enough, else beside it. Popover places a card GAP below its point.
export function cardPoint(box, w, h, vw, vh) {
  const x = box.left + Math.max(0, (box.width - w) / 2);
  if (box.bottom + GAP + h <= vh - MARGIN) return { x, y: box.bottom };
  if (box.top - GAP - h >= MARGIN) return { x, y: box.top - h - 2 * GAP };
  if (box.width >= w + 2 * MARGIN && box.height >= h + 2 * MARGIN) return { x, y: box.top + Math.min((box.height - h) / 2, 90) - GAP };
  if (box.right + GAP + w <= vw - MARGIN) return { x: box.right + GAP, y: box.top - GAP };
  if (box.left - GAP - w >= MARGIN) return { x: box.left - GAP - w, y: box.top - GAP };
  return { x, y: box.top - GAP };
}

const onTouch = () => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

// A step names its target once per layout; it shows on whichever is on screen.
function visibleTarget(step) {
  return [...document.querySelectorAll(step.target)].find((el) => el.getClientRects().length) ?? null;
}

export class Tour {
  constructor({ app }) {
    this.app = app;
    this.steps = [];
    this.index = 0;
    this._moving = false;
  }

  start() {
    this.steps = TOUR_STEPS.filter(visibleTarget);
    this.index = 0;
    if (this.steps.length) this._show();
  }

  _show() {
    const step = this.steps[this.index];
    const target = visibleTarget(step);
    if (!target) { this._advance(); return; }
    const last = this.index === this.steps.length - 1;
    target.classList.add('tour-spot');
    const html = `<div class="tour-card"><small>${this.index + 1} of ${this.steps.length}</small><b>${escapeHtml(step.title)}</b><p>${escapeHtml(onTouch() && step.touch ? step.touch : step.text)}</p><div class="tour-acts"><button type="button" class="btn pri" data-v="next">${last ? 'Done' : 'Next'}</button><button type="button" class="btn ghost" data-v="skip">Skip the tour</button></div></div>`;
    const card = this.app.popover.open(target, html, {
      className: 'tour',
      label: `Tour: ${step.title}`,
      onClick: (button) => {
        if (button.dataset.v === 'next') this._advance();
        else this.app.popover.close({ restoreFocus: false });
      },
      onClose: () => {
        target.classList.remove('tour-spot');
        if (!this._moving) this.app.setPrefs({ tourSeen: true });
      },
    });
    this.app.popover.moveTo(cardPoint(target.getBoundingClientRect(), card.offsetWidth, card.offsetHeight, window.innerWidth, window.innerHeight));
  }

  _advance() {
    this._moving = true;
    this.app.popover.close({ restoreFocus: false });
    this._moving = false;
    this.index += 1;
    if (this.index < this.steps.length) this._show();
    else this.app.setPrefs({ tourSeen: true });
  }
}
