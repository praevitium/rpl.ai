import { readFileSync } from 'node:fs';
import {
  decodeEntities, htmlToText, parseCommandReference, findReferenceEntry,
  formatReferenceEntry, shortDescription, searchCommands,
} from '../www/src/ui/command-reference.js';
import { allOps, hasOp } from '../www/src/rpl/ops.js';
import { CATEGORIES } from '../www/src/ui/side-panel.js';
import { assert } from './helpers.mjs';

/* Command-reference text index — what the AI assistant's lookup_command
   and search_commands tools read.  The parser is pure string work over
   docs/hp50-commands.html so it runs here without a DOM; these tests pin
   the field extraction, the alias fallbacks, the model-facing formatting
   and the search ranking against the real document. */

{
  assert(decodeEntities('a &lt; b &amp; c &#x60;x&#x60; &#65;') === 'a < b & c `x` A',
         'decodeEntities handles named, hex and decimal entities');
  assert(decodeEntities('&bogus;') === '&bogus;',
         'decodeEntities leaves unknown named entities alone');
}

{
  const html = '<p>First.</p><ul class="cmd-bullets"><li>one</li><li>two</li></ul>'
    + '<table class="cmd-io"><thead><tr><th>L2</th><th>L1</th><th></th><th>Out</th></tr></thead>'
    + '<tbody><tr><td>x</td><td>y</td><td class="cmd-io-arrow">→</td><td>x+y</td></tr>'
    + '<tr><td>n</td><td class="cmd-io-arrow">→</td><td></td></tr></tbody></table>'
    + '<table class="cmd-kv"><tbody><tr><th>Command</th><td>FOO(1)</td></tr>'
    + '<tr><th>Result</th><td>2</td></tr></tbody></table>';
  const text = htmlToText(html);
  const lines = text.split('\n');
  assert(lines[0] === 'First.', 'htmlToText keeps a paragraph on its own line');
  assert(lines[1] === '- one' && lines[2] === '- two', 'htmlToText renders list items as dashes');
  assert(lines[3] === 'x y → x+y', 'htmlToText renders an io row as args → result');
  assert(lines[4] === 'n → (nothing)', 'htmlToText names an empty io result');
  assert(lines[5] === 'Command: FOO(1)' && lines[6] === 'Result: 2',
         'htmlToText renders a kv table as label: value lines');
  assert(!/<[a-z]/.test(text), 'htmlToText strips every tag');
}

const HTML = readFileSync(new URL('../www/docs/hp50-commands.html', import.meta.url), 'utf8');
const REF = parseCommandReference(HTML);

{
  assert(REF.size >= 800, `parseCommandReference indexes the whole document (${REF.size} entries)`);
  const fact = REF.get('FACT');
  assert(fact && fact.inApp && fact.type === 'Command',
         'FACT entry carries in-app flag and type');
  assert(/Factorial/.test(fact.description), 'FACT entry has its description');
  assert(/n → n!/.test(fact.io), 'FACT entry renders its stack diagram');
  assert(fact.seeAlso.includes('COMB') && fact.seeAlso.includes('!'),
         'FACT entry lists see-also tokens');
  const deriv = REF.get('DERIV');
  assert(/Level 2\/Argument 1/.test(deriv.input) && /derivative/.test(deriv.output),
         'DERIV entry splits input/output fields');
  assert(/DERIV\(2\*X\^2\*Y/.test(deriv.example), 'DERIV entry keeps its example command');
  const root = REF.get('ROOT');
  assert(root && !root.inApp, 'ROOT is indexed but flagged not-in-app');
}

// →LIST's manual page runs into ΔLIST's under one heading; the first
// description must win so →LIST doesn't describe list differences.
{
  const e = REF.get('→LIST');
  assert(e && /Stack to List/.test(e.description),
         'parseCommandReference keeps the first description when a page runs two commands together');
  assert(/obj1 … objn n → \{ obj1/.test(e.io), '→LIST keeps its own stack diagram');
}

{
  assert(findReferenceEntry(REF, 'fact') === REF.get('FACT'), 'findReferenceEntry is case-insensitive');
  assert(findReferenceEntry(REF, 'SQRT') === REF.get('√'), 'findReferenceEntry follows the SQRT → √ alias');
  assert(findReferenceEntry(REF, 'INTEG') === REF.get('∫'), 'findReferenceEntry follows the INTEG → ∫ alias');
  assert(findReferenceEntry(REF, '->LIST') === REF.get('→LIST'), 'findReferenceEntry maps ASCII -> to →');
  assert(findReferenceEntry(REF, 'NOPE_XYZ') === null, 'findReferenceEntry returns null for unknown names');
  assert(findReferenceEntry(REF, '') === null && findReferenceEntry(REF, null) === null,
         'findReferenceEntry returns null for empty input');
}

{
  const text = formatReferenceEntry(REF.get('FACT'));
  assert(text.startsWith('FACT (Command)'), 'formatReferenceEntry leads with name and type');
  assert(/\nStack:\nn → n!/.test(text), 'formatReferenceEntry includes the stack diagram');
  assert(/See also: COMB, PERM, !/.test(text), 'formatReferenceEntry includes see-also');
  const sto = formatReferenceEntry(REF.get('STO'), { maxChars: 500 });
  assert(sto.length <= 500, 'formatReferenceEntry honours maxChars');
  const root = formatReferenceEntry(REF.get('ROOT'));
  assert(/NOT implemented in this calculator/.test(root),
         'formatReferenceEntry flags commands the app lacks');
  assert(formatReferenceEntry(null) === '', 'formatReferenceEntry tolerates null');
  assert(shortDescription(REF.get('FIX')).startsWith('Sets the number display format'),
         'shortDescription drops the manual\'s "Foo Command:" lead-in and keeps the first sentence');
}

{
  const opts = { names: allOps(), entries: REF, categories: CATEGORIES };
  const top = (q) => searchCommands(q, opts).map((r) => r.name);
  assert(top('SWAP')[0] === 'SWAP', 'searchCommands: exact name wins');
  assert(top('swap')[0] === 'SWAP', 'searchCommands: exact name match is case-insensitive');
  assert(top('prime').slice(0, 3).includes('ISPRIME?') && top('prime').slice(0, 3).includes('NEXTPRIME'),
         'searchCommands: keyword hits in descriptions rank the prime family first');
  assert(top('derivative')[0] === 'DERIV', 'searchCommands: name-prefix affinity ranks DERIV first for "derivative"');
  assert(top('convert units')[0] === 'CONVERT', 'searchCommands: multi-word query finds CONVERT');
  const mat = searchCommands('matrix commands', opts);
  assert(mat.filter((r) => r.category === 'Vectors / matrices').length >= 5,
         'searchCommands: a category stem match ("matrix" ~ "matrices") lists that category');
  assert(top('factorial')[0] === 'FACT', 'searchCommands: "factorial" finds FACT');
  const rows = searchCommands('mean', opts);
  assert(rows[0].name === 'MEAN' && rows[0].inApp && /average|mean/i.test(rows[0].description),
         'searchCommands rows carry inApp and a one-line description');
  assert(rows.every((r) => r.inApp || r.score >= 20),
         'searchCommands drops not-in-app entries unless the name matched strongly');
  assert(searchCommands('', opts).length === 0, 'searchCommands returns nothing for an empty query');
  assert(searchCommands('mean', { names: allOps(), entries: null, categories: CATEGORIES })[0].name === 'MEAN',
         'searchCommands still ranks by name when the reference has not loaded');
  const limited = searchCommands('list', { ...opts, limit: 3 });
  assert(limited.length === 3, 'searchCommands honours limit');
  for (const r of searchCommands('stack', opts)) {
    if (r.inApp) assert(hasOp(r.name) || REF.get(r.name.toUpperCase())?.inApp,
                        `searchCommands inApp row ${r.name} is registered or doc-flagged in-app`);
  }
}

// Heading ids must be unique: LCD→ used to share LASTARG's id, so the
// badge script last-wins-grayed LASTARG and the LCD→ TOC href was dead.
{
  const ids = [...HTML.matchAll(/<h2 id="(cmd-[^"]+)">/g)].map((m) => m[1]);
  const seen = new Set();
  const dups = [];
  for (const id of ids) {
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  assert(dups.length === 0,
         `command-reference heading ids are unique (dups: ${dups.join(', ')})`);
  assert(seen.has('cmd-LCD-to') && seen.has('cmd-LASTARG'),
         'LCD→ and LASTARG have distinct heading ids');
  const toc = HTML.split('<div class="toc"', 2)[1].split('</div>', 2)[0];
  const hrefs = [...toc.matchAll(/<a href="#(cmd-[^"]+)"/g)].map((m) => m[1]);
  const missing = hrefs.filter((h) => !seen.has(h));
  assert(missing.length === 0,
         `every TOC href has a heading (missing: ${missing.join(', ')})`);
}

{
  assert(REF.get('LASTARG')?.inApp, 'LASTARG is flagged in-app');
  assert(REF.get('PMINI')?.inApp, 'PMINI is flagged in-app');
  assert(REF.get('SCHUR')?.inApp, 'SCHUR is flagged in-app');
  assert(findReferenceEntry(REF, 'SQRT')?.inApp,
         'SQRT / √ heading is flagged in-app');
  const lcd = findReferenceEntry(REF, 'LCD→');
  assert(lcd && !lcd.inApp, 'LCD→ is indexed and flagged not-in-app');
  assert(REF.get('COL–')?.inApp && REF.get('ROW–')?.inApp
      && REF.get('HMS–')?.inApp && REF.get('STO–')?.inApp,
         'en-dash COL– / ROW– / HMS– / STO– headings are flagged in-app');
}
