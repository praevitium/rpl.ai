/* Textbook (2D) layout of algebra ASTs and equation-writer rows as SVG
   strings.  A fixed monospace advance model keeps the layout identical in
   Node and the browser.  A Box is { width, ascent, descent, draw(x, by) },
   and the boxes in a row share one baseline. */

import { isNum, isVar, isNeg, isBin, isFn, PREC, numText } from './algebra.js';

// Single-quoted family names let the stack sit inside a double-quoted attribute.
const FONT_STACK = "'IBM Plex Mono', 'RPL Symbols', 'IBM Plex Sans', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const DEFAULT_SIZE = 24;

// Fractions of the font size unless noted.
const CHAR_W  = 0.6;
const ASCENT  = 0.8;
const DESCENT = 0.2;

const FRAC_GAP    = 0.10;
const FRAC_BAR_H  = 1/24;
const FRAC_HPAD   = 0.15;

const SUP_SCALE   = 0.70;
const SUP_RISE    = 0.45;   // of the base's ascent

const PAREN_W_R   = 0.28;   // of the content height

const RAD_HOOK_W    = 0.55;
const RAD_GAP_TOP   = 0.12;
const RAD_OVERHANG  = 0.12;
const RAD_BAR_H     = 1/24;
const RAD_DIP_FRAC  = 0.35;   // of the radical's height

const XML_ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s) { return String(s).replace(/[&<>"]/g, c => XML_ENT[c]); }

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

function gapBox(w) {
  return {
    width: Math.max(0, w),
    ascent: 0,
    descent: 0,
    draw() { return ''; },
  };
}

function opSepBox(op, size = DEFAULT_SIZE) {
  const pad = CHAR_W * size * 0.3;
  const inner = textBox(op, size);
  return rowBox([gapBox(pad), inner, gapBox(pad)]);
}

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

function fracBox(num, den, size = DEFAULT_SIZE) {
  const gap  = FRAC_GAP * size;
  const barH = Math.max(1, FRAC_BAR_H * size);
  const hpad = FRAC_HPAD * size;
  const width = Math.max(num.width, den.width) + 2 * hpad;
  const ascent  = num.ascent + num.descent + gap + barH / 2;
  const descent = den.ascent + den.descent + gap + barH / 2;
  return {
    width, ascent, descent,
    draw(x, by) {
      const nx = x + (width - num.width) / 2;
      const dx = x + (width - den.width) / 2;
      const nby = by - gap - barH / 2 - num.descent;
      const dby = by + gap + barH / 2 + den.ascent;
      return (
        num.draw(nx, nby) +
        den.draw(dx, dby) +
        `<line x1="${fmt(x + hpad * 0.2)}" y1="${fmt(by)}" ` +
        `x2="${fmt(x + width - hpad * 0.2)}" y2="${fmt(by)}" ` +
        `stroke="currentColor" stroke-width="${fmt(barH)}"/>`
      );
    },
  };
}

// A tall exponent, such as a fraction, rises further so it clears the base.
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
      const lx = x + pw * 0.75;
      const l = `<path d="M ${fmt(lx)} ${fmt(top)} Q ${fmt(x)} ${fmt(by)} ` +
        `${fmt(lx)} ${fmt(bot)}" fill="none" stroke="currentColor" ` +
        `stroke-width="${fmt(strokeW)}"/>`;
      const rOuter = x + inner.width + 2 * pw;
      const rInner = rOuter - pw * 0.75;
      const r = `<path d="M ${fmt(rInner)} ${fmt(top)} Q ${fmt(rOuter)} ${fmt(by)} ` +
        `${fmt(rInner)} ${fmt(bot)}" fill="none" stroke="currentColor" ` +
        `stroke-width="${fmt(strokeW)}"/>`;
      return l + inner.draw(x + pw, by) + r;
    },
  };
}

// `index` is an optional small box set in the crook of the hook (ⁿ√x).
function radicalBox(inner, size = DEFAULT_SIZE, index = null) {
  const pw    = RAD_HOOK_W * size;
  const gap   = RAD_GAP_TOP * size;
  const barH  = Math.max(1, RAD_BAR_H * size);
  const over  = RAD_OVERHANG * size;
  const innerAscent = inner.ascent + gap + barH;
  // The index may overlap the left 55% of the hook; beyond that it pushes the hook right.
  const indexH    = index ? index.ascent + index.descent : 0;
  const indexPad  = index ? Math.max(0, index.width - pw * 0.55) : 0;
  const indexRise = index ? 2 : 0;
  const ascent    = innerAscent + indexH + indexRise;
  // The dip ignores the index and has a floor, so SQRT(X) still shows its tick.
  const hookTotalH = innerAscent + inner.descent;
  const dip    = Math.max(inner.descent, RAD_DIP_FRAC * hookTotalH, 0.18 * size);
  const descent = dip;
  const width   = indexPad + pw + inner.width + over;
  return {
    width, ascent, descent,
    draw(x, by) {
      const hookX   = x + indexPad;
      const topY    = by - innerAscent + barH / 2;
      const tipY    = by + dip;
      const peakX   = hookX + pw * 0.85;
      const peakY   = topY;
      const dipX    = hookX + pw * 0.45;
      const dipY    = tipY;
      const preX    = hookX + pw * 0.05;
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
      const innerX = hookX + pw + over * 0.2;
      let indexSvg = '';
      if (index) {
        const idxRightX = peakX - pw * 0.08;
        const idxLeftX  = idxRightX - index.width;
        const idxBy     = topY - indexRise - index.descent;
        indexSvg = index.draw(idxLeftX, idxBy);
      }
      return indexSvg + path + inner.draw(innerX, by);
    },
  };
}

function fmt(n) {
  if (Number.isInteger(n)) return String(n);
  return Number(n).toFixed(3).replace(/\.?0+$/, '');
}

const OP_GLYPHS = Object.freeze({ '*': '·', '-': '−' });
const opGlyph = (op) => OP_GLYPHS[op] ?? op;

function opBox(op, size) {
  const glyph = opGlyph(op);
  return op === '+' || op === '-' || op === '='
    ? opSepBox(glyph, size)
    : textBox(glyph, size);
}

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
  const bar = Math.max(1.5, 0.06 * size);
  return {
    width: bar + 2,
    ascent: size * 0.78,
    descent: size * 0.2,
    draw(x, by) {
      return `<rect class="eqw-caret" x="${fmt(x + 1)}" y="${fmt(by - size * 0.78)}" width="${fmt(bar)}" height="${fmt(size * 0.98)}" rx="${fmt(bar / 2)}" fill="currentColor"/>`;
    },
  };
}

function caretSlotBox(size) {
  const slot = placeholderBox(size);
  const caret = caretBox(size);
  return {
    width: slot.width,
    ascent: Math.max(slot.ascent, caret.ascent),
    descent: Math.max(slot.descent, caret.descent),
    draw(x, by) {
      const y = by - slot.ascent;
      const frame = `<rect class="eqw-slot" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(slot.width)}" height="${fmt(slot.ascent + slot.descent)}" fill="currentColor"/>`;
      return frame + caret.draw(x + (slot.width - caret.width) / 2, by);
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

function callBox(name, args, size) {
  const list = args.flatMap((arg, i) => (i ? [textBox(', ', size), arg] : [arg]));
  return rowBox([textBox(name, size), parenBox(rowBox(list))]);
}

function factBox(arg, bare, size) {
  return rowBox([bare ? arg : parenBox(arg), textBox('!', size)]);
}

function derivBox(body, v, size) {
  const frac = fracBox(textBox('∂', size), rowBox([textBox('∂', size), v]), size);
  return rowBox([frac, parenBox(body)]);
}

function integBox(body, v, lo, hi, size) {
  return rowBox([integralBox(lo, hi, size), body, textBox('d', size), v]);
}

function sumBox(body, v, lo, hi, size) {
  const below = rowBox([v, textBox('=', size * SUP_SCALE), lo]);
  return rowBox([sigmaBox(below, hi, size), body]);
}

const isNegativeNum = (ast) => ast.kind === 'num' && numText(ast).startsWith('-');

function lay(ast, parentPrec, size) {
  if (!ast) return textBox('', size);
  if (ast.kind === 'num') {
    const box = textBox(numText(ast), size);
    // Only a power's base needs it: -3 with a raised X would read as -(3^X).
    return parentPrec > 3 && isNegativeNum(ast) ? parenBox(box) : box;
  }
  if (isVar(ast)) return textBox(ast.name, size);

  if (isNeg(ast)) {
    const inner = lay(ast.arg, 3, size);
    const box = rowBox([textBox('−', size), inner]);
    return parentPrec >= 2 ? parenBox(box) : box;
  }

  if (isFn(ast)) {
    const { name, args } = ast;
    const arg = (i, at = size) => lay(args[i], 0, at);
    const small = size * SUP_SCALE;
    if (name === 'EXP' && args.length === 1) {
      return supBox(textBox('e', size), arg(0, small));
    }
    if (name === 'FACT' && args.length === 1) {
      const a = args[0];
      const bare = (a.kind === 'num' && !isNegativeNum(a)) || isVar(a) || isFn(a);
      return factBox(arg(0), bare, size);
    }
    if (name === 'DERIV' && args.length === 2) {
      return derivBox(arg(0), arg(1), size);
    }
    if (name === 'INTEG' && args.length === 4) {
      return integBox(arg(0), arg(1), arg(2, small), arg(3, small), size);
    }
    if (name === 'Σ' && args.length === 4) {
      const body = args[0];
      const additive = isBin(body) && (body.op === '+' || body.op === '-');
      return sumBox(additive ? parenBox(arg(0)) : arg(0), arg(1, small), arg(2, small), arg(3, small), size);
    }
    if (name === 'SQRT' && args.length === 1) {
      return radicalBox(arg(0), size);
    }
    if (name === 'XROOT' && args.length === 2) {
      return radicalBox(arg(0), size, arg(1, small));
    }
    return callBox(name, args.map((_, i) => arg(i)), size);
  }

  if (isBin(ast)) {
    const { op, l, r } = ast;
    const p = PREC[op];

    if (op === '/') {
      return fracBox(lay(l, 0, size), lay(r, 0, size), size);
    }

    if (op === '^') {
      const box = supBox(lay(l, p + 1, size), lay(r, 0, size * SUP_SCALE));
      return p < parentPrec ? parenBox(box) : box;
    }

    const lBox = lay(l, p, size);
    const rBox = lay(r, p + 1, size);
    // 2*X reads 2X and X*(Y+1) reads X(Y+1), but 2*3 keeps its dot so it cannot read as 23.
    const rightInParens = isNeg(r) || (isBin(r) && PREC[r.op] < p + 1);
    const juxtapose = op === '*' && ((isNum(l) && r.kind !== 'num') || rightInParens);
    const box = rowBox(juxtapose ? [lBox, rBox] : [lBox, opBox(op, size), rBox]);
    return p < parentPrec ? parenBox(box) : box;
  }

  return textBox(`?${ast.kind || ''}?`, size);
}

function svgDoc(width, height, inner, attrs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" ` +
    `height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}" ` +
    `fill="currentColor"${attrs}>${inner}</svg>`;
}

export function astToSvg(ast, opts = {}) {
  const size = opts.size ?? DEFAULT_SIZE;
  const pad  = opts.padding ?? 4;
  const box = layoutAst(ast, size);
  const width  = box.width  + pad * 2;
  const height = box.ascent + box.descent + pad * 2;
  const baseline = pad + box.ascent;
  const inner = box.draw(pad, baseline);
  const colorAttr = opts.color ? ` color="${opts.color}"` : '';
  return { svg: svgDoc(width, height, inner, colorAttr), width, height };
}

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

function layEqwSlot(row, rowKey, size, caret, rects, { bareParen = false } = {}) {
  if (bareParen && row.length === 1 && row[0].t === 'paren') {
    const key = eqwItemKey(rowKey, 0);
    return eqwTrack(layEqwRow(row[0].slots[0], `${key}.0`, size, caret, rects), key, 'struct', rects);
  }
  return layEqwRow(row, rowKey, size, caret, rects);
}

function isImpliedProduct(row, index) {
  const item = row[index];
  const next = row[index + 1];
  return item.t === 'op' && item.op === '*' && row[index - 1]?.t === 'num'
    && !!next && next.t !== 'num' && next.t !== 'op' && next.t !== 'hole';
}

function layEqwRow(row, rowKey, size, caret, rects) {
  return rowBox(row.map((item, index) => {
    const key = eqwItemKey(rowKey, index);
    if (isImpliedProduct(row, index)) return eqwTrack(gapBox(size * 0.06), key, 'op', rects);
    return layEqwItem(item, key, size, caret, rects);
  }));
}

function layEqwItem(item, key, size, caret, rects) {
  if (item.t === 'hole') {
    const box = key === caret ? caretSlotBox(size) : placeholderBox(size);
    return eqwTrack(box, key, 'hole', rects);
  }
  if (item.t === 'num' || item.t === 'name') {
    const text = textBox(item.text || '', size);
    const box = key === caret ? rowBox([text, caretBox(size)]) : text;
    return eqwTrack(box, key, 'leaf', rects);
  }
  if (item.t === 'op') return eqwTrack(opBox(item.op, size), key, 'op', rects);
  const small = size * SUP_SCALE;
  const slot = (index, at = size) => layEqwSlot(item.slots[index], `${key}.${index}`, at, caret, rects);
  const bare = (index, at = size) => layEqwSlot(item.slots[index], `${key}.${index}`, at, caret, rects, { bareParen: true });
  const operand = () => (eqwRowHas(item.slots[0], ['+', '-']) ? parenBox(slot(0)) : slot(0));
  const sole = item.slots[0]?.length === 1 ? item.slots[0][0]?.t : null;
  let box;
  if (item.t === 'frac') box = fracBox(bare(0), bare(1), size);
  else if (item.t === 'pow') {
    const base = sole === null || ['frac', 'neg', 'pow', 'fact'].includes(sole) ? parenBox(slot(0)) : slot(0);
    box = supBox(base, bare(1, small));
  }
  else if (item.t === 'sqrt') box = radicalBox(bare(0), size);
  else if (item.t === 'xroot') box = radicalBox(bare(0), size, bare(1, small));
  else if (item.t === 'exp') box = supBox(textBox('e', size), bare(0, small));
  else if (item.t === 'neg') box = rowBox([textBox('−', size), operand()]);
  else if (item.t === 'fact') box = factBox(slot(0), ['num', 'name', 'hole', 'paren', 'fn'].includes(sole), size);
  else if (item.t === 'paren') box = parenBox(slot(0));
  else if (item.t === 'fn') box = callBox(item.name, item.slots.map((_, i) => slot(i)), size);
  else if (item.t === 'deriv') box = derivBox(slot(0), slot(1), size);
  else if (item.t === 'integ') box = integBox(slot(0), slot(1), slot(2, small), slot(3, small), size);
  else if (item.t === 'sigma') box = sumBox(operand(), slot(1, small), slot(2, small), slot(3, small), size);
  else box = item.slots.length ? rowBox(item.slots.map((_, i) => slot(i))) : textBox('?', size);
  return eqwTrack(box, key, 'struct', rects);
}

function eqwUnion(rects, selected) {
  let union = null;
  for (let index = selected.from; index <= selected.to; index++) {
    const rect = rects.get(eqwItemKey(selected.row, index));
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

const outset = (r) => `x="${fmt(r.x - 1)}" y="${fmt(r.y - 1)}" width="${fmt(r.w + 2)}" height="${fmt(r.h + 2)}"`;

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
    inner += `<rect class="eqw-clear" ${outset(rects.get(boxed))} fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  }
  const union = selected ? eqwUnion(rects, selected) : null;
  if (union && opts.selectionAsCaret) {
    inner += caretBox(size).draw(union.x + union.w, baseline);
  } else if (union) {
    const again = content.draw(pad, baseline);
    inner += `<defs><clipPath id="${clipId}"><rect ${outset(union)}/></clipPath></defs>`;
    inner += `<g clip-path="url(#${clipId})"><rect ${outset(union)} fill="currentColor"/><g class="eqw-inverse">${again}</g></g>`;
  }
  return { svg: svgDoc(width, height, inner), width, height, rects, selection: union };
}
