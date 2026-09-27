/* Pretty-print (textbook-mode 2D rendering) of algebra AST nodes.

   String-producing only — never touches the DOM.  We use a fixed
   advance-width model tuned for a monospace font so layout is
   reproducible in Node (for tests) and in the browser.

   Everything is a Box:
     {
       width:   px  (horizontal advance — always positive)
       ascent:  px  (distance from the drawing baseline to the top)
       descent: px  (distance from baseline to the bottom)
       draw(x, baselineY): SVG fragment string
     }
   When boxes are placed in a row, their baselines align; the row's
   ascent/descent are the max of the children's. */

import { isNum, isVar, isNeg, isBin, isFn } from './algebra.js';

// Monospace-ish stack — matches the LCD font in css/calc.css.  Font
// family names that contain spaces are wrapped in SINGLE quotes so
// the whole stack can live inside a double-quoted SVG attribute
// without needing entity-escaping.
const FONT_STACK = "'IBM Plex Mono', 'RPL Symbols', 'IBM Plex Sans', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const DEFAULT_SIZE = 24;

// Font-metric approximations.  A 24px monospace glyph is ~14.4px wide
// (≈0.6em) with ascent ≈0.8em and descent ≈0.2em.  These are close
// enough for visible layout; the browser will kern real glyphs but we
// size the bounding box from these ratios.
const CHAR_W  = 0.6;
const ASCENT  = 0.8;
const DESCENT = 0.2;

// Fraction styling.
const FRAC_GAP    = 0.10;   // vertical gap between bar and num/den (× fontSize)
const FRAC_BAR_H  = 1/24;   // bar thickness as fraction of fontSize (≥1px)
const FRAC_HPAD   = 0.15;   // small horizontal pad on each side of fraction box

// Superscript styling.
const SUP_SCALE   = 0.70;   // exponent font size relative to base
const SUP_RISE    = 0.45;   // how much exponent baseline rises (× base ascent)

// Paren styling.
const PAREN_W_R   = 0.28;   // paren half-width as fraction of content height

// Radical (√) styling.  The hook is the √ check-mark on the left; the
// vinculum is the horizontal bar over the radicand.
const RAD_HOOK_W    = 0.55;   // hook width as fraction of fontSize
const RAD_GAP_TOP   = 0.12;   // vertical gap between top of radicand and vinculum
const RAD_OVERHANG  = 0.12;   // right-side vinculum overhang past radicand
const RAD_BAR_H     = 1/24;   // vinculum thickness as fraction of fontSize (≥1px)
const RAD_DIP_FRAC  = 0.35;   // hook tip dips this far below the baseline
                              // (fraction of total radical height)

const XML_ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s) { return String(s).replace(/[&<>"]/g, c => XML_ENT[c]); }

/** Plain text glyph block.  Returns a Box whose width is proportional
 *  to string length × CHAR_W × size, and whose ascent/descent follow
 *  the canonical monospace metrics.  Emits one `<text>` element. */
function textBox(s, size = DEFAULT_SIZE) {
  return {
    width:  s.length * CHAR_W * size,
    ascent: ASCENT * size,
    descent: DESCENT * size,
    draw(x, by) {
      return `<text x="${fmt(x)}" y="${fmt(by)}" font-family="${FONT_STACK}" ` +
        `font-size="${size}">${esc(s)}</text>`;
    },
  };
}

/** Blank horizontal spacer — occupies `w` user units of width, draws
 *  nothing.  Used by opSepBox to give `+`, `-`, `=` a small breathing
 *  gap without the full-character-width padding of `textBox(' ${op} ')`. */
function gapBox(w) {
  return {
    width: Math.max(0, w),
    ascent: 0,
    descent: 0,
    draw(_x, _by) { return ''; },
  };
}

/** Operator separator box — tighter spacing than `textBox(\` ${op} \`)`.
 *  Each side gets ~0.3 char-width padding instead of a full space, so
 *  `X+1` in pretty-print doesn't get three whole character widths of
 *  gap.  */
function opSepBox(op, size = DEFAULT_SIZE) {
  const pad = CHAR_W * size * 0.3;
  const inner = textBox(op, size);
  return rowBox([gapBox(pad), inner, gapBox(pad)]);
}

/** Horizontal concatenation.  Baselines align; width is the sum of
 *  child widths; ascent/descent are the max of children so the row
 *  bounding box covers the tallest child above the line and below. */
function rowBox(children) {
  const ascent  = Math.max(0, ...children.map(c => c.ascent));
  const descent = Math.max(0, ...children.map(c => c.descent));
  const width   = children.reduce((w, c) => w + c.width, 0);
  return {
    width, ascent, descent,
    draw(x, by) {
      let out = ''; let cx = x;
      for (const c of children) {
        out += c.draw(cx, by);
        cx += c.width;
      }
      return out;
    },
  };
}

/** Stacked fraction.  The drawing baseline sits at the bar; numerator
 *  hangs above with a small gap; denominator below with the same gap.
 *  Width is the max of num/den plus a small horizontal pad so the bar
 *  overshoots the content slightly — the classic textbook look. */
function fracBox(num, den, size = DEFAULT_SIZE) {
  const gap  = FRAC_GAP * size;
  const barH = Math.max(1, FRAC_BAR_H * size);
  const hpad = FRAC_HPAD * size;
  const inner = Math.max(num.width, den.width);
  const width = inner + 2 * hpad;
  // ascent covers numerator's full height + gap + half the bar
  const ascent  = num.ascent + num.descent + gap + barH / 2;
  const descent = den.ascent + den.descent + gap + barH / 2;
  return {
    width, ascent, descent,
    draw(x, by) {
      // Centre num and den inside the box width.
      const nx = x + (width - num.width) / 2;
      const dx = x + (width - den.width) / 2;
      // num baseline: the bottom of the numerator sits (gap + barH/2) above `by`.
      // bottom-of-num = baseline + num.descent, so we want:
      //   baseline + num.descent  ==  by - gap - barH/2
      //   baseline = by - gap - barH/2 - num.descent
      const nby = by - gap - barH / 2 - num.descent;
      const dby = by + gap + barH / 2 + den.ascent;
      const barY = by;
      return (
        num.draw(nx, nby) +
        den.draw(dx, dby) +
        `<line x1="${fmt(x + hpad * 0.2)}" y1="${fmt(barY)}" ` +
        `x2="${fmt(x + width - hpad * 0.2)}" y2="${fmt(barY)}" ` +
        `stroke="currentColor" stroke-width="${fmt(barH)}"/>`
      );
    },
  };
}

/** base^exp  —  base drawn at normal size, exp at SUP_SCALE and raised so
 *  it sits cleanly above the base.  For a normal exp ("2"), the rise is
 *  SUP_RISE × base.ascent — the typographic default that overlaps the top
 *  of the base.  For a tall exp (a stacked fraction in X^(1/2)), that rise
 *  isn't enough — the fraction's descent dips below the base's baseline
 *  and visually crashes into the base.  We bump the rise so the exp's
 *  bottom stays above the base baseline by a small clearance. */
function supBox(base, exp) {
  const minRise = SUP_RISE * base.ascent;
  const clearance = 0.05 * base.ascent;
  const rise = Math.max(minRise, exp.descent + clearance);
  const ascent  = Math.max(base.ascent, rise + exp.ascent);
  const descent = base.descent;
  const width   = base.width + exp.width;
  return {
    width, ascent, descent,
    draw(x, by) {
      return (
        base.draw(x, by) +
        exp.draw(x + base.width, by - rise)
      );
    },
  };
}

/** Matching parens that scale to the enclosed content.  Drawn as
 *  quadratic Bézier arcs (SVG <path>) so they open outward like real
 *  textbook parens regardless of inner height — a fraction gets tall
 *  parens, a plain variable gets small ones. */
function parenBox(inner) {
  const h = inner.ascent + inner.descent;
  const pw = Math.max(6, h * PAREN_W_R);
  return {
    width: inner.width + 2 * pw,
    ascent: inner.ascent,
    descent: inner.descent,
    draw(x, by) {
      const top = by - inner.ascent;
      const bot = by + inner.descent;
      const strokeW = Math.max(1, h * 0.03);
      // Left paren: quadratic from (x+pw*0.75,top) via (x,by) to (x+pw*0.75,bot)
      const lx = x + pw * 0.75;
      const l = `<path d="M ${fmt(lx)} ${fmt(top)} Q ${fmt(x)} ${fmt(by)} ` +
        `${fmt(lx)} ${fmt(bot)}" fill="none" stroke="currentColor" ` +
        `stroke-width="${fmt(strokeW)}"/>`;
      // Right paren: mirror about the inner right edge.
      const rOuter = x + inner.width + 2 * pw;
      const rInner = rOuter - pw * 0.75;
      const r = `<path d="M ${fmt(rInner)} ${fmt(top)} Q ${fmt(rOuter)} ${fmt(by)} ` +
        `${fmt(rInner)} ${fmt(bot)}" fill="none" stroke="currentColor" ` +
        `stroke-width="${fmt(strokeW)}"/>`;
      return l + inner.draw(x + pw, by) + r;
    },
  };
}

/** Radical box — √ hook + vinculum over the radicand.  The radicand's
 *  baseline is the box's baseline so the √ composes with neighboring
 *  elements like any other box (e.g. `1 + SQRT(2)` sits cleanly on the
 *  same line).  The vinculum is a straight `<line>`, the hook is a
 *  single `<path>` stroked with round caps/joins.
 *
 *  Visual (plain √):
 *
 *        ┌──────────────┐       ← vinculum
 *       /
 *      /    <radicand>
 *     V                          ← hook tip dips below baseline
 *
 *  Indexed variant (³√x for cube root):
 *
 *    3 ┌──────────────┐          ← index sits above-left of hook peak
 *       /
 *      V    <radicand>
 *
 *  Box ascent covers inner.ascent + gap + bar (+ optional index height);
 *  descent covers the deeper of inner.descent and the hook tip dip.
 *  Width = (optional index overhang) + hook + inner + a small vinculum
 *  overhang.
 *
 *  The optional `index` argument is a pre-laid Box rendered small, sitting
 *  above the hook's peak — classic textbook "ⁿ√k" placement.  Pass `null`
 *  (the default) for an unadorned √.
 */
function radicalBox(inner, size = DEFAULT_SIZE, index = null) {
  const pw    = RAD_HOOK_W * size;
  const gap   = RAD_GAP_TOP * size;
  const barH  = Math.max(1, RAD_BAR_H * size);
  const over  = RAD_OVERHANG * size;
  // innerAscent is the ascent above baseline consumed by the radicand +
  // the gap and vinculum above it.  This is the fixed height of the
  // hook+vinculum part, independent of the index.
  const innerAscent = inner.ascent + gap + barH;
  // If an index is present, it sits above the vinculum so the box ascent
  // must grow.  We also may need extra width on the left so the index
  // doesn't spill past x=0 (the radical's own width reserves peak*0.55 of
  // pw for the index to tuck into; anything beyond that pushes the hook
  // to the right).
  const indexH    = index ? index.ascent + index.descent : 0;
  const indexPad  = index ? Math.max(0, index.width - pw * 0.55) : 0;
  const indexRise = index ? 2 : 0;   // small gap between index bottom and vinculum
  const ascent    = innerAscent + indexH + indexRise;
  // Hook tip dip: fraction of total radical height, but not less than a
  // small floor so a zero-descent radicand (e.g. SQRT(X)) still shows a
  // visible dip.  We compute the dip from the hook-only portion so
  // attaching an index doesn't stretch the hook downward.
  const hookTotalH = innerAscent + inner.descent;
  const dip    = Math.max(inner.descent, RAD_DIP_FRAC * hookTotalH, 0.18 * size);
  const descent = dip;
  const width   = indexPad + pw + inner.width + over;
  return {
    width, ascent, descent,
    draw(x, by) {
      const hookX   = x + indexPad;              // left edge of the hook
      const topY    = by - innerAscent + barH / 2;    // vinculum centerline
      const tipY    = by + dip;                  // bottom of hook
      const peakX   = hookX + pw * 0.85;         // where hook meets vinculum
      const peakY   = topY;
      const dipX    = hookX + pw * 0.45;         // bottom of the ˇ
      const dipY    = tipY;
      const preX    = hookX + pw * 0.05;         // short up-stroke start
      const preY    = topY + (tipY - topY) * 0.55;
      const rightX  = x + width;
      const strokeW = Math.max(1, barH * 1.2);
      const path =
        `<path d="M ${fmt(preX)} ${fmt(preY)} ` +
        `L ${fmt(dipX)} ${fmt(dipY)} ` +
        `L ${fmt(peakX)} ${fmt(peakY)} ` +
        `L ${fmt(rightX)} ${fmt(topY)}" ` +
        `fill="none" stroke="currentColor" stroke-width="${fmt(strokeW)}" ` +
        `stroke-linecap="round" stroke-linejoin="round"/>`;
      // Offset the radicand so there's a tiny left-pad after the hook.
      const innerX = hookX + pw + over * 0.2;
      // Draw the optional index.  Bottom edge sits `indexRise` px above
      // topY so it hovers just over the vinculum; right edge aligns to
      // just shy of peakX so the glyph lives inside the hook's crook.
      let indexSvg = '';
      if (index) {
        const idxRightX = peakX - pw * 0.08;
        const idxLeftX  = idxRightX - index.width;
        // baseline so glyph bottom (baseline + descent) lands at topY - indexRise
        const idxBy     = topY - indexRise - index.descent;
        indexSvg = index.draw(idxLeftX, idxBy);
      }
      return indexSvg + path + inner.draw(innerX, by);
    },
  };
}

/** Format a number for SVG coordinate output — trim to 3 decimal
 *  places to keep the markup compact.  Pure cosmetic. */
function fmt(n) {
  if (Number.isInteger(n)) return String(n);
  return Number(n).toFixed(3).replace(/\.?0+$/, '');
}

// Precedence mirrors algebra.js's fmt():
//   =,≠,<,>,≤,≥ → 0 (outermost only)
//   +,-  → 1    *,/  → 2    ^  → 3    neg  → 4 (unary)
const PREC = {
  '=': 0, '≠': 0, '<': 0, '>': 0, '≤': 0, '≥': 0,
  '+': 1, '-': 1, '*': 2, '/': 2, '^': 3,
};

/** layoutAst(ast, size) → Box.  Top-level entry; always passes
 *  parentPrec=0 so the outermost box never gets wrapped in parens. */
export function layoutAst(ast, size = DEFAULT_SIZE) {
  return lay(ast, 0, size);
}

function placeholderBox(size) {
  const side = 0.5 * size;
  return {
    width: side,
    ascent: side * 0.8,
    descent: side * 0.2,
    draw(x, by) {
      const y = by - side * 0.8;
      return `<rect class="eqw-hole" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(side)}" height="${fmt(side)}" fill="currentColor"/>`;
    },
  };
}

function caretBox(size) {
  const w = 0.45 * size;
  const h = 0.7 * size;
  return {
    width: w,
    ascent: h * 0.75,
    descent: h * 0.1,
    draw(x, by) {
      const top = by - h * 0.55;
      const mid = by + h * 0.05;
      const bot = by + h * 0.35;
      return `<polygon class="eqw-caret" points="${fmt(x)},${fmt(mid)} ${fmt(x + w)},${fmt(top)} ${fmt(x + w)},${fmt(bot)}" fill="currentColor"/>`;
    },
  };
}

function integralBox(lo, hi, size) {
  const glyph = textBox('∫', size * 1.7);
  const limW = Math.max(lo.width, hi.width);
  const width = glyph.width + limW;
  const ascent = Math.max(glyph.ascent, hi.ascent + hi.descent + glyph.ascent * 0.15);
  const descent = Math.max(glyph.descent, lo.ascent + lo.descent);
  return {
    width, ascent, descent,
    draw(x, by) {
      const hiBy = by - glyph.ascent + hi.descent;
      const loBy = by + lo.ascent * 0.15;
      return glyph.draw(x, by) + hi.draw(x + glyph.width, hiBy) + lo.draw(x + glyph.width, loBy);
    },
  };
}

function sigmaBox(below, above, size) {
  const glyph = textBox('Σ', size * 1.35);
  const width = Math.max(glyph.width, below.width, above.width);
  const ascent = glyph.ascent + above.ascent + above.descent;
  const descent = glyph.descent + below.ascent + below.descent;
  return {
    width, ascent, descent,
    draw(x, by) {
      const gx = x + (width - glyph.width) / 2;
      const ax = x + (width - above.width) / 2;
      const bx = x + (width - below.width) / 2;
      const aboveBy = by - glyph.ascent + above.descent * 0.2;
      const belowBy = by + glyph.descent + below.ascent;
      return above.draw(ax, aboveBy) + glyph.draw(gx, by) + below.draw(bx, belowBy);
    },
  };
}

function lay(ast, parentPrec, size) {
  if (!ast) return textBox('', size);
  if (ast.kind === 'num') return textBox(ast.digits ?? String(ast.value), size);
  if (isVar(ast)) return textBox(ast.name, size);

  if (isNeg(ast)) {
    // Unary minus binds tighter than + / - but looser than * / ^.
    // We mirror fmt()'s rule: inside * / ^, wrap the whole neg.
    const inner = lay(ast.arg, 4, size);
    const box = rowBox([textBox('-', size), inner]);
    return parentPrec >= 2 ? parenBox(box) : box;
  }

  if (isFn(ast)) {
    if (ast.name === 'EXP' && ast.args.length === 1) {
      const exp = lay(ast.args[0], 0, size * SUP_SCALE);
      return supBox(textBox('e', size), exp);
    }
    if (ast.name === 'FACT' && ast.args.length === 1) {
      const argAst = ast.args[0];
      const arg = lay(argAst, 0, size);
      const bare = isNum(argAst) || isVar(argAst) || isFn(argAst);
      return rowBox([bare ? arg : parenBox(arg), textBox('!', size)]);
    }
    if (ast.name === 'DERIV' && ast.args.length === 2) {
      const v = lay(ast.args[1], 0, size);
      const body = parenBox(lay(ast.args[0], 0, size));
      const frac = fracBox(textBox('∂', size), rowBox([textBox('∂', size), v]), size);
      return rowBox([frac, body]);
    }
    if (ast.name === 'INTEG' && ast.args.length === 4) {
      const body = lay(ast.args[0], 0, size);
      const v = lay(ast.args[1], 0, size);
      const lo = lay(ast.args[2], 0, size * SUP_SCALE);
      const hi = lay(ast.args[3], 0, size * SUP_SCALE);
      return rowBox([integralBox(lo, hi, size), body, textBox('d', size), v]);
    }
    if (ast.name === 'Σ' && ast.args.length === 4) {
      const bodyAst = ast.args[0];
      const body = lay(bodyAst, 0, size);
      const v = lay(ast.args[1], 0, size * SUP_SCALE);
      const lo = lay(ast.args[2], 0, size * SUP_SCALE);
      const hi = lay(ast.args[3], 0, size * SUP_SCALE);
      const below = rowBox([v, textBox('=', size * SUP_SCALE), lo]);
      const sum = isBin(bodyAst) && (bodyAst.op === '+' || bodyAst.op === '-') ? parenBox(body) : body;
      return rowBox([sigmaBox(below, hi, size), sum]);
    }
    // √ radical.  SQRT(x) draws a hook-and-vinculum over the radicand
    // instead of the literal text `SQRT(x)`.  The shape composes with
    // fractions, exponents, etc. — SQRT((X+1)/2) correctly draws the
    // vinculum over a stacked fraction, and SQRT(X)^2 superscripts the
    // whole √-box.
    if (ast.name === 'SQRT' && ast.args.length === 1) {
      const inner = lay(ast.args[0], 0, size);
      return radicalBox(inner, size);
    }
    // ⁿ√k — XROOT(radicand, index) renders as an indexed radical.  By
    // convention in algebra.js / ops.js the first arg is the radicand
    // and the second is the degree (XROOT(2, 3) means ∛2).  We draw the
    // index at SUP_SCALE of base size to match exponent typography, so
    // ∛2 visually composes with 2^(1/3) the way a mathematician expects.
    if (ast.name === 'XROOT' && ast.args.length === 2) {
      const radicand = lay(ast.args[0], 0, size);
      const indexSize = size * SUP_SCALE;
      const index = lay(ast.args[1], 0, indexSize);
      return radicalBox(radicand, size, index);
    }
    // NAME(arg1, arg2).  The paren scales to args height.
    const name = textBox(ast.name, size);
    const args = ast.args.map((a, i) => {
      const b = lay(a, 0, size);
      // Insert a comma-and-small-space between args.
      return i === 0 ? b : rowBox([textBox(', ', size), b]);
    });
    const inner = rowBox(args);
    return rowBox([name, parenBox(inner)]);
  }

  if (isBin(ast)) {
    const { op, l, r } = ast;
    const p = PREC[op];

    // Division — always a stacked fraction regardless of parent
    // precedence.  Children never get parens because the fraction bar
    // separates them visually.
    if (op === '/') {
      const num = lay(l, 0, size);
      const den = lay(r, 0, size);
      const box = fracBox(num, den, size);
      return box;
    }

    // Exponentiation — base as normal, exponent as superscript.  Base
    // gets parens when its precedence is lower than '^'; exponent
    // doesn't need parens because it's visually distinct (small, raised).
    if (op === '^') {
      const base = lay(l, p + 1, size);
      // Exponent renders smaller; recurse with a scaled size.
      const expSize = size * SUP_SCALE;
      const exp  = lay(r, 0, expSize);
      const box = supBox(base, exp);
      return p < parentPrec ? parenBox(box) : box;
    }

    // =, +, -, * — flat inline.  `=` and the additive operators use
    // surrounding spaces for readability; `*` is tight.  `=` binds
    // loosest (prec 0) and only appears at the outermost level, so
    // parentPrec=0 at the top is never greater than its own prec.
    const rightAssoc = false;       // all flat ops are left-assoc
    const lPrec = rightAssoc ? p + 1 : p;
    const rPrec = rightAssoc ? p : p + 1;
    const lBox = lay(l, lPrec, size);
    const rBox = lay(r, rPrec, size);

    // Textbook juxtaposition.  `2*X` renders as `2X`, `2*X^2` as
    // `2X²`, `2*(X+1)` as `2(X+1)`, `2*SIN(X)` as `2 SIN(X)`.  We
    // apply it when the left operand is a Num AND the
    // right operand is NOT a Num — that's sufficient to cover all
    // textbook "coefficient meets variable/power/fn/paren" shapes while
    // avoiding `2*3 → 23` (which would read as twenty-three).
    //
    //   Num × Var         2*X          → 2X
    //   Num × Bin('^')    2*X^2        → 2X²
    //   Num × Fn          2*SIN(X)     → 2SIN(X)
    //   Num × Bin('+'/'-'/'*' etc., parenthesized)
    //                     2*(X + 1)    → 2(X + 1)
    //   Num × Neg         2*(-X)       → 2(-X)   (Neg wraps itself in
    //                                               parens inside `*`)
    //
    // We do NOT juxtapose Num × Num (ambiguity) or non-Num × anything
    // (to keep the rule conservative; X*Y in the HP50 is usually an
    // explicit product written as X*Y anyway).
    const juxtapose = op === '*' && isNum(l) && !isNum(r);

    let box;
    if (juxtapose) {
      box = rowBox([lBox, rBox]);
    } else {
      const sep = (op === '+' || op === '-' || op === '=')
        ? opSepBox(op, size)
        : textBox(op, size);
      box = rowBox([lBox, sep, rBox]);
    }
    return p < parentPrec ? parenBox(box) : box;
  }

  // Unknown node — render its stringified form.  Keeps pretty-print
  // total-with-no-surprises even if a new AST node is added before the
  // renderer is updated.
  return textBox(`?${ast.kind || ''}?`, size);
}

/** astToSvg(ast, [opts]) → { svg, width, height }.
 *
 *  Options:
 *    size:        number   base font size in px (default 24)
 *    padding:     number   padding in px around the content (default 4)
 *    color:       CSS      currentColor fill — not set by default (the
 *                          SVG inherits `color` from the parent so the
 *                          LCD theme wins).
 */
export function astToSvg(ast, opts = {}) {
  const size = opts.size ?? DEFAULT_SIZE;
  const pad  = opts.padding ?? 4;
  const box = layoutAst(ast, size);
  const width  = box.width  + pad * 2;
  const height = box.ascent + box.descent + pad * 2;
  const baseline = pad + box.ascent;
  const inner = box.draw(pad, baseline);
  const colorAttr = opts.color ? ` color="${opts.color}"` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" ` +
    `height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}"` +
    ` fill="currentColor"${colorAttr}>${inner}</svg>`;
  return { svg, width, height };
}

const EQW_READING = {
  frac: [0, 1], pow: [0, 1], sqrt: [0], xroot: [1, 0], exp: [0], neg: [0],
  fact: [0], paren: [0], deriv: [1, 0], integ: [2, 3, 0, 1], sigma: [1, 2, 3, 0],
};

function eqwItemKey(rowKey, index) {
  return rowKey === '' ? String(index) : `${rowKey}.${index}`;
}

function eqwTrack(box, key, kind, rects) {
  return {
    width: box.width,
    ascent: box.ascent,
    descent: box.descent,
    draw(x, by) {
      rects.set(key, {
        x,
        y: by - box.ascent,
        w: box.width,
        h: box.ascent + box.descent,
        kind,
      });
      return box.draw(x, by);
    },
  };
}

function eqwRowHas(row, ops) {
  return row.some(item => item.t === 'op' && ops.includes(item.op));
}

function layEqwSlot(row, rowKey, size, caret, rects) {
  return layEqwRow(row, rowKey, size, caret, rects);
}

function layEqwRow(row, rowKey, size, caret, rects) {
  return rowBox(row.map((item, index) => {
    return layEqwItem(item, eqwItemKey(rowKey, index), size, caret, rects);
  }));
}

function layEqwItem(item, key, size, caret, rects) {
  if (item.t === 'hole') {
    const box = key === caret ? caretBox(size) : placeholderBox(size);
    return eqwTrack(box, key, 'hole', rects);
  }
  if (item.t === 'num' || item.t === 'name') {
    const text = textBox(item.text || '', size);
    const box = key === caret ? rowBox([text, caretBox(size)]) : text;
    return eqwTrack(box, key, 'leaf', rects);
  }
  if (item.t === 'op') {
    const glyph = item.op === '*' ? '·' : item.op;
    const box = (item.op === '+' || item.op === '-' || item.op === '=')
      ? opSepBox(glyph, size)
      : textBox(glyph, size);
    return eqwTrack(box, key, 'op', rects);
  }
  const slots = item.slots.map((slot, index) => {
    return layEqwSlot(slot, `${key}.${index}`, size, caret, rects);
  });
  let box;
  if (item.t === 'frac') box = fracBox(slots[0], slots[1], size);
  else if (item.t === 'pow') {
    const base = (item.slots[0].length !== 1 || ['frac', 'neg', 'pow', 'fact'].includes(item.slots[0][0]?.t))
      ? parenBox(slots[0])
      : slots[0];
    box = supBox(base, layEqwSlot(item.slots[1], `${key}.1`, size * SUP_SCALE, caret, rects));
  }
  else if (item.t === 'sqrt') box = radicalBox(slots[0], size);
  else if (item.t === 'xroot') {
    const index = layEqwSlot(item.slots[1], `${key}.1`, size * SUP_SCALE, caret, rects);
    box = radicalBox(slots[0], size, index);
  }
  else if (item.t === 'exp') {
    box = supBox(textBox('e', size), layEqwSlot(item.slots[0], `${key}.0`, size * SUP_SCALE, caret, rects));
  }
  else if (item.t === 'neg') {
    const arg = eqwRowHas(item.slots[0], ['+', '-']) ? parenBox(slots[0]) : slots[0];
    box = rowBox([textBox('-', size), arg]);
  }
  else if (item.t === 'fact') {
    const bare = item.slots[0].length === 1 && ['num', 'name', 'hole', 'paren', 'fn'].includes(item.slots[0][0]?.t);
    box = rowBox([bare ? slots[0] : parenBox(slots[0]), textBox('!', size)]);
  }
  else if (item.t === 'paren') box = parenBox(slots[0]);
  else if (item.t === 'fn') {
    const args = [];
    slots.forEach((slot, index) => {
      if (index) args.push(textBox(', ', size));
      args.push(slot);
    });
    box = rowBox([textBox(item.name, size), parenBox(rowBox(args))]);
  }
  else if (item.t === 'deriv') {
    const v = slots[1];
    const frac = fracBox(textBox('∂', size), rowBox([textBox('∂', size), v]), size);
    box = rowBox([frac, parenBox(slots[0])]);
  }
  else if (item.t === 'integ') {
    const lo = layEqwSlot(item.slots[2], `${key}.2`, size * SUP_SCALE, caret, rects);
    const hi = layEqwSlot(item.slots[3], `${key}.3`, size * SUP_SCALE, caret, rects);
    box = rowBox([integralBox(lo, hi, size), slots[0], textBox('d', size), slots[1]]);
  }
  else if (item.t === 'sigma') {
    const small = size * SUP_SCALE;
    const v = layEqwSlot(item.slots[1], `${key}.1`, small, caret, rects);
    const lo = layEqwSlot(item.slots[2], `${key}.2`, small, caret, rects);
    const hi = layEqwSlot(item.slots[3], `${key}.3`, small, caret, rects);
    const body = eqwRowHas(item.slots[0], ['+', '-']) ? parenBox(slots[0]) : slots[0];
    box = rowBox([sigmaBox(rowBox([v, textBox('=', small), lo]), hi, size), body]);
  }
  else box = slots.length ? rowBox(slots) : textBox('?', size);
  return eqwTrack(box, key, 'struct', rects);
}

function eqwUnion(rects, selected) {
  let union = null;
  for (let index = selected.from; index <= selected.to; index++) {
    const key = selected.row === '' ? String(index) : `${selected.row}.${index}`;
    const rect = rects.get(key);
    if (!rect) continue;
    if (!union) union = { ...rect };
    else {
      const x2 = Math.max(union.x + union.w, rect.x + rect.w);
      const y2 = Math.max(union.y + union.h, rect.y + rect.h);
      union.x = Math.min(union.x, rect.x);
      union.y = Math.min(union.y, rect.y);
      union.w = x2 - union.x;
      union.h = y2 - union.y;
    }
  }
  return union;
}

export function eqwToSvg(root, opts = {}) {
  const size = opts.size ?? DEFAULT_SIZE;
  const pad = opts.padding ?? 6;
  const rects = new Map();
  const caret = opts.caret ?? null;
  const boxed = opts.boxed ?? null;
  const selected = opts.selected ?? null;
  const clipId = opts.clipId || 'eqw-sel';
  const content = layEqwRow(root, '', size, caret, rects);
  const width = content.width + pad * 2;
  const height = content.ascent + content.descent + pad * 2;
  const baseline = pad + content.ascent;
  let inner = content.draw(pad, baseline);
  if (boxed && rects.has(boxed)) {
    const rect = rects.get(boxed);
    inner += `<rect class="eqw-clear" x="${fmt(rect.x - 1)}" y="${fmt(rect.y - 1)}" width="${fmt(rect.w + 2)}" height="${fmt(rect.h + 2)}" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  }
  if (selected) {
    const union = eqwUnion(rects, selected);
    if (union) {
      const again = content.draw(pad, baseline);
      inner += `<defs><clipPath id="${clipId}"><rect x="${fmt(union.x - 1)}" y="${fmt(union.y - 1)}" width="${fmt(union.w + 2)}" height="${fmt(union.h + 2)}"/></clipPath></defs>`;
      inner += `<g clip-path="url(#${clipId})"><rect x="${fmt(union.x - 1)}" y="${fmt(union.y - 1)}" width="${fmt(union.w + 2)}" height="${fmt(union.h + 2)}" fill="currentColor"/><g class="eqw-inverse">${again}</g></g>`;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" ` +
    `height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}" ` +
    `fill="currentColor">${inner}</svg>`;
  return { svg, width, height, rects };
}
