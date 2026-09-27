import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../www/', import.meta.url).pathname;
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
const SCALE = 1.5;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

const LLM_URL = process.env.RPLAI_SCREENSHOT_LLM;
const LLM_MODEL = process.env.RPLAI_SCREENSHOT_MODEL;
const LLM_PROMPT = process.env.RPLAI_SCREENSHOT_PROMPT
  ?? 'Write a program that returns the n-th Fibonacci number, store it as FIB, and run it for n = 20.';

function serveWww() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launchChrome() {
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
}

async function enter(page, ...lines) {
  const failure = await page.evaluate((all) => {
    const app = window.__hp50;
    for (const line of all) {
      app.entry.paste(line);
      app.commitEntry();
      if (app.entry.buffer.trim()) return `${line} did not run: ${app.entry.error || 'still in the command line'}`;
    }
    return null;
  }, lines);
  if (failure) throw new Error(failure);
  await page.waitForTimeout(250);
}

async function casReady(page) {
  await page.evaluate(async () => {
    const { giac } = await import('/src/rpl/cas/giac-engine.mjs');
    await giac.init();
  });
}

const SCENES = [
  {
    name: 'hero',
    viewport: { width: 1440, height: 900 },
    async setup(page) {
      await casReady(page);
      await enter(page,
        '[[2 1 0][1 3 1][0 1 4]]',
        "'(X^5-1)/(X-1)'",
        '« DUP * LASTARG + »',
        '12_m/s', '1_km/h', 'CONVERT',
        "'X^2-4'", 'FACTOR');
      await page.evaluate(() => window.__hp50.sidePanel.open('commands'));
    },
  },
  {
    name: 'minimal',
    viewport: { width: 1280, height: 800 },
    init: () => localStorage.setItem('hp50.ui.chrome', 'minimal'),
    async setup(page) {
      await casReady(page);
      await enter(page,
        "'SIN(X)*EXP(X)'", "'X'", 'DERIV',
        "'1/(X^2-1)'", 'PARTFRAC',
        "'X^3-6*X^2+11*X-6'", 'FACTOR',
        "'X^2-3*X+2=0'", "'X'", 'SOLVE',
        "'X*SIN(X)'", "'X'", 'INTEG');
    },
  },
  {
    name: 'equation-writer',
    viewport: { width: 1280, height: 800 },
    async setup(page) {
      await casReady(page);
      await enter(page, "'(X^2+1)/√(X^4+1)+X^3/(1-X)'");
      await page.evaluate(() => window.__hp50.openEquationEditor({ fromLevel1: true }));
      await page.waitForTimeout(300);
      await page.click('.eqw-view');
    },
  },
  {
    name: 'matrix-writer',
    viewport: { width: 1280, height: 800 },
    async setup(page) {
      await casReady(page);
      await enter(page, '[[2 1 0][1 3 1][0 1 4]]', 'DUP', 'DET', 'OVER', 'INV', 'ROT');
      await page.evaluate(() => window.__hp50.sidePanel.open('matrix'));
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'From stack' }).click();
    },
  },
  {
    name: 'graph',
    viewport: { width: 1440, height: 900 },
    async setup(page) {
      await casReady(page);
      await enter(page, "'SIN(X)'", 'FUNCTION', "'X^3/20-X/2'", 'FUNCTION', "'COS(2*X)*X/3'", 'FUNCTION');
      await page.evaluate(() => window.__hp50.sidePanel._applyWidth(640));
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'palette',
    viewport: { width: 1280, height: 800 },
    async setup(page) {
      await casReady(page);
      await enter(page, "'X^3-6*X^2+11*X-6=0'");
      await page.keyboard.press('ControlOrMeta+k');
      await page.keyboard.type('solv', { delay: 40 });
    },
  },
  {
    name: 'reference',
    viewport: { width: 1440, height: 900 },
    async setup(page) {
      await page.evaluate(() => window.__hp50.sidePanel.open('commands'));
      await page.fill('.sp-filter', 'deriv');
      await page.waitForTimeout(300);
      await page.locator('.side-panel-body button', { hasText: /^DERIV$/ }).first().click({ button: 'right' });
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'files',
    viewport: { width: 1280, height: 800 },
    async setup(page) {
      await enter(page,
        "'CIRCUITS'", 'CRDIR', 'CIRCUITS',
        "« INV SWAP INV + INV » 'PAR' STO",
        "4700 'R1' STO", "10000 'R2' STO",
        "'V=I*R' 'OHM' STO",
        "'FILTERS'", 'CRDIR',
        'R1', 'R2', 'PAR');
      await page.evaluate(() => { window.__hp50.showVarsMenu(); window.__hp50.sidePanel.open('files'); });
    },
  },
  {
    name: 'debugging',
    viewport: { width: 1280, height: 800 },
    async setup(page) {
      await enter(page, "« 1 2 + HALT 3 * 'X' STO »", 'EVAL');
    },
  },
  {
    name: 'assistant',
    viewport: { width: 1440, height: 900 },
    skip: !LLM_URL || !LLM_MODEL,
    init: (cfg) => {
      localStorage.setItem('rpl5050.chatbot.consented.v1', '1');
      localStorage.setItem('rpl5050.chatbot.remote', JSON.stringify(cfg));
    },
    initArg: { url: LLM_URL, model: LLM_MODEL, contextTokens: 32768, think: false, apiKey: '' },
    async setup(page) {
      await page.evaluate(() => window.__hp50.sidePanel._applyWidth(560));
      await page.evaluate(() => window.__hp50.sidePanel.open('ai'));
      await page.waitForSelector('.cb-status-ready', { timeout: 60000 });
      await page.fill('.cb-input', LLM_PROMPT);
      await page.click('.cb-send-btn');
      await page.waitForSelector('.cb-stop-btn:not(.hidden)', { timeout: 30000 });
      await page.waitForSelector('.cb-stop-btn.hidden', { state: 'attached', timeout: 240000 });
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'phone',
    viewport: { width: 390, height: 844 },
    phone: true,
    async setup(page) {
      await casReady(page);
      await enter(page, "'X^2-4'", 'FACTOR', '355', '113', '/', "'√2'", '→NUM');
    },
  },
];

function frameHtml(png, { width, height }, phone) {
  const img = `<img src="data:image/png;base64,${png.toString('base64')}" width="${width}" height="${height}" style="display:block">`;
  if (phone) {
    return `<body style="margin:0;padding:40px;background:transparent"><div style="display:inline-block;border-radius:52px;padding:12px;background:#0d0e11;box-shadow:0 0 0 2px #2c3038,0 30px 70px rgba(0,0,0,.45)"><div style="border-radius:40px;overflow:hidden">${img}</div></div></body>`;
  }
  const dot = (c) => `<i style="width:12px;height:12px;border-radius:50%;background:${c};display:block"></i>`;
  return `<body style="margin:0;padding:40px;background:transparent"><div style="display:inline-block;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.5),0 28px 70px rgba(0,0,0,.45)"><div style="height:36px;background:#2b2e35;display:flex;align-items:center;gap:8px;padding:0 14px;font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#c9ccd3">${dot('#ec6a5e')}${dot('#f4bf4f')}${dot('#61c554')}<span style="flex:1;text-align:center;margin-right:56px">rpl.ai</span></div>${img}</div></body>`;
}

async function capture(browser, base, scene) {
  const context = await browser.newContext({ viewport: scene.viewport, deviceScaleFactor: SCALE, colorScheme: 'dark' });
  if (scene.init) await context.addInitScript(scene.init, scene.initArg);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__hp50);
  await scene.setup(page);
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
  const shot = await page.screenshot();
  await context.close();
  const framer = await browser.newPage({ deviceScaleFactor: SCALE });
  await framer.setContent(frameHtml(shot, scene.viewport, scene.phone));
  const framed = await framer.locator('body > div').screenshot({ omitBackground: true });
  await framer.close();
  await writeFile(join(OUT, `${scene.name}.png`), framed);
  return errors;
}

const only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
const server = await serveWww();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchChrome();
try {
  for (const scene of SCENES) {
    if (only.length && !only.includes(scene.name)) continue;
    if (scene.skip) { console.log(`skip  ${scene.name} (set RPLAI_SCREENSHOT_LLM and RPLAI_SCREENSHOT_MODEL)`); continue; }
    const errors = await capture(browser, base, scene);
    console.log(`${errors.length ? 'warn' : 'ok  '}  ${scene.name}${errors.length ? `: ${errors.join('; ')}` : ''}`);
  }
} finally {
  await browser.close();
  server.close();
}
