/* The part of the canvas 2D context the plot draws with, recorded as SVG so a plot can be saved as a vector picture. */

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const number = (n) => String(Math.round(n * 100) / 100);

// 'rgba(r, g, b, a)' or '#rrggbb' as an SVG colour and its opacity, for any CSS colour the page can resolve.
const defaultResolve = (color) => ({ color, alpha: 1 });

export class SvgContext {
  constructor({ resolve = defaultResolve } = {}) {
    this.resolve = resolve;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.font = '10px sans-serif';
    this._dash = [];
    this._stack = [];
    this._path = [];
    this._out = [];
  }

  save() {
    const { fillStyle, strokeStyle, lineWidth, globalAlpha, lineCap, lineJoin, font, _dash } = this;
    this._stack.push({ fillStyle, strokeStyle, lineWidth, globalAlpha, lineCap, lineJoin, font, _dash });
  }

  restore() {
    const saved = this._stack.pop();
    if (saved) Object.assign(this, saved);
  }

  setLineDash(dash) { this._dash = [...dash]; }
  setTransform() {}
  clearRect() {}

  beginPath() { this._path = []; }
  moveTo(x, y) { this._path.push(`M${number(x)} ${number(y)}`); }
  lineTo(x, y) { this._path.push(`L${number(x)} ${number(y)}`); }
  closePath() { this._path.push('Z'); }

  // An arc from angle a0 to a1; a full turn is two half circles, as SVG's arc cannot start and end at one point.
  arc(x, y, r, a0, a1, counterclockwise = false) {
    const point = (a) => `${number(x + r * Math.cos(a))} ${number(y + r * Math.sin(a))}`;
    const full = Math.PI * 2;
    let sweep = a1 - a0;
    if (!counterclockwise && sweep < 0) sweep = (sweep % full) + full;
    if (counterclockwise && sweep > 0) sweep = (sweep % full) - full;
    const move = this._path.length ? 'L' : 'M';
    if (Math.abs(sweep) >= full - 1e-9) {
      const opposite = a0 + (counterclockwise ? -Math.PI : Math.PI);
      const flag = counterclockwise ? 0 : 1;
      this._path.push(`${move}${point(a0)}`, `A${number(r)} ${number(r)} 0 1 ${flag} ${point(opposite)}`, `A${number(r)} ${number(r)} 0 1 ${flag} ${point(a0)}`);
      return;
    }
    this._path.push(`${move}${point(a0)}`, `A${number(r)} ${number(r)} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${sweep > 0 ? 1 : 0} ${point(a0 + sweep)}`);
  }

  _paint(style) {
    const { color, alpha } = this.resolve(style);
    const opacity = alpha * this.globalAlpha;
    return { color, opacity: opacity < 1 ? ` opacity="${number(opacity)}"` : '' };
  }

  stroke() {
    if (!this._path.length) return;
    const { color, opacity } = this._paint(this.strokeStyle);
    const dash = this._dash.length ? ` stroke-dasharray="${this._dash.map(number).join(' ')}"` : '';
    const cap = this.lineCap === 'butt' ? '' : ` stroke-linecap="${this.lineCap}"`;
    const join = this.lineJoin === 'miter' ? '' : ` stroke-linejoin="${this.lineJoin}"`;
    this._out.push(`<path d="${this._path.join(' ')}" fill="none" stroke="${escapeXml(color)}" stroke-width="${number(this.lineWidth)}"${cap}${join}${dash}${opacity}/>`);
  }

  fill() {
    if (!this._path.length) return;
    const { color, opacity } = this._paint(this.fillStyle);
    this._out.push(`<path d="${this._path.join(' ')}" fill="${escapeXml(color)}"${opacity}/>`);
  }

  fillRect(x, y, w, h) {
    const { color, opacity } = this._paint(this.fillStyle);
    this._out.push(`<rect x="${number(x)}" y="${number(y)}" width="${number(w)}" height="${number(h)}" fill="${escapeXml(color)}"${opacity}/>`);
  }

  fillText(text, x, y) {
    const { color, opacity } = this._paint(this.fillStyle);
    const size = /(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '10';
    const family = this.font.replace(/^.*?\d+(?:\.\d+)?px\s*/, '').trim() || 'sans-serif';
    this._out.push(`<text x="${number(x)}" y="${number(y)}" font-size="${size}" font-family="${escapeXml(family)}" fill="${escapeXml(color)}"${opacity}>${escapeXml(text)}</text>`);
  }

  toSvg(width, height) {
    const w = number(width), h = number(height);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${this._out.join('\n')}\n</svg>\n`;
  }
}
