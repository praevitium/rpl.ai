// The program dialogs, INPUT, CHOOSE, INFORM, MSGBOX and WAIT, as methods of the App: how each opens, takes its
// answer and hands it back to the waiting program.
import { state as calcState, touchLcd, batchStateNotifications } from '../rpl/state.js';
import { lookup } from '../rpl/ops.js';
import { _hp50TypeCode } from '../rpl/ops/internal.js';
import { parseTyped } from '../rpl/parser.js';
import { formatSource, withFractionMark } from '../rpl/formatter.js';
import { isName, Integer, Real, Str, Name, RList } from '../rpl/types.js';
import { chooseEntry } from './menus.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);

// Between the stretches of a program polling KEY, long enough for the page to draw and take a key.
const KEY_PAUSE_MS = 20;

// INFORM's values as the form shows them: NOVAL, the HP's empty field, shows as nothing.
function informText(v) {
  return !v || (isName(v) && v.id === 'NOVAL') ? '' : withFractionMark(formatSource(v));
}

// A field's text as one object of a type the field takes, or the complaint to show on the field.
function informValue(text, field) {
  let objects;
  try { objects = parseTyped(text); } catch (e) { return e.message; }
  if (objects.length !== 1) return 'One object per field';
  if (field.types.length && !field.types.includes(_hp50TypeCode(objects[0]))) return `Not a type this field takes (${field.types.join(', ')})`;
  return objects[0];
}

export const DIALOG_METHODS = {
  // The line that ran the program clears once it ends, after this notification, so a dialog opens a tick later.
  _beginDialog(halted) {
    this._dialogHalt = halted;
    if (halted.kind === 'wait') { this._beginWait(halted); return; }
    queueMicrotask(() => {
      if (calcState.halted !== halted) return;
      if (halted.kind === 'input') {
        if (this.inputMode !== 'rpl') this._closeWriter((mode) => `Put the ${mode} aside for the program's INPUT`);
        this.entry.recall(halted.dialog.text);
        if (halted.dialog.cursor != null) this.entry.cursor = halted.dialog.cursor;
        if (halted.dialog.alpha && this.shift !== 'alphaLock') { this._dialogAlpha = true; this.setShift('alphaLock'); }
      } else if (halted.kind === 'inform') this.showInformSheet();
      else this.showChooseList();
    });
  },

  // A timed WAIT goes on by itself; -1 WAIT shows the soft keys, the HP's menu, in minimal view.
  _beginWait(halted) {
    const { seconds, menu, poll } = halted.dialog;
    if (menu && this.prefs.minimal) this.setMinimalMenu(true);
    if (seconds) this._waitTimer = setTimeout(() => { if (calcState.halted === halted) this._continueProgram(); }, seconds * 1000);
    if (poll) this._waitTimer = setTimeout(() => { if (calcState.halted === halted) this._continueProgram(Real(0)); }, KEY_PAUSE_MS);
  },

  // A CHOOSE's list goes with its dialog: the banner's keys sit on the popover's anchor, where a press leaves it open.
  _endDialog() {
    if (this._dialogAlpha) { this._dialogAlpha = false; if (this.shift === 'alphaLock') this.setShift(null); }
    if (this._dialogHalt.kind === 'choose') this.popover.close({ restoreFocus: false });
    if (this._dialogHalt.kind === 'inform' && this.sheets.kind === 'inform') this.sheets.close();
    clearTimeout(this._waitTimer);
    this._dialogHalt = null;
  },

  // CHOOSE's choices in a popover above the banner, clear of its keys and the command line: a tap answers with the
  // choice and 1, as the HP's OK does, or with 0 when no choice is highlighted and the list is for looking at.
  showChooseList() {
    const { items, pos } = calcState.halted.dialog;
    const rows = items.map((item, i) => ({ text: chooseEntry(item).label, mark: i + 1 === pos ? icon('check', 'sm') : '', on: i + 1 === pos, run: () => this._answerChoice(i + 1) }));
    this._chooseList = this._heldKeyMenu(rows, $('banner').querySelector('.bn'), pos ? 'Choose' : 'View', { above: true, onArrow: pos ? (d) => this._moveChoice(d) : null, className: 'choose' });
    this._revealChoice(true);
  },

  // The arrow keys move the highlight through a CHOOSE box's list, as the HP's do, or bring back a list put away.
  _moveChoice(d) {
    const dialog = calcState.halted?.kind === 'choose' ? calcState.halted.dialog : null;
    if (!dialog?.pos) return false;
    if (!this.popover.el || this.popover.el !== this._chooseList) { this.showChooseList(); return true; }
    this._markChoice(Math.max(1, Math.min(dialog.items.length, dialog.pos + d)));
    return true;
  },

  // A letter typed on an empty line while the list is open moves the highlight to the next choice starting with it.
  _jumpChoice(letter) {
    const dialog = calcState.halted?.kind === 'choose' ? calcState.halted.dialog : null;
    if (!dialog?.pos || this.popover.el !== this._chooseList || this.entry.buffer.trim() || !/^\p{L}$/u.test(letter)) return false;
    const n = dialog.items.length;
    const starts = (i) => chooseEntry(dialog.items[i]).label.trimStart().toUpperCase().startsWith(letter.toUpperCase());
    const next = Array.from({ length: n }, (_, k) => (dialog.pos + k) % n).find(starts);
    if (next !== undefined) this._markChoice(next + 1);
    return true;
  },

  // The highlighted choice, as the AUR has it, is the row with the check mark and the highlight bar.
  _markChoice(pos) {
    calcState.halted.dialog.pos = pos;
    this.popover.el.querySelectorAll('.opt').forEach((row, i) => {
      row.classList.toggle('on', i + 1 === pos);
      row.querySelector('.ck').innerHTML = i + 1 === pos ? icon('check', 'sm') : '';
    });
    this._revealChoice(false);
  },

  _revealChoice(center) {
    this.popover.el?.querySelector('.opt.on')?.scrollIntoView({ block: center ? 'center' : 'nearest' });
  },

  // INFORM's form in a sheet: a label and an input per field, its help as the placeholder and its initial value as
  // source; a form closed without answering reopens from the banner.
  showInformSheet() {
    const { title, fields, columns, resets, init } = calcState.halted.dialog;
    let n = 0;
    const rows = fields.map((f) => {
      if (!f) return null;
      const row = { ...f, text: informText(init[n]), reset: informText(resets[n]) };
      n++;
      return row;
    });
    this.sheets.openInform({ title, columns, fields: rows });
  },

  // OK parses each field, an empty one giving NOVAL, checks it against the field's types and answers with the values
  // and 1; a field that fails keeps the form open with the complaint on it.
  acceptInform() {
    const fields = calcState.halted.dialog.fields.filter(Boolean);
    const values = [];
    for (const input of this.sheets.el.querySelectorAll('input[data-inf]')) {
      const text = input.value.trim();
      const value = text ? informValue(text, fields[Number(input.dataset.inf)]) : Name('NOVAL');
      if (typeof value === 'string') { input.setCustomValidity(value); input.reportValidity(); input.focus(); return; }
      input.setCustomValidity('');
      values.push(value);
    }
    this._continueProgram(RList(values), Integer(1n));
  },

  cancelInform() { this._continueProgram(Integer(0n)); },

  // Enter or OK hands the command line to the program waiting at INPUT, as a string; with V it has to parse first.
  _acceptInput() {
    const { dialog } = calcState.halted;
    const text = this.entry.buffer;
    if (dialog.verify) { try { parseTyped(text); } catch (e) { this.entry.flashError(e); return; } }
    this.entry.cancel();
    this._continueProgram(Str(text));
  },

  // Enter on an empty line is the OK of a message or choose box, as the HP's ENTER is: a CHOOSE answers with its
  // highlighted choice, or 0 when none is highlighted, and a MSGBOX goes on. A typed line still runs.
  _enterAnswersDialog() {
    const kind = calcState.halted?.kind;
    if (this.entry.buffer.trim() || !(kind === 'choose' || kind === 'msgbox')) return false;
    if (kind === 'msgbox') this._continueProgram();
    else this._answerChoice(calcState.halted.dialog.pos);
    return true;
  },

  // The nth choice answers with its result and 1; with no choice highlighted the list is for looking at and gives 0.
  _answerChoice(n) {
    const { items, pos } = calcState.halted.dialog;
    if (!pos) { this._continueProgram(Integer(0n)); return; }
    this._continueProgram(chooseEntry(items[n - 1]).value, Integer(1n));
  },

  // A key pressed while a program waits at 0 WAIT answers it with the key's code, as the HP's keyboard would; KEY
  // gets the key's row and column without its plane, and 1.
  _answerKey(code) {
    const halted = calcState.halted;
    if (halted?.kind !== 'wait' || !halted.dialog.key || code == null) return false;
    this.releaseShift();
    if (halted.dialog.poll) this._continueProgram(Real(Math.trunc(code)), Real(1));
    else this._continueProgram(Real(code));
    return true;
  },

  // A dialog's answer belongs to the program's run, so it adds no undo step: UNDO afterwards takes the whole run
  // back, as the HP's LAST STACK does. A dialog reached while stepping steps on, as the HP's SST would. The end of
  // a WAIT is no key press for the display: its message stays. The run draws once, when it halts again or ends.
  _continueProgram(...answers) {
    const { kind, stepping, tag } = calcState.halted;
    const op = { over: 'SST', into: 'SST↓' }[stepping] ?? 'CONT';
    if (kind !== 'wait' && kind !== 'slice') touchLcd();
    const resume = () => { for (const a of answers) this.stack.push(a); lookup(op).fn(this.stack, this.entry); };
    this.entry.safeRun(() => this.stack.holdEmit(() => batchStateNotifications(resume)), kind === 'slice' ? tag ?? '' : op, { keepPartial: true });
  },
};
