import { Stack } from './rpl/stack.js';
import { Entry, inProgramEntry } from './ui/entry.js';
import { Display, escapeHtml, describeValue, suspendedProgramHtml, binaryBaseLabel } from './ui/display.js';
import { Keypad, hpKeyCode, typedKeyCode } from './ui/keyboard.js';
import { MenuBar } from './ui/menubar.js';
import { AppBar, installHint } from './ui/appbar.js';
import { Drawers, CATEGORIES, familyCommands, signatureOf } from './ui/drawer.js';
import { describeError, ERROR_KINDS } from './ui/errors.js';
import { errorBannerHtml, haltedBannerHtml, lcdHtml } from './ui/banner.js';
import { InputArea } from './ui/input-area.js';
import { Autocomplete } from './ui/autocomplete.js';
import { Palette } from './ui/palette.js';
import { Popover } from './ui/popover.js';
import { Toasts } from './ui/toast.js';
import { Sheets } from './ui/sheets.js';
import { Tour } from './ui/tour.js';
import { chordFromEvent, findBinding, shortcutText } from './ui/actions.js';
import { loadUiPrefs, saveUiPrefs, normalizeUiPrefs } from './ui/ui-prefs.js';
import { MENU_FAMILIES, UNIT_GROUPS, BRANCH_KEYS, menuById, unitConversions, chooseEntry, customMenuEntry, customMenuLabel } from './ui/menus.js';
import { convertValue } from './rpl/units.js';
import { MODES } from './ui/modes.js';
import { computeMenuPage } from './ui/paging.js';
import { clampLevel, dropLevel, keepLevels, moveLevel, replaceLevel } from './ui/stack-levels.js';
import { icon } from './ui/icons.js';
import { installCommandHover, entryWordAtEvent, stackWordAtEvent } from './ui/hover-help.js';
import { EquationEditor, keypadFace } from './ui/equation-editor.js';
import { MatrixEditor } from './ui/matrix-editor.js';
import {
  loadCommandReference, findReferenceEntry, formatReferenceEntry, searchCommands, shortDescription,
} from './ui/command-reference.js';
import { format, formatSource, formatProgramLines } from './rpl/formatter.js';
import { spreadsheetHtml } from './rpl/sheet.js';
import { toLatex } from './rpl/latex.js';
import {
  state as calcState, subscribe as subscribeState,
  varOrder, varList, varRecall, varStore, currentPath,
  goInto, goHome, goUp, captureCalcState, restoreCalcState, getPromptMessage, getLcd, touchLcd, testUserFlag,
} from './rpl/state.js';
import { lookup, allOps, setGraphicsHook, setMenuHook, setBeepHook } from './rpl/ops.js';
import { beep } from './ui/beep.js';
import { _hp50TypeCode } from './rpl/ops/internal.js';
import { evalScratch, previewCommand } from './rpl/scratch.js';
import {
  isProgram, isDirectory, isList, isName, isString, isTagged, isSymbolic,
  isMatrix, isVector, isReal, isInteger, isRational, isUnit, Symbolic, Integer, Real, Unit, Str, Name, RList,
} from './rpl/types.js';
import { parseEntry } from './rpl/parser.js';
import {
  loadInitialState, adoptStoredState, saveToLocalStorage, exportToFile, importFromFile, downloadFormats, downloadValue, readUpload, STORAGE_KEY,
  shareLink, sharedSource, sharedText,
} from './rpl/persist.js';
import { giac } from './rpl/cas/giac-engine.mjs';
import { ChatBot } from './ai/chat-bot.js';

const $ = (id) => document.getElementById(id);

const MODIFIER_KINDS = new Set(['shiftL', 'shiftR', 'alpha']);
const DOUBLE_PRESS_MS = 300;
// The installed app's icon shortcuts (the manifest's ./?open=…); a link can name nothing else.
const APP_SHORTCUTS = new Map([
  ['equation', (app) => app.setInputMode('equation')],
  ['matrix', (app) => app.setInputMode('matrix')],
  ['vars', (app) => app.drawers.open('vars')],
  ['search', (app) => app.palette.open()],
]);

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

    // A view's hint toast would sit over the menu's first rows.
    this.popover = new Popover($('layPop'), { onOpen: () => this.toasts?.dismiss('view') });
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
      onTutorMine: (step, check) => this._tutorAside(`${step.title}. Keys: ${step.keys || step.rpl}`, 'Check', check),
      onTutorShow: (step) => this._tutorAside(`${step.title}: done`, 'Continue'),
    });
    this.chatBot.setMode(this.prefs.assistantMode, { tutorStyle: this.prefs.tutorStyle });
    this.drawers = new Drawers({ rail: $('rail'), el: $('drawer'), scrim: $('scrim'), app: this });
    setGraphicsHook((kind, stack) => this.drawers.openGraph(kind, stack));
    setMenuHook((list, temporary) => {
      if (!list) this.showPreviousMenu({ commit: false });
      else if (temporary) this.setMenu(this._customMenuSlots(list), 'TMENU');
      else this.showMenu('CST', { commit: false });
      if (this.prefs.minimal) this.setMinimalMenu(true);
    });
    setBeepHook(beep);
    loadCommandReference().then((m) => { this.reference = m; this.menubar.render(); }).catch(() => {});

    this._wireDisplay();
    loadInitialState(this.stack);

    this.stack.subscribe(() => this._onStackChange());
    this.entry.subscribe(() => this._onEntryChange());
    subscribeState(() => this._onStateChange());

    this.entry.attach($('cmdline'), {
      onCommit: () => { if (this._answerKey(hpKeyCode('ENTER')) || this._enterAnswersDialog()) return; if (!this._runChord('Enter')) this.commitEntry(); },
      onType: (text) => this._answerKey(typedKeyCode(text)),
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
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyThemeColor);
    this._applyPhoneKeyboard();
    this.showMenu(this.prefs.menu ?? (varOrder().length ? 'VARS' : 'STACK'), { remember: false });
    if (this.prefs.drawer) this.drawers.open(this.prefs.drawer);
    this._installKeyboard();
    this._installAutosave();
    this._installFileDrop();
    this._installBackButton();
    this._installHaptics();
    this.renderAll();
    this._openSharedLink();
    this._openShortcut();
    if (!this.prefs.tourSeen) setTimeout(() => this.tour.start(), 700);
  }

  // A shared link, or text another app shares to rpl.ai, only fills the command
  // line, so nothing it carries runs until Enter.
  _openSharedLink() {
    const fromLink = sharedSource(location.hash);
    const source = fromLink ?? sharedText(location.search);
    if (source === null) return;
    history.replaceState(history.state, '', location.pathname + (fromLink === null ? '' : location.search));
    this.entry.recall(source);
    this.toast('Opened a shared value. Check it, then press Enter to put it on the stack.', { key: 'shared' });
  }

  _openShortcut() {
    const open = APP_SHORTCUTS.get(new URLSearchParams(location.search).get('open'));
    if (!open) return;
    history.replaceState(history.state, '', location.pathname);
    open(this);
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
      halted: calcState.halted && calcState.halted.kind !== 'wait' ? calcState.halted.kind : null,
      editing: this.pendingEdit ? this.pendingEdit.level ?? this.pendingEdit.name : null,
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
    this._announceTop();
  }

  _announceTop() {
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => {
      this.display.announce(this.stack.depth ? `Level 1: ${describeValue(this.stack.peek(1)).text}` : 'The stack is empty');
    }, 300);
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
    else if (this.menuKind === 'CST') this.showCustomMenu({ refresh: true });
    else this.menubar.render();
    this.display.renderStack(this.stack);
    const halted = calcState.halted;
    if (this._dialogHalt && this._dialogHalt !== halted) this._endDialog();
    if (halted?.dialog && this._dialogHalt !== halted) this._beginDialog(halted);
    if (halted?.kind === 'prompt' && this._promptHalt !== halted) {
      this._promptHalt = halted;
      if (this.inputMode !== 'rpl') this._closeWriter((mode) => `Put the ${mode} aside for the program's PROMPT`);
    }
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
    if (this.prefs.stackSize === 'normal') delete root.dataset.stackSize;
    else root.dataset.stackSize = this.prefs.stackSize;
    root.dataset.panelsSide = this.prefs.panelsSide;
    root.dataset.keypadSide = this.prefs.keypadSide;
    applyThemeColor();
  }

  setTheme(theme) {
    this.setPrefs({ theme });
    this._applyPrefs();
    this.renderAll();
    this.drawers.graph?.draw?.();
  }

  setStackSize(size) {
    this.setPrefs({ stackSize: size });
    this._applyPrefs();
    this.renderAll();
  }

  setMinimal(on) {
    this.setPrefs({ minimal: !!on });
    this._applyPrefs();
    this._applyPhoneKeyboard();
    this.renderAll();
    if (on) this.toast('Minimal view. The buttons at the top right open the menu or bring everything back.', { action: 'Leave', onAction: () => this.setMinimal(false), key: 'view', transient: true });
    else this.toasts.dismiss('view');
  }

  setTextbook(on) {
    this.entry.safeRun(() => lookup(on ? 'TEXTBOOK' : 'FLAT').fn(this.stack, this.entry));
  }

  setDockSide(part, side) {
    this.setPrefs(part === 'keypad' ? { keypadSide: side } : { panelsSide: side });
    this._applyPrefs();
  }

  setMinimalMenu(on) {
    this.setPrefs({ minimalMenu: !!on });
    this._applyPrefs();
  }

  setKeypadLayout(layout) {
    if (layout !== 'hidden') this._lastKeypad = layout;
    this.setPrefs({ keypad: layout });
    this.keypad.update();
    this._applyPhoneKeyboard();
    this.appbar.render();
    if (layout === 'hidden') this.toast('Keypad hidden', { action: 'Show', onAction: () => this.setKeypadLayout(this._lastKeypad ?? 'full'), key: 'view', transient: true });
    else this.toasts.dismiss('view');
  }

  // On a phone the calc keypad does the typing while it shows, so the editables ask for no system
  // keyboard; with it hidden they take the phone's usual one, as none offers letters and digits at once.
  phoneKeyboard() {
    if (!matchMedia('(pointer: coarse)').matches) return null;
    return this.prefs.keypad !== 'hidden' && !this.prefs.minimal ? 'none' : null;
  }

  _applyPhoneKeyboard() {
    const mode = this.phoneKeyboard();
    this.entry.setPhoneKeyboard(mode);
    this.matrixEditor?.setPhoneKeyboard(mode);
    this.equationEditor?.setPhoneKeyboard(mode);
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
    if (message) this._buzzError();
    this._errorShown = message;
    this.errorBanner = message ? describeError(message, {
      failure: this.entry.failure,
      stack: this.stack.snapshot().slice(0, 3),
      depth: this.stack.depth,
      line: this.entry.buffer || this.entry.errorLine,
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
    const lcd = lcdHtml(getLcd());
    if (this.errorBanner) { el.innerHTML = lcd + errorBannerHtml(this.errorBanner); return; }
    const halted = calcState.halted;
    if (halted) {
      const prompt = getPromptMessage();
      el.innerHTML = lcd + haltedBannerHtml({
        kind: halted.kind,
        dialog: halted.dialog,
        prompt: prompt == null ? '' : isString(prompt) ? prompt.value : format(prompt),
        programHtml: suspendedProgramHtml(halted, this.display.displayOpts),
      });
      return;
    }
    el.innerHTML = lcd;
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
    const kind = calcState.halted?.kind;
    if (act === 'ok' && kind === 'input') { this._acceptInput(); return; }
    if (act === 'cont' && kind === 'msgbox') { this._continueProgram(); return; }
    if (act === 'choose' && kind === 'choose') { this.showChooseList(); return; }
    if (act === 'form' && kind === 'inform') { this.showInformSheet(); return; }
    if (act === 'cancel' && (kind === 'choose' || kind === 'inform')) { this._continueProgram(Integer(0n)); return; }
    if (act === 'enter' && kind === 'wait') { this._answerKey(hpKeyCode('ENTER')); return; }
    if (act === 'kill' && kind === 'input') this.entry.cancel();
    const op = { cont: 'CONT', sst: 'SST', into: 'SST↓', kill: 'KILL' }[act];
    if (op) { this.entry.execOp(op); return; }
    if (act === 'fix') this._runFix(b.dataset.fix, b.dataset.arg);
  }

  _runFix(id, arg) {
    const desc = this.errorBanner;
    const message = this.entry.error;
    switch (id) {
      case 'drop': this.dismissError(); this.levelAction('drop', 1); return;
      case 'swap': this.dismissError(); this.swapTop(); return;
      case 'help': this.drawers.showReference(arg ?? desc?.command); return;
      case 'explain': this._explainError(message); return;
      case 'edit-line': if (!this.entry.buffer.trim() && this.entry.errorLine) this.entry.recall(this.entry.errorLine); else this.entry.focus(); return;
      case 'vars': this.drawers.open('vars'); return;
      case 'retry':
        this.dismissError();
        if (!this.entry.buffer.trim() && desc?.command && lookup(desc.command)) this.entry.execOp(desc.command);
        else this.commitEntry();
        return;
    }
  }

  _explainError(message) {
    const levels = this.stack.snapshot().slice(0, 4).map((v, i) => `level ${i + 1} is ${formatSource(v)}`).join(', ');
    const line = this.entry.buffer.trim();
    this.askAssistant(`I got this error on the calculator: "${message}".${line ? ` The command line held: ${line}.` : ''} ${levels ? `On the stack, ${levels}.` : 'The stack is empty.'} What went wrong, and how do I fix it?`);
  }

  toast(message, opts) { this.toasts.show(message, opts); }

  // A toast's Undo reverses its own step, never the text being typed, and
  // only while that step is still the latest one, so each replaces the last.
  undoToast(message) {
    const mark = this.stack.undoMark();
    this.toast(message, { key: 'undo', action: 'Undo', onAction: () => {
      if (this.stack.undoMark() === mark) this._undoStackStep();
      else this.notifyError('Something has changed since, so that Undo no longer applies. Use Undo to step back.');
    } });
  }

  canUndo() {
    return (this.inputMode === 'equation' && !!this.equationEditor?.canUndo())
      || (this.inputMode === 'matrix' && !!this.matrixEditor?.canUndo())
      || this.stack.hasUndo();
  }

  canRedo() {
    return (this.inputMode === 'equation' && !!this.equationEditor?.canRedo())
      || (this.inputMode === 'matrix' && !!this.matrixEditor?.canRedo())
      || this.stack.hasRedo();
  }

  _undoStackStep() {
    try { this.entry.performUndo(); this.dismissError(); } catch (e) { this.entry.flashError(e); }
  }

  _redoStackStep() {
    try { this.entry.performRedo(); this.dismissError(); } catch (e) { this.entry.flashError(e); }
  }

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
      snapshotState: () => ({ stack: this.stack.save(), calc: captureCalcState(), editor: this.entry.buffer }),
      restoreState: (snap) => {
        this.entry._snapForUndo();
        this.stack.restore(snap.stack);
        restoreCalcState(snap.calc);
        this.entry.recall(snap.editor ?? '');
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
      base: binaryBaseLabel(st.binaryBase) ?? 'DEC',
      casVar: st.casVx,
      dir: currentPath().join('/') || 'HOME',
      vars: varList().slice(0, 40),
      editor: this.entry.buffer,
      lastError: this.entry.error || '',
    };
  }

  isInstalledApp() {
    return !!(globalThis.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);
  }

  // Firefox on a computer can't install web apps, so it gets no Install button.
  offersInstall() {
    const desktopFirefox = /Firefox\//.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
    return window.isSecureContext && !this.installedHere && !this.isInstalledApp() && !desktopFirefox;
  }

  installApp() {
    const prompt = window.installPrompt;
    if (prompt) {
      window.installPrompt = null;
      prompt.prompt();
      return;
    }
    if (this.isInstalledApp()) { this.toast('rpl.ai is already running as an installed app.'); return; }
    if (!window.isSecureContext) {
      this.toast(`Browsers only install apps served over https or from localhost, and this page comes from http://${location.host}. Open it as http://localhost:${location.port || 80} on this machine, or serve it over https.`, { timeout: 12000 });
      return;
    }
    const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    this.toast(installHint(navigator.userAgent, iPadOS), { timeout: 12000 });
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
    requestAnimationFrame(() => this.chatBot.ask(t));
  }

  _installAutosave() {
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
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
  }

  _noteAutosave(result) {
    if (result === true) {
      this._autosaveFailed = false;
      return;
    }
    if (result === 'trimmed') {
      this._autosaveFailed = false;
      if (!this._autosaveTrimmed) {
        this._autosaveTrimmed = true;
        this.toast('Older backups were cleared so this session could be saved.');
      }
      return;
    }
    if (!this._autosaveFailed) {
      this._autosaveFailed = true;
      this.notifyError('Autosave failed because browser storage is full or blocked. Export a backup before you reload, or the latest changes will be lost.');
    }
  }

  exportSnapshot() {
    try { this.toast(`Saved ${exportToFile(this.stack)}`); }
    catch (e) { this.notifyError(`Export failed: ${e.message}`); }
  }

  async importSnapshotFromFile(file) {
    this.entry._snapForUndo();
    try {
      await importFromFile(file, this.stack);
      this.undoToast(`Restored from ${file.name}`);
      return true;
    } catch (e) {
      this.entry._dropNoOpUndoStep();
      this.notifyError(`Couldn't restore ${file.name}: ${e.message}`);
      return false;
    }
  }

  async putFileOnStack(file) {
    try {
      const { value, note } = await readUpload(file);
      if (isDirectory(value)) throw new Error('a directory belongs in the Variables drawer (Upload)');
      if (this.entry.buffer.trim()) this.commitEntry();
      this.entry._snapForUndo();
      this.stack.push(value);
      this.undoToast(`Put ${file.name} on the stack${note ? `. ${note}` : ''}`);
    } catch (e) {
      this.notifyError(`Couldn't read ${file.name}: ${e.message}`);
    }
  }

  _installFileDrop() {
    let depth = 0;
    const carriesFiles = (e) => e.dataTransfer?.types?.includes('Files');
    const end = () => { depth = 0; document.body.classList.remove('file-drag'); };
    document.addEventListener('dragenter', (e) => {
      if (!carriesFiles(e)) return;
      depth++;
      document.body.classList.add('file-drag');
    });
    document.addEventListener('dragleave', (e) => { if (carriesFiles(e) && --depth <= 0) end(); });
    document.addEventListener('dragover', (e) => { if (carriesFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', async (e) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      end();
      for (const file of [...e.dataTransfer.files]) await this.putFileOnStack(file);
    });
  }

  _wireDisplay() {
    const d = this.display;
    d.emptyHtml = `<div class="st-empty"><h5>The stack is empty</h5><p>Type a number and press Enter. Commands take their arguments from the stack and leave their results on it.</p><div class="keysline"><span class="kc">2</span> <span class="kc">Enter</span> <span class="kc">3</span> <span class="kc">+</span> → 5</div><div class="chipset" style="justify-content:center"><button type="button" class="chip" data-empty-act="equation">${icon('fx', 'sm')}Write an equation</button><button type="button" class="chip" data-empty-act="solve">Solve x² − 5x + 6 = 0</button><button type="button" class="chip" data-empty-act="plot">${icon('plot', 'sm')}Plot sin x</button><button type="button" class="chip" data-empty-act="tutor">${icon('cap', 'sm')}Walk me through a problem</button></div></div>`;
    // An example line runs on the command line; with a writer open, Enter would commit the writer instead.
    const runExample = (line) => {
      if (this.inputMode !== 'rpl') this.setInputMode('rpl');
      this.entry.recall(line);
      this.commitEntry();
    };
    d.onEmptyAction = (act) => {
      if (act === 'equation') this.setInputMode('equation');
      else if (act === 'solve') runExample('`X^2-5*X+6=0` `X` SOLVE');
      else if (act === 'plot') runExample('`SIN(X)` FUNCTION');
      else if (act === 'tutor') this.runAction('assistant.tutor');
    };
    d.rowActionsHtml = (level, value) => `<div class="st-acts" role="toolbar" aria-label="Level ${level} actions"><button type="button" data-row-act="edit" title="Edit (Enter)">${icon('edit', 'sm')}Edit</button><button type="button" data-row-act="view" title="View full size (VIEW)" aria-label="View">${icon('expand', 'sm')}</button><button type="button" data-row-act="pick" title="Copy it to level 1 (PICK)">Pick</button><button type="button" data-row-act="roll" title="Move it to level 1 (ROLL)">Roll</button>${isSymbolic(value) ? `<button type="button" data-row-act="plot" title="Plot it">${icon('plot', 'sm')}</button>` : ''}${isUnit(value) ? '<button type="button" data-row-act="convert" title="Convert to another unit (CONVERT)">Conv</button>' : ''}<button type="button" data-row-act="drop" title="Drop it (⌫)" aria-label="Drop">${icon('trash', 'sm')}</button><button type="button" data-row-act="more" title="More actions" aria-label="More actions">${icon('more', 'sm')}</button></div>`;
    d.onRowClick = (level) => this.selectLevel(this.selection === level ? null : level);
    d.onRowDoubleClick = (level) => this.editLevel(level);
    d.onRowHold = (level) => {
      this.buzzHold();
      this.selectLevel(level);
      this.levelAction('more', level, this.display.stackView.querySelector('.st-row.sel [data-row-act="more"]'));
    };
    d.onRowAction = (level, act, el) => this.levelAction(act, level, el);
    d.onRowMove = (from, to) => this._moveLevel(from, to);
    d.onRowSwipe = (level) => {
      this.levelAction('drop', level);
      this.undoToast(`Dropped level ${level}`);
    };
    d.onStatusAction = (kind, data, el) => {
      if (kind === 'mode') this.appbar.openModeMenu(data.mode, el);
      else if (kind === 'path') this.navigateToPathSegment(Number(data.index));
      else if (kind === 'fullscreen') this.runAction('view.fullscreen');
      else if (kind === 'leave-minimal') this.setMinimal(false);
      else if (kind === 'menu') this.appbar.openAppMenu(el, { drawers: true });
      else if (kind === 'cancel-edit') this.cancelEdit();
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
    const runOn = (op) => {
      this.clearSelection();
      this.entry._snapForUndo();
      this.entry.safeRun(() => { moveLevel(this.stack, level, 1); this.stack.runOp(() => lookup(op).fn(this.stack, this.entry)); }, op);
    };
    const runOnLevels = (op) => {
      this.clearSelection();
      this.entry._snapForUndo();
      this.entry.safeRun(() => { this.stack.push(Integer(level)); this.stack.runOp(() => lookup(op).fn(this.stack, this.entry)); }, op);
    };
    switch (act) {
      case 'edit': this.editLevel(level); return;
      case 'view': this._viewLevel(level); return;
      case 'echo': this.clearSelection(); this.entry.typeToken(formatSource(value)); return;
      case 'pick': run(() => this.stack.push(value)); this.selectLevel(level + 1); return;
      case 'roll': run(() => moveLevel(this.stack, level, 1)); this.selectLevel(1); return;
      case 'rolld': run(() => moveLevel(this.stack, 1, level)); this.selectLevel(level); return;
      case 'drop': run(() => dropLevel(this.stack, level)); if (!this.stack.depth) this.clearSelection(); return;
      case 'tolist': runOnLevels('→LIST'); return;
      case 'dupn': runOnLevels('DUPN'); return;
      case 'dropn': runOnLevels('DROPN'); return;
      case 'keep': run(() => keepLevels(this.stack, level)); this.clearSelection(); return;
      case 'level': run(() => this.stack.push(Integer(level))); this.selectLevel(level + 1); return;
      case 'eval': runOn('EVAL'); return;
      case 'debug': runOn('DBUG'); return;
      case 'num': runOn('→NUM'); return;
      case 'convert': this._convertMenu(level, anchor); return;
      case 'plot': this.clearSelection(); this.plotExpression(value.expr); return;
      case 'copy': {
        const table = spreadsheetHtml(value);
        this.copyText(formatSource(value), table ? `Copied level ${level}. It pastes into a spreadsheet as cells.` : `Copied level ${level}`, table);
        return;
      }
      case 'latex': {
        const latex = toLatex(value);
        if (latex === null) this.notifyError(`Level ${level} has no LaTeX form.`);
        else this.copyText(latex, `Copied level ${level} as LaTeX`);
        return;
      }
      case 'share': {
        const text = formatSource(value);
        this.shareText(text, shareLink(text, location.href));
        return;
      }
      case 'sharen': {
        const text = Array.from({ length: level }, (_, i) => formatSource(this.stack.peek(level - i))).join('\n');
        this.shareText(text, shareLink(text, location.href));
        return;
      }
      case 'download': this.downloadMenu(anchor, `level${level}`, value); return;
      case 'store': this._storePrompt(level, anchor); return;
      case 'ask': this.askAssistant(`Explain what is on level ${level} of my stack: ${formatSource(value)}`); return;
      case 'more': this._levelMenu(level, anchor); return;
    }
  }

  // The HP interactive stack's VIEW: the value at a readable size, scrolling both ways, where the stack would shrink or cut it.
  _viewLevel(level) {
    const cell = document.createElement('div');
    cell.className = 'st-val';
    this.display._fillValue(cell, this.stack.peek(level), 30);
    this.sheets.openView(`Level ${level}`, cell.outerHTML, level);
  }

  _levelMenu(level, anchor) {
    const value = this.stack.peek(level);
    const item = (act, ico, label, hint = '') => `<button type="button" class="opt" data-act="${act}"><span class="ck">${icon(ico, 'sm')}</span><b>${escapeHtml(label)}</b><em>${escapeHtml(hint)}</em></button>`;
    const groups = [
      [item('edit', 'edit', 'Edit', shortcutText('level.edit')), item('view', 'expand', 'View full size (VIEW)')],
      [
        item('echo', 'chr', 'Copy into the command line'),
        item('pick', 'copy', 'Copy to level 1 (PICK)', shortcutText('level.pick')),
        item('roll', 'up', 'Move to level 1 (ROLL)'),
        item('rolld', 'down', 'Move level 1 here (ROLLD)'),
      ],
      [
        item('tolist', 'chr', `Make a list of levels 1–${level} (→LIST)`),
        item('dupn', 'copy', `Copy levels 1–${level} (DUPN)`),
        item('dropn', 'trash', `Drop levels 1–${level} (DRPN)`),
        item('keep', 'check', `Keep levels 1–${level} only (KEEP)`),
        item('level', 'enter', `Push the level number, ${level} (LEVEL)`),
      ],
      [
        item('eval', 'play', 'Evaluate (EVAL)'),
        isProgram(value) ? item('debug', 'step', 'Debug step by step (DBUG)') : '',
        item('num', 'chr', 'To a number (→NUM)'),
        isUnit(value) ? item('convert', 'chr', 'Convert to…') : '',
        isSymbolic(value) ? item('plot', 'plot', 'Plot it') : '',
        item('ask', 'spark', 'Ask the assistant about it'),
      ],
      [
        item('store', 'folder', 'Store in a variable…'),
        item('copy', 'copy', 'Copy', shortcutText('level.copy')),
        toLatex(value) === null ? '' : item('latex', 'copy', 'Copy as LaTeX'),
        typeof navigator.share === 'function' ? item('share', 'share', 'Share…') : '',
        typeof navigator.share === 'function' && level > 1 ? item('sharen', 'share', `Share levels 1–${level}…`) : '',
        item('download', 'down', 'Download as…'),
      ],
      [item('drop', 'trash', 'Drop', shortcutText('level.drop'))],
    ];
    const html = `<h6>Level ${level}</h6>${groups.map((group) => group.join('')).join('<hr>')}`;
    this.popover.open(anchor, html, {
      label: `Level ${level}`,
      onClick: (t) => { this.popover.close({ restoreFocus: false }); this.levelAction(t.dataset.act, level, anchor); },
    });
  }

  // The HP's CONVERT with its target typed for you: the level in each unit of its dimensions, so a tap says 1_in CONVERT.
  _convertMenu(level, anchor) {
    const value = this.stack.peek(level);
    const targets = unitConversions(value.uexpr);
    if (!targets.length) { this.toast(`No other unit in the UNITS menu matches level ${level}`); return; }
    const rows = targets.map((uexpr, i) => `<button type="button" class="opt" data-v="${i}"><span class="ck">${icon('chr', 'sm')}</span><b>${escapeHtml(format(Unit(convertValue(value.value, value.uexpr, uexpr), uexpr), this.display.displayOpts))}</b></button>`);
    this.popover.open(anchor ?? this.display.stackView.querySelector('.st-row.sel'), `<h6>Convert level ${level} to</h6>${rows.join('')}`, {
      label: `Convert level ${level}`,
      onClick: (t) => {
        this.popover.close({ restoreFocus: false });
        this.clearSelection();
        this.entry._snapForUndo();
        this.entry.safeRun(() => { moveLevel(this.stack, level, 1); this.stack.push(Unit(1, targets[+t.dataset.v])); this.stack.runOp(() => lookup('CONVERT').fn(this.stack, this.entry)); }, 'CONVERT');
      },
    });
  }

  downloadMenu(anchor, name, value) {
    const items = downloadFormats(value).map(([format, label]) => `<button type="button" class="opt" data-v="${format}"><span class="ck">${icon('down', 'sm')}</span><b>${escapeHtml(label)}</b></button>`).join('');
    this.popover.open(anchor, `<h6>Download ${escapeHtml(name)}</h6>${items}`, {
      label: `Download ${name}`,
      onClick: (target) => {
        this.popover.close({ restoreFocus: false });
        try { this.toast(`Saved ${downloadValue(name, value, target.dataset.v)}`); }
        catch (e) { this.notifyError(`Download failed: ${e.message}`); }
      },
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
        this.undoToast(`Stored in ${name}`);
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

  // With html, spreadsheets paste a table as cells while text editors get the text.
  async copyText(text, message, html = '') {
    try {
      if (html && typeof ClipboardItem === 'function' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      this.toast(message);
    } catch {
      this.notifyError('The clipboard is not available here.');
    }
  }

  async shareText(text, url = null) {
    try { await navigator.share(url ? { text, url } : { text }); }
    catch (e) { if (e.name !== 'AbortError') this.notifyError(`Couldn't share: ${e.message}`); }
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
    const { value } = edit;
    const mode = isSymbolic(value) || (isName(value) && edit.kind === 'level') ? 'equation'
      : isMatrix(value) || isVector(value) ? 'matrix' : 'rpl';
    const writer = { equation: this.equationEditor, matrix: this.matrixEditor }[mode];
    const replaced = writer && !writer.isEmpty() ? { saved: writer.snapshot(), edit: this.pendingEdit } : null;
    this.pendingEdit = edit;
    if (mode === 'rpl') {
      this.setInputMode('rpl');
      this.entry.recall(isProgram(value) ? formatProgramLines(value) : formatSource(value));
    } else {
      this.setInputMode(mode, { value });
    }
    this.renderStatus();
    this.input.render();
    if (replaced) {
      this.toast(`Replaced the ${mode}`, { action: 'Undo', onAction: () => this._reopenWriter(mode, replaced.saved, replaced.edit) });
    }
  }

  _reopenWriter(mode, saved, edit) {
    this.pendingEdit = edit;
    this.setInputMode(mode);
    this._writer().restore(saved);
    this.input.render();
    this.renderStatus();
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
    if (edit?.kind === 'var') this.undoToast(`Stored ${edit.name}`);
  }

  _writer() {
    return { equation: this.equationEditor, matrix: this.matrixEditor }[this.inputMode] ?? null;
  }

  focusInput() {
    if (this.inputMode === 'rpl') this.entry.focus();
    else this._writer().focus();
  }

  // A line handed to the command line, from History say, goes where INPUT's text does: a writer steps aside, Undo at hand.
  recallLine(text, why) {
    if (this.inputMode !== 'rpl') this._closeWriter((mode) => `Put the ${mode} aside for ${why}`);
    this.entry.recall(text);
  }

  cancelWriter() {
    if (this._writer().collapseSelection?.()) return;
    this._closeWriter((mode) => `Discarded the ${mode}`);
  }

  // The writer's content stays a tap of Undo away, as does the edit it was for.
  _closeWriter(message) {
    const mode = this.inputMode;
    const writer = this._writer();
    const edit = this.pendingEdit;
    const saved = writer.snapshot();
    const hadContent = !writer.isEmpty();
    writer.clear();
    if (edit) this._endEdit();
    this.setInputMode('rpl');
    const reopen = () => this._reopenWriter(mode, saved, edit);
    if (edit) this._toastEditCancelled(edit, reopen);
    else if (hadContent) this.toast(message(mode), { action: 'Undo', onAction: reopen });
  }

  _toastEditCancelled(edit, reopen) {
    this.toast(`Edit cancelled. ${edit.kind === 'var' ? edit.name : 'The level'} is unchanged.`, { action: 'Undo', onAction: reopen });
  }

  pushFromWriter(value, message) {
    this.entry._snapForUndo();
    this.stack.push(value);
    this.undoToast(message);
  }

  plotExpression(ast) {
    const scratch = new Stack();
    scratch.push(Symbolic(ast));
    this.drawers.openGraph('function', scratch);
  }

  commitEntryAndPush(values) {
    if (this.entry.buffer.trim()) this.entry.enter();
    this.entry._snapForUndo();
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
      this.undoToast(`Stored ${edit.name}`);
    }
    this._endEdit();
  }

  cancelEdit() {
    const edit = this.pendingEdit;
    const text = this.entry.buffer;
    this.entry.cancel();
    this._endEdit();
    this._toastEditCancelled(edit, () => {
      this.pendingEdit = edit;
      this.entry.recall(text);
      this.renderStatus();
      this.input.render();
    });
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
    if (this.pendingEdit) { this._commitEdit(); return; }
    if (this._enterAnswersDialog()) return;
    if (calcState.halted?.kind === 'input') { this._acceptInput(); return; }
    if (this._answerKey(hpKeyCode('ENTER'))) return;
    this.entry.enter();
    if (this.entry.error) this.entry.focus();
  }

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
  }

  // A timed WAIT goes on by itself; -1 WAIT shows the soft keys, the HP's menu, in minimal view.
  _beginWait(halted) {
    const { seconds, menu } = halted.dialog;
    if (menu && this.prefs.minimal) this.setMinimalMenu(true);
    if (seconds) this._waitTimer = setTimeout(() => { if (calcState.halted === halted) this._continueProgram(); }, seconds * 1000);
  }

  // A CHOOSE's list goes with its dialog: the banner's keys sit on the popover's anchor, where a press leaves it open.
  _endDialog() {
    if (this._dialogAlpha) { this._dialogAlpha = false; if (this.shift === 'alphaLock') this.setShift(null); }
    if (this._dialogHalt.kind === 'choose') this.popover.close({ restoreFocus: false });
    if (this._dialogHalt.kind === 'inform' && this.sheets.kind === 'inform') this.sheets.close();
    clearTimeout(this._waitTimer);
    this._dialogHalt = null;
  }

  // CHOOSE's choices in a popover above the banner, clear of its keys and the command line: a tap answers with the
  // choice and 1, as the HP's OK does, or with 0 when no choice is highlighted and the list is for looking at.
  showChooseList() {
    const { items, pos } = calcState.halted.dialog;
    const rows = items.map((item, i) => ({ text: chooseEntry(item).label, mark: i + 1 === pos ? icon('check', 'sm') : '', run: () => this._answerChoice(i + 1) }));
    this._heldKeyMenu(rows, $('banner').querySelector('.bn'), pos ? 'Choose' : 'View', { above: true });
  }

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
  }

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
  }

  cancelInform() { this._continueProgram(Integer(0n)); }

  // Enter or OK hands the command line to the program waiting at INPUT, as a string; with V it has to parse first.
  _acceptInput() {
    const { dialog } = calcState.halted;
    const text = this.entry.buffer;
    if (dialog.verify) { try { parseEntry(text); } catch (e) { this.entry.flashError(e); return; } }
    this.entry.cancel();
    this._continueProgram(Str(text));
  }

  // Enter on an empty line is the OK of a message or choose box, as the HP's ENTER is: a CHOOSE answers with its
  // highlighted choice, or 0 when none is highlighted, and a MSGBOX goes on. A typed line still runs.
  _enterAnswersDialog() {
    const kind = calcState.halted?.kind;
    if (this.entry.buffer.trim() || !(kind === 'choose' || kind === 'msgbox')) return false;
    if (kind === 'msgbox') this._continueProgram();
    else this._answerChoice(calcState.halted.dialog.pos);
    return true;
  }

  // The nth choice answers with its result and 1; with no choice highlighted the list is for looking at and gives 0.
  _answerChoice(n) {
    const { items, pos } = calcState.halted.dialog;
    if (!pos) { this._continueProgram(Integer(0n)); return; }
    this._continueProgram(chooseEntry(items[n - 1]).value, Integer(1n));
  }

  // A key pressed while a program waits at 0 WAIT answers it with the key's code, as the HP's keyboard would.
  _answerKey(code) {
    const halted = calcState.halted;
    if (halted?.kind !== 'wait' || !halted.dialog.key || code == null) return false;
    if (this.shift && !this.shiftLocked()) this.setShift(null);
    this._continueProgram(Real(code));
    return true;
  }

  // A dialog's answer belongs to the program's run, so it adds no undo step: UNDO afterwards takes the whole run
  // back, as the HP's LAST STACK does. A dialog reached while stepping steps on, as the HP's SST would. The end of
  // a WAIT is no key press for the display: its message stays.
  _continueProgram(...answers) {
    const op = { over: 'SST', into: 'SST↓' }[calcState.halted.stepping] ?? 'CONT';
    if (calcState.halted.kind !== 'wait') touchLcd();
    this.entry.safeRun(() => { for (const a of answers) this.stack.push(a); lookup(op).fn(this.stack, this.entry); }, op, { keepPartial: true });
  }

  backspace() {
    if (this.selection != null) this.levelAction('drop');
    else this.entry.backspace();
  }

  swapTop() {
    this.entry._snapForUndo();
    this.entry.safeRun(() => lookup('SWAP').fn(this.stack, this.entry), 'SWAP');
  }

  // A soft key runs at once like the HP's keys; the catalog and the search type while the line has text.
  runCommandFromUI(name, { asKey = false } = {}) {
    if (this.inputMode === 'equation') { this.equationEditor.pressCommand(name); return; }
    if (this.selection != null) this.clearSelection();
    if (!lookup(name)) { this.entry.flashError({ message: `${name} isn't available in rpl.ai` }); return; }
    if (asKey) this.entry.pressFunction(name);
    else this.entry.typeOrExecFn(name);
  }

  // As on the HP 50g, a unit key multiplies level 1 by the unit, a left-shifted
  // one converts level 1 to it and a right-shifted one divides by it. In a program
  // it types that, unless it can attach to the number being typed. Returns what it typed.
  insertUnit(unit, mode = 'times') {
    if (this.inputMode === 'equation') { this.equationEditor.typeUnit(unit, mode); return; }
    const e = this.entry;
    const typed = e.buffer.trim();
    const before = e.buffer.slice(0, e.cursor);
    const word = before.match(/[^\s«{]*$/)[0];
    const number = /^[-+]?\.?\d/.test(word);
    if (inProgramEntry(before.slice(0, before.length - word.length)) && (number ? mode === 'convert' : inProgramEntry(before))) {
      const text = `1_${unit} ${{ times: '*', divide: '/', convert: 'CONVERT' }[mode]}`;
      e.typeToken(`${text} `);
      return text;
    }
    if (mode !== 'convert' && typed) {
      const withUnit = word.includes('_');
      const text = mode === 'divide' ? (withUnit ? `/${unit}` : `_1/${unit}`) : (withUnit ? `*${unit}` : `_${unit}`);
      e.type(text);
      return text;
    }
    if (typed) {
      this.commitEntry();
      if (e.buffer.trim()) return;
    }
    const top = this.stack.depth ? this.stack.peek(1) : null;
    const scalable = top && (isReal(top) || isInteger(top) || isRational(top) || isUnit(top));
    const line = { times: scalable ? `1_${unit} *` : `1_${unit}`, divide: scalable ? `1_${unit} /` : `1_1/${unit}`, convert: `1_${unit} CONVERT` };
    e.recall(line[mode]);
    this.commitEntry();
  }

  navigateToPathSegment(index) {
    const path = currentPath();
    if (index < 0 || index >= path.length) return;
    const stepsUp = path.length - 1 - index;
    if (stepsUp <= 0) return;
    if (this.entry.buffer.trim()) this.commitEntry();
    if (index === 0) { goHome(); return; }
    for (let i = 0; i < stepsUp; i++) goUp();
  }

  _takeWriterText() {
    const writer = this._writer();
    if (!writer) return '';
    if (writer.isEmpty()) {
      writer.clear();
      return '';
    }
    try {
      const text = formatSource(writer.value());
      writer.clear();
      return text;
    } catch {
      this.toast(this.inputMode === 'equation'
        ? 'The equation has an empty box, so it stays in the equation writer.'
        : "The matrix isn't complete, so it stays in the matrix writer.");
      return '';
    }
  }

  setInputMode(mode, { value = null, carry = false } = {}) {
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
      const text = carry ? this._takeWriterText() : '';
      this.inputMode = 'rpl';
      this._eqwSlots = null;
      this.input.show('rpl');
      if (text) this.entry.typeToken(text);
      this.entry.focus();
    }
    this._ctxPage = 0;
    this._menuPinned = false;
    this.menubar.render();
    this.keypad.update();
    this.appbar.updateHistory();
    this.renderStatus();
  }

  openEquationEditor() { this.runAction('writer.equation'); }

  // The menu a writer puts up, or null; choosing another menu pins it in its place until the writer closes.
  writerMenuId() {
    if (this.inputMode === 'equation' && this.equationEditor) return 'EQW';
    if (this.inputMode === 'matrix' && this.matrixEditor) return 'MTRW';
    return null;
  }

  showMenu(id, { remember = true, commit = true } = {}) {
    if (this.selection != null) this.clearSelection();
    if (id === 'EQW' || id === 'MTRW') { this._menuPinned = false; this._ctxPage = 0; this.menubar.render(); return; }
    this._menuPinned = !!this.writerMenuId();
    if (id === 'VARS') this.showVarsMenu();
    else if (id === 'CST') this.showCustomMenu({ commit });
    else if (id === 'MODES') this.showModesMenu();
    else if (id === 'BRCH') this.showBranchMenu();
    else this._showFamilyMenu(id);
    if (remember) this.setPrefs({ menu: this.menuKind, recentMenus: [this.menuKind, ...this.prefs.recentMenus.filter((m) => m !== this.menuKind)] });
  }

  // The menu shown before this one, one hold away on a phone, where the picker's Recent group is two taps.
  showPreviousMenu({ commit = true } = {}) {
    const prev = this.prefs.recentMenus.find((id) => id !== this.menuKind);
    if (prev) this.showMenu(prev, { commit });
    else this.toast('No menu before this one');
  }

  setMenu(slots, kind = null, { preservePage = false } = {}) {
    if (kind === 'EQW') { this._eqwSlots = slots; this._ctxPage = 0; this.menubar.render(); return; }
    this.menuKind = kind;
    this.menuAll = Array.isArray(slots) ? slots.slice() : [];
    if (!preservePage) this.menuPage = 0;
    this.menubar.render();
  }

  menuView() {
    let ctx = null;
    if (this.selection != null && this.stack.depth) ctx = { key: `LVL${this.selection}`, title: `LEVEL ${this.selection}`, short: `LVL ${this.selection}`, items: this._levelSlots() };
    else if (this._menuPinned && this.writerMenuId()) ctx = null;
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
    return { title: meta.short === 'VARS' ? `VARS · ${currentPath().at(-1)}` : meta.short, short: meta.short, items: this.menuAll, slots: view, page, pages: Math.max(1, Math.ceil(this.menuAll.length / 6)) };
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
    if (this._answerKey(hpKeyCode(`F${i + 1}`, forcedLayer ?? this.layer()))) return;
    this._pressSlot(this.menuView().slots[i], forcedLayer);
  }

  // A key picked from the whole-menu grid, by its place in the menu; the soft keys turn to its page first.
  pressMenuSlot(index) {
    const slot = this.menuView().items[index];
    const page = Math.floor(index / 6);
    if (this._inContextMenu()) this._ctxPage = page;
    else this.menuPage = page;
    this.menubar.render();
    this._pressSlot(slot);
  }

  _pressSlot(slot, forcedLayer = null) {
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
      { label: 'VIEW', title: 'Show it full size', onPress: act('view') },
      { label: '→LIST', title: `Make a list of levels 1–${level}`, onPress: act('tolist') },
      { label: 'DUPN', title: `Copy levels 1–${level}`, onPress: act('dupn') },
      { label: 'DRPN', title: `Drop levels 1–${level}`, onPress: act('dropn') },
      { label: 'KEEP', title: `Keep levels 1–${level} only`, onPress: act('keep') },
      { label: 'LEVEL', title: `Push the level number, ${level}`, onPress: act('level') },
      isSymbolic(value)
        ? { label: 'PLOT', title: 'Plot it', onPress: act('plot') }
        : { label: 'EVAL', title: 'Evaluate it', onPress: act('eval') },
      { label: '→NUM', title: 'Evaluate to a number', onPress: act('num') },
      ...(isUnit(value) ? [{ label: 'CONV', title: 'Convert it to another unit (CONVERT)', onPress: act('convert') }] : []),
      { label: 'STO…', title: 'Store it in a variable', onPress: act('store') },
      { label: 'COPY', title: 'Copy to the clipboard · ↰ copies it as LaTeX', onPress: act('copy'), onPressL: act('latex') },
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
      title: `${this.commandTitle(name)} · ↰ types it · ↱ opens the reference`,
      blockedReason: () => this._tooFewArgumentsReason(name),
      onPress: () => this.runCommandFromUI(name, { asKey: true }),
      onPressL: () => this.entry.typeToken(`${name} `),
      onPressR: () => this.drawers.showReference(name),
    }));
    const groups = family.id === 'UNITS'
      ? UNIT_GROUPS.map((group) => ({ label: group.id, dir: true, title: `${group.title}: ${group.units.length} units`, onPress: () => this._showUnitMenu(group) }))
      : [];
    this.setMenu([...groups, ...slots], family.id);
  }

  _showUnitMenu(group) {
    const back = { label: '◀ BACK', title: 'Back to the Units menu', onPress: () => this._showFamilyMenu('UNITS') };
    const keys = group.units.map((unit) => ({
      label: unit,
      title: `Attach _${unit} to the number you are typing, or multiply level 1 by it · ↰ converts level 1 to ${unit} · ↱ divides by ${unit}`,
      onPress: () => this.insertUnit(unit),
      onPressL: () => this.insertUnit(unit, 'convert'),
      onPressR: () => this.insertUnit(unit, 'divide'),
      onHold: (anchor) => this._heldKeyMenu([{ text: `Convert level 1 to ${unit}`, run: () => this.insertUnit(unit, 'convert') }, { text: `Divide by ${unit}`, run: () => this.insertUnit(unit, 'divide') }], anchor, 'Unit'),
    }));
    this.setMenu([back, ...keys], 'UNITS');
  }

  commandTitle(name) {
    const info = this.commandInfo(name);
    return info ? `${name}: ${shortDescription(info.entry, 100)}` : name;
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
    const slots = MODES.flatMap((m) => m.options.map((o) => ({
      label: m.id === 'base' ? binaryBaseLabel(o.value) : m.id === 'fmt' || m.id === 'coord' ? o.value.slice(0, 5) : o.value,
      title: `${m.title}: ${o.label}. ${o.detail}`,
      toggle: true,
      on: () => m.current() === o.value,
      onPress: () => {
        if (this.entry._typingAtCursor()) this.entry.typeToken(`${modeCommand(m, o)} `);
        else m.set(o.value);
      },
    })));
    slots.splice(12, 0, {
      label: 'TXTBK',
      title: 'Pretty math: show expressions, matrices and lists in textbook form',
      toggle: true,
      on: () => calcState.textbookMode,
      onPress: () => this.setTextbook(!calcState.textbookMode),
    });
    this.setMenu(slots, 'MODES', opts);
  }

  showBranchMenu() {
    const type = (words) => () => this.entry.typeStructure(words);
    const also = (words, shift) => (words ? `; ${shift} types ${words.join(' … ')}` : '');
    const slots = BRANCH_KEYS.map(([word, left, right]) => ({
      label: word,
      title: `Type ${word}${also(left, '⇦')}${also(right, '⇨')}`,
      onPress: type([word]),
      onPressL: left && type(left),
      onPressR: right && type(right),
      onHold: left && ((anchor) => this._heldKeyMenu([left, right].filter(Boolean).map((words) => ({ text: words.join(' … '), run: type(words) })), anchor, 'Structures')),
    }));
    this.setMenu(slots, 'BRCH');
  }

  // A phone with the keypad hidden has no shift, so a finger held on a key offers what ⇦ and ⇨ would do with it.
  _heldKeyMenu(options, anchor, label, { above = false } = {}) {
    const html = options.map((o, i) => `<button type="button" class="opt" data-v="${i}"><span class="ck">${o.mark ?? (i ? '⇨' : '⇦')}</span><b>${escapeHtml(o.text)}</b></button>`).join('');
    this.popover.open(anchor, html, {
      label,
      keepFocus: true,
      above,
      onClick: (target) => {
        this.popover.close({ restoreFocus: false });
        options[Number(target.dataset.v)].run();
      },
    });
  }

  // The HP's CMD: the last four lines entered, newest first; one goes back on an empty line or into the line typed.
  showLastLines(anchor) {
    const lines = [...new Set(this.entry.getHistory().reverse())].slice(0, 4);
    if (!lines.length) return;
    this._heldKeyMenu(lines.map((line) => ({ text: line, mark: '', run: () => (this.entry.buffer ? this.entry.typeToken(line) : this.entry.recall(line)) })), anchor, 'Last lines');
  }

  pressVariable(name, layer = null) {
    if (this.entry.typeVariable(name, layer)) return;
    if (this.entry.buffer.trim().length > 0) {
      this.commitEntry();
      if (this.entry.error) return;
    }
    const v = varRecall(name);
    if (v === undefined) { this.entry.flashError({ message: `Undefined name: ${name}` }); return; }
    if (layer === 'L') {
      if (this.stack.depth < 1) { this.entry.flashError({ message: `STO ${name} needs a value on level 1; the stack is empty.` }); return; }
      const stored = this.entry.safeRun(() => { this.entry._snapForUndo(); varStore(name, this.stack.pop()); }, 'STO');
      if (stored) this.undoToast(`Stored level 1 in ${name}`);
      return;
    }
    if (layer === 'R') { this._pushValue(v); return; }
    if (isDirectory(v)) {
      if (!goInto(name)) this.entry.flashError({ message: `Cannot open ${name}` });
      return;
    }
    this._pushValue(v, isProgram(v) ? name : null);
  }

  _pushValue(value, runAs = null) {
    this.entry._snapForUndo();
    if (runAs) this.entry.safeRun(() => { this.stack.push(value); lookup('EVAL').fn(this.stack, this.entry); }, runAs);
    else this.stack.push(value);
  }

  showVarsMenu(opts = {}) {
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
        onHold: dir ? null : (anchor) => this._heldKeyMenu([{ text: `Store level 1 in ${id}`, run: () => this.pressVariable(id, 'L') }, { text: `Recall ${id}`, run: () => this.pressVariable(id, 'R') }], anchor, 'Variable'),
      };
    });
    this.setMenu(slots, 'VARS', opts);
  }

  // MENU runs with the line still in hand, so it shows the menu without committing it again; a refresh follows
  // CST as it changes (STO, PURGE, UNDO) while the menu shows, keeping the page and saying nothing.
  showCustomMenu({ commit = true, refresh = false } = {}) {
    if (commit && !refresh && this.entry.buffer.trim().length > 0 && !this.entry._typingAtCursor()) this.commitEntry();
    const cst = varRecall('CST');
    const list = isName(cst) ? varRecall(cst.id) : cst;
    if (!isList(list)) {
      this.setMenu([], 'CST', { preservePage: refresh });
      if (!refresh) this.toast(cst === undefined
        ? 'CST is empty. Store a list of commands or names in CST, for example { SOLVE FACTOR } `CST` STO.'
        : 'CST must hold a list, for example { SOLVE FACTOR }.');
      return;
    }
    this.setMenu(this._customMenuSlots(list), 'CST', { preservePage: refresh });
  }

  _customMenuSlots(list) {
    return list.items.map((item) => {
      const { label, main, left, right } = customMenuEntry(item);
      const shifted = !!(left || right);
      const press = (target) => () => {
        if (!target || this._typeCustomItem(target)) return;
        if (customCommand(target)) { this.runCommandFromUI(target.id, { asKey: true }); return; }
        if (this.entry.buffer.trim().length > 0) this.commitEntry();
        this._pushValue(target, isProgram(target) || isName(target) ? label : null);
      };
      const hint = (mark, target) => (target ? ` · ${mark} ${customMenuLabel(target)}` : '');
      return {
        label,
        title: shifted ? `${label}${hint('↰', left)}${hint('↱', right)}` : `${label} · ↰ types it · ↱ recalls it`,
        onPress: press(main),
        onPressL: shifted ? press(left) : () => { if (!this._typeCustomItem(main)) this.entry.typeToken(`${customMenuSource(main)} `); },
        onPressR: shifted ? press(right) : () => {
          if (this._typeCustomItem(main, 'R')) return;
          if (this.entry.buffer.trim().length > 0) this.commitEntry();
          this._pushValue(main);
        },
        onHold: shifted ? (anchor) => this._heldKeyMenu([[left, '⇦'], [right, '⇨']].filter(([t]) => t).map(([t, mark]) => ({ text: customMenuLabel(t), mark, run: press(t) })), anchor, label) : null,
      };
    });
  }

  // Inside an open object a CST key types its item, as the HP's keys do; false when it should run.
  _typeCustomItem(target, layer = null) {
    if (!this.entry._typingAtCursor()) return false;
    if (customCommand(target)) this.entry.pressFunction(target.id);
    else this.entry.typeVariable(customMenuSource(target), isName(target) ? layer : null);
    return true;
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
    if (this.inputMode !== 'rpl') {
      const enter = this.inputMode === 'matrix' && this.matrixEditor.typedCellFocused() ? 'NEXT'
        : this.pendingEdit ? (this.pendingEdit.kind === 'var' ? 'STORE' : 'REPLACE') : 'PUSH';
      return { ENTER: enter, ON: 'CANCEL' }[key.primary] ?? '';
    }
    const depth = this.stack.depth;
    if (this.entry.buffer.length) return key.primary === 'ON' ? 'CANCEL' : '';
    if (key.primary === 'ENTER' && depth) return 'DUP';
    if (key.primary === '▲' && depth) return 'SELECT';
    if (key.primary === '▼' && depth) return 'EDIT';
    if (key.primary === '▶' && depth > 1) return 'SWAP';
    if (key.primary === '+/-' && depth && (isReal(this.stack.peek(1)) || isInteger(this.stack.peek(1)))) return 'NEG';
    return '';
  }

  showKeyLayers(key, anchor) {
    this.buzzHold();
    if (MODIFIER_KINDS.has(key.kind)) return;
    const row = (layer, label, name, desc, color) => `<button type="button" data-v="${layer}" ${label ? '' : 'disabled'}><small style="color:${color}">${name}</small><span><b>${escapeHtml(label || '—')}</b>${desc ? ` · ${escapeHtml(desc)}` : ''}</span></button>`;
    const html = `<h6>${escapeHtml(key.primary)} key</h6><div class="layers">${row('P', key.primary, 'KEY', '', 'var(--ink3)')}${row('L', key.shiftL, '↰ LEFT', '', 'var(--amber)')}${row('R', key.shiftR, '↱ RIGHT', '', 'var(--coral)')}${row('A', key.alpha, 'α ALPHA', 'types the letter', 'var(--blue)')}</div>`;
    this.popover.open(anchor, html, {
      label: `${key.primary} key layers`,
      onClick: (t) => {
        this.popover.close({ restoreFocus: false });
        this.shift = { L: 'shiftL', R: 'shiftR', A: 'alpha' }[t.dataset.v] ?? null;
        this.handleKey(key);
        this.setShift(null);
      },
    });
  }

  handleKey(key) {
    // A shift key with a letter on it (the compact keypad's) types the letter under α.
    if (MODIFIER_KINDS.has(key.kind) && !(key.alpha && this.layer() === 'A')) { this.setShift(key.kind); return; }
    if (this._answerKey(hpKeyCode(key.primary, this.layer()))) return;

    if (this.selection != null && !this.shift) {
      const sel = { '▲': 'level.up', '▼': 'level.down', ENTER: 'level.edit', '⌫': 'level.drop', ON: 'ui.escape' }[key.primary];
      if (sel) { this.runAction(sel); return; }
      this.clearSelection();
    }

    if (this.inputMode !== 'rpl') {
      if (key.primary === 'ON' && !this.shift) { this.runAction('ui.escape'); return; }
      if (this.inputMode === 'equation') this.equationEditor.pressKeypad(key, this.shift);
      else this.matrixEditor.pressFace(keypadFace(key, this.shift));
      if (this.shift && !this.shiftLocked()) this.setShift(null);
      return;
    }

    const layer = this.layer();
    if (layer === 'A' && key.alpha) {
      this.entry.type(key.alpha);
      if (this.shift === 'alpha') this.setShift(null);
      return;
    }

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
      case 'app.install': this.installApp(); return true;
      case 'assistant.ask': {
        const text = this.entry.buffer.trim().replace(/^\?/, '').trim();
        if (text) this.entry.cancel();
        this.drawers.open('assistant');
        if (text) requestAnimationFrame(() => this.chatBot.setDraft(text));
        return true;
      }
      case 'writer.equation': {
        if (this.inputMode === 'equation') { this.setInputMode('rpl', { carry: true }); return true; }
        if (this.selection != null && (isSymbolic(this.stack.peek(this.selection)) || isName(this.stack.peek(this.selection)))) this.editLevel(this.selection);
        else this.setInputMode('equation');
        return true;
      }
      case 'writer.matrix': {
        if (this.inputMode === 'matrix') { this.setInputMode('rpl', { carry: true }); return true; }
        if (this.selection != null && (isMatrix(this.stack.peek(this.selection)) || isVector(this.stack.peek(this.selection)))) this.editLevel(this.selection);
        else this.setInputMode('matrix');
        return true;
      }
      case 'drawer.toggle': this.drawers.toggle(); return true;
      case 'keypad.toggle': this.setKeypadLayout(this.prefs.keypad === 'hidden' ? (this._lastKeypad ?? 'full') : 'hidden'); return true;
      case 'keypad.compact': this.setKeypadLayout(this.prefs.keypad === 'compact' ? 'full' : 'compact'); return true;
      case 'keypad.side': this.setDockSide('keypad', this.prefs.keypadSide === 'left' ? 'right' : 'left'); return true;
      case 'panels.side': this.setDockSide('panels', this.prefs.panelsSide === 'left' ? 'right' : 'left'); return true;
      case 'view.minimal': this.setMinimal(!this.prefs.minimal); return true;
      case 'view.fullscreen': document.documentElement.requestFullscreen?.().catch(() => this.notifyError('Full screen is not available here.')); return true;
      case 'view.minimalMenu': this.setMinimalMenu(!this.prefs.minimalMenu); return true;
      case 'settings.open': this.sheets.openSettings(); return true;
      case 'shortcuts.open': this.sheets.openShortcuts(); return true;
      case 'edit.undo':
        if (this.inputMode === 'equation' && this.equationEditor.canUndo()) { this.equationEditor.pressFace('UNDO'); return true; }
        if (this.inputMode === 'matrix' && this.matrixEditor.canUndo()) { this.matrixEditor.undo(); return true; }
        if (this.inputMode === 'rpl' && this.entry.buffer.length) { this.entry.undoText(); return true; }
        this._undoStackStep();
        return true;
      case 'edit.redo':
        if (this.inputMode === 'equation' && this.equationEditor.canRedo()) { this.equationEditor.pressFace('REDO'); return true; }
        if (this.inputMode === 'matrix' && this.matrixEditor.canRedo()) { this.matrixEditor.redo(); return true; }
        if (this.inputMode === 'rpl' && this.entry.buffer.length) { this.entry.redoText(); return true; }
        this._redoStackStep();
        return true;
      case 'edit.paste':
        navigator.clipboard?.readText?.().then((text) => { if (text) this.entry.paste(text); })
          .catch(() => this.notifyError('The clipboard is not available here. Click the command line and paste there.'));
        return true;
      case 'ui.escape': return this._escape();
      case 'writer.commit': this.commitEntry(); return true;
      case 'matrix.nextCell': this.matrixEditor.focus(); return true;
      case 'matrix.enter': this.commitEntry(); return true;
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

  clearLine(text = this.entry.buffer) {
    this.entry.cancel();
    this.toast('Cleared the command line', { action: 'Undo', onAction: () => this.entry.recall(text) });
  }

  _escape() {
    if (this.popover.isOpen()) { this.popover.close(); return true; }
    if (this.sheets.isOpen()) { this.sheets.close(); return true; }
    if (this.plotFocus) { this.setPlotFocus(false); return true; }
    if (document.activeElement?.closest?.('.pl-box')) { this.focusInput(); return true; }
    if (this.selection != null) { this.clearSelection(); return true; }
    if (this.entry.error) { this.dismissError(); return true; }
    if (this.inputMode !== 'rpl') { this.cancelWriter(); return true; }
    if (this.pendingEdit) { this.cancelEdit(); return true; }
    if (this.entry.buffer.length) { this.clearLine(); return true; }
    if (this.shift) { this.setShift(null); return true; }
    if (this._drawerCoversStack()) { this.drawers.close(); return true; }
    return true;
  }

  // Where the drawer hides the input, a tutor step puts it away so the step plays out on the calculator, and the note brings it back.
  _tutorAside(text, action, then = null) {
    if (!this.drawers.hidesInput()) return;
    this.drawers.close();
    this.toast(text, {
      action, key: 'tutor', timeout: Infinity,
      onAction: () => { this.drawers.open('assistant'); then?.(); },
    });
  }

  _drawerCoversStack() {
    return this.drawers.isOpen() && (this.prefs.minimal || window.innerWidth < 980);
  }

  // A phone's back button closes the top overlay before it leaves the app: an overlay holds one history entry.
  _installHaptics() {
    if (typeof navigator.vibrate !== 'function') return;
    document.addEventListener('pointerdown', (e) => {
      if (this.prefs.haptics && e.pointerType === 'touch' && e.target.closest?.('.k, .sk, .key-strip button, .cmdline-go')) navigator.vibrate(10);
    }, { passive: true });
  }

  // The HP beeps on an error unless flag -56 (Error Beep) is set; with key vibration on, a phone buzzes twice.
  // A held finger that opens a menu, starts a drag or clears the line says so, as a key does on its press.
  buzzHold() {
    if (this.prefs.haptics && typeof navigator.vibrate === 'function') navigator.vibrate(20);
  }

  _buzzError() {
    if (this.prefs.haptics && typeof navigator.vibrate === 'function' && !testUserFlag(-56)) navigator.vibrate([30, 60, 30]);
  }

  _installBackButton() {
    const overlays = [
      [() => this.popover.isOpen(), () => this.popover.close()],
      [() => this.palette.isOpen(), () => this.palette.close()],
      [() => this.sheets.isOpen(), () => this.sheets.close()],
      [() => this.inputMode !== 'rpl', () => this.cancelWriter()],
      [() => this._drawerCoversStack(), () => this.drawers.close()],
      // As the HP's ON cancels an edit, so does a phone's back button.
      [() => !!this.pendingEdit, () => this.cancelEdit()],
    ];
    const top = () => overlays.find(([isOpen]) => isOpen());
    let ignorePop = false;
    const sync = () => {
      if (ignorePop) return;
      const guarded = history.state?.rplOverlay === true;
      if (top() && !guarded) history.pushState({ rplOverlay: true }, '');
      else if (!top() && guarded) { ignorePop = true; history.back(); }
    };
    window.addEventListener('popstate', () => {
      if (ignorePop) { ignorePop = false; return; }
      top()?.[1]();
      sync();
    });
    for (const type of ['click', 'keyup', 'pointerup']) document.addEventListener(type, () => setTimeout(sync), true);
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
    if ((this.sheets.isOpen() || this.popover.isOpen()) && !/^(Mod\+|Escape$)/.test(chord)) return;
    if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (chord === 'Mod+V' && (inEditor || this.inputMode !== 'rpl')) return;

    if (this.inputMode === 'equation' && !target?.closest?.('.pl-box') && this.equationEditor.ownsKeyboard(target)) {
      const writerBinding = findBinding(chord, ['equation']);
      if (writerBinding) {
        if (this.runAction(writerBinding.action, writerBinding.arg) !== false) e.preventDefault();
        return;
      }
      if (!/^(Mod\+|F\d|Shift\+F|Alt\+F|PageUp|PageDown|Escape)/.test(chord) && this.equationEditor.handleKey(e)) { e.preventDefault(); return; }
    }

    if (inField) {
      const fieldSafe = /^Mod\+(K|I|E|\\|;|,|\/)$|^Mod\+Shift\+(F|M)$|^F\d$|^(Shift|Alt)\+F\d$/.test(chord)
        || (/^Page(Up|Down)$/.test(chord) && !!target.closest?.('.mx, .eqw'))
        || (/^Mod\+(Shift\+Z|Z|Y)$/.test(chord) && !!target.closest?.('.mx-cell'));
      const escapeSafe = chord === 'Escape' && (!target.value || this.inputMode !== 'rpl');
      if (!fieldSafe && !escapeSafe) return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !inField && this._answerKey(typedKeyCode(e.key))) { e.preventDefault(); return; }
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

// INFORM's values as the form shows them: NOVAL, the HP's empty field, shows as nothing.
function informText(v) {
  return !v || (isName(v) && v.id === 'NOVAL') ? '' : formatSource(v);
}

// A field's text as one object of a type the field takes, or the complaint to show on the field.
function informValue(text, field) {
  let objects;
  try { objects = parseEntry(text); } catch (e) { return e.message; }
  if (objects.length !== 1) return 'One object per field';
  if (field.types.length && !field.types.includes(_hp50TypeCode(objects[0]))) return `Not a type this field takes (${field.types.join(', ')})`;
  return objects[0];
}

// What a MODES key types inside a program; CMPLX on its own toggles, so the domain keys set flag -103.
function modeCommand(mode, option) {
  if (mode.id === 'complex') return `-103 ${option.value === 'CMPLX' ? 'SF' : 'CF'}`;
  if (mode.id === 'base') return binaryBaseLabel(option.value);
  return option.value;
}

// A phone's status bar and the browser's toolbar take the colour of the app's top edge, whatever the
// theme: the app bar, or minimal view's stack. index.html's pair only knows the system's dark and light.
function applyThemeColor() {
  const top = document.querySelector(document.documentElement.dataset.view === 'minimal' ? '.work' : '#appbar');
  const color = getComputedStyle(top).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = color;
}

function customMenuSource(target) {
  return isName(target) ? target.id : formatSource(target);
}

// A built-in command in CST, such as SIN, reads as a name; its key runs the command unless a variable shadows it.
function customCommand(target) {
  return isName(target) && lookup(target.id) && varRecall(target.id) === undefined;
}

window.__hp50 = new App();

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

// A browser tab can't tell the app is installed, except through this (Chrome only).
if (navigator.getInstalledRelatedApps && !window.__hp50.isInstalledApp()) {
  navigator.getInstalledRelatedApps().then((apps) => {
    if (!apps.length) return;
    window.__hp50.installedHere = true;
    window.__hp50.appbar.render();
  }).catch(() => {});
}

window.addEventListener('appinstalled', () => {
  window.installPrompt = null;
  window.__hp50.installedHere = true;
  window.__hp50.appbar.render();
  window.__hp50.toast('Installed. rpl.ai now opens in its own window and works offline.');
});
