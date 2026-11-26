// What the page keeps through a reload, as the HP keeps it through power-off: the menu place, the line being typed with its
// edit or writer, the undo steps, a program left suspended and the autosaved state, as methods of the App.
import { state as calcState, subscribe as subscribeState, varRecall, currentPath } from '../rpl/state.js';
import { formatSource } from '../rpl/formatter.js';
import {
  saveToLocalStorage, adoptStoredState, saveUndo, saveDraft, loadDraft, holdPageLock, saveRun, STORAGE_KEY, NOT_STORED,
} from '../rpl/persist.js';

const DRAFT_DELAY_MS = 400;

// Stands for the value an edit began from, so a draft is only taken back to an edit of that value.
export function sourceHash(value) {
  let hash = 0;
  for (const c of formatSource(value)) hash = (Math.imul(hash, 31) + c.codePointAt(0)) | 0;
  return hash;
}

export const KEEP_METHODS = {
  _restoreMenuPlace() {
    const { menuFolder, menuPage } = this.prefs;
    if (menuFolder && menuFolder !== this.menuFolder) {
      const folder = this.menuAll.find((slot) => slot.dir && slot.label === menuFolder);
      if (!folder) return;
      folder.onPress();
    }
    this.menuPage = Math.min(menuPage, Math.max(0, Math.ceil(this.menuAll.length / 6) - 1));
    this.menubar.render();
  },

  _installMenuPlace() {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this._keepMenuPlace(); });
    addEventListener('pagehide', () => this._keepMenuPlace());
  },

  _keepMenuPlace() {
    if (this.menuKind && this.menuKind !== 'TMENU') this.setPrefs({ menu: this.menuKind, menuFolder: this.menuFolder, menuPage: this.menuPage });
  },

  // The HP keeps its command line through power-off. A phone may drop the page while another app has the screen, so a line
  // typed but not entered is kept and comes back at the next start with its cursor, without raising the keyboard.
  _restoreDraft() {
    const draft = loadDraft();
    if (!draft) return;
    this.entry.resetBuffer(draft.text);
    this.entry.cursor = draft.cursor;
    if (draft.edit) this._restoreEdit(draft.edit);
    if (draft.writer) this._restoreWriter(draft.writer);
  },

  // A level or variable being edited is edited again, if its value is still the one the edit began from; else the text stays as a line.
  _restoreEdit({ kind, level, name, line, was }) {
    const value = kind === 'level' ? (level <= this.stack.depth ? this.stack.peek(level) : undefined) : varRecall(name);
    if (value === undefined ? was !== NOT_STORED : sourceHash(value) !== was) return;
    const target = kind === 'level' ? { level, label: `Editing level ${level}` } : { name, label: `${was === NOT_STORED ? 'Entering' : 'Editing'} ${name}`, path: currentPath().join('/') };
    this.pendingEdit = { kind, value, line, was, ...target };
    this.renderStatus();
    this.input.render();
  },

  // A formula or matrix being written comes back open, as the line does; one that cannot be put back is left out.
  _restoreWriter({ mode, saved }) {
    try {
      this.setInputMode(mode);
      this._writer().restore(saved);
    } catch (e) {
      console.warn('rpl.ai: could not bring back the writer', e);
      try { this._writer().clear(); } catch { /* it never opened */ }
      this.setInputMode('rpl');
    }
  },

  _installDraft() {
    let timer = 0;
    const keep = () => {
      clearTimeout(timer);
      saveDraft(this._draft());
    };
    this._keepDraft = keep;
    this.entry.subscribe(() => {
      clearTimeout(timer);
      if (this._draft()) timer = setTimeout(keep, DRAFT_DELAY_MS);
      else keep();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keep(); });
    addEventListener('pagehide', keep);
  },

  // UNDO and LASTARG go to storage as the page is hidden, as the HP keeps them through power-off, and come back at the next start.
  _installUndoKeep() {
    const keep = () => saveUndo(this.stack);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keep(); });
    addEventListener('pagehide', keep);
  },

  // A reload ends a program the HP would keep through power-off, so one left halted, waiting or running as the page is hidden is
  // noted for the next start, and forgotten when the page comes back or the program ends.
  _installRunKeep() {
    holdPageLock();
    let kept = false;
    const keep = () => {
      const record = calcState.halted;
      if (!record) return;
      const first = calcState.haltedStack[0] ?? record;
      const again = record.kind === 'slice' ? !this._savedMidRun : first.step === this.stack.undoMark();
      saveRun({ kind: record.kind, tag: first.tag ?? null, line: first.line, again: !!first.line && again });
      kept = true;
    };
    const back = () => {
      if (kept) saveRun(null);
      kept = false;
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keep(); else back(); });
    addEventListener('pagehide', keep);
    addEventListener('pageshow', back);
    return subscribeState(() => { if (document.hidden) (calcState.halted ? keep : back)(); });
  },

  _installAutosave() {
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (this._running()) return;
        if (calcState.halted) this._savedMidRun = true;
        this._noteAutosave(saveToLocalStorage(this.stack));
      });
    };
    this.stack.subscribe(schedule);
    subscribeState(schedule);
    const adopt = (announce) => {
      if (adoptStoredState(this.stack) && announce) this.toast('Updated from another window.');
    };
    let recent = [];
    addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      const now = Date.now();
      recent = recent.filter((t) => now - t < 2000);
      if (recent.push(now) <= 20) adopt(false);
    });
    addEventListener('focus', () => adopt(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') adopt(true); });
  },
};
