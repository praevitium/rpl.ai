/* =================================================================
   Main orchestrator.  Wires together stack, entry, display, and
   keyboard and installs a physical-keyboard handler for desktop use.
   ================================================================= */

import { Stack }        from './rpl/stack.js';
import { Entry }        from './ui/entry.js';
import { Display }      from './ui/display.js';
import { renderKeyboard } from './ui/keyboard.js';
import { SidePanel }    from './ui/side-panel.js';
import { clampStackScroll, computeMenuPage } from './ui/paging.js';
import { handleModifierShortcut } from './ui/shortcuts.js';
import {
  interactiveStackMenu, levelUp, levelDown, clampLevel,
  rollLevel, rollDownToLevel, dropLevel,
} from './ui/interactive-stack.js';
import { format } from './rpl/formatter.js';
import {
  state as calcState, subscribe as subscribeState,
  cycleAngle, toggleApproxMode, cycleCoordMode, toggleComplexMode,
  setBinaryBase, setDisplay,
  varOrder, varList, varRecall, varStore, currentPath,
  goInto, goHome, goUp,
} from './rpl/state.js';
import { lookup } from './rpl/ops.js';
import {
  isProgram, isDirectory, isList, isName, isString, isTagged, Real,
} from './rpl/types.js';
import './rpl/ops.js';                     // register ops as side effect
import {
  loadFromLocalStorage, saveToLocalStorage,
  exportToFile, importFromFile,
} from './rpl/persist.js';
import { giac } from './rpl/cas/giac-engine.mjs';
import { FULL as BUILD_FULL } from './build-info.js';
import { ChatBot } from './ai/chat-bot.js';

class App {
  constructor() {
    this.stack = new Stack();
    this.entry = new Entry(this.stack);

    const versionEl = document.getElementById('versionLabel');
    if (versionEl) versionEl.textContent = BUILD_FULL;

    this.display = new Display({
      stackView:  document.getElementById('stackView'),
      cmdline:    document.getElementById('cmdline'),
      statusLine: document.getElementById('statusLine'),
      menuBar:    document.getElementById('menuBar'),
    });

    // Shift state.  `shift` is one of:
    //   null         — no shift active
    //   'shiftL'     — next key takes its left (orange) shifted meaning
    //   'shiftR'     — next key takes its right (red) shifted meaning
    //   'alpha'      — next key types its alpha label (single-shot)
    //   'shiftLLock' / 'shiftRLock' / 'alphaLock'
    //                — the respective shift stays engaged across
    //                  multiple presses until explicitly cleared.
    // All three modifiers share the same gesture model: a single click
    // engages the one-shot (and a second slow click cancels it); a
    // rapid double-click promotes the one-shot to lock; any click on a
    // locked modifier clears it.  Keeping the three keys identical
    // means users don't have to remember per-key rules — the double-
    // click threshold is the one thing to know.
    this.shift = null;
    this._shiftListeners = new Set();
    this._lastShiftAt = 0;          // timestamp of most recent shiftL/R press
    this._lastShiftKind = null;     // which shift ('shiftL' / 'shiftR')

    // Active soft-menu state.
    // `menuAll` holds every slot; only `menuAll[page*6..page*6+6]` is
    // shown on the LCD at a time.  NXT advances the page, PREV (shift-L
    // on NXT) or ◀ / ▶ page backward/forward.  `menuSlots` is the
    // currently-visible 6-slot view — what pressSoftKey(i) dispatches
    // through.  `menuKind` tags dynamic menus (e.g. VARS) so the state
    // subscriber can rebuild them when the underlying data changes.
    this.menuKind = null;
    this.menuAll = [];
    this.menuPage = 0;
    this.menuSlots = Array(6).fill(null);

    // Stack scroll: 0 means level 1 is at the bottom of the LCD (usual
    // HP50 view).  ▲ increments, ▼ decrements.  Any stack mutation
    // snaps back to 0 so newly-pushed results stay visible.
    this.stackScroll = 0;

    renderKeyboard(this, {
      softRow: document.getElementById('softRow'),
      navRow:  document.getElementById('navRow'),
      keypad:  document.getElementById('keypad'),
    });

    // Side panel (Commands / History / Characters / Files).  Mounts
    // itself into #sidePanelRoot and starts hidden.  Browsable catalog
    // of every registered op in place of a dozen small shifted soft-menus.
    const sidePanelRoot = document.getElementById('sidePanelRoot');
    if (sidePanelRoot) {
      this.sidePanel = new SidePanel({ root: sidePanelRoot, app: this });
      // Re-render the History tab whenever a new entry is committed.
      // subscribeHistory fires only on actual additions (not every keystroke),
      // and refresh() is a no-op when the panel is closed or on another tab.
      this.entry.subscribeHistory(() => {
        if (this.sidePanel?.tab === 'history') this.sidePanel.refresh();
      });
    }

    // AI assistant — completely decoupled from calculator internals.
    // We hand it an opaque `tools` object and a `getContext` function;
    // it never imports anything from rpl/ or the rest of the UI.
    // The SidePanel mounts the chatBot's DOM on first AI-tab open.
    this.chatBot = new ChatBot({
      tools: {
        /** Run RPL code exactly as if the user typed it and pressed ENTER.
         *  This is how the model "places things on the stack" — the RPL
         *  parser handles numbers, names, expressions, programs, and
         *  whole sequences indifferently. */
        run: (text) => {
          this.entry.recall(text);
          this.entry.enter();
        },
        /** Insert text at the editor cursor without committing.  Lets
         *  the model build up an expression piece-by-piece while the
         *  user watches. */
        appendToEditor: (text) => {
          this.entry.type(text);
        },
        /** Empty the editor buffer (HP50 ON / cancel). */
        clearEditor: () => {
          this.entry.cancel();
        },
        /** Read the current editor buffer — what the user is typing. */
        getEditor: () => this.entry.buffer,
        /** List variable names in the current directory. */
        listVars: () => varList(),
        /** Recall the value bound to `name` (or undefined). */
        recallVar: (name) => {
          const v = varRecall(name);
          if (v === undefined) return undefined;
          return format(v, this.display?.displayOpts);
        },
      },
      getContext: () => {
        // `snapshot()` returns the stack ordered level-1-first — same
        // shape we want for the LLM context (top of stack at index 0).
        const levels = this.stack.snapshot();
        const st     = calcState;
        const opts   = this.display?.displayOpts;
        return {
          stack: levels.slice(0, 8).map(v => format(v, opts)),
          angleMode: st.angle,
          displayMode: st.displayMode === 'STD'
            ? 'STD'
            : `${st.displayMode} ${st.displayDigits}`,
          dir: currentPath().join('/') || 'HOME',
        };
      },
    });

    // The SidePanel is constructed BEFORE chatBot above, and its
    // _restoreUIState() may have already rendered the AI tab while
    // chatBot was still undefined (showing an "Initialising assistant…"
    // placeholder).  Refresh now that chatBot exists so the real chat UI
    // takes over without requiring user interaction.
    if (this.sidePanel?.tab === 'ai') this.sidePanel.refresh();

    this._installChromeToggles();

    // Interactive-stack state (set by enterInteractiveStack, read by
    // the arrow-key dispatch below).  null means "not active";
    // otherwise { savedMenuAll, savedMenuPage, savedMenuKind } holds the
    // pre-existing soft menu so we can restore it on exit.
    this._interactive = null;

    // "Editing level 1" shadow.  When editLevel1() pops level 1 onto
    // the command line, it stashes the popped value here.  cancelEntry()
    // restores it if the user escapes out; commitEntry() clears it if
    // the user presses ENTER.  See editLevel1 for the full lifecycle
    // explanation.
    this._pendingEditValue = null;

    // Plumb the Display's click-delegate callbacks into App-level
    // handlers.  Stack-row click echoes the level's decompiled form
    // into the command-line editor (entry.type focuses as a side
    // effect, so the user can keep typing).  Interactive-stack
    // browse mode is still reachable via ▲ on an empty cmdline.
    // Indicator click cycles the underlying mode; path segment
    // click jumps to that directory.
    this.display.onStackRowClick    = (level) => this.echoStackLevel(level);
    this.display.onIndicatorClick   = (id)    => this.cycleIndicator(id);
    this.display.onPathSegmentClick = (index) => this.navigateToPathSegment(index);

    // Restore persisted state from localStorage before wiring any
    // autosave listener — otherwise the restore itself would trigger
    // a redundant save round-trip.  A silent failure here just means
    // the user boots into an empty HOME, which is what they'd see on
    // first visit anyway.
    loadFromLocalStorage(this.stack);

    this.stack.subscribe(() => {
      this.stackScroll = 0;
      this.display.setStackScroll(0);
      this.display.renderStack(this.stack);
    });
    // Any stack mutation invalidates a pending edit shadow.  Covers
    // the operator-auto-commit path (pressing e.g. + with a non-empty
    // buffer commits the buffer via Entry.enter() and then runs the
    // op) so we never end up with a stale shadow that a later ESC
    // would mistakenly restore.
    this.stack.subscribe(() => { this._pendingEditValue = null; });
    this.entry.subscribe(() => this.display.renderCmdline(this.entry));

    // Mirror global calc state (angle mode, path, future flags) into
    // the LCD.  When variables change (STO/PURGE) the VARS menu, if
    // it's the active one, must re-render too.
    subscribeState((st) => {
      this.display.setAngleMode(st.angle);
      this.display.setPath(currentPath());
      this.display.setApproxAnnunciator(st.approxMode);
      this.display.setComplexAnnunciator(st.complexMode);
      this.display.setBinaryBaseAnnunciator(st.binaryBase);
      this.display.setCoordMode(st.coordMode);
      this.display.setDisplayAnnunciator(st.displayMode, st.displayDigits);
      if (this.menuKind === 'VARS')  this.showVarsMenu({ preservePage: true });
      if (this.menuKind === 'MODES') this.showModesMenu({ preservePage: true });
      // Re-render the stack so Symbolic rows swap between pretty-printed
      // SVG and flat text at the moment textbookMode flips.  Done
      // unconditionally on every state event because renderStack is
      // cheap for the handful of rows on the LCD and reliably picks up
      // the flag.
      this.display.renderStack(this.stack);
    });

    // Attach CodeMirror to the command-line surface.  Entry-level
    // operations keep using entry.type() / entry.buffer setter etc.; the
    // EditorView is the live DOM for user-driven editing (mouse, keyboard
    // shortcuts, selection, autogrow).  App-level keys (Enter, Escape,
    // arrows-when-empty) route back here via the callbacks below.
    this.entry.attach(this.display.cmdline, {
      onCommit:         () => this.commitEntry(),
      onCancel:         () => this.cancelEntry(),
      onArrowUpEmpty:   () => this.enterInteractiveStack(),
      onArrowDownEmpty: () => { if (this.stack.depth >= 1) this.editLevel1(); },
      onArrowLeftEmpty: () => this.prevMenuPage(),
      onArrowRightEmpty:() => { this.stack.depth >= 2 ? this.swapTop() : this.nextMenuPage(); },
    });

    this.display.renderStack(this.stack);
    this.display.renderCmdline(this.entry);

    // Note: we deliberately DO NOT auto-focus the editor on boot.  Focus
    // arrives on first interaction — clicking the cmdline, any text
    // insertion (virtual-keypad press, CMD recall, ▼ edit-level-1), or
    // the first non-modifier physical-keyboard press (see
    // _installKeyboardShortcuts).  This keeps the app from stealing
    // focus from a host page before the user has actually engaged.
    this.display.setMenu(['', '', '', '', '', '']);
    this.display.setAngleMode(calcState.angle);
    this.display.setPath(currentPath());
    this.display.setApproxAnnunciator(calcState.approxMode);
    this.display.setComplexAnnunciator(calcState.complexMode);
    this.display.setBinaryBaseAnnunciator(calcState.binaryBase);
    this.display.setCoordMode(calcState.coordMode);
    this.display.setDisplayAnnunciator(calcState.displayMode, calcState.displayDigits);

    this._installKeyboardShortcuts();
    this._installAutosave();
  }

  /* ================================================================
     Persistence
     ================================================================ */

  /** Save on every stack or state change, coalesced on a microtask
   *  so a program pushing many values in a row only writes once. */
  _installAutosave() {
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        saveToLocalStorage(this.stack);
      });
    };
    this.stack.subscribe(schedule);
    subscribeState(schedule);
  }

  /** Brand tag cycles chrome density (full → simple → minimal) via a
   *  class on <body>; subtitle toggles the side panel.  Mode class is
   *  set here so the first paint already matches whatever the user
   *  last chose — kept in memory only for now.
   *
   *  Clicking the version label toggles the Tauri WebView's
   *  DevTools panel (single-click — consistent with the brand and
   *  model labels above it).  In a plain browser context the click
   *  is a no-op (the browser already has F12 / Cmd+Option+I).
   *  Settings reset has moved to the global `calc_reset()` function —
   *  type it into the DevTools console to wipe localStorage and
   *  reload. */
  _installChromeToggles() {
    const MODES = ['full', 'simple', 'minimal'];
    const CHROME_KEY = 'hp50.ui.chrome';
    let savedMode;
    try { savedMode = localStorage.getItem(CHROME_KEY); } catch { /* ignore */ }
    let idx = MODES.includes(savedMode) ? MODES.indexOf(savedMode) : 0;
    document.body.classList.add(`mode-${MODES[idx]}`);
    document.querySelector('.brand')?.addEventListener('click', () => {
      document.body.classList.remove(`mode-${MODES[idx]}`);
      idx = (idx + 1) % MODES.length;
      document.body.classList.add(`mode-${MODES[idx]}`);
      try { localStorage.setItem(CHROME_KEY, MODES[idx]); } catch { /* ignore */ }
    });
    document.querySelector('.model')?.addEventListener('click', () => {
      const sp = this.sidePanel;
      if (!sp) return;
      if (sp.isOpen()) sp.close();
      else sp.open(sp.tab);
    });
    document.getElementById('versionLabel')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Tauri v2 with `withGlobalTauri: true` exposes invoke at
      // window.__TAURI__.core.invoke; the matching Rust command is
      // registered in src-tauri/src/main.rs.  In a plain browser tab
      // the global is undefined and we silently no-op.
      window.__TAURI__?.core?.invoke?.('toggle_devtools').catch(() => {});
    });
  }

  /** Download the current stack + HOME directory as a JSON snapshot.
   *  Called from the side-panel Files tab.  Errors are flashed on the
   *  LCD rather than raised — the user can just try again. */
  exportSnapshot() {
    try {
      const filename = exportToFile(this.stack);
      this.entry.flashNotice(`Saved ${filename}`);
    } catch (e) { this.entry.flashError({ message: `Export failed: ${e.message}` }); }
  }

  /** Load a snapshot from the given File object, replacing the stack
   *  and HOME tree.  Also used by the side-panel Files tab. */
  async importSnapshotFromFile(file) {
    try { await importFromFile(file, this.stack); }
    catch (e) { this.entry.flashError({ message: `Import failed: ${e.message}` }); }
  }

  /** Called by the MODE meta-key.  A single press cycles the angle
   *  mode; a full MODE dialog is future work. */
  cycleAngleMode() { cycleAngle(); }

  /** Open / close the side panel on the chosen tab.  Used by the 📖
   *  button (→ 'commands').  Pressing the same tab again closes the
   *  panel, matching what you'd expect from a toggle. */
  toggleSidePanel(tab = 'commands') {
    if (!this.sidePanel) return;
    this.sidePanel.toggle(tab);
  }

  /* ================================================================
     MODES soft-menu.

     Presents display / angle mode toggles on F1..F6 when MODE is
     pressed.  On a real HP50 this lives inside a full-screen MODE
     dialog (Flag -17 for angle, Flag -80 for textbook, etc.); our
     soft-menu version gives the user keypad access to the flags
     that matter most for day-to-day use.

     F1  ANGL    cycle RAD → DEG → GRD (label shows the active mode)
     F2  TXT     toggle textbookMode (label shows '→TXT' in flat mode,
                 '→FLT' in textbook mode — user reads "press to switch")
     F3  HEX     set binary display base to hex
     F4  DEC     set binary display base to decimal
     F5  OCT     set binary display base to octal
     F6  BIN     set binary display base to binary
     F7  EXA/APX toggle EXACT ↔ APPROX numeric-eval mode

     The menu labels refresh whenever state changes (angle mode,
     textbook mode) so the user always sees the current mode without
     having to look at the annunciator.  Labels rebuild on each
     render because `showModesMenu` re-captures the live state values
     when called.
     ================================================================ */
  showModesMenu(opts = {}) {
    // Re-read current state each call so the labels stay live.  When
    // the user presses ANGL or TXT, the follow-up state event is also
    // caught by the subscribeState hook below which rebuilds the
    // MODES menu — so the user sees the updated label even if they
    // triggered the toggle via other means (e.g., typing ANGL in
    // alpha mode).
    //
    // `preservePage`: keep the current page index on rebuild so a
    // user who clicks the EXA→APX slot on page 2 doesn't get kicked
    // back to page 1 by the self-rebuild that follows the state
    // change.  The initial call from MODE leaves it false so the
    // menu always opens on page 1.
    const prevPage = this.menuPage;
    const rebuild = () => this.showModesMenu({ preservePage: true });
    const slots = [
      { label: `ANGL ${calcState.angle}`,
        onPress: () => { cycleAngle(); rebuild(); } },
      { label: calcState.textbookMode ? 'TXT→FLT' : 'FLT→TXT',
        onPress: () => {
          this.entry.safeRun(() =>
            lookup(calcState.textbookMode ? 'FLAT' : 'TEXTBOOK').fn(this.stack, this.entry), calcState.textbookMode ? 'FLAT' : 'TEXTBOOK');
          rebuild();
        } },
      { label: 'HEX',
        onPress: () => this.entry.safeRun(() => lookup('HEX').fn(this.stack, this.entry), 'HEX') },
      { label: 'DEC',
        onPress: () => this.entry.safeRun(() => lookup('DEC').fn(this.stack, this.entry), 'DEC') },
      { label: 'OCT',
        onPress: () => this.entry.safeRun(() => lookup('OCT').fn(this.stack, this.entry), 'OCT') },
      { label: 'BIN',
        onPress: () => this.entry.safeRun(() => lookup('BIN').fn(this.stack, this.entry), 'BIN') },
      // EXACT/APPROX toggle.  Label shows the target mode the user
      // would switch INTO if they pressed the key, matching the
      // TXT→FLT / FLT→TXT pattern above.
      { label: calcState.approxMode ? 'APX→EXA' : 'EXA→APX',
        onPress: () => {
          this.entry.safeRun(() =>
            lookup(calcState.approxMode ? 'EXACT' : 'APPROX').fn(this.stack, this.entry), calcState.approxMode ? 'EXACT' : 'APPROX');
          rebuild();
        } },
      // Real/Complex toggle (HP50 flag -103).  Label shows the target
      // mode, matching the EXA→APX pattern above.  CMPLX is a pure
      // toggle, so the same op switches either direction.
      { label: calcState.complexMode ? 'CMP→REAL' : 'REAL→CMP',
        onPress: () => {
          this.entry.safeRun(() => lookup('CMPLX').fn(this.stack, this.entry), 'CMPLX');
          rebuild();
        } },
    ];
    this.menuKind = 'MODES';
    this.menuAll = slots;
    this.menuPage = opts.preservePage ? prevPage : 0;
    this._renderMenuPage();
  }

  /* ================================================================
     Menu helper

     A single "commit-and-run" factory shared by every soft-menu whose
     F-keys just dispatch to a registered op.  Keeps each menu
     definition to a single array of `{label, onPress}` entries.
     ================================================================ */
  _run(opName) {
    return () => {
      if (this.entry.buffer.trim().length > 0) this.entry.enter();
      this.entry.safeRun(() => lookup(opName).fn(this.stack, this.entry), opName);
    };
  }

  /** Push a raw number onto the stack.  Used by menu slots that
   *  produce a constant (e, π, etc.). */
  _pushReal(value) {
    return () => {
      if (this.entry.buffer.trim().length > 0) this.entry.enter();
      this.stack.push(Real(value));
    };
  }

  /** "Not yet implemented" handler for menu slots whose op hasn't
   *  been registered.  Keeps the label visible so the user sees the
   *  full menu layout. */
  _stub(label) {
    return () => this.entry.flashError({ message: `${label}: not yet implemented` });
  }

  /* ================================================================
     Soft-menu plumbing
     ================================================================ */

  /** Install a full slot list and jump to page 0.  Each slot is
   *  `{ label, onPress, onPressL?, onPressR? }`.  `onPressL` / `onPressR`
   *  fire when the soft key is pressed with left / right shift active.
   *  Missing shifted handlers fall through to `onPress`. */
  setMenu(slots, kind = null) {
    this.menuKind = kind;
    this.menuAll = Array.isArray(slots) ? slots.slice() : [];
    this.menuPage = 0;
    this._renderMenuPage();
  }

  clearMenu() {
    this.menuKind = null;
    this.menuAll = [];
    this.menuPage = 0;
    this.menuSlots = Array(6).fill(null);
    this.display.setMenu(['', '', '', '', '', '']);
    this._updateSoftKeyLabels(null);
  }

  nextMenuPage() {
    if (this.menuAll.length <= 6) return;
    this.menuPage += 1;
    this._renderMenuPage();
  }

  prevMenuPage() {
    if (this.menuAll.length <= 6) return;
    this.menuPage -= 1;
    this._renderMenuPage();
  }

  _renderMenuPage() {
    const { view, page } = computeMenuPage(this.menuAll, this.menuPage, 6);
    this.menuPage = page;                 // normalized (wrap)
    this.menuSlots = view;
    this.display.setMenu(view.map(s => s?.label ?? ''));
    this._updateSoftKeyLabels(view);
  }

  /** Repaint the on-screen F1..F6 button faces to show the active menu's
   *  slot labels.  When no menu is loaded (or a slot is empty) the button
   *  falls back to its default 'F1'..'F6' label.  This makes the soft
   *  keys self-describing — the user can read what each one does from
   *  the button itself, without having to look up at the LCD menu bar. */
  _updateSoftKeyLabels(view) {
    const buttons = document.querySelectorAll('#softRow .key');
    for (let i = 0; i < buttons.length; i++) {
      const primary = buttons[i].querySelector('.primary');
      if (!primary) continue;
      const dynamic = !!(view && view[i]?.label);
      primary.textContent = dynamic ? view[i].label : `F${i + 1}`;
      primary.classList.toggle('menu-label', dynamic);
    }
  }

  /** Fill the soft-menu bar with the current directory's variables.
   *  Unshifted F-key:  EVAL-on-press for Program values, DESCEND for
   *                    Directory values (HP50 "cd into subdir"),
   *                    otherwise push the value (classic HP50 VARS
   *                    behavior).
   *  Left-shift + F:   STO level 1 into that name (`value SHIFT-L F`).
   *  Right-shift + F:  RCL — push value without evaluating Program or
   *                    descending into a Directory.
   *
   *  `preservePage: true` keeps the current page index after a rebuild,
   *  which the state subscriber uses so STO-ing doesn't kick the user
   *  back to page 0.  The index is still clamped by computeMenuPage
   *  when it ends up past the end of a shrunk var list.
   */
  showVarsMenu(opts = {}) {
    const names = varOrder();
    const prevPage = this.menuPage;
    const slots = names.map((id) => ({
      label: id,
      // Unshifted: EVAL-or-descend-or-push.  Programs execute; a
      // Directory value descends into that subdirectory (HP50 VARS
      // press-on-a-subdir behavior); everything else is pushed
      // literally.  Looking up via varOrder() restricts this to names
      // that live in the CURRENT directory, so descent never walks
      // across parent chains — it always enters a direct child.
      onPress: () => {
        if (this.entry.buffer.trim().length > 0) this.entry.enter();
        const v = varRecall(id);
        if (v === undefined) {
          this.entry.flashError({ message: `Undefined: ${id}` });
          return;
        }
        if (isDirectory(v)) {
          // goInto fires its own state event, which will rebuild the
          // VARS menu to show the new directory's contents.
          const ok = goInto(id);
          if (!ok) this.entry.flashError({ message: `Cannot descend: ${id}` });
          return;
        }
        if (isProgram(v)) {
          // Push + EVAL inside one safeRun snapshot.  HP50 behavior:
          // a soft-key invocation that errors should leave the stack
          // exactly as it was before the press — including dropping
          // the program itself.  safeRun captures the snapshot at
          // entry, so pushing the program inside the body means a
          // rollback also unwinds the push.
          this.entry.safeRun(() => {
            this.stack.push(v);
            lookup('EVAL').fn(this.stack, this.entry);
          }, 'EVAL');
          return;
        }
        this.stack.push(v);
      },
      // Left-shift: STO level 1 into this name.  Classic HP50 VAR
      // shortcut — spares the user from keying `'NAME' STO`.
      onPressL: () => {
        if (this.entry.buffer.trim().length > 0) this.entry.enter();
        if (this.stack.depth < 1) {
          this.entry.flashError({ message: 'Too few arguments' });
          return;
        }
        this.entry.safeRun(() => {
          const value = this.stack.pop();
          varStore(id, value);
        });
      },
      // Right-shift: RCL — push the value unchanged, never EVALed.
      onPressR: () => {
        if (this.entry.buffer.trim().length > 0) this.entry.enter();
        const v = varRecall(id);
        if (v === undefined) {
          this.entry.flashError({ message: `Undefined: ${id}` });
          return;
        }
        this.stack.push(v);
      },
    }));
    this.menuKind = 'VARS';
    this.menuAll = slots;
    this.menuPage = opts.preservePage ? prevPage : 0;
    this._renderMenuPage();
  }

  /** Load the CST reserved variable as a soft menu — HP50 "Custom menu".
   *
   *  The CST variable is expected to be a List whose entries are the
   *  menu items.  Each item can be:
   *    - a Name / String             → label = name, press = push name
   *                                    then EVAL (programs run, values
   *                                    get pushed literally)
   *    - a Tagged object { name, value }
   *                                  → label = tag, press = push+EVAL
   *                                    the value
   *    - any other value             → label is the value's display
   *                                    form, press pushes it literally
   *
   *  If CST doesn't exist (or isn't a list) we flash a hint rather than
   *  silently installing an empty menu — the user almost certainly
   *  wants to know why nothing happened.  */
  showCustomMenu() {
    if (this.entry.buffer.trim().length > 0) this.entry.enter();
    const cst = varRecall('CST');
    if (cst === undefined) {
      this.entry.flashError({
        message: 'CST undefined — store a list in CST',
      });
      return;
    }
    if (!isList(cst)) {
      this.entry.flashError({
        message: 'CST must be a list',
      });
      return;
    }
    const slots = cst.items.map((item) => {
      const label = customMenuLabel(item);
      const [target, tag] = customMenuTarget(item);
      return {
        label,
        onPress: () => {
          if (this.entry.buffer.trim().length > 0) this.entry.enter();
          if (isProgram(target) || isName(target)) {
            // Push + EVAL inside one safeRun snapshot so a runtime
            // error from the program (or an unbound name) rolls the
            // stack back to its pre-press state — see the matching
            // VARS soft-key comment in showVarsMenu.
            this.entry.safeRun(() => {
              this.stack.push(target);
              lookup('EVAL').fn(this.stack, this.entry);
            }, 'EVAL');
          } else {
            // Non-evaluable item: push literally, no rollback needed.
            this.stack.push(target);
          }
        },
        // Left-shift: type the item's label into the command line —
        // useful when the user wants to reference the name without
        // running the program it points to.
        onPressL: () => {
          this.entry.type(tag || label);
        },
        // Right-shift: recall (push without EVAL), parallel to VARS.
        onPressR: () => {
          if (this.entry.buffer.trim().length > 0) this.entry.enter();
          this.stack.push(target);
        },
      };
    });
    this.menuKind = 'CST';
    this.menuAll = slots;
    this.menuPage = 0;
    this._renderMenuPage();
  }

  /* ================================================================
     HP50 arrow-key / direct-manipulation actions

     Three HP50 keystroke sequences from the Advanced Guide live here:
       25.1  ▲ from empty cmdline      → interactive stack
       35.1  ▼ from empty cmdline      → edit level 1 (EDITB style)
       36.1  ▶ from empty cmdline      → SWAP

     Plus a family of direct-manipulation helpers for the LCD click
     delegates: echo a stack level, cycle an indicator, navigate to a
     path segment.
     ================================================================ */

  /** Swap level 1 and level 2.  No-op if depth < 2 (with a friendly
   *  error flash so the user sees why ▶ didn't do anything). */
  swapTop() {
    if (this.stack.depth < 2) {
      this.entry.flashError({ message: 'Too few arguments' });
      return;
    }
    this.entry._snapForUndo();
    this.entry.safeRun(() => lookup('SWAP').fn(this.stack, this.entry), 'SWAP');
  }

  /** Pull level 1 onto the command line for editing (HP50 EDITB
   *  shortcut).  Decompiles the value with the default formatter —
   *  round-trippable for Real / Integer / Name / Symbolic; for nested
   *  types the user gets a decompiled form they can re-ENTER to rebuild.
   *
   *  The original value is POPPED and stashed in `_pendingEditValue`.
   *  If the user commits with ENTER, the edited buffer is parsed and
   *  pushed normally (commitEntry discards the stash).  If the user
   *  cancels with ESC (or the ON key), cancelEntry() pushes the stashed
   *  value back so nothing is lost — matching the behaviour you'd
   *  expect from any "edit in place" affordance. */
  editLevel1() {
    if (this.stack.depth < 1) {
      this.entry.flashError({ message: 'Too few arguments' });
      return;
    }
    // Re-entrancy guard.  ▼ is only bound to editLevel1 when the buffer
    // is empty, but the pendingEdit shadow can outlive an emptied buffer
    // (user deleted everything without pressing ESC).  In that state,
    // pulling a fresh level 1 would clobber the first shadow and lose
    // the original value.  Silently ignore the second ▼ — ESC is how
    // you exit the pending edit.
    if (this._pendingEditValue !== null && this._pendingEditValue !== undefined) {
      return;
    }
    this.entry._snapForUndo();
    const v = this.stack.pop();
    this._pendingEditValue = v;
    const text = format(v);
    this.entry.buffer = text;
    this.entry.cursor = text.length;
    this.entry.error  = '';
    this.entry._emit();
    this.entry.focus();
  }

  /** Cancel-aware wrapper around Entry.cancel.  If the buffer was
   *  populated by editLevel1, restore the popped value to the stack;
   *  otherwise behave exactly like Entry.cancel. */
  cancelEntry() {
    if (this._pendingEditValue !== null && this._pendingEditValue !== undefined) {
      this.stack.push(this._pendingEditValue);
      this._pendingEditValue = null;
      this.entry.buffer = '';
      this.entry.cursor = 0;
      this.entry.error  = '';
      this.entry._emit();
      return;
    }
    this.entry.cancel();
  }

  /** Commit-aware wrapper around Entry.enter.  Clears any pending
   *  edit shadow — once the user presses ENTER, the edited text is
   *  authoritative and the popped original should not be restored on
   *  a later ESC.  Blurs the editor afterward so the post-commit
   *  state matches "I'm done with this input" — the next physical
   *  keystroke goes through the calc's unfocused shortcuts
   *  (Backspace → DROP, etc.) until the user explicitly re-engages
   *  the editor. */
  commitEntry() {
    // `?<text>` escape prefix — route the rest of the buffer to the
    // chatbot as if the user had typed it into the chat input.  This
    // turns the entry line into a quick "ask the assistant" affordance
    // without forcing the user to switch tabs first.  The `?` itself
    // is consumed; everything after is the message text.  Whitespace
    // after the `?` is also stripped so `? how do I…` works the same
    // as `?how do I…`.
    //
    // Empty body (just `?`) does nothing useful — clear the buffer so
    // the user isn't left with a stale `?` and silently no-op, since
    // there's nothing meaningful to send.
    if (this.entry.buffer.startsWith('?')) {
      const prompt = this.entry.buffer.slice(1).trim();
      this._pendingEditValue = null;
      this.entry.buffer = '';
      this.entry.cursor = 0;
      this.entry.error  = '';
      this.entry._emit();
      this.entry.blur();
      if (prompt) {
        // Make sure the AI panel is open and on the right tab so the
        // user actually sees the conversation they just kicked off.
        // Best-effort — both calls are no-ops if the panel isn't
        // ready or doesn't exist.
        try { this.sidePanel?.open?.('ai'); } catch { /* ignore */ }
        try { this.chatBot?.sendUserMessage?.(prompt); } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[app] commitEntry: chat send failed:', err);
        }
      }
      return;
    }

    this._pendingEditValue = null;
    this.entry.enter();
    // On a failed commit (parse error, undefined op, type error, …) the
    // buffer is preserved so the user can fix it.  Keep focus in the
    // editor in that case; only blur when the commit actually went
    // through, matching "I'm done with this input".
    if (this.entry.error) this.entry.focus();
    else this.entry.blur();
  }

  /** Copy a stack level's decompiled form into the command-line editor
   *  (HP50 "ECHO").  The source value stays on the stack — echo is a
   *  non-destructive copy.  Used by both the interactive-stack menu F1
   *  ECHO slot and by direct clicking on a stack row. */
  echoStackLevel(level) {
    const depth = this.stack.depth;
    if (level < 1 || level > depth) return;
    const v = this.stack.snapshot()[level - 1];   // level 1 == last element
    const text = format(v);
    // Append with a leading space separator if the buffer already has
    // content — otherwise the echoed token runs into whatever the user
    // was typing.  If empty, just type the text.
    if (this.entry.buffer.length > 0 &&
        !/\s$/.test(this.entry.buffer)) {
      this.entry.type(' ' + text);
    } else {
      this.entry.type(text);
    }
  }

  /** Cycle the clicked annunciator through its options.  `id` is the
   *  bare id (e.g. 'angle', 'approx') — the Display strips the `ann-`
   *  prefix before dispatching. */
  cycleIndicator(id) {
    switch (id) {
      case 'angle':   cycleAngle();        return;
      case 'approx':  toggleApproxMode();  return;
      case 'complex': toggleComplexMode(); return;
      case 'coord':   cycleCoordMode();    return;
      // Click the base annunciator → cycle HEX → DEC → OCT → BIN →
      // HEX.  The `null` ("per-value stored base") state is still
      // reachable via the CLB op but skipped in the cycle so the
      // annunciator never blinks out mid-click.
      case 'hex': {
        const order = ['h', 'd', 'o', 'b'];
        const i = order.indexOf(calcState.binaryBase);
        setBinaryBase(order[((i < 0 ? -1 : i) + 1) % order.length]);
        return;
      }
      // Clicking the α annunciator runs the same single-click /
      // double-click-to-lock cycle as pressing the α key on the
      // keypad, so the LCD marker is the same affordance as the
      // physical button.
      case 'alpha': this.setShift('alpha'); return;
      case 'display': {
        // STD → FIX 4 → SCI 4 → ENG 4 → STD
        const m = calcState.displayMode;
        const d = calcState.displayDigits;
        if (m === 'STD')            { setDisplay('FIX', 4); return; }
        if (m === 'FIX' && d === 4) { setDisplay('SCI', 4); return; }
        if (m === 'SCI' && d === 4) { setDisplay('ENG', 4); return; }
        setDisplay('STD', 12);
        return;
      }
      // Annunciators without a defined click-cycle action just flash a
      // gentle "no-op" — better than a silent miss on a labelled click.
      default:
        this.entry.flashError({ message: `${id}: nothing to toggle` });
    }
  }

  /** Navigate to the directory at path segment `index` (0 = HOME).
   *  Walks up the appropriate number of levels — we can't use goInto()
   *  because the user may be jumping across multiple segments at once
   *  and we don't have sibling directory names in the path. */
  navigateToPathSegment(index) {
    const path = currentPath();
    if (index < 0 || index >= path.length) return;
    const stepsUp = path.length - 1 - index;
    if (stepsUp <= 0) return;                      // clicked current dir
    if (index === 0) { goHome(); return; }
    for (let i = 0; i < stepsUp; i++) goUp();
  }

  /* ---------------- Interactive stack ----------------
     The HP50 interactive stack is a "browse" mode entered by pressing
     ▲ from an empty command line.  A visual cursor highlights a stack
     level (starting at level 1); ▲ / ▼ move the cursor; ENTER runs the
     HP50 default which is ECHO (decompile the selection into the
     command line).  A soft menu exposes PICK / ROLL / ROLLD / DROP /
     CANCL as alternative verbs.  ◀ / ESC cancel without acting.
     -------------------------------------------------------------- */

  enterInteractiveStack(startLevel = 1) {
    if (this.stack.depth === 0) {
      // Nothing to browse — a silent no-op mirrors HP50.
      return;
    }
    if (this._interactive) return;                 // already active
    // Drop editor focus so Arrow / Enter events flow to the document-
    // level keydown handler (which owns the interactive-stack branch).
    // Without this, CM would eat arrow keys and the selection couldn't
    // move.  _exitInteractiveStack refocuses the editor on echo paths.
    this.entry.blur();
    // Save the outgoing soft menu so we can restore it on exit.  A user
    // who'd opened VARS shouldn't lose it after one interactive-stack
    // round-trip.
    this._interactive = {
      prevMenuAll:  this.menuAll,
      prevMenuPage: this.menuPage,
      prevMenuKind: this.menuKind,
    };
    const initial = Math.max(1, Math.min(startLevel | 0, this.stack.depth));
    this.display.selectedLevel = initial;
    const refresh = () => {
      this.display.selectedLevel = this._interactive
        ? this._interactive.level
        : null;
      this.display.renderStack(this.stack);
    };
    this._interactive.level = initial;
    refresh();

    const cleanup = () => {
      this._interactive = null;
      this.display.selectedLevel = null;
      this.display.renderStack(this.stack);
    };

    const doAndExit = (fn) => () => {
      try { fn(); }
      catch (e) { this.entry.flashError(e); }
      this._exitInteractiveStack();
    };

    const menu = interactiveStackMenu({
      onEcho:   doAndExit(() => {
        this.echoStackLevel(this._interactive.level);
        this.entry.focus();
      }),
      onPick:   doAndExit(() => {
        this.entry._snapForUndo();
        this.stack.pick(this._interactive.level);  // pick mutates + pushes
      }),
      onRoll:   doAndExit(() => {
        this.entry._snapForUndo();
        rollLevel(this.stack, this._interactive.level);
      }),
      onRollD:  doAndExit(() => {
        this.entry._snapForUndo();
        rollDownToLevel(this.stack, this._interactive.level);
      }),
      onDrop:   doAndExit(() => {
        this.entry._snapForUndo();
        dropLevel(this.stack, this._interactive.level);
      }),
      onCancel: () => this._exitInteractiveStack(),
    });
    this.setMenu(menu, 'ISTK');
    // Attach the level-move helper so the arrow-key handler can nudge.
    this._interactive.moveUp   = () => {
      this._interactive.level = levelUp(this._interactive.level, this.stack.depth);
      refresh();
    };
    this._interactive.moveDown = () => {
      this._interactive.level = levelDown(this._interactive.level, this.stack.depth);
      refresh();
    };
    // ENTER in interactive mode = default action (ECHO, per HP50).  Echo
    // is non-destructive — the stack value stays — and returns focus
    // to the editor so the user can continue typing with the echoed
    // text at the cursor.
    this._interactive.defaultAction = doAndExit(() => {
      this.echoStackLevel(this._interactive.level);
      this.entry.focus();
    });
    // Backspace while a level is selected = DROP that level, but stay
    // in browse mode so the user can chain deletions.  After the
    // splice, the entry that used to sit one level deeper now occupies
    // the same level number — the cursor naturally lands on it.
    // clampLevel handles the "deleted the deepest level" case (snap to
    // new depth) and the "stack is now empty" case (level → 0, no
    // highlight).  Only Esc / ◀ / ON exit interactive mode.
    this._interactive.dropAction = () => {
      try {
        this.entry._snapForUndo();
        dropLevel(this.stack, this._interactive.level);
      } catch (e) {
        this.entry.flashError(e);
        return;
      }
      this._interactive.level = clampLevel(this._interactive.level, this.stack.depth);
      refresh();
    };
    // Cleanup hook for _exitInteractiveStack.
    this._interactive._cleanup = cleanup;
  }

  _exitInteractiveStack() {
    if (!this._interactive) return;
    const { prevMenuAll, prevMenuPage, prevMenuKind, _cleanup } = this._interactive;
    _cleanup();
    // Restore the pre-existing menu (or clear if none).
    if (prevMenuAll && prevMenuAll.length) {
      this.menuKind = prevMenuKind;
      this.menuAll  = prevMenuAll;
      this.menuPage = prevMenuPage;
      this._renderMenuPage();
    } else {
      this.clearMenu();
    }
  }

  /* ================================================================
     Stack scrolling
     ================================================================ */

  scrollStackUp() {
    const next = clampStackScroll(this.stackScroll + 1, this.stack.depth);
    if (next === this.stackScroll) return;
    this.stackScroll = next;
    this.display.setStackScroll(next, this.stack);
  }

  scrollStackDown() {
    const next = clampStackScroll(this.stackScroll - 1, this.stack.depth);
    if (next === this.stackScroll) return;
    this.stackScroll = next;
    this.display.setStackScroll(next, this.stack);
  }

  onShiftChange(fn) { this._shiftListeners.add(fn); }

  /** Virtual-button press on a modifier key (shiftL / shiftR / alpha).
   *  Three-state cycle:
   *    null         → one-shot      (single click)
   *    one-shot     → lock          (quick second click — double-click)
   *    one-shot     → null          (slow second click — toggle off)
   *    lock         → null          (any click)
   *    otherShift*  → new one-shot  (switching between L / R / α)
   *  Any other `state` falls back to plain toggle semantics.
   */
  setShift(state) {
    if (state === 'shiftL' || state === 'shiftR' || state === 'alpha') {
      const lockName = state + 'Lock';
      const now = Date.now();
      const DOUBLE_CLICK_MS = 300;
      if (this.shift === lockName) {
        this.shift = null;
      } else if (this.shift === state) {
        const doubleClick =
          (now - this._lastShiftAt) < DOUBLE_CLICK_MS &&
          this._lastShiftKind === state;
        this.shift = doubleClick ? lockName : null;
      } else {
        this.shift = state;
      }
      this._lastShiftAt = now;
      this._lastShiftKind = state;
    } else {
      this.shift = (this.shift === state) ? null : state;
    }
    for (const fn of this._shiftListeners) fn();
  }


  /** Called by keyboard.js when a virtual key is pressed. */
  handleKey(key) {
    switch (key.kind) {
      case 'shiftL': return this.setShift('shiftL');
      case 'shiftR': return this.setShift('shiftR');
      case 'alpha':  return this.setShift('alpha');
    }

    // Alpha typing.  If alpha shift is active and the pressed key has
    // a blue alpha label (keyboard.js assigns A..Z across the first 26
    // physical keys), append that letter to the entry buffer.  Under
    // plain 'alpha' the shift releases after one letter (HP50 default);
    // under 'alphaLock' it stays on until the user presses α again.
    const alphaActive = this.shift === 'alpha' || this.shift === 'alphaLock';
    if (alphaActive && key.alpha) {
      this.entry.type(key.alpha);
      if (this.shift === 'alpha') this.setShift(null);
      return;
    }

    const sL = this.shift === 'shiftL' || this.shift === 'shiftLLock';
    const sR = this.shift === 'shiftR' || this.shift === 'shiftRLock';
    const action =
      sL && key.shiftLAction ? key.shiftLAction :
      sR && key.shiftRAction ? key.shiftRAction :
      key.action;

    // Labeled-but-unimplemented shift: the key shows a label (e.g.
    // 'USER', 'ENTRY') but no handler is wired.  Flash a clear
    // "Not implemented" rather than silently falling through to the
    // unshifted action — the label was a promise the user followed.
    const unimplementedLabel =
      (sL && !key.shiftLAction && key.shiftL) ? key.shiftL :
      (sR && !key.shiftRAction && key.shiftR) ? key.shiftR :
      null;

    if (unimplementedLabel) {
      this.entry.flashError({ message: `Not implemented: ${unimplementedLabel}` });
    } else if (action) {
      action(this.entry, this.shift, this);
    }

    // Auto-clear shift after one action — but NOT for any *Lock state
    // (those persist until the user explicitly cancels them) and not
    // when the user just toggled a shift key itself.
    const locked =
      this.shift === 'alphaLock' ||
      this.shift === 'shiftLLock' ||
      this.shift === 'shiftRLock';
    if (
      this.shift &&
      !locked &&
      !['shiftL','shiftR','alpha'].includes(key.kind)
    ) {
      this.setShift(null);
    }
  }

  pressSoftKey(i) {
    const slot = this.menuSlots[i];
    if (!slot) {
      this.entry.flashError({ message: `F${i + 1} (no menu)` });
      return;
    }
    // Pick the handler matching the current shift; fall back to the
    // unshifted onPress when a shifted handler is not installed.  We
    // read `this.shift` synchronously because handleKey auto-clears
    // shift only AFTER the action returns.
    const sL = this.shift === 'shiftL' || this.shift === 'shiftLLock';
    const sR = this.shift === 'shiftR' || this.shift === 'shiftRLock';
    const handler =
      (sL && slot.onPressL) ? slot.onPressL :
      (sR && slot.onPressR) ? slot.onPressR :
      slot.onPress;
    if (!handler) {
      this.entry.flashError({ message: `F${i + 1} (no menu)` });
      return;
    }
    try { handler(); }
    catch (e) { this.entry.flashError(e); }
  }

  /* ---------------- physical-keyboard shortcuts ----------------
     The physical keyboard is a plain text-input channel: every
     printable character types itself into the command-line buffer,
     exactly like a `<textarea>`.  This means the user can bang out
     `'X^2 + 2*X + 1'` in one go without fighting alpha mode or worrying
     that `+` will execute against a partial buffer.  To run RPN ops,
     they type `+` / `SIN` / `FACTOR` / etc. and press Enter — the
     command-line parser already commits bare-operator tokens and
     op names as ops (see entry.js::enter).  For fluency with the
     virtual calculator, clicking the on-screen buttons still follows
     HP50 semantics (alpha shift, operator-keys-execute, algebraic
     entry rerouting — see keyboard.js).

     Keys with non-text meaning stay special: Enter commits, Backspace
     deletes, Escape cancels, arrow keys drive stack scroll and menu
     paging.  Everything else — letters (either case), digits, `+`,
     `-`, `*`, `/`, `^`, `(`, `)`, `{`, `}`, `[`, `]`, `,`, `=`, `'`,
     `<`, `>`, `_`, etc. — goes straight into the buffer via e.key.
  ---------------------------------------------------------------- */
  _installKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ignore if user is typing into a real <input>/<textarea>
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // If CodeMirror (or one of its keybindings) already claimed this
      // event, don't double-handle.  CM's bindings call preventDefault on
      // consumed keys — Enter / Escape / arrows-with-content / every
      // printable char when the editor has focus — so the document-level
      // handler below only fires for keys CM declined or for events
      // dispatched while the editor isn't focused.
      if (e.defaultPrevented) return;

      const focused = this.entry.hasFocus();

      // Modifier combos (Ctrl/Cmd/Alt) split by focus:
      //   focused  → CM and the browser own them (text-editor semantics —
      //              Cmd-Z undoes buffer edits via CM's history, Cmd-V
      //              pastes through the native paste event).  We stay out.
      //   unfocused → calc semantics — Cmd-Z ≡ stack UNDO, Cmd-V ≡ type
      //              clipboard, Cmd-Y ≡ REDO.  handleModifierShortcut
      //              covers those.
      // Any remaining modifier combo (Cmd-T, Cmd-R, …) falls through to
      // the browser unchanged.
      if (!focused && handleModifierShortcut(e, this.entry)) return e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Interactive-stack override: while the browse-cursor is active,
      // arrow keys move the selection and ENTER echoes the selection.
      // ESC / ◀ cancel.  Everything else (digits, letters, …) exits
      // interactive mode first so the user can just start typing.
      if (this._interactive) {
        switch (e.key) {
          case 'ArrowUp':    this._interactive.moveUp();    return e.preventDefault();
          case 'ArrowDown':  this._interactive.moveDown();  return e.preventDefault();
          case 'Enter':      this._interactive.defaultAction(); return e.preventDefault();
          case 'Backspace':  this._interactive.dropAction(); return e.preventDefault();
          case 'Escape':
          case 'ArrowLeft':  this._exitInteractiveStack();  return e.preventDefault();
          default:           this._exitInteractiveStack();  // fall through
        }
      }

      // F-keys bypass the focus dance.  F1..F6 press soft-menu slots;
      // F7..F12 we don't claim (reload / devtools / OS shortcuts live
      // there).  None of them engage the editor.
      switch (e.key) {
        case 'F1': this.pressSoftKey(0); return e.preventDefault();
        case 'F2': this.pressSoftKey(1); return e.preventDefault();
        case 'F3': this.pressSoftKey(2); return e.preventDefault();
        case 'F4': this.pressSoftKey(3); return e.preventDefault();
        case 'F5': this.pressSoftKey(4); return e.preventDefault();
        case 'F6': this.pressSoftKey(5); return e.preventDefault();
        case 'F7': case 'F8': case 'F9':
        case 'F10': case 'F11': case 'F12':
          return;
      }

      // Keys whose meaning depends on focus and that should stay OUT
      // of the editor when it isn't already focused — handled before
      // the auto-focus grab so pressing them never pulls focus.  When
      // the editor IS focused, CM owns these (Backspace →
      // deleteCharBackward, Tab → appKeys 2-space insert) and the
      // document handler never sees them thanks to defaultPrevented.
      if (!focused) {
        switch (e.key) {
          case 'Backspace':
            // Classic calc DROP — pop the top of stack.  Same undo
            // snapshot Entry.backspace takes on an empty buffer; we
            // skip Entry.backspace itself so a stale non-empty buffer
            // doesn't get delete-char'd (the user asked for DROP, not
            // edit, when the editor isn't active).
            this.entry._snapForUndo();
            try { this.stack.drop(); } catch (err) { this.entry.flashError(err); }
            return e.preventDefault();
          case 'Tab':
            // Let the browser perform its default focus navigation.
            return;
          case 'Escape':
            // Esc is a dismiss gesture, not an "engage editor" one —
            // stay out of the editor when it isn't already active.
            return;
        }
      }

      // Any other non-modifier keypress pulls focus into the editor.
      // The event has already left the editor's DOM path by the time we
      // handle it here, so focusing doesn't re-dispatch the keystroke —
      // we still have to perform the action ourselves via the switch
      // below (type / commitEntry / cursor moves / …).
      if (!focused) this.entry.focus();

      // Named non-text keys handled first.
      switch (e.key) {
        case 'Enter':
          if (e.shiftKey) this.entry.type('\n');
          else this.commitEntry();
          return e.preventDefault();
        case 'Escape':     this.cancelEntry();            return e.preventDefault();
        case 'ArrowUp':
          // When the editor is active, ▲ only moves the cursor within
          // the buffer (multi-line-aware).  It never scrolls the stack
          // or enters the interactive-stack browser — user asked for
          // the editor to own up/down as long as any text is typed.
          if (this.entry.buffer.length === 0) this.enterInteractiveStack();
          else this.entry.cursorUp();
          return e.preventDefault();
        case 'ArrowDown':
          if (this.entry.buffer.length === 0 && this.stack.depth >= 1) this.editLevel1();
          else if (this.entry.buffer.length > 0) this.entry.cursorDown();
          return e.preventDefault();
        case 'ArrowLeft':
          if (this.entry.buffer.length > 0) this.entry.cursorLeft();
          else this.prevMenuPage();
          return e.preventDefault();
        case 'ArrowRight':
          if (this.entry.buffer.length > 0) this.entry.cursorRight();
          else if (this.stack.depth >= 2) this.swapTop();
          else this.nextMenuPage();
          return e.preventDefault();
        case 'Home':
          if (this.entry.buffer.length > 0) this.entry.cursorHome();
          return e.preventDefault();
        case 'End':
          if (this.entry.buffer.length > 0) this.entry.cursorEnd();
          return e.preventDefault();
      }

      // Any single printable character (including Shift-produced
      // symbols like !@#$%^&*() and punctuation) goes straight into
      // the buffer.  e.key is already post-shift — Shift+9 arrives
      // as '(' on US layouts, so no case-fiddling needed.
      if (e.key.length === 1) {
        this.entry.type(e.key);
        return e.preventDefault();
      }
    });
  }
}

/* ------------------------------------------------------------------
   CST soft-menu helpers — extract a display label and the underlying
   RPL value to push when the slot is pressed.  Tagged wrappers are
   opened (we show the tag, push the wrapped value); raw names/strings
   are shown verbatim; anything else falls through to the formatter so
   the label at least identifies the item.
   ------------------------------------------------------------------ */
function customMenuLabel(item) {
  if (isTagged(item)) return item.tag || format(item.value);
  if (isName(item))   return item.id;
  if (isString(item)) return item.value;
  return format(item);
}

function customMenuTarget(item) {
  if (isTagged(item)) return [item.value, item.tag];
  return [item, null];
}

window.__hp50 = new App();

/** Wipe all persisted settings and reload the page.  Covers every
 *  localStorage key the app writes: calculator state, side-panel
 *  layout, chrome mode, AI model choice, remote endpoint config,
 *  consent flags, etc.  Exposed as a global so users can run it from
 *  the DevTools console (the previous double-click-version shortcut
 *  has been repurposed to open DevTools itself). */
window.calc_reset = function calc_reset() {
  const KEYS = [
    'hp50.state',
    'hp50.ui.sidePanel',
    'hp50.ui.chrome',
    'rpl5050.chatbot.modelId',
    'rpl5050.chatbot.consented.v1',
    'rpl5050.chatbot.migrated.dropPremium.v1',
    'rpl5050.chatbot.remote',
  ];
  try { for (const k of KEYS) localStorage.removeItem(k); }
  catch { /* private / storage-blocked — proceed to reload anyway */ }
  location.reload();
};

/* ------------------------------------------------------------------
   Kick off the Giac CAS in the background.  Cold init is ~150 ms
   (loads /src/vendor/giac/giacwasm.js + giacwasm.wasm and cwraps the
   caseval bridge).  Fire-and-forget: the UI stays responsive while
   the WASM fetches, and any CAS-routed op (FACTOR on Symbolic, and
   the EXPAND/DERIV/INTEG/SOLVE migrations to come) that runs before
   `giac.isReady()` flips true throws "CAS not ready" per the
   no-fallback policy — user just presses the op again once init
   completes.  A visible init error is swallowed to the console for
   now; a future UI polish pass can annunciate readiness on-screen.
   ------------------------------------------------------------------ */
giac.init().catch((e) => {
  console.error('[giac] init failed:', e);
});
