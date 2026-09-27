import { escapeHtml } from './display.js';

export const TOUR_STEPS = Object.freeze([
  Object.freeze({ target: '#stackView', title: 'The stack', text: 'Everything you enter lands on level 1, and commands take their arguments from here. Click a level to select it; its actions appear on the row and in the menu bar.' }),
  Object.freeze({ target: '#cmdline', title: 'The command line', text: 'Type numbers and commands, then press Enter. Tab completes a command name, and a line that starts with ? goes to the assistant.' }),
  Object.freeze({ target: '#menubar', title: 'Soft keys', text: 'F1 to F6 run the menu shown here. Hover a key to preview what it will do to the stack; the menu button on the left picks another menu.' }),
  Object.freeze({ target: '#inputTop', title: 'Writers', text: 'Equation lets you type maths the way you write it, with results worked out as you go. Matrix is for grids.' }),
  Object.freeze({ target: '#appbar .modes', title: 'Modes', text: 'Angle, number format, exact or approximate, complex numbers, coordinates and base. Click a chip to see what each option does.' }),
  Object.freeze({ target: '#rail', title: 'Tools', text: 'The assistant and its tutor, the catalog of every command, your variables, history, plots and special characters.' }),
]);

function visibleTarget(step) {
  const el = document.querySelector(step.target);
  return el && el.getClientRects().length ? el : null;
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
    const box = target.getBoundingClientRect();
    target.classList.add('tour-spot');
    const html = `<div class="tour-card"><small>${this.index + 1} of ${this.steps.length}</small><b>${escapeHtml(step.title)}</b><p>${escapeHtml(step.text)}</p><div class="tour-acts"><button type="button" class="btn pri" data-v="next">${last ? 'Done' : 'Next'}</button><button type="button" class="btn ghost" data-v="skip">Skip the tour</button></div></div>`;
    this.app.popover.open(target, html, {
      className: 'tour',
      label: `Tour: ${step.title}`,
      point: { x: box.left + Math.max(0, Math.min(box.width - 320, box.width / 2 - 160)), y: box.top + Math.min(box.height, 180) / 2 },
      onClick: (button) => {
        if (button.dataset.v === 'next') this._advance();
        else this.app.popover.close({ restoreFocus: false });
      },
      onClose: () => {
        target.classList.remove('tour-spot');
        if (!this._moving) this.app.setPrefs({ tourSeen: true });
      },
    });
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
