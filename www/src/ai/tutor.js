import { icon } from '../ui/icons.js';
import { escapeHtml } from '../ui/display.js';

const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)(E[-+]?\d+)?$/i;

export function sameStackValue(actual, expected) {
  const a = String(actual ?? '').trim().replace(/\.$/, '');
  const b = String(expected ?? '').trim().replace(/\.$/, '');
  if (a === b) return true;
  if (!DECIMAL.test(a) || !DECIMAL.test(b)) return false;
  const x = Number(a);
  const y = Number(b);
  return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
}

export function stackCheck(current, expected, levels = 3) {
  const count = Math.min(levels, Math.max(1, expected.length));
  for (let i = 0; i < count; i++) {
    if (!sameStackValue(current[i], expected[i])) return { ok: false, level: i + 1, got: current[i] ?? null, want: expected[i] ?? null };
  }
  return { ok: true };
}

export class TutorCard {
  constructor({ plan, tools, renderMarkdown, onFinish }) {
    this.plan = plan;
    this.tools = tools;
    this.renderMarkdown = renderMarkdown;
    this.onFinish = onFinish;
    this.current = 0;
    this.done = new Set();
    this.hintsShown = new Map();
    this.doingIt = new Set();
    this.baseline = new Map([[0, tools.snapshot()]]);
    this.feedback = new Map();
    this.el = document.createElement('div');
    this.el.className = 'tut';
    this.el.addEventListener('click', (e) => this._onClick(e));
    this.render();
  }

  get finished() { return this.done.size === this.plan.steps.length; }

  render() {
    const { steps } = this.plan;
    const progress = steps.map((_, i) => `<i class="${this.done.has(i) ? 'done' : i === this.current && !this.finished ? 'cur' : ''}"></i>`).join('');
    const finale = this.finished ? `<div class="tut-end"><b>Nicely done.</b><span>You worked it through on your own calculator.</span><div class="chipset"><button type="button" class="chip pri" data-tut="similar">Try a similar problem</button><button type="button" class="chip" data-tut="recap">Recap the solution</button></div></div>` : '';
    this.el.innerHTML = `<div class="tut-prob"><small>Problem</small><span></span></div><div class="tut-prog" role="progressbar" aria-label="Steps done" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${this.done.size}">${progress}</div><ol class="tut-steps">${steps.map((step, i) => this._stepHtml(step, i)).join('')}</ol>${finale}`;
    this.el.querySelector('.tut-prob span').textContent = this.plan.problem;
    for (const holder of this.el.querySelectorAll('[data-idea]')) holder.appendChild(this.renderMarkdown(steps[Number(holder.dataset.idea)].idea));
  }

  _stepHtml(step, i) {
    const open = i === this.current && !this.finished;
    const done = this.done.has(i);
    const head = `<button type="button" class="tut-h" data-tut="open" data-i="${i}" aria-expanded="${open}"><span class="n">${done ? icon('check', 'xs') : i + 1}</span><b>${escapeHtml(step.title)}</b>${icon(open ? 'chd' : 'chr', 'sm')}</button>`;
    if (!open) return `<li class="tut-step${done ? ' done' : ''}">${head}</li>`;
    const keys = step.rpl ? `<div class="tut-keys"><span>Keys</span>${(step.keys || step.rpl).split(/\s+/).filter(Boolean).map((k) => `<span class="kc">${escapeHtml(k)}</span>`).join('')}</div>` : '';
    const shown = this.hintsShown.get(i) ?? 0;
    const hints = step.hints.slice(0, shown).map((h, n) => `<div class="tut-hint">${icon('bulb', 'sm')}<span><b>Hint ${n + 1}.</b> ${escapeHtml(h)}</span></div>`).join('');
    const last = i === this.plan.steps.length - 1;
    const primary = done ? '' : step.rpl
      ? `<button type="button" class="chip pri" data-tut="show" data-i="${i}">${icon('play', 'sm')}Show me</button><button type="button" class="chip" data-tut="mine" data-i="${i}" aria-pressed="${this.doingIt.has(i)}">I'll do it</button>`
      : `<button type="button" class="chip pri" data-tut="next" data-i="${i}">${last ? 'Done' : 'Got it'}</button>`;
    const hintButton = !done && shown < step.hints.length ? `<button type="button" class="chip" data-tut="hint" data-i="${i}">${icon('bulb', 'sm')}${shown ? 'Another hint' : 'Hint'}</button>` : '';
    const feedback = this.feedback.get(i);
    const note = feedback ? `<div class="tut-fb${feedback.ok ? ' ok' : ''}" role="status">${escapeHtml(feedback.text)}</div>` : '';
    const check = this.doingIt.has(i) ? `<div class="tut-mine"><span>Press the keys on the keypad or type them, then</span><button type="button" class="chip" data-tut="check" data-i="${i}">${icon('check', 'sm')}Check my stack</button></div>` : '';
    return `<li class="tut-step cur">${head}<div class="tut-b"><div class="tut-idea" data-idea="${i}"></div>${keys}<div class="chipset">${primary}${hintButton}</div>${hints}${check}${note}</div></li>`;
  }

  _onClick(e) {
    const button = e.target.closest('[data-tut]');
    if (!button) return;
    const i = Number(button.dataset.i);
    const step = this.plan.steps[i];
    switch (button.dataset.tut) {
      case 'open': if (!this.finished) this.current = i; break;
      case 'show': this._show(i, step); break;
      case 'mine': this.doingIt.add(i); break;
      case 'check': this._check(i, step); break;
      case 'hint': this.hintsShown.set(i, (this.hintsShown.get(i) ?? 0) + 1); break;
      case 'next': this._complete(i); break;
      case 'similar': this.onFinish('similar'); return;
      case 'recap': this.onFinish('recap'); return;
      default: return;
    }
    this.render();
  }

  _show(i, step) {
    const start = this.baseline.get(i);
    const now = this.tools.snapshot();
    const moved = start && (start.stack.length !== now.stack.length || start.stack.some((item, n) => item !== now.stack[n]));
    if (moved) this.tools.restore(start);
    const error = this.tools.run(step.rpl);
    if (error) this.feedback.set(i, { ok: false, text: `That didn't run: ${error}` });
    else this._complete(i);
  }

  _check(i, step) {
    const expected = this.tools.evaluateOn(step.rpl, (this.baseline.get(i) ?? this.tools.snapshot()).stack);
    if (!expected.ok) { this.feedback.set(i, { ok: false, text: `I couldn't work out what this step should give: ${expected.error}` }); return; }
    const result = stackCheck(this.tools.currentStack(), expected.stack);
    if (result.ok) { this._complete(i); return; }
    const hintsLeft = (this.hintsShown.get(i) ?? 0) < step.hints.length;
    const got = result.got == null ? `level ${result.level} is empty` : `level ${result.level} is ${result.got}`;
    this.feedback.set(i, { ok: false, text: `Not yet: ${got}; it should be ${result.want}. ${hintsLeft ? 'Try a hint, or press Show me.' : 'Press Show me to see it done.'}` });
  }

  _complete(i) {
    this.done.add(i);
    this.feedback.set(i, { ok: true, text: "✓ That's it." });
    const next = this.plan.steps.findIndex((_, n) => !this.done.has(n));
    if (next >= 0) {
      this.current = next;
      this.baseline.set(next, this.tools.snapshot());
    }
  }
}
