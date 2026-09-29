#!/usr/bin/env node
// The generator behind hp50-commands.html isn't checked in, so this edits its regular markup in place.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { allOps } from '../www/src/rpl/ops.js';
import { ALIASES } from '../www/src/ui/command-help.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(HERE, '../www/docs/hp50-commands.html');

const registered = new Set(allOps().map(s => s.toUpperCase()));

function decodeEntities(s) {
  return s
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&amp;/g,  '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g,            (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function commandKey(display) {
  // Symbol headings carry a name in parentheses, e.g. `!(Factorial)` is `!`.
  const stripped = display.replace(/\s*\(.*\)\s*$/, '').trim();
  return decodeEntities(stripped).toUpperCase();
}

// Headings use glyphs (`√`) where the registry uses mnemonics (`SQRT`).
const dispatchForDoc = new Map();
for (const [dispatch, doc] of ALIASES) {
  dispatchForDoc.set(String(doc).toUpperCase(), String(dispatch).toUpperCase());
}

const UI_COMMANDS = new Set(['EQW']);

function isRegistered(display) {
  const key = commandKey(display);
  if (UI_COMMANDS.has(key)) return true;
  if (registered.has(key)) return true;
  const alias = dispatchForDoc.get(key);
  return !!(alias && registered.has(alias));
}

let html = readFileSync(HTML_PATH, 'utf8');

const idToInApp = new Map();
let h2Count = 0;
html = html.replace(
  /<h2 id="(cmd-[^"]+)">([^<]+?) <span class="(?:in-app|not-in-app)">(?:in app|not in app)<\/span>/g,
  (_m, id, display) => {
    h2Count += 1;
    const inApp = isRegistered(display);
    idToInApp.set(id, inApp);
    const cls   = inApp ? 'in-app' : 'not-in-app';
    const label = inApp ? 'in app' : 'not in app';
    return `<h2 id="${id}">${display} <span class="${cls}">${label}</span>`;
  });

if (h2Count === 0) {
  console.error('No <h2 id="cmd-…"> entries matched — has the markup changed?');
  process.exit(1);
}

html = html.replace(
  /<a href="(#cmd-[^"]+)"(?:\s+class='notinapp')?>([^<]+)<\/a>/g,
  (m, href, label) => {
    const id = href.slice(1);
    if (!idToInApp.has(id)) return m;
    return idToInApp.get(id)
      ? `<a href="${href}">${label}</a>`
      : `<a href="${href}" class='notinapp'>${label}</a>`;
  });

const inAppCount = [...idToInApp.values()].filter(Boolean).length;
const totalCount = idToInApp.size;
html = html.replace(
  /(\d+) commands extracted from the HP 50g Advanced User's Reference Manual\. (\d+) are implemented in this RPL app\./,
  `${totalCount} commands extracted from the HP 50g Advanced User's Reference Manual. ${inAppCount} are implemented in this RPL app.`);

writeFileSync(HTML_PATH, html);

console.log(
  `Updated ${HTML_PATH}: ${inAppCount} in-app, ${totalCount - inAppCount} not-in-app of ${totalCount} commands.`);
