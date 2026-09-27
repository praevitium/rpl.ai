import { icon } from './icons.js';
import { escapeHtml } from './display.js';

export function errorBannerHtml(desc) {
  const fixes = desc.fixes.map((f, i) => `<button type="button" class="chip${i === 0 ? ' pri' : ''}" data-bn="fix" data-fix="${escapeHtml(f.id)}"${f.arg ? ` data-arg="${escapeHtml(f.arg)}"` : ''}>${escapeHtml(f.label)}</button>`).join('');
  return `<div class="bn" role="alert"><div class="bn-ico" aria-hidden="true">!</div><div class="bn-t">${escapeHtml(desc.title)}</div><button type="button" class="icon-btn sm bn-x" data-bn="dismiss" title="Dismiss (Esc)" aria-label="Dismiss">${icon('x', 'sm')}</button>${desc.detail ? `<div class="bn-d">${escapeHtml(desc.detail)}</div>` : ''}${fixes ? `<div class="bn-f">${fixes}</div>` : ''}</div>`;
}

const HALT_TITLES = Object.freeze({
  halt: 'Program halted',
  step: 'Stepping through the program',
  prompt: 'The program is waiting for you',
});

export function haltedBannerHtml({ kind, prompt = '', programHtml = '' }) {
  const title = HALT_TITLES[kind] ?? HALT_TITLES.halt;
  return `<div class="bn halt" role="status"><div class="bn-ico" aria-hidden="true">${icon('stop', 'xs')}</div><div class="bn-t">${escapeHtml(title)}${prompt ? ` · ${escapeHtml(prompt)}` : ''}</div>${programHtml ? `<div class="bn-prog">${programHtml}</div>` : ''}<div class="bn-f"><button type="button" class="chip pri" data-bn="cont" title="CONT">${icon('play', 'sm')}Continue</button><button type="button" class="chip" data-bn="sst" title="SST: run the next instruction">${icon('step', 'sm')}Step</button><button type="button" class="chip warn" data-bn="kill" title="KILL: abandon the program">${icon('stop', 'sm')}Stop</button></div></div>`;
}
