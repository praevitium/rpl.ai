/* =================================================================
   Render the stack and command line onto the LCD DOM nodes.
   ================================================================= */

import { format, formatStackTop, DEFAULT_DISPLAY } from '../rpl/formatter.js';
import { astToSvg } from '../rpl/pretty.js';
import { isSymbolic, isMatrix, isVector, isList } from '../rpl/types.js';
import { state as calcState } from '../rpl/state.js';

/** Escape the four characters that bite when interpolating plain text
 *  into HTML.  The formatter never emits raw markup, but the cell /
 *  list / path renderers route every formatted value through this so a
 *  future change can't leak a `<` or `&` into the LCD DOM. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Normalize a soft-menu label array to exactly six slots: truncate any
 *  past the sixth, pad short arrays with ''.  HP50 menu rows always have
 *  six slots, so setMenu renders a fixed grid regardless of how many
 *  labels the caller supplies.  Returns a fresh array (the input is left
 *  untouched). */
export function normalizeMenuSlots(slots) {
  const out = slots.slice(0, 6);
  while (out.length < 6) out.push('');
  return out;
}

/** Map a BinaryInteger display-base key (h/d/o/b) to its annunciator
 *  label.  Returns undefined for any unknown / cleared key, which the
 *  caller treats as "hide the annunciator". */
export function binaryBaseLabel(base) {
  return { h: 'HEX', d: 'DEC', o: 'OCT', b: 'BIN' }[base];
}

/** Build the number-display-mode annunciator label: 'STD' (the bare
 *  mode, ignoring digits) or `<MODE> <digits>` for FIX / SCI / ENG.  A
 *  falsy mode defaults to STD; the mode is upper-cased. */
export function displayModeLabel(mode, digits) {
  const m = String(mode || 'STD').toUpperCase();
  return m === 'STD' ? 'STD' : `${m} ${digits}`;
}

/** Map a coordinate mode (RECT/CYLIN/SPHERE) to its display glyph,
 *  defaulting to the rectangular 'XYZ' for any unknown mode. */
export function coordModeGlyph(mode) {
  return { RECT: 'XYZ', CYLIN: 'R∠Z', SPHERE: 'R∠∠' }[mode] || 'XYZ';
}

export class Display {
  constructor({ stackView, cmdline, statusLine, menuBar }) {
    this.stackView  = stackView;
    this.cmdline    = cmdline;
    this.statusLine = statusLine;
    this.menuBar    = menuBar;
    this.displayOpts = { ...DEFAULT_DISPLAY };
    this.menuSlots = ['', '', '', '', '', ''];
    // How many rows to push the bottom of the visible window up past
    // level 1.  0 = level 1 is the bottom row (default HP50 view).
    // The App layer owns the clamp; renderStack just uses whatever
    // offset is passed in.
    this.stackScroll = 0;
    // Interactive stack visual cursor.  null means no level is
    // selected (normal rendering); otherwise the 1-based level is
    // highlighted with `.stack-row.selected`.
    this.selectedLevel = null;
    // Optional click/hover callbacks injected by App.  Left null by
    // default so the Display stays standalone for tests.
    this.onStackRowClick    = null;
    this.onIndicatorClick   = null;
    this.onPathSegmentClick = null;
    this._installInteractiveHandlers();
  }

  /* -------- interactive display event wiring --------
     The Display owns the DOM for the LCD and is the cheapest place
     to attach click / hover listeners.  We use event delegation so
     the handlers survive re-renders of stack rows and annunciators.
     The App layer plugs in its own `onStackRowClick` / etc. callbacks
     after construction; when a callback is null the DOM event is a
     no-op (the CSS cursor hint also drops off — see calc.css). */
  _installInteractiveHandlers() {
    if (!this.stackView || typeof this.stackView.addEventListener !== 'function') {
      return;                                   // non-DOM test harness
    }
    this.stackView.addEventListener('click', (ev) => {
      if (!this.onStackRowClick) return;
      const row = ev.target.closest?.('.stack-row');
      if (!row || !row.dataset.level) return;
      const level = Number(row.dataset.level);
      if (Number.isFinite(level)) this.onStackRowClick(level);
    });
    this.stackView.addEventListener('mouseover', (ev) => {
      const row = ev.target.closest?.('.stack-row');
      if (!row || !row.dataset.level) return;
      row.classList.add('hover');
    });
    this.stackView.addEventListener('mouseout', (ev) => {
      const row = ev.target.closest?.('.stack-row');
      if (!row) return;
      row.classList.remove('hover');
    });

    if (this.statusLine && typeof this.statusLine.addEventListener === 'function') {
      this.statusLine.addEventListener('click', (ev) => {
        const seg = ev.target.closest?.('.path-segment');
        if (seg && seg.dataset.index != null && this.onPathSegmentClick) {
          this.onPathSegmentClick(Number(seg.dataset.index));
          return;
        }
        const ann = ev.target.closest?.('.annunciator');
        if (ann && ann.id && this.onIndicatorClick) {
          // Annunciator IDs are 'ann-angle', 'ann-approx', 'ann-mode', etc.
          // Swallow #ann-mode clicks that missed a .path-segment — the
          // user clicked the braces or whitespace.  Those aren't
          // interactive; only the named segments are.
          if (ann.id === 'ann-mode') return;
          const id = ann.id.replace(/^ann-/, '');
          this.onIndicatorClick(id);
        }
      });
    }
  }

  renderStack(stack) {
    const snap = stack.snapshot();                 // [level1, level2, ...]
    // LCD renders level N at top, level 1 at bottom.  We reverse so the
    // DOM order is [levelN, ..., level1].  Higher levels that don't
    // fit in the LCD are clipped at the top by CSS (the flex column is
    // justify-content: flex-end, overflow: hidden — so the newest items
    // (levels 1..M) stay visible while older items scroll off-top).
    //
    // "Scrolling up" in this LCD means exposing the *higher* levels
    // that are clipped off the top.  The container is flex-end + hidden,
    // so the bottommost DOM child is what stays visible.  To shift the
    // whole window up by N rows, we append N empty spacer rows *after*
    // the real rows — those spacers anchor to the bottom and push the
    // real content upward, which drops higher levels into view at the
    // top and drops lower levels out at the bottom.
    const rows = snap.slice().reverse();
    const svgSize = parseFloat(getComputedStyle(this.stackView).fontSize);
    this.stackView.innerHTML = '';
    rows.forEach((val, i) => {
      const level = rows.length - i;
      const row = document.createElement('div');
      row.className = 'stack-row';
      // data-level lets the click delegate read the level without
      // a DOM walk, and anchors CSS :hover and .selected styling.
      row.dataset.level = String(level);
      if (this.selectedLevel === level) row.classList.add('selected');
      row.title = `Stack level ${level} — click to copy to the command line`;
      // `.value` is a flex container that right-aligns its inner
      // `.value-text` span.  The inner span owns overflow / ellipsis,
      // so short values hug the right edge (HP50-style) AND long
      // values truncate with `…` rather than spilling past the LCD.
      row.innerHTML = `
        <span class="level">${level}:</span>
        <span class="value"><span class="value-text"></span></span>
      `;
      // formatStackTop forces HP50-style tick rendering on bare Names —
      // on the stack an identifier is always a name literal, so `X`
      // displays as `'X'` regardless of how it was pushed.  `format`
      // (no stack context) is still used from inside the formatter
      // for nested program / list / vector / matrix / tagged cells.
      //
      // Textbook mode: when calcState.textbookMode is on AND the
      // value is a Symbolic, swap the flat-text rendering for the
      // SVG pretty-print from src/rpl/pretty.js.  Everything else
      // (Real, Integer, BinInt, Complex, List, …) keeps flat text —
      // textbook only affects algebraic expressions.
      const cell = row.querySelector('.value');
      const inner = row.querySelector('.value-text');
      // Sync the display options from global state before each format
      // call so STD / FIX n / SCI n / ENG n ops take visible effect
      // immediately.  (The state fields are the source of truth; the
      // local `displayOpts` is a convenience buffer.)
      this.displayOpts.mode   = calcState.displayMode   || 'STD';
      this.displayOpts.digits = calcState.displayDigits ?? 12;
      if (calcState.textbookMode && isSymbolic(val)) {
        const { svg } = astToSvg(val.expr, { size: svgSize });
        inner.innerHTML = svg;
        cell.classList.add('textbook');
      } else if (calcState.textbookMode && isList(val)) {
        inner.innerHTML = this._renderTextbookList(val, svgSize);
        cell.classList.add('textbook');
      } else if (calcState.textbookMode && (isMatrix(val) || isVector(val))) {
        // Textbook 2D matrix/vector: lay rows out as a CSS grid of
        // monospace cells with bracket pseudo-elements drawn either
        // side.  Vectors render as a single-row matrix so they pick up
        // the same bracket styling.  Cell text comes from the regular
        // formatter so EXACT/APPROX, FIX/SCI/ENG, complex polar form,
        // etc. all keep working — only the layout changes.
        inner.innerHTML = this._renderTextbookGrid(val);
        cell.classList.add('textbook');
      } else {
        inner.textContent = formatStackTop(val, this.displayOpts);
        cell.classList.remove('textbook');
      }
      this.stackView.appendChild(row);
    });
    for (let k = 0; k < this.stackScroll; k++) {
      const pad = document.createElement('div');
      pad.className = 'stack-row scroll-pad';
      pad.innerHTML = '<span class="level">&nbsp;</span><span class="value">&nbsp;</span>';
      this.stackView.appendChild(pad);
    }
    // Annunciator hint: show a small "↕" indicator when scrolled so the
    // user knows they're not looking at level 1 at the bottom.  Done via
    // a data attribute the CSS can style without forcing a reflow here.
    this.stackView.dataset.scrolled = this.stackScroll > 0 ? '1' : '0';
  }

  /** Set the scroll offset and re-render with the given stack snapshot.
   *  Does NOT clamp — callers own clamping (see clampStackScroll). */
  setStackScroll(offset, stack) {
    this.stackScroll = offset;
    if (stack) this.renderStack(stack);
  }

  /** Render a Matrix or Vector as a 2D HTML grid for textbook mode.
   *  Each cell goes through the regular formatter so display-mode
   *  knobs (FIX/SCI/ENG, EXACT/APPROX, polar/rect, …) still apply —
   *  only the wrapping layout changes here.  The outer .matrix-grid
   *  div carries left/right square-bracket pseudo-elements via CSS
   *  (calc.css) so the brackets scale with the cell-grid height
   *  without us measuring fonts at runtime.
   *
   *  Vectors fold into a single-row matrix so they share the same
   *  bracket / spacing styling and the same "pretty matrix" code
   *  path — saves a parallel renderer.
   *
   *  Empty matrix / empty vector still produce a `[]` pair (an empty
   *  inner grid) so the user sees something rather than a phantom
   *  blank cell. */
  _renderTextbookGrid(val) {
    // Three input shapes land here in textbook mode:
    //   - Matrix         → use val.rows directly.
    //   - Vector whose
    //     items are all
    //     same-length
    //     Vectors        → treat as a Matrix laid out by inner rows.
    //                      Parser produces this when the user types
    //                      `[[1 2 3][4 5 6]]` because parseVector is
    //                      structural-only and never promotes nested
    //                      Vectors to a Matrix.  Without this branch
    //                      the outer Vector renders as a single row
    //                      containing three `[ … ]` cells, defeating
    //                      the 2D layout the user expects.
    //   - Vector of
    //     scalars        → single-row matrix.  (No change.)
    let rows;
    if (isMatrix(val)) {
      rows = val.rows.map(r => r.slice());
    } else if (
      isVector(val) &&
      val.items.length > 0 &&
      val.items.every(it => isVector(it)) &&
      val.items.every(it => it.items.length === val.items[0].items.length)
    ) {
      rows = val.items.map(v => v.items.slice());
    } else {
      rows = [val.items.slice()];
    }
    const ncols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const cells = rows.map(r => {
      // Pad short rows with empty cells so a ragged input still lays
      // out as a rectangle (defensive: the type constructors pin all
      // rows to the same length, but Matrix(rows)'s inner-array shape
      // isn't enforced at the boundary).
      const padded = r.concat(Array(Math.max(0, ncols - r.length)).fill(null));
      return padded.map(cell => {
        if (cell === null) return '<span class="mcell"></span>';
        // Symbolic cells get the same SVG pretty-print as top-level
        // symbolics; everything else stays as formatted plain text.
        if (isSymbolic(cell)) {
          const { svg } = astToSvg(cell.expr, { size: 18 });
          return `<span class="mcell mcell-sym">${svg}</span>`;
        }
        const text = format(cell, this.displayOpts);
        return `<span class="mcell">${escapeHtml(text)}</span>`;
      }).join('');
    });
    const cls = isMatrix(val) ? 'matrix-grid' : 'matrix-grid vector-grid';
    const cols = Math.max(1, ncols);
    return (
      `<span class="${cls}" style="--mcols:${cols}">` +
      cells.join('') +
      `</span>`
    );
  }

  /** Render a List in textbook mode.
   *
   *  Produces:  { <item>  <item>  … }
   *
   *  Each item that is a Symbolic gets the full SVG pretty-print;
   *  everything else uses the regular formatter so numbers, names,
   *  nested lists, etc. all display correctly. */
  _renderTextbookList(val, svgSize = 22) {
    const items = val.items.map(item => {
      if (isSymbolic(item)) {
        const { svg } = astToSvg(item.expr, { size: svgSize });
        return `<span class="lcell lcell-sym">${svg}</span>`;
      }
      const text = format(item, this.displayOpts);
      return `<span class="lcell">${escapeHtml(text)}</span>`;
    });
    const inner = items.join('<span class="lsep"> </span>');
    return `<span class="list-inline">{ ${inner} }</span>`;
  }

  /** Render the command line.
   *
   *  CodeMirror (attached via Entry.attach) owns the editing surface
   *  inside `this.cmdline`, so our job here is limited to:
   *   - showing a transient error banner (replaces the editor visually
   *     via a child element we toggle on/off)
   *   - toggling an `empty` class so CSS can style the placeholder state
   *  The cursor and text rendering are no longer ours — CM draws them. */
  renderCmdline(entry) {
    const { buffer, error, notice } = entry;
    // Lazily carve out an error node that overlays the editor.  Living
    // inside #cmdline as a sibling to the CM root keeps the layout
    // cue (same box) while letting CM's DOM stay unmutated.
    if (!this._errNode) {
      this._errNode = document.createElement('div');
      this._errNode.className = 'cmdline-error';
      this.cmdline.appendChild(this._errNode);
    }
    if (!this._noticeNode) {
      this._noticeNode = document.createElement('div');
      this._noticeNode.className = 'cmdline-notice';
      this.cmdline.appendChild(this._noticeNode);
    }
    if (error) {
      this._errNode.textContent = error;
      this._errNode.hidden = false;
      this._noticeNode.hidden = true;
      this.cmdline.classList.remove('empty');
      return;
    }
    this._errNode.hidden = true;
    if (notice) {
      this._noticeNode.textContent = notice;
      this._noticeNode.hidden = false;
      this.cmdline.classList.remove('empty');
      return;
    }
    this._noticeNode.hidden = true;
    this.cmdline.classList.toggle('empty', buffer.length === 0);
  }

  setMenu(slots) {
    this.menuSlots = normalizeMenuSlots(slots);
    if (!this.menuBar) return;     // on-screen menu bar is optional
    this.menuBar.innerHTML = '';
    this.menuSlots.forEach(label => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.textContent = label || '';
      this.menuBar.appendChild(d);
    });
  }

  setAnnunciator(id, on) {
    const el = this.statusLine.querySelector(`#ann-${id}`);
    if (!el) return;
    el.classList.toggle('on', !!on);
    // Attach a helpful tooltip on first use.  The map below keeps
    // copy in one place so every annunciator has a short hint the
    // user sees on hover (and the App layer can still click to act).
    if (!el.title) {
      const hints = {
        alpha: 'α — alpha (letter) typing mode; click to cycle off → α → α-lock → off',
        halt: 'HALT — program execution paused',
        hex:  'HEX — binary display base',
        xyz:  'XYZ — rectangular coordinate mode',
        r:    'R — polar / cylindrical mode',
      };
      if (hints[id]) el.title = hints[id];
    }
  }

  /** Update the angle-mode annunciator (DEG/RAD/GRD).  The annunciator
   *  stays visible — HP50 always shows the active angle mode.
   *  Tooltip advertises the click-to-cycle behavior. */
  setAngleMode(mode) {
    const el = this.statusLine.querySelector('#ann-angle');
    if (!el) return;
    el.textContent = mode;
    el.classList.add('on');
    el.title = `Angle mode: ${mode} — click to cycle RAD → DEG → GRD`;
  }

  /** Update the EXACT/APPROX annunciator.  HP50 flag -105: when CLEAR
   *  ("EXACT") the calculator keeps symbolic results symbolic and shows
   *  an `=` glyph; when SET ("APPROX") results fold to decimals and the
   *  annunciator flips to `~`.  Always lit — the user should be able
   *  to glance at the LCD and tell which mode they're in without
   *  opening the MODES menu.  The annunciator disambiguates the `=`
   *  glyph on the keypad so users don't confuse it with EXACT when
   *  the calculator is booting in APPROX. */
  setApproxAnnunciator(approx) {
    const el = this.statusLine?.querySelector('#ann-approx');
    if (!el) return;
    el.textContent = approx ? '~' : '=';
    el.classList.add('on');
    el.title = approx
      ? 'APPROX mode (flag -105 set) — click to switch to EXACT'
      : 'EXACT mode (flag -105 clear) — click to switch to APPROX';
  }

  /** Update the Real/Complex annunciator.  HP50 flag -103: when CLEAR
   *  ("Real") SOLVE returns real roots only and domain-violating
   *  transcendental ops throw; the annunciator shows `ℝ`.  When SET
   *  ("Complex") SOLVE also searches for complex roots and those ops
   *  return their principal-branch Complex result; the annunciator
   *  flips to `i`.  Always lit so the mode is visible at a glance,
   *  mirroring the EXACT/APPROX annunciator. */
  setComplexAnnunciator(on) {
    const el = this.statusLine?.querySelector('#ann-complex');
    if (!el) return;
    el.textContent = on ? 'i' : 'ℝ';
    el.classList.add('on');
    el.title = on
      ? 'Complex mode (flag -103 set) — SOLVE finds complex roots; click to switch to Real'
      : 'Real mode (flag -103 clear) — SOLVE finds real roots only; click to switch to Complex';
  }

  /** Show the current BinaryInteger display-base override as a short
   *  label (HEX / DEC / OCT / BIN) in the status line.  When the
   *  override is cleared (`null`) the annunciator hides — BinInts
   *  then render in their own stored base, matching HP50 behaviour
   *  where this annunciator only lights up when a mode is actively
   *  forcing a base.  Reach the modes by typing HEX / DEC / OCT /
   *  BIN (or via the Commands side-panel).  Reuses the `#ann-hex`
   *  slot for DOM stability. */
  setBinaryBaseAnnunciator(base) {
    const el = this.statusLine?.querySelector('#ann-hex');
    if (!el) return;
    const label = binaryBaseLabel(base);
    if (!label) {
      el.textContent = '';
      el.classList.remove('on');
      el.removeAttribute('title');
      return;
    }
    el.textContent = label;
    el.classList.add('on');
    el.title = `${label} — BinaryInteger display base (click to cycle)`;
  }

  /** Update the number-display mode annunciator: STD / FIX n / SCI n /
   *  ENG n.  Always lit — the user should see at a glance which mode
   *  is active (matches HP50's persistent indicator).  Reuses the
   *  `#ann-display` slot. */
  setDisplayAnnunciator(mode, digits) {
    const el = this.statusLine?.querySelector('#ann-display');
    if (!el) return;
    const label = displayModeLabel(mode, digits);
    el.textContent = label;
    el.classList.add('on');
    el.title = `Number display mode: ${label}`;
  }

  /** Show the current coordinate mode (XYZ / R∠Z / R∠∠) for complex /
   *  vector display.  Always lit — the user should see at a glance
   *  whether (1,1) renders as `(1, 1)` or `(SQRT(2), PI/4)`.  Occupies
   *  the slot directly after the angle annunciator (`#ann-coord`). */
  setCoordMode(mode) {
    const el = this.statusLine?.querySelector('#ann-coord');
    if (!el) return;
    el.textContent = coordModeGlyph(mode);
    el.classList.add('on');
    el.title = `Coord mode: ${el.textContent} — click to cycle RECT → CYLIN → SPHERE`;
  }

  /** Update the directory-path annunciator — `{ HOME }` at startup;
   *  `{ HOME A }` once subdirs land.  Accepts an array of segments.
   *
   *  Each segment is wrapped in a clickable
   *  `<span class="path-segment" data-index="N" title="…">NAME</span>`
   *  so the user can jump straight back to an ancestor directory by
   *  clicking on its name in the path annunciator.  The App layer wires
   *  onPathSegmentClick to navigate there.  Non-segment glyphs — the
   *  `{` / `}` braces and the inter-segment spaces — stay as plain
   *  text so they're not clickable. */
  setPath(segments) {
    const el = this.statusLine.querySelector('#ann-mode');
    if (!el) return;
    const segs = Array.isArray(segments) && segments.length ? segments : ['HOME'];
    // Wrap the whole path in a single .path-inner so the outer #ann-mode
    // can truncate-from-the-left via `direction: rtl` + overflow: hidden
    // without reversing the order of the inner click-targets.  .path-inner
    // forces `direction: ltr` so the segments render in order.
    const parts = ['<span class="path-inner">{ '];
    segs.forEach((name, i) => {
      if (i > 0) parts.push(' ');
      const hint = i === segs.length - 1
        ? `Current directory: ${name}`
        : `Navigate up to ${name}`;
      const esc = escapeHtml(name);
      parts.push(
        `<span class="path-segment" data-index="${i}" title="${hint}">${esc}</span>`
      );
    });
    parts.push(' }</span>');
    el.innerHTML = parts.join('');
    // Deliberately do NOT set a title on #ann-mode itself — only the
    // inner .path-segment spans should be interactive.  Giving the outer
    // annunciator a title would (a) trigger the .annunciator[title]:hover
    // highlight across the whole `{ HOME … }` area including the braces,
    // and (b) suggest the braces themselves are clickable.  Only the
    // segment names get the pointer cursor and the hover pill.
  }
}
