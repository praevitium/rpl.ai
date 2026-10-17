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

const key = (bn, label, title, ico, cls = '') => `<button type="button" class="chip${cls ? ` ${cls}` : ''}" data-bn="${bn}" title="${title}" aria-label="${label}">${icon(ico, 'sm')}<span>${label}</span></button>`;
const STOP_KEY = key('kill', 'Stop', 'KILL: abandon the program', 'stop', 'warn');

// MSGBOX and INPUT speak to the program's user: the message alone, with no program source or debugger keys.
export function haltedBannerHtml({ kind, prompt = '', programHtml = '' }) {
  const message = `<div class="bn-t">${escapeHtml(prompt)}</div>`;
  if (kind === 'msgbox') return `<div class="bn halt msgbox" role="status"><div class="bn-ico" aria-hidden="true">${icon('info', 'xs')}</div>${message}<div class="bn-f">${key('cont', 'OK', 'CONT', 'check', 'pri')}</div></div>`;
  if (kind === 'input') return `<div class="bn halt input" role="status"><div class="bn-ico" aria-hidden="true">${icon('edit', 'xs')}</div>${message}<div class="bn-f">${key('ok', 'OK', 'Enter: answer with the command line', 'check', 'pri')}${STOP_KEY}</div></div>`;
  // A PROMPT speaks to the program's user, so its message is the title and the program's source stays out, as on the HP.
  const title = kind === 'prompt' && prompt ? prompt : `${HALT_TITLES[kind] ?? HALT_TITLES.halt}${prompt ? ` · ${prompt}` : ''}`;
  const program = kind === 'prompt' ? '' : programHtml;
  return `<div class="bn halt" role="status"><div class="bn-ico" aria-hidden="true">${icon('stop', 'xs')}</div><div class="bn-t">${escapeHtml(title)}</div>${program ? `<div class="bn-prog">${program}</div>` : ''}<div class="bn-f">${key('cont', 'Continue', 'CONT', 'play', 'pri')}${key('sst', 'Step', 'SST: run the next instruction', 'step')}${key('into', 'Step into', 'SST↓: run the next instruction, stepping into a subroutine', 'step-into')}${STOP_KEY}</div></div>`;
}
