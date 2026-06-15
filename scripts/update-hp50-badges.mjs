#!/usr/bin/env node
/* The original generator that produced hp50-commands.html isn't checked
   in, so this script edits the existing markup in place.  Pure regex
   updates (no DOM library) — the markup the generator emits is regular
   enough that a few targeted patterns suffice. */

import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { allOps } from '../www/src/rpl/ops.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(HERE, '../www/docs/hp50-commands.html');

const registered = new Set(allOps().map(s => s.toUpperCase()));

// HP50 reference docs encode `<`, `>`, etc. as HTML entities in the
// h2 display text (e.g. `&lt;(Less than)`).  We have to decode before
// looking up the registry, since ops are registered as raw chars.
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
  // Strip the parenthetical disambiguator the generator appends to
  // symbol commands (e.g. `!(Factorial)` → `!`).  Decode entities and
  // upper-case so the match is symmetric with `register()`.
  const stripped = display.replace(/\s*\(.*\)\s*$/, '').trim();
  return decodeEntities(stripped).toUpperCase();
}

let html = readFileSync(HTML_PATH, 'utf8');

const idToInApp = new Map();
let h2Count = 0;
html = html.replace(
  /<h2 id="(cmd-[^"]+)">([^<]+?) <span class="(?:in-app|not-in-app)">(?:in app|not in app)<\/span>/g,
  (_m, id, display) => {
    h2Count += 1;
    const inApp = registered.has(commandKey(display));
    idToInApp.set(id, inApp);
    const cls   = inApp ? 'in-app' : 'not-in-app';
    const label = inApp ? 'in app' : 'not in app';
    return `<h2 id="${id}">${display} <span class="${cls}">${label}</span>`;
  });

if (h2Count === 0) {
  console.error('No <h2 id="cmd-…"> entries matched — has the markup changed?');
  process.exit(1);
}

// The lead anchor (id='top') has no `cmd-` prefix; only links pointing
// at command sections are touched.
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
