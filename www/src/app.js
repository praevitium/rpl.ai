import { Stack } from './rpl/stack.js';
import { Entry } from './ui/entry.js';
import { Display, escapeHtml, describeValue, suspendedProgramHtml } from './ui/display.js';
import { Keypad } from './ui/keyboard.js';
import { MenuBar } from './ui/menubar.js';
import { AppBar } from './ui/appbar.js';
import { Drawers, CATEGORIES, familyCommands, UNIT_SYMBOLS, signatureOf } from './ui/drawer.js';
import { describeError, ERROR_KINDS } from './ui/errors.js';
import { errorBannerHtml, haltedBannerHtml } from './ui/banner.js';
import { InputArea } from './ui/input-area.js';
import { Autocomplete } from './ui/autocomplete.js';
import { Palette } from './ui/palette.js';
import { Popover } from './ui/popover.js';
import { Toasts } from './ui/toast.js';
import { Sheets } from './ui/sheets.js';
import { Tour } from './ui/tour.js';
import { chordFromEvent, findBinding } from './ui/actions.js';
import { loadUiPrefs, saveUiPrefs, normalizeUiPrefs } from './ui/ui-prefs.js';
import { MENU_FAMILIES, menuById } from './ui/menus.js';
import { MODES } from './ui/modes.js';
import { computeMenuPage } from './ui/paging.js';
import { clampLevel, dropLevel, moveLevel, replaceLevel } from './ui/stack-levels.js';
import { icon } from './ui/icons.js';
import { installCommandHover, entryWordAtEvent, stackWordAtEvent } from './ui/hover-help.js';
import { EquationEditor } from './ui/equation-editor.js';
import { MatrixEditor } from './ui/matrix-editor.js';
import {
  loadCommandReference, findReferenceEntry, formatReferenceEntry, searchCommands, shortDescription,
} from './ui/command-reference.js';
import { format, formatSource } from './rpl/formatter.js';
import {
  state as calcState, subscribe as subscribeState,
  varOrder, varList, varRecall, varStore, currentPath,
  goInto, goHome, goUp, captureCalcState, restoreCalcState, getPromptMessage,
} from './rpl/state.js';
import { lookup, allOps, setGraphicsHook } from './rpl/ops.js';
import { evalScratch, previewCommand } from './rpl/scratch.js';
import {
  isProgram, isDirectory, isList, isName, isString, isTagged, isSymbolic,
  isMatrix, isVector, isReal, isInteger, Symbolic,
} from './rpl/types.js';
import { UNIT_CATALOG } from './rpl/units.js';
import { loadFromLocalStorage, saveToLocalStorage, exportToFile, importFromFile } from './rpl/persist.js';
import { giac } from './rpl/cas/giac-engine.mjs';
import { ChatBot } from './ai/chat-bot.js';

const $ = (id) => document.getElementById(id);

const MODIFIER_KINDS = new Set(['shiftL', 'shiftR', 'alpha']);
const DOUBLE_PRESS_MS = 300;

class App {
  constructor() {
    this.stack = new Stack();
    this.entry = new Entry(this.stack);
    this.prefs = loadUiPrefs();
    this.shift = null;
    this._lastShiftAt = 0;
    this._lastShiftKind = null;
    this.menuKind = null;
    this.menuAll = [];
    this.menuPage = 0;
    this.selection = null;
    this.pendingEdit = null;
    this.inputMode = 'rpl';
    this.plotFocus = false;
    this.showKeyHints = false;
    this.equationEditor = null;
    this.matrixEditor = null;
    this._ctxPage = 0;
    this._ctxKey = '';
    this._eqwSlots = null;
    this._keyRepeat = false;
    this.reference = null;
    this.errorBanner = null;
    this._errorShown = '';
    this._noticeShown = '';
    this.preview = null;
    this._lineEmpty = true;

    this.popover = new Popover($('layPop'));
    this.toasts = new Toasts($('toasts'));
    this.display = new Display({
      stackView: $('stackView'), cmdline: $('cmdline'), statusLine: $('statusLine'),
    });
    $('banner').addEventListener('click', (e) => this._onBannerClick(e));
    this.appbar = new AppBar({ el: $('appbar'), app: this });
    this.keypad = new Keypad({ el: $('keys'), app: this });
    this.menubar = new MenuBar({ el: $('menubar'), app: this });
    this.input = new InputArea({ top: $('inputTop'), body: $('inputBody'), hint: $('inputHint'), cmdline: $('cmdline'), app: this });
    this.autocomplete = new Autocomplete({ host: $('input'), cmdline: $('cmdline'), app: this });
    this.palette = new Palette({ host: $('layPal'), app: this });
    this.sheets = new Sheets({ host: $('laySheet'), app: this });
    this.tour = new Tour({ app: this });

    this.chatBot = new ChatBot({
      tools: this._assistantTools(),
      getContext: () => this._assistantContext(),
      onStatus: (status) => this.drawers?.setAssistantConnected(status === 'ready'),
    });
    this.chatBot.setMode(this.prefs.assistantMode, { tutorStyle: this.prefs.tutorStyle });
    this.drawers = new Drawers({ rail: $('rail'), el: $('drawer'), scrim: $('scrim'), app: this });
    setGraphicsHook((kind, stack) => this.drawers.openGraph(kind, stack));
    loadCommandReference().then((m) => { this.reference = m; this.menubar.render(); }).catch(() => {});

    this._wireDisplay();
    loadFromLocalStorage(this.stack);

    this.stack.subscribe(() => this._onStackChange());
    this.entry.subscribe(() => this._onEntryChange());
    subscribeState(() => this._onStateChange());

    this.entry.attach($('cmdline'), {
      onCommit: () => { if (!this._runChord('Enter')) this.commitEntry(); },
      onCancel: () => this.runAction('ui.escape'),
      onArrowUpEmpty: () => this._runChord('ArrowUp'),
      onArrowDownEmpty: () => this._runChord('ArrowDown'),
      onArrowLeftEmpty: () => this._runChord('ArrowLeft'),
      onArrowRightEmpty: () => this._runChord('ArrowRight'),
      onBackspaceEmpty: () => this._runChord('Backspace'),
      onDeleteEmpty: () => this._runChord('Delete'),
    });
    this.input.attachEditorChrome();
    const openReference = (word) => this.drawers.showReference(word.toUpperCase());
    installCommandHover(this.display.cmdline, entryWordAtEvent(this.entry), { onOpenReference: openReference });
    installCommandHover(this.display.stackView, stackWordAtEvent, { onOpenReference: openReference });

    this._applyPrefs();
    this.showMenu(this.prefs.menu ?? (varOrder().length ? 'VARS' : 'STACK'), { remember: false });
    if (this.prefs.drawer) this.drawers.open(this.prefs.drawer);
    this._installKeyboard();
    this._installAutosave();
    this.renderAll();
    if (!this.prefs.tourSeen) setTimeout(() => this.tour.start(), 700);
  }

  renderAll() {
    this.appbar.render();
    this.display.renderStack(this.stack);
    this.display.renderCmdline(this.entry);
    this.renderBanner();
    this.renderStatus();
    this.input.render();
    this.menubar.render();
    this.keypad.update();
  }

  renderStatus() {
    this.display.renderStatus({
      classic: this.prefs.theme === 'classic',
      minimal: this.prefs.minimal,
      shift: this.shift,
      halted: calcState.halted ? calcState.halted.kind : null,
      editing: this.pendingEdit?.kind === 'level' ? this.pendingEdit.level : null,
    });
  }

  _onStackChange() {
    this._dropPreview();
    if (this.selection != null) {
      const clamped = clampLevel(this.selection, this.stack.depth);
      this.selection = clamped || null;
      this.display.selectedLevel = this.selection;
    }
    if (this.pendingEdit?.kind === 'level' && this.stack.peek(this.pendingEdit.level) !== this.pendingEdit.value) {
      this.pendingEdit = null;
      this.input.render();
    }
    if (this.errorBanner && !this.entry.error) this._showError('');
    this.display.renderStack(this.stack);
    this.appbar.render();
    this.menubar.render();
    this.keypad.update();
  }

  _onEntryChange() {
    this.clearPreview();
    if (this.entry.error !== this._errorShown) this._showError(this.entry.error);
    if (this.entry.notice && this.entry.notice !== this._noticeShown) this.toast(this.entry.notice);
    this._noticeShown = this.entry.notice;
    this.display.renderCmdline(this.entry);
    if (this.entry.buffer && this.selection != null) this.clearSelection();
    this.input.render();
    this.keypad.update();
    this.autocomplete.update();
    const lineEmpty = !this.entry.buffer.trim();
    if (lineEmpty !== this._lineEmpty) { this._lineEmpty = lineEmpty; this.menubar.render(); }
  }

  _onStateChange() {
    this.appbar.render();
    this.renderStatus();
    this.renderBanner();
    if (this.menuKind === 'VARS') this.showVarsMenu({ preservePage: true });
    else if (this.menuKind === 'MODES') this.showModesMenu({ preservePage: true });
    else this.menubar.render();
    this.display.renderStack(this.stack);
  }

  setPrefs(patch) {
    this.prefs = normalizeUiPrefs({ ...this.prefs, ...patch });
    saveUiPrefs(this.prefs);
  }

  _applyPrefs() {
    const root = document.documentElement;
    root.dataset.theme = this.prefs.theme;
    if (this.prefs.minimal) root.dataset.view = 'minimal';
    else delete root.dataset.view;
    if (this.prefs.minimalMenu) root.dataset.minimalMenu = 'on';
    else delete root.dataset.minimalMenu;
  }

  setTheme(theme) {
    this.setPrefs({ theme });
    this._applyPrefs();
    this.renderAll();
    this.drawers.graph?.draw?.();
  }

  setMinimal(on) {
    this.setPrefs({ minimal: !!on });
    this._applyPrefs();
    this.renderAll();
    if (on) this.toast('Minimal view. Press it again, or the corner button, to return.', { action: 'Leave', onAction: () => this.setMinimal(false) });
  }

  setTextbook(on) {
    this.entry.safeRun(() => lookup(on ? 'TEXTBOOK' : 'FLAT').fn(this.stack, this.entry));
  }

  setMinimalMenu(on) {
    this.setPrefs({ minimalMenu: !!on });
    this._applyPrefs();
  }

  setKeypadLayout(layout) {
    if (layout !== 'hidden') this._lastKeypad = layout;
    this.setPrefs({ keypad: layout });
    this.keypad.update();
    this.appbar.render();
    if (layout === 'hidden') this.toast('Keypad hidden', { action: 'Show', onAction: () => this.setKeypadLayout(this._lastKeypad ?? 'full') });
  }

  setPlotFocus(on) {
    const plotHadFocus = !!document.activeElement?.closest?.('.pl-box');
    this.plotFocus = !!on;
    $('app').classList.toggle('plot-focus', this.plotFocus);
    if (this.drawers.current === 'plot') this.drawers.render();
    if (plotHadFocus) this.drawers.graph.focus();
    requestAnimationFrame(() => this.drawers.graph?.resize?.());
  }

  _showError(message) {
    this._dropPreview();
    this._errorShown = message;
    this.errorBanner = message ? describeError(message, {
      failure: this.entry.failure,
      stack: this.stack.snapshot().slice(0, 3),
      depth: this.stack.depth,
      line: this.entry.buffer,
      describe: describeValue,
      commandInfo: (name) => this.commandInfo(name),
    }) : null;
    const levels = this.errorBanner?.culpritLevels ?? [];
    this.display.marks = levels.length ? Object.fromEntries(levels.map((l) => [l, 'culprit'])) : null;
    this.display.renderStack(this.stack);
    this.renderBanner();
    if (this.errorBanner) this.display.announce(`${this.errorBanner.title} ${this.errorBanner.detail}`);
  }

  renderBanner() {
    const el = $('banner');
    if (this.errorBanner) { el.innerHTML = errorBannerHtml(this.errorBanner); return; }
    const halted = calcState.halted;
    if (halted) {
      const prompt = getPromptMessage();
      el.innerHTML = haltedBannerHtml({
        kind: halted.kind,
        prompt: prompt == null ? '' : isString(prompt) ? prompt.value : format(prompt),
        programHtml: suspendedProgramHtml(halted, this.display.displayOpts),
      });
      return;
    }
    el.innerHTML = '';
  }

  dismissError() {
    if (!this.entry.error) return;
    this.entry.error = '';
    this.entry._emit();
  }

  _onBannerClick(e) {
    const b = e.target.closest('[data-bn]');
    if (!b) return;
    const act = b.dataset.bn;
    if (act === 'dismiss') { this.dismissError(); return; }
    if (act === 'cont' || act === 'sst' || act === 'kill') { this.entry.execOp({ cont: 'CONT', sst: 'SST', kill: 'KILL' }[act]); return; }
    if (act === 'fix') this._runFix(b.dataset.fix, b.dataset.arg);
  }

  _runFix(id, arg) {
    const desc = this.errorBanner;
    const message = this.entry.error;
    switch (id) {
      case 'drop':
        this.dismissError();
        this.entry._snapForUndo();
        try { dropLevel(this.stack, 1); } catch (err) { this.entry.flashError(err); }
        return;
      case 'swap': this.dismissError(); this.swapTop(); return;
      case 'help': this.drawers.showReference(arg ?? desc?.command); return;
      case 'explain': this._explainError(message); return;
      case 'edit-line': this.entry.focus(); return;
      case 'vars': this.drawers.open('vars'); return;
      case 'retry': this.dismissError(); this.commitEntry(); return;
    }
  }

  _explainError(message) {
    const levels = this.stack.snapshot().slice(0, 4).map((v, i) => `level ${i + 1} is ${formatSource(v)}`).join(', ');
    const line = this.entry.buffer.trim();
    this.askAssistant(`I got this error on the calculator: "${message}".${line ? ` The command line held: ${line}.` : ''} ${levels ? `On the stack, ${levels}.` : 'The stack is empty.'} What went wrong, and how do I fix it?`);
  }

  toast(message, opts) { this.toasts.show(message, opts); }

  notifyError(message) { this.toasts.show(message, { error: true, timeout: 5200 }); }

  _assistantTools() {
    const displayOpts = () => this.display.displayOpts;
    return {
      run: (text) => {
        this.entry.recall(text);
        this.entry.enter();
        return this.entry.error || '';
      },
      evaluate: (text) => evalScratch(text, { liveItems: this.stack.save(), displayOpts: displayOpts() }),
      evaluateOn: (text, liveItems) => evalScratch(text, { liveItems, displayOpts: displayOpts() }),
      appendToEditor: (text) => this.entry.type(text),
      clearEditor: () => this.entry.cancel(),
      getEditor: () => this.entry.buffer,
      listVars: () => varList(),
      recallVar: (name) => {
        const v = varRecall(name);
        return v === undefined ? undefined : format(v, displayOpts());
      },
      lookupCommand: (name) => {
        const entry = this.commandInfo(name)?.entry;
        const registered = lookup(name) != null;
        if (!entry) return { text: '', registered, name: String(name ?? '') };
        return { text: formatReferenceEntry(entry), registered: registered || entry.inApp, name: entry.name };
      },
      searchCommands: (query) => searchCommands(query, { names: allOps(), entries: this.reference, categories: CATEGORIES, limit: 12 }),
      snapshotState: () => ({ stack: this.stack.save(), calc: captureCalcState() }),
      restoreState: (snap) => {
        this.entry.cancel();
        this.entry._snapForUndo();
        this.stack.restore(snap.stack);
        restoreCalcState(snap.calc);
      },
    };
  }

  _assistantContext() {
    const levels = this.stack.snapshot();
    const st = calcState;
    const opts = this.display.displayOpts;
    return {
      stack: levels.slice(0, 8).map((v) => format(v, opts)),
      depth: levels.length,
      angleMode: st.angle,
      displayMode: st.displayMode === 'STD' ? 'STD' : `${st.displayMode} ${st.displayDigits}`,
      exactMode: st.approxMode ? 'APPROX' : 'EXACT',
      base: { d: 'DEC', h: 'HEX', o: 'OCT', b: 'BIN' }[st.binaryBase] ?? 'DEC',
      casVar: st.casVx,
      dir: currentPath().join('/') || 'HOME',
      vars: varList().slice(0, 40),
      editor: this.entry.buffer,
      lastError: this.entry.error || '',
    };
  }

  setAssistantMode(mode) {
    this.setPrefs({ assistantMode: mode });
    this.chatBot.setMode(this.prefs.assistantMode);
    if (this.drawers.current === 'assistant') this.drawers.render();
  }

  setTutorStyle(style) {
    this.setPrefs({ tutorStyle: style });
    this.chatBot.setMode(this.chatBot.mode, { tutorStyle: this.prefs.tutorStyle });
  }

  askAssistant(text = '') {
    this.drawers.open('assistant');
    const t = String(text).trim();
    if (!t) return;
    requestAnimationFrame(() => {
      if (this.chatBot._llm?.loadedModelId) this.chatBot.sendUserMessage(t);
      else this.chatBot.setDraft(t);
    });
  }

  _installAutosave() {
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => { pending = false; saveToLocalStorage(this.stack); });
    };
    this.stack.subscribe(schedule);
    subscribeState(schedule);
  }

  exportSnapshot() {
    try { this.toast(`Saved ${exportToFile(this.stack)}`); }
    catch (e) { this.notifyError(`Export failed: ${e.message}`); }
  }

  async importSnapshotFromFile(file) {
    this.entry._snapForUndo();
    try {
      await importFromFile(file, this.stack);
      this.toast(`Restored from ${file.name}`, { action: 'Undo', onAction: () => this.runAction('edit.undo') });
    } catch (e) {
      this.entry._dropNoOpUndoStep();
      this.notifyError(`Couldn't restore ${file.name}: ${e.message}`);
    }
  }

  _wireDisplay() {
    const d = this.display;
    d.emptyHtml = `<div class="st-empty"><h5>The stack is empty</h5><p>Type a number and press Enter. Commands take their arguments from the stack and leave their results on it.</p><div class="keysline"><span class="kc">2</span> <span class="kc">Enter</span> <span class="kc">3</span> <span class="kc">+</span> → 5</div><div class="chipset" style="justify-content:center"><button type="button" class="chip" data-empty-act="equation">${icon('fx', 'sm')}Write an equation</button><button type="button" class="chip" data-empty-act="solve">Solve x² − 5x + 6 = 0</button><button type="button" class="chip" data-empty-act="plot">${icon('plot', 'sm')}Plot sin x</button><button type="button" class="chip" data-empty-act="tutor">${icon('cap', 'sm')}Walk me through a problem</button></div></div>`;
    d.onEmptyAction = (act) => {
      if (act === 'equation') this.setInputMode('equation');
      else if (act === 'solve') { this.entry.recall('`X^2-5*X+6=0` `X` SOLVE'); this.commitEntry(); }
      else if (act === 'plot') { this.entry.recall('`SIN(X)` FUNCTION'); this.commitEntry(); }
      else if (act === 'tutor') this.runAction('assistant.tutor');
    };
    d.rowActionsHtml = (level, value) => `<div class="st-acts" role="toolbar" aria-label="Level ${level} actions"><button type="button" data-row-act="edit" title="Edit (Enter)">${icon('edit', 'sm')}Edit</button><button type="button" data-row-act="pick" title="Copy it to level 1 (PICK)">Pick</button><button type="button" data-row-act="roll" title="Move it to level 1 (ROLL)">Roll</button>${isSymbolic(value) ? `<button type="button" data-row-act="plot" title="Plot it">${icon('plot', 'sm')}</button>` : ''}<button type="button" data-row-act="drop" title="Drop it (⌫)" aria-label="Drop">${icon('trash', 'sm')}</button><button type="button" data-row-act="more" title="More actions" aria-label="More actions">${icon('more', 'sm')}</button></div>`;
    d.onRowClick = (level) => this.selectLevel(this.selection === level ? null : level);
    d.onRowDoubleClick = (level) => this.editLevel(level);
    d.onRowAction = (level, act, el) => this.levelAction(act, level, el);
    d.onRowMove = (from, to) => this._moveLevel(from, to);
    d.onStatusAction = (kind, data, el) => {
      if (kind === 'mode') this.appbar.openModeMenu(data.mode, el);
      else if (kind === 'path') this.navigateToPathSegment(Number(data.index));
      else if (kind === 'fullscreen') document.documentElement.requestFullscreen?.().catch(() => this.notifyError('Full screen is not available here.'));
      else if (kind === 'leave-minimal') this.setMinimal(false);
    };
  }

  selectLevel(level) {
    const depth = this.stack.depth;
    const next = level == null || !depth ? null : clampLevel(level, depth);
    if (next === this.selection) return;
    this.selection = next;
    this._ctxPage = 0;
    this.display.selectedLevel = next;
    this.display.renderStack(this.stack);
    this.menubar.render();
    this.keypad.update();
    if (next != null) this.display.announce(`Level ${next} selected`);
  }

  clearSelection() { this.selectLevel(null); }

  levelAction(act, level = this.selection, anchor = null) {
    if (level == null || level > this.stack.depth) return;
    const value = this.stack.peek(level);
    const run = (fn) => {
      this.entry._snapForUndo();
      try { fn(); } catch (e) { this.entry._dropNoOpUndoStep(); this.entry.flashError(e); }
    };
    switch (act) {
      case 'edit': this.editLevel(level); return;
      case 'echo': this.clearSelection(); this.entry.type(`${this.entry.buffer && !/\s$/.test(this.entry.buffer) ? ' ' : ''}${formatSource(value)}`); this.entry.focus(); return;
      case 'pick': run(() => this.stack.push(value)); this.selectLevel(level + 1); return;
      case 'roll': run(() => moveLevel(this.stack, level, 1)); this.selectLevel(1); return;
      case 'rolld': run(() => moveLevel(this.stack, 1, level)); this.selectLevel(level); return;
      case 'drop': run(() => dropLevel(this.stack, level)); if (!this.stack.depth) this.clearSelection(); return;
      case 'eval': this.clearSelection(); this.entry.safeRun(() => { moveLevel(this.stack, level, 1); lookup('EVAL').fn(this.stack, this.entry); }, 'EVAL'); return;
      case 'num': this.clearSelection(); this.entry.safeRun(() => { moveLevel(this.stack, level, 1); lookup('→NUM').fn(this.stack, this.entry); }, '→NUM'); return;
      case 'plot': this.clearSelection(); this.plotExpression(value.expr); return;
      case 'copy': this._copyText(formatSource(value), `Copied level ${level}`); return;
      case 'store': this._storePrompt(level, anchor); return;
      case 'ask': this.askAssistant(`Explain what is on level ${level} of my stack: ${formatSource(value)}`); return;
      case 'more': this._levelMenu(level, anchor); return;
    }
  }

  _levelMenu(level, anchor) {
    const value = this.stack.peek(level);
    const item = (act, ico, label, hint = '') => `<button type="button" class="opt" data-act="${act}"><span class="ck">${icon(ico, 'sm')}</span><b>${escapeHtml(label)}</b><em>${escapeHtml(hint)}</em></button>`;
    const html = `<h6>Level ${level}</h6>${item('edit', 'edit', 'Edit', '↵')}${item('echo', 'chr', 'Copy into the command line')}${item('pick', 'copy', 'Copy to level 1 (PICK)')}${item('roll', 'up', 'Move to level 1 (ROLL)')}${item('rolld', 'down', 'Move level 1 here (ROLLD)')}${item('eval', 'play', 'Evaluate (EVAL)')}${item('num', 'chr', 'To a number (→NUM)')}${isSymbolic(value) ? item('plot', 'plot', 'Plot it') : ''}${item('store', 'folder', 'Store in a variable…')}${item('copy', 'copy', 'Copy as text')}${item('ask', 'spark', 'Ask the assistant about it')}<hr>${item('drop', 'trash', 'Drop', '⌫')}`;
    this.popover.open(anchor, html, {
      label: `Level ${level}`,
      onClick: (t) => { this.popover.close({ restoreFocus: false }); this.levelAction(t.dataset.act, level, anchor); },
    });
  }

  _storePrompt(level, anchor) {
    const html = `<form data-store><h6>Store level ${level} in</h6><div style="padding:4px 6px 6px"><input type="text" name="name" placeholder="Variable name, like R1" aria-label="Variable name" spellcheck="false" autocomplete="off" style="width:100%;height:32px;border-radius:8px;border:1px solid var(--line2);background:var(--well);color:var(--ink);padding:0 9px;font:13px/1 var(--font-mono)"></div><div class="note">Same as <code>\`NAME\` STO</code>. Level ${level} stays on the stack.</div><div style="display:flex;justify-content:flex-end;padding:6px"><button type="submit" class="btn pri">Store</button></div></form>`;
    const pop = this.popover.open(anchor ?? this.display.stackView.querySelector('.st-row.sel'), html, { label: 'Store' });
    const form = pop.querySelector('form');
    requestAnimationFrame(() => form.elements.name.focus());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      const value = this.stack.peek(level);
      this.entry._snapForUndo();
      try {
        varStore(name, value);
        this.popover.close();
        this.toast(`Stored in ${name}`, { action: 'Undo', onAction: () => this.runAction('edit.undo') });
      } catch (err) {
        this.entry._dropNoOpUndoStep();
        this.notifyError(`Couldn't store in “${name}”: ${err.message}`);
      }
    });
  }

  _moveLevel(from, to) {
    if (from === to) return;
    this.entry._snapForUndo();
    try { moveLevel(this.stack, from, to); } catch (e) { this.entry._dropNoOpUndoStep(); this.entry.flashError(e); return; }
    this.selectLevel(to);
  }

  async _copyText(text, message) {
    try { await navigator.clipboard.writeText(text); this.toast(message); }
    catch { this.notifyError('The clipboard is not available here.'); }
  }

  editLevel(level) {
    if (this.stack.depth < level) { this.entry.flashError({ message: 'Too few arguments' }); return; }
    const value = this.stack.peek(level);
    this.clearSelection();
    this._beginEdit({ kind: 'level', level, value, label: `Editing level ${level}` });
  }

  editVariable(name) {
    const value = varRecall(name);
    if (value === undefined) return;
    this._beginEdit({ kind: 'var', name, value, label: `Editing ${name}` });
  }

  _beginEdit(edit) {
    if (this.entry.buffer.trim()) this.commitEntry();
    if (this.entry.buffer.trim()) return;
    this.pendingEdit = edit;
    const { value } = edit;
    if (isSymbolic(value) || (isName(value) && edit.kind === 'level')) {
      this.setInputMode('equation', { value });
    } else if (isMatrix(value) || isVector(value)) {
      this.setInputMode('matrix', { value });
    } else {
      this.setInputMode('rpl');
      this.entry.recall(formatSource(value));
    }
    this.renderStatus();
    this.input.render();
  }

  _endEdit() {
    this.pendingEdit = null;
    this.renderStatus();
    this.input.render();
  }

  writerCommit(value) {
    const edit = this.pendingEdit;
    if (this.entry.buffer.trim()) this.entry.enter();
    this.entry._recordHistory(formatSource(value));
    this.entry._snapForUndo();
    if (edit?.kind === 'level' && this.stack.peek(edit.level) === edit.value) replaceLevel(this.stack, edit.level, [value]);
    else if (edit?.kind === 'var') varStore(edit.name, value);
    else this.stack.push(value);
    this._endEdit();
    this.setInputMode('rpl');
    if (edit?.kind === 'var') this.toast(`Stored ${edit.name}`);
  }

  _writer() {
    return { equation: this.equationEditor, matrix: this.matrixEditor }[this.inputMode] ?? null;
  }

  focusInput() {
    if (this.inputMode === 'rpl') this.entry.focus();
    else this._writer().focus();
  }

  cancelWriter() {
    const mode = this.inputMode;
    const writer = this._writer();
    if (writer.collapseSelection?.()) return;
    const edit = this.pendingEdit;
    const saved = writer.snapshot();
    const hadContent = !writer.isEmpty();
    writer.clear();
    if (edit) this._endEdit();
    this.setInputMode('rpl');
    const reopen = () => {
      if (edit) this.pendingEdit = edit;
      this.setInputMode(mode);
      writer.restore(saved);
      this.input.render();
      this.renderStatus();
    };
    if (edit) this.toast('Edit cancelled. The level is unchanged.', { action: 'Undo', onAction: reopen });
    else if (hadContent) this.toast(mode === 'equation' ? 'Discarded the equation' : 'Discarded the matrix', { action: 'Undo', onAction: reopen });
  }

  pushFromWriter(value, message) {
    this.entry._snapForUndo();
    this.stack.push(value);
    this.toast(message, { action: 'Undo', onAction: () => { try { this.entry.performUndo(); } catch (e) { this.entry.flashError(e); } } });
  }

  plotExpression(ast) {
    const scratch = new Stack();
    scratch.push(Symbolic(ast));
    this.drawers.openGraph('function', scratch);
  }

  commitEntryAndPush(values) {
    if (this.entry.buffer.trim()) this.entry.enter();
    for (const value of Array.isArray(values) ? values : [values]) this.stack.push(value);
  }

  _commitEdit() {
    const edit = this.pendingEdit;
    const before = this.stack.depth;
    this.entry.enter();
    if (this.entry.error) { this.entry.focus(); return; }
    const added = this.stack.depth - before;
    if (edit.kind === 'level' && added >= 0) {
      const origLevel = edit.level + added;
      if (this.stack.peek(origLevel) === edit.value) {
        const items = this.stack.save();
        const results = items.splice(items.length - added, added);
        const at = items.length - edit.level;
        items.splice(at, 1, ...results);
        this.stack.restore(items);
      }
    } else if (edit.kind === 'var' && added === 1) {
      varStore(edit.name, this.stack.pop());
      this.toast(`Stored ${edit.name}`);
    }
    this._endEdit();
  }

  cancelEdit() {
    if (!this.pendingEdit) return false;
    this.entry.cancel();
    this._endEdit();
    if (this.inputMode !== 'rpl') this.setInputMode('rpl');
    return true;
  }

  commitEntry() {
    if (this.inputMode !== 'rpl') { this._writer().commit(); return; }
    const text = this.entry.buffer.trimStart();
    if (text.startsWith('?')) {
      const question = text.slice(1).trim();
      this.entry.cancel();
      this.askAssistant(question);
      return;
    }
    if (this.pendingEdit && this.inputMode === 'rpl') { this._commitEdit(); return; }
    this.entry.enter();
    if (this.entry.error) this.entry.focus();
  }

  cancelEntry() {
    if (this.cancelEdit()) return;
    this.entry.cancel();
  }

  swapTop() {
    if (this.stack.depth < 2) { this.entry.flashError({ message: 'SWAP needs two values; the stack has one.' }); return; }
    this.entry._snapForUndo();
    this.entry.safeRun(() => lookup('SWAP').fn(this.stack, this.entry), 'SWAP');
  }

  runCommandFromUI(name) {
    if (this.inputMode === 'equation') { this.equationEditor.pressCommand(name); return; }
    if (this.selection != null) this.clearSelection();
    if (!lookup(name)) { this.entry.flashError({ message: `${name} isn't available in rpl.ai` }); return; }
    this.entry.typeOrExecFn(name);
  }

  insertUnit(unit) {
    const e = this.entry;
    if (e.buffer.trim()) { e.type(`_${unit}`); e.focus(); return; }
    const top = this.stack.depth ? this.stack.peek(1) : null;
    e.recall(top && (isReal(top) || isInteger(top)) ? `1_${unit} *` : `1_${unit}`);
    this.commitEntry();
  }

  echoStackLevel(level) { this.levelAction('echo', level); }

  navigateToPathSegment(index) {
    const path = currentPath();
    if (index < 0 || index >= path.length) return;
    const stepsUp = path.length - 1 - index;
    if (stepsUp <= 0) return;
    if (this.entry.buffer.trim()) this.commitEntry();
    if (index === 0) { goHome(); return; }
    for (let i = 0; i < stepsUp; i++) goUp();
  }

  setInputMode(mode, { value = null } = {}) {
    if (mode === 'equation') {
      if (!this.equationEditor) this.equationEditor = new EquationEditor({ app: this });
      const eqw = this.equationEditor;
      this.inputMode = 'equation';
      this.input.show('equation', eqw.el);
      if (value) eqw.load(value);
      else eqw.refreshInsights();
      eqw.focus();
    } else if (mode === 'matrix') {
      if (!this.matrixEditor) this.matrixEditor = new MatrixEditor({ app: this });
      this.inputMode = 'matrix';
      this.input.show('matrix', this.matrixEditor.el);
      if (value) this.matrixEditor.load(value);
      this.matrixEditor.focus();
    } else {
      this.inputMode = 'rpl';
      this._eqwSlots = null;
      this.input.show('rpl');
      this.entry.focus();
    }
    this._ctxPage = 0;
    this.menubar.render();
    this.keypad.update();
    this.renderStatus();
  }

  openEquationEditor({ fromLevel1 = false } = {}) {
    if (fromLevel1 && this.stack.depth && (isSymbolic(this.stack.peek(1)) || isName(this.stack.peek(1)))) this.editLevel(1);
    else this.setInputMode('equation');
  }

  showMenu(id, { remember = true } = {}) {
    if (this.selection != null) this.clearSelection();
    if (id === 'VARS') this.showVarsMenu();
    else if (id === 'CST') this.showCustomMenu();
    else if (id === 'MODES') this.showModesMenu();
    else this._showFamilyMenu(id);
    if (remember) this.setPrefs({ menu: this.menuKind });
  }

  setMenu(slots, kind = null) {
    if (kind === 'EQW') { this._eqwSlots = slots; this._ctxPage = 0; this.menubar.render(); return; }
    this.menuKind = kind;
    this.menuAll = Array.isArray(slots) ? slots.slice() : [];
    this.menuPage = 0;
    this.menubar.render();
  }

  menuView() {
    let ctx = null;
    if (this.selection != null && this.stack.depth) ctx = { key: `LVL${this.selection}`, title: `LEVEL ${this.selection}`, short: `LVL ${this.selection}`, items: this._levelSlots() };
    else if (this.inputMode === 'equation' && this.equationEditor) ctx = { key: 'EQW', title: 'EQUATION', short: 'EQW', items: this._eqwSlots ?? this.equationEditor.menu() };
    else if (this.inputMode === 'matrix' && this.matrixEditor) ctx = { key: 'MTRW', title: 'MATRIX', short: 'MTRW', items: this.matrixEditor.menu() };
    if (ctx) {
      if (ctx.key !== this._ctxKey) { this._ctxKey = ctx.key; this._ctxPage = 0; }
      const { view, page } = computeMenuPage(ctx.items, this._ctxPage, 6);
      this._ctxPage = page;
      return { ...ctx, slots: view, page, pages: Math.max(1, Math.ceil(ctx.items.length / 6)) };
    }
    this._ctxKey = '';
    const meta = menuById(this.menuKind) ?? { title: this.menuKind ?? 'MENU', short: this.menuKind ?? 'MENU' };
    const { view, page } = computeMenuPage(this.menuAll, this.menuPage, 6);
    this.menuPage = page;
    return { title: meta.short === 'VARS' ? `VARS · ${currentPath().at(-1)}` : meta.short, short: meta.short, slots: view, page, pages: Math.max(1, Math.ceil(this.menuAll.length / 6)) };
  }

  _inContextMenu() { return !!this._ctxKey; }

  nextMenuPage() {
    if (this._inContextMenu()) this._ctxPage += 1;
    else this.menuPage += 1;
    this.menubar.render();
  }

  prevMenuPage() {
    if (this._inContextMenu()) this._ctxPage -= 1;
    else this.menuPage -= 1;
    this.menubar.render();
  }

  pressSoftKey(i, forcedLayer = null) {
    const view = this.menuView();
    const slot = view.slots[i];
    if (!slot) return;
    const layer = forcedLayer ?? this.layer();
    const handler = (layer === 'L' && slot.onPressL) || (layer === 'R' && slot.onPressR) || slot.onPress;
    if (!forcedLayer && this.shift && !this.shiftLocked()) this.setShift(null);
    if (!handler) return;
    try { handler(); } catch (e) { this.entry.flashError(e); }
  }

  _levelSlots() {
    const level = this.selection;
    const value = this.stack.peek(level);
    const act = (a) => () => this.levelAction(a, level);
    return [
      { label: 'EDIT', title: 'Edit this level (Enter)', onPress: act('edit') },
      { label: 'ECHO', title: 'Copy it into the command line', onPress: act('echo') },
      { label: 'PICK', title: 'Copy it to level 1', onPress: act('pick') },
      { label: 'ROLL', title: 'Move it to level 1', onPress: act('roll') },
      { label: 'ROLLD', title: 'Move level 1 here', onPress: act('rolld') },
      { label: 'DROP', title: 'Remove it (⌫)', onPress: act('drop') },
      isSymbolic(value)
        ? { label: 'PLOT', title: 'Plot it', onPress: act('plot') }
        : { label: 'EVAL', title: 'Evaluate it', onPress: act('eval') },
      { label: '→NUM', title: 'Evaluate to a number', onPress: act('num') },
      { label: 'STO…', title: 'Store it in a variable', onPress: () => this.levelAction('store', level) },
      { label: 'COPY', title: 'Copy to the clipboard', onPress: act('copy') },
      { label: 'ASK ✦', title: 'Ask the assistant about it', onPress: act('ask') },
      { label: 'DONE', title: 'Clear the selection (Esc)', onPress: () => this.clearSelection() },
    ];
  }

  _showFamilyMenu(id) {
    const family = MENU_FAMILIES.find((f) => f.id === id) ?? MENU_FAMILIES[0];
    const names = familyCommands(family);
    const slots = names.map((name) => ({
      label: name,
      command: name,
      title: this.commandTitle(name),
      blockedReason: () => this._tooFewArgumentsReason(name),
      onPress: () => this.runCommandFromUI(name),
      onPressL: () => { this.entry.type(`${this.entry.buffer && !/\s$/.test(this.entry.buffer) ? ' ' : ''}${name} `); this.entry.focus(); },
      onPressR: () => this.drawers.showReference(name),
    }));
    if (family.id === 'UNITS') {
      for (const unit of UNIT_SYMBOLS.filter((u) => UNIT_CATALOG.has(u))) {
        slots.push({ label: unit, title: `Attach _${unit} to the number you are typing, or to level 1`, onPress: () => this.insertUnit(unit) });
      }
    }
    this.menuKind = family.id;
    this.menuAll = slots;
    this.menuPage = 0;
    this.menubar.render();
  }

  commandTitle(name) {
    const info = this.commandInfo(name);
    return info ? `${name}: ${shortDescription(info.entry, 100)} · ↰ types it · ↱ opens the reference` : `${name} · ↰ types it · ↱ opens the reference`;
  }

  commandInfo(name) {
    const entry = this.reference ? findReferenceEntry(this.reference, name) : null;
    return entry && { entry, signature: signatureOf(entry), inputs: entry.inputs };
  }

  _tooFewArgumentsReason(name) {
    const inputs = this.commandInfo(name)?.inputs;
    const depth = this.stack.depth;
    if (inputs == null || inputs <= depth || this.entry.buffer.trim()) return '';
    return ERROR_KINDS.tooFew.title({ command: name, args: inputs, depth });
  }

  previewSoftKey(i) {
    const command = this.menuView().slots[i]?.command;
    if (command) this.previewCommand(command);
    else this.clearPreview();
  }

  previewCommand(name) {
    const idle = !this.entry.buffer.trim() && this.selection == null && !this.errorBanner && this.inputMode === 'rpl' && !this.layer();
    const outcome = idle ? previewCommand(name, this.stack.save()) : null;
    if (!outcome) { this.clearPreview(); return; }
    this.preview = name;
    const d = this.display;
    d.previewFails = !outcome.ok;
    if (outcome.ok) {
      d.marks = Object.fromEntries(Array.from({ length: outcome.consumed }, (_, i) => [i + 1, 'arg']));
      d.ghosts = outcome.results;
      d.previewLabel = `PREVIEW · ${name}`;
    } else {
      const desc = this._previewFailure(name, outcome.error);
      d.marks = Object.fromEntries(desc.culpritLevels.map((l) => [l, 'culprit']));
      d.ghosts = null;
      d.previewLabel = desc.title;
    }
    d.renderStack(this.stack);
  }

  previewText(name) {
    const outcome = previewCommand(name, this.stack.save());
    if (!outcome) return '';
    if (!outcome.ok) return this._previewFailure(name, outcome.error).title;
    const top = outcome.results.slice(-2).reverse();
    if (!top.length) return `→ removes ${outcome.consumed === 1 ? 'level 1' : `${outcome.consumed} levels`}`;
    return `→ ${top.map((value, i) => `${i + 1}: ${format(value, this.display.displayOpts)}`).join('   ')}`;
  }

  _previewFailure(name, error) {
    const levels = this.stack.snapshot().slice(0, 3);
    return describeError(error, {
      failure: { op: name, levels }, stack: levels, depth: this.stack.depth,
      describe: describeValue, commandInfo: (n) => this.commandInfo(n),
    });
  }

  clearPreview() {
    if (!this.preview) return;
    this._dropPreview();
    this.display.renderStack(this.stack);
  }

  _dropPreview() {
    if (!this.preview) return;
    this.preview = null;
    Object.assign(this.display, { marks: null, ghosts: null, previewLabel: '', previewFails: false });
  }

  showModesMenu(opts = {}) {
    const prevPage = this.menuPage;
    const slots = MODES.flatMap((m) => m.options.map((o) => ({
      label: m.id === 'base' ? ({ h: 'HEX', d: 'DEC', o: 'OCT', b: 'BIN' })[o.value] : m.id === 'fmt' || m.id === 'coord' ? o.value.slice(0, 5) : o.value,
      title: `${m.title}: ${o.label}. ${o.detail}`,
      toggle: true,
      on: () => m.current() === o.value,
      onPress: () => m.set(o.value),
    })));
    slots.splice(12, 0, {
      label: 'TXTBK',
      title: 'Pretty math: show expressions, matrices and lists in textbook form',
      toggle: true,
      on: () => calcState.textbookMode,
      onPress: () => this.setTextbook(!calcState.textbookMode),
    });
    this.menuKind = 'MODES';
    this.menuAll = slots;
    this.menuPage = opts.preservePage ? prevPage : 0;
    this.menubar.render();
  }

  pressVariable(name, layer = null) {
    if (this.entry.buffer.trim().length > 0) this.commitEntry();
    const v = varRecall(name);
    if (v === undefined) { this.entry.flashError({ message: `Undefined name: ${name}` }); return; }
    if (layer === 'L') {
      if (this.stack.depth < 1) { this.entry.flashError({ message: `STO ${name} needs a value on level 1; the stack is empty.` }); return; }
      this.entry.safeRun(() => { this.entry._snapForUndo(); varStore(name, this.stack.pop()); }, 'STO');
      this.toast(`Stored level 1 in ${name}`);
      return;
    }
    if (layer === 'R') { this.entry._snapForUndo(); this.stack.push(v); return; }
    if (isDirectory(v)) {
      if (!goInto(name)) this.entry.flashError({ message: `Cannot open ${name}` });
      return;
    }
    this.entry._snapForUndo();
    if (isProgram(v)) {
      this.entry.safeRun(() => { this.stack.push(v); lookup('EVAL').fn(this.stack, this.entry); }, name);
      return;
    }
    this.stack.push(v);
  }

  showVarsMenu(opts = {}) {
    const prevPage = this.menuPage;
    const slots = varOrder().map((id) => {
      const v = varRecall(id);
      const dir = isDirectory(v);
      return {
        label: id,
        dir,
        variable: !dir,
        title: dir ? `Open folder ${id}` : `${id}: ${isProgram(v) ? 'run it' : 'put it on the stack'} · ↰ stores level 1 into it · ↱ recalls without running`,
        onPress: () => this.pressVariable(id),
        onPressL: dir ? null : () => this.pressVariable(id, 'L'),
        onPressR: dir ? null : () => this.pressVariable(id, 'R'),
      };
    });
    this.menuKind = 'VARS';
    this.menuAll = slots;
    this.menuPage = opts.preservePage ? prevPage : 0;
    this.menubar.render();
  }

  showCustomMenu() {
    if (this.entry.buffer.trim().length > 0) this.commitEntry();
    const cst = varRecall('CST');
    if (cst === undefined || !isList(cst)) {
      this.menuKind = 'CST';
      this.menuAll = [];
      this.menuPage = 0;
      this.menubar.render();
      this.toast(cst === undefined
        ? 'CST is empty. Store a list of commands or names in CST, for example { SOLVE FACTOR } `CST` STO.'
        : 'CST must hold a list, for example { SOLVE FACTOR }.');
      return;
    }
    const slots = cst.items.map((item) => {
      const label = customMenuLabel(item);
      const [target, tag] = customMenuTarget(item);
      return {
        label,
        title: `${label} · ↰ types it · ↱ recalls it`,
        onPress: () => {
          if (this.entry.buffer.trim().length > 0) this.commitEntry();
          if (isProgram(target) || isName(target)) {
            this.entry.safeRun(() => { this.stack.push(target); lookup('EVAL').fn(this.stack, this.entry); }, label);
          } else {
            this.stack.push(target);
          }
        },
        onPressL: () => this.entry.type(tag || label),
        onPressR: () => { if (this.entry.buffer.trim().length > 0) this.commitEntry(); this.stack.push(target); },
      };
    });
    this.menuKind = 'CST';
    this.menuAll = slots;
    this.menuPage = 0;
    this.menubar.render();
  }

  layer() {
    if (!this.shift) return null;
    if (this.shift.startsWith('shiftL')) return 'L';
    if (this.shift.startsWith('shiftR')) return 'R';
    return 'A';
  }

  shiftKind() { return this.shift ? this.shift.replace('Lock', '') : null; }

  shiftLocked() { return !!this.shift?.endsWith('Lock'); }

  setShift(state) {
    if (MODIFIER_KINDS.has(state)) {
      const lockName = `${state}Lock`;
      const now = Date.now();
      if (this.shift === lockName) this.shift = null;
      else if (this.shift === state) {
        const quick = (now - this._lastShiftAt) < DOUBLE_PRESS_MS && this._lastShiftKind === state;
        this.shift = quick ? lockName : null;
      } else this.shift = state;
      this._lastShiftAt = now;
      this._lastShiftKind = state;
    } else {
      this.shift = state;
    }
    this.keypad.update();
    this.menubar.render();
    this.renderStatus();
  }

  keyCaption(key) {
    if (this.selection != null) return { '▲': 'UP', '▼': 'DOWN', ENTER: 'EDIT', '⌫': 'DROP', ON: 'DONE' }[key.primary] ?? '';
    if (this.inputMode !== 'rpl') return { ENTER: 'PUSH', ON: 'BACK' }[key.primary] ?? '';
    const depth = this.stack.depth;
    if (this.entry.buffer.length) return key.primary === 'ON' ? 'CANCEL' : '';
    if (key.primary === 'ENTER' && depth) return 'DUP';
    if (key.primary === '⌫' && depth) return 'DROP';
    if (key.primary === '▲' && depth) return 'SELECT';
    if (key.primary === '▼' && depth) return 'EDIT';
    if (key.primary === '▶' && depth > 1) return 'SWAP';
    if (key.primary === '+/-' && depth && (isReal(this.stack.peek(1)) || isInteger(this.stack.peek(1)))) return 'NEG';
    return '';
  }

  showKeyLayers(key, anchor) {
    if (MODIFIER_KINDS.has(key.kind)) return;
    const row = (layer, label, name, desc, color) => `<button type="button" data-v="${layer}" ${label ? '' : 'disabled'}><small style="color:${color}">${name}</small><span><b>${escapeHtml(label || '—')}</b>${desc ? ` · ${escapeHtml(desc)}` : ''}</span></button>`;
    const html = `<h6>${escapeHtml(key.primary)} key</h6><div class="layers">${row('P', key.primary, 'KEY', '', 'var(--ink3)')}${row('L', key.shiftL, '↰ LEFT', '', 'var(--amber)')}${row('R', key.shiftR, '↱ RIGHT', '', 'var(--coral)')}${row('A', key.alpha, 'α ALPHA', 'types the letter', 'var(--blue)')}</div>`;
    this.popover.open(anchor, html, {
      label: `${key.primary} key layers`,
      onClick: (t) => {
        this.popover.close({ restoreFocus: false });
        const layer = t.dataset.v;
        const saved = this.shift;
        this.shift = layer === 'L' ? 'shiftL' : layer === 'R' ? 'shiftR' : layer === 'A' ? 'alpha' : null;
        this.handleKey(key);
        if (this.shift) this.shift = saved;
        this.keypad.update();
        this.renderStatus();
      },
    });
  }

  handleKey(key) {
    if (MODIFIER_KINDS.has(key.kind)) { this.setShift(key.kind); return; }

    if (this.selection != null && !this.shift) {
      const sel = { '▲': 'level.up', '▼': 'level.down', ENTER: 'level.edit', '⌫': 'level.drop', ON: 'ui.escape' }[key.primary];
      if (sel) { this.runAction(sel); return; }
      this.clearSelection();
    }

    if (this.inputMode === 'equation') {
      if (key.primary === 'ON' && !this.shift) { this.runAction('ui.escape'); return; }
      this.equationEditor.pressKeypad(key, this.shift);
      if (this.shift && !this.shiftLocked()) this.setShift(null);
      return;
    }

    const alphaActive = this.shift === 'alpha' || this.shift === 'alphaLock';
    if (alphaActive && key.alpha) {
      this.entry.type(key.alpha);
      if (this.shift === 'alpha') this.setShift(null);
      return;
    }

    const layer = this.layer();
    const action =
      layer === 'L' && key.shiftLAction ? key.shiftLAction :
      layer === 'R' && key.shiftRAction ? key.shiftRAction :
      key.action;
    const missing = (layer === 'L' && !key.shiftLAction && key.shiftL) ? key.shiftL
      : (layer === 'R' && !key.shiftRAction && key.shiftR) ? key.shiftR : null;
    if (missing) this.entry.flashError({ message: `${missing} isn't available in rpl.ai` });
    else if (action) action(this.entry, this.shift, this);
    if (this.shift && !this.shiftLocked()) this.setShift(null);
  }

  _keyContexts() {
    const contexts = [];
    if (document.activeElement?.closest?.('.pl-box')) contexts.push('plot');
    if (this.inputMode === 'equation') contexts.push('equation');
    if (this.inputMode === 'matrix') contexts.push('matrix');
    if (this.selection != null) contexts.push('selection');
    if (this.inputMode === 'rpl') contexts.push(this.entry.buffer.length ? 'line' : 'empty');
    contexts.push('global');
    return contexts;
  }

  _runChord(chord) {
    const binding = findBinding(chord, this._keyContexts());
    if (!binding) return false;
    return this.runAction(binding.action, binding.arg) !== false;
  }

  runAction(id, arg) {
    switch (id) {
      case 'palette.open': this.popover.close({ restoreFocus: false }); this.palette.open(); return true;
      case 'assistant.tutor': this.setAssistantMode('tutor'); this.askAssistant(); return true;
      case 'help.tour': this.tour.start(); return true;
      case 'catalog.open': this.drawers.open('catalog'); return true;
      case 'about.open': this.sheets.openAbout(); return true;
      case 'assistant.ask': {
        const text = this.entry.buffer.trim().replace(/^\?/, '').trim();
        if (text) this.entry.cancel();
        this.drawers.open('assistant');
        if (text) requestAnimationFrame(() => this.chatBot.setDraft(text));
        return true;
      }
      case 'writer.equation': {
        if (this.inputMode === 'equation') { this.setInputMode('rpl'); return true; }
        if (this.selection != null && (isSymbolic(this.stack.peek(this.selection)) || isName(this.stack.peek(this.selection)))) this.editLevel(this.selection);
        else this.setInputMode('equation');
        return true;
      }
      case 'writer.matrix': {
        if (this.inputMode === 'matrix') { this.setInputMode('rpl'); return true; }
        if (this.selection != null && (isMatrix(this.stack.peek(this.selection)) || isVector(this.stack.peek(this.selection)))) this.editLevel(this.selection);
        else this.setInputMode('matrix');
        return true;
      }
      case 'drawer.toggle': this.drawers.toggle(); return true;
      case 'keypad.toggle': this.setKeypadLayout(this.prefs.keypad === 'hidden' ? (this._lastKeypad ?? 'full') : 'hidden'); return true;
      case 'view.minimal': this.setMinimal(!this.prefs.minimal); return true;
      case 'settings.open': this.sheets.openSettings(); return true;
      case 'shortcuts.open': this.sheets.openShortcuts(); return true;
      case 'edit.undo':
        if (this.inputMode === 'equation' && this.equationEditor.canUndo()) { this.equationEditor.pressFace('UNDO'); return true; }
        if (this.inputMode === 'rpl' && this.entry.buffer.length) { this.entry.undoText(); return true; }
        try { this.entry.performUndo(); } catch (e) { this.entry.flashError(e); }
        return true;
      case 'edit.redo':
        if (this.inputMode === 'equation' && this.equationEditor.state.future.length) { this.equationEditor.pressFace('REDO'); return true; }
        if (this.inputMode === 'rpl' && this.entry.buffer.length) { this.entry.redoText(); return true; }
        try { this.entry.performRedo(); } catch (e) { this.entry.flashError(e); }
        return true;
      case 'edit.paste':
        if (this.entry.hasFocus()) return false;
        navigator.clipboard?.readText?.().then((text) => { if (text) { this.entry.paste(text); this.entry.focus(); } })
          .catch(() => this.notifyError('The clipboard is not available here. Click the command line and paste there.'));
        return true;
      case 'ui.escape': return this._escape();
      case 'writer.commit': this.commitEntry(); return true;
      case 'matrix.nextCell': this.matrixEditor.focus(); return true;
      case 'plot.pan': this.drawers.graph.nudge(arg); return true;
      case 'plot.zoomIn': this.drawers.graph.zoomBy(1 / 1.25); return true;
      case 'plot.zoomOut': this.drawers.graph.zoomBy(1.25); return true;
      case 'plot.reset': this.drawers.graph.resetView(); return true;
      case 'plot.trace': this.drawers.graph.setTraceMode(!this.drawers.graph.tracing); return true;
      case 'plot.fullscreen': this.drawers.graph.fullscreen(); return true;
      case 'eqw.fraction': this.equationEditor.pressFace('÷'); return true;
      case 'eqw.power': this.equationEditor.pressFace('yˣ'); return true;
      case 'eqw.group': this.equationEditor.pressFace('( )'); return true;
      case 'eqw.next': this.equationEditor.pressFace('▶'); return true;
      case 'eqw.extend': this.equationEditor.pressFace(arg < 0 ? '⇧◀' : '⇧▶'); return true;
      case 'menu.prev': this.prevMenuPage(); return true;
      case 'menu.next': this.nextMenuPage(); return true;
      case 'softkey.press': this.pressSoftKey(arg); return true;
      case 'softkey.store': this.pressSoftKey(arg, 'L'); return true;
      case 'softkey.recall': this.pressSoftKey(arg, 'R'); return true;
      case 'line.newline': this.entry.type('\n'); return true;
      case 'stack.dup':
        if (this._keyRepeat) return true;
        this.entry.enter();
        return true;
      case 'stack.drop':
        if (this._keyRepeat) return true;
        this.entry.backspace();
        return true;
      case 'stack.swap': if (this.stack.depth < 2) { this.nextMenuPage(); return true; } this.swapTop(); return true;
      case 'level.selectFirst': if (!this.stack.depth) return true; this.selectLevel(1); return true;
      case 'level.editFirst': if (!this.stack.depth) return true; this.editLevel(1); return true;
      case 'level.up': this.selectLevel(Math.min(this.stack.depth, this.selection + 1)); return true;
      case 'level.down': if (this.selection <= 1) this.clearSelection(); else this.selectLevel(this.selection - 1); return true;
      case 'level.rollUp': if (this.selection < this.stack.depth) this._moveLevel(this.selection, this.selection + 1); return true;
      case 'level.rollDown': if (this.selection > 1) this._moveLevel(this.selection, this.selection - 1); return true;
      case 'level.edit': this.levelAction('edit'); return true;
      case 'level.drop': if (this._keyRepeat) return true; this.levelAction('drop'); return true;
      case 'level.copy': this.levelAction('copy'); return true;
      case 'level.pick': this.levelAction('pick'); return true;
      default: return false;
    }
  }

  _escape() {
    if (this.popover.isOpen()) { this.popover.close(); return true; }
    if (this.sheets.isOpen()) { this.sheets.close(); return true; }
    if (this.plotFocus) { this.setPlotFocus(false); return true; }
    if (document.activeElement?.closest?.('.pl-box')) { this.focusInput(); return true; }
    if (this.selection != null) { this.clearSelection(); return true; }
    if (this.entry.error) { this.entry.error = ''; this.entry._emit(); return true; }
    if (this.inputMode !== 'rpl') { this.cancelWriter(); return true; }
    if (this.pendingEdit) { this.cancelEdit(); return true; }
    if (this.entry.buffer.length) {
      const text = this.entry.buffer;
      this.entry.cancel();
      this.toast('Cleared the command line', { action: 'Undo', onAction: () => this.entry.recall(text) });
      return true;
    }
    if (this.shift) { this.setShift(null); return true; }
    const overlay = this.prefs.minimal || window.innerWidth < 980;
    if (this.drawers.isOpen() && overlay) { this.drawers.close(); return true; }
    return true;
  }

  _installKeyboard() {
    document.addEventListener('keydown', (e) => {
      this._keyRepeat = e.repeat;
      if (e.key === 'Alt' && !this.showKeyHints) { this.showKeyHints = true; this.keypad.update(); }
    }, true);
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && this.showKeyHints) { this.showKeyHints = false; this.keypad.update(); }
    });
    window.addEventListener('blur', () => { if (this.showKeyHints) { this.showKeyHints = false; this.keypad.update(); } });
    document.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  _onKeyDown(e) {
    if (e.defaultPrevented || this.palette.isOpen()) return;
    const target = e.target;
    const tag = target?.tagName;
    const inEditor = this.entry.hasFocus();
    const inField = !inEditor && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable);
    const chord = chordFromEvent(e);
    if (!chord) return;
    if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;

    if (this.inputMode === 'equation' && this.equationEditor.ownsKeyboard(target)) {
      const writerBinding = findBinding(chord, ['equation']);
      if (writerBinding) {
        if (this.runAction(writerBinding.action, writerBinding.arg) !== false) e.preventDefault();
        return;
      }
      if (!/^(Mod\+|F\d|Shift\+F|Alt\+F|PageUp|PageDown|Escape)/.test(chord) && this.equationEditor.handleKey(e)) { e.preventDefault(); return; }
    }

    if (inField) {
      const fieldSafe = /^Mod\+(K|I|E|\\|;|,|\/)$|^Mod\+Shift\+(F|M)$|^F\d$|^(Shift|Alt)\+F\d$/.test(chord);
      const escapeSafe = chord === 'Escape' && (!target.value || this.inputMode !== 'rpl');
      if (!fieldSafe && !escapeSafe) return;
    }

    const binding = findBinding(chord, inField ? this._keyContexts().filter((c) => c === 'global' || c === 'selection') : this._keyContexts());
    if (binding) {
      if (this.runAction(binding.action, binding.arg) !== false) e.preventDefault();
      return;
    }
    if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.inputMode !== 'rpl') return;
    if (e.key.length === 1) {
      this.entry.focus();
      this.entry.type(e.key);
      e.preventDefault();
    }
  }
}

function customMenuLabel(item) {
  if (isTagged(item)) return item.tag || format(item.value);
  if (isName(item)) return item.id;
  if (isString(item)) return item.value;
  return format(item);
}

function customMenuTarget(item) {
  if (isTagged(item)) return [item.value, item.tag];
  return [item, null];
}

window.__hp50 = new App();

window.calc_reset = function calc_reset() {
  window.__hp50.sheets.resetEverything();
};

giac.init().then(() => window.__hp50.equationEditor?.refreshInsights()).catch((e) => {
  console.error('[giac] init failed:', e);
});

function installOfflineCache(app) {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  let reloadRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadRequested) location.reload(); });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const announceWaitingUpdate = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      app.toast('A new version of rpl.ai is ready', {
        action: 'Reload',
        onAction: () => { reloadRequested = true; reg.waiting?.postMessage({ type: 'activate-update' }); },
      });
    };
    announceWaitingUpdate();
    reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', announceWaitingUpdate));
  }).catch((e) => console.warn('[offline] service worker registration failed:', e));
}

installOfflineCache(window.__hp50);
