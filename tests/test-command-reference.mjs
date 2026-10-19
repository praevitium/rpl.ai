import { readFileSync } from 'node:fs';
import {
  decodeEntities, htmlToText, parseCommandReference, findReferenceEntry,
  formatReferenceEntry, shortDescription, searchCommands,
} from '../www/src/ui/command-reference.js';
import { allOps, hasOp } from '../www/src/rpl/ops.js';
import { CATEGORIES, signatureOf } from '../www/src/ui/drawer.js';
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
  const baud = REF.get('BAUD');
  assert(baud && !baud.inApp, 'BAUD, a serial I/O command, is indexed but flagged not-in-app');
}

{
  const inputs = (name) => findReferenceEntry(REF, name).inputs;
  assert(inputs('SIN') === 1 && inputs('+') === 2 && inputs('DEPTH') === 0,
         'parseCommandReference: inputs counts the stack arguments of the shortest form');
  assert(inputs('TRN') === 1 && inputs('RSWP') === 3 && inputs('DOT') === 2,
         'parseCommandReference: inputs counts diagram cells, so [[ matrix ]] and "nrow i" are one input each');
  assert(inputs('ROLL') === null && inputs('DROPN') === null,
         'parseCommandReference: inputs is null for a variadic stack diagram');
}

{
  // A soft key shows itself blocked on a stack shorter than these counts, so each command must agree with its count.
  const { lookup } = await import('../www/src/rpl/ops.js');
  const { Stack } = await import('../www/src/rpl/stack.js');
  const wrong = [];
  for (const name of allOps()) {
    if ((findReferenceEntry(REF, name)?.inputs ?? 0) < 1) continue;
    let message = 'ran';
    try { await lookup(name).fn(new Stack(), null); } catch (e) { message = e.message; }
    if (!/Too few arguments|not inside a running program/.test(message)) wrong.push(`${name} (${message})`);
  }
  assert(wrong.length === 0, `every command that needs arguments says Too few arguments on an empty stack (${wrong.join(', ')})`);
  assert(findReferenceEntry(REF, 'MEDIAN').inputs === 0, 'MEDIAN needs no argument, since it reads ΣDAT as MEAN does');
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
  const baud = formatReferenceEntry(REF.get('BAUD'));
  assert(/NOT implemented in this calculator/.test(baud),
         'formatReferenceEntry flags commands the app lacks');
  assert(formatReferenceEntry(null) === '', 'formatReferenceEntry tolerates null');
  assert(shortDescription(REF.get('FIX')).startsWith('Sets the number display format'),
         'shortDescription drops the manual\'s "Foo Command:" lead-in and keeps the first sentence');
{
  const short = (description) => shortDescription({ description });
  assert(short('LU Decomposition of a Square Matrix Command: Returns the LU decomposition. More.') === 'Returns the LU decomposition.'
    && short('Cartesian to Polar: converts a complex number into polar form.') === 'Cartesian to Polar: converts a complex number into polar form.'
    && short('Sets exact (symbolic) evaluation mode: subsequent evaluations keep π.') === 'Sets exact (symbolic) evaluation mode: subsequent evaluations keep π.'
    && short('Factorizes a polynomial or an integer:\n- The function expresses a polynomial as a product.') === 'Factorizes a polynomial or an integer.',
    'shortDescription: a title of any length goes before a sentence, a lead-in that runs on in lower case stays, and a colon before a list ends the sentence (FACTOR read "- The function", EXACT lost its first half)');
}
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
  assert(top('pi')[0] === 'Π' && top('PI')[0] === 'Π',
         'searchCommands: "pi" finds π, which a phone keyboard cannot type (PICK, PICK3 and PICT came first)');
  assert(top('arry').every((n) => !n.includes('->')) && top('arry').includes('ARRY→') && top('c->r')[0] === 'C→R' && top('->num')[0] === '→NUM',
         'searchCommands: an ASCII alias is its arrow command, so "arry" lists ARRY→ and →ARRY once each and "c->r" finds C→R (both search lists showed ARRY-> and ->ARRY beside them)');
  assert(top('square root')[0] === '√' && top('natural logarithm')[0] === 'LN',
         'searchCommands: words that run together in a description outrank one of them as a name ("square root" gave ROOT, PROOT and XROOT, not √)');
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

/* The palette's stack signature is the manual's first stack line, without its column headings or a bare None. */
{
  assert(signatureOf(REF.get('LR')) === '→ Intercept: x1 Slope: x2' && signatureOf(REF.get('SQ')) === 'z → z2' && signatureOf(REF.get('PWRFIT')) === '' && signatureOf(REF.get('MINEHUNT')) === '',
    'signatureOf skips Level n/Argument n headings and the manual\'s None');
}

/* The manual's PDF ran fifteen entries into the one before them (→DATE under DATE, RREF under the CAS rref), so a
   page carried two commands and a lookup of the second found the first.  Each heading now holds one command, and
   where a CAS alias shares a classic command's letters the classic entry wins, in the text index and in the drawer's
   section loader alike. */
{
  const doubled = HTML.split('<h2 id="cmd-').slice(1).filter((sec) => sec.split('cmd-label-type').length > 2).map((sec) => sec.slice(0, sec.indexOf('"')));
  assert(doubled.length === 0, `every reference section describes one command (${doubled.join(', ')})`);
  assert(REF.get('DATE')?.description.startsWith('Date Command: Returns the system date') && REF.get('→DATE')?.description.startsWith('Set Date Command: Sets the system date'),
    '→DATE has a page of its own under DATE');
  assert(REF.get('RREF')?.name === 'RREF' && REF.get('QR')?.name === 'QR' && REF.get('PSI')?.name === 'PSI' && REF.get('NEXT')?.description.startsWith('NEXT Command: Ends definite loop'),
    'RREF, QR and PSI index the classic commands, not the CAS rref, qr and Psi, and NEXT the command, not the NEXT operation');
  const helpSrc = readFileSync(new URL('../www/src/ui/command-help.js', import.meta.url), 'utf8');
  assert(/const prior = named\.get\(upper\);\s*if \(prior && !\(key === upper && prior !== upper\)\) continue;\s*named\.set\(upper, key\);/.test(helpSrc),
    "the drawer's section loader keeps the classic command's section over a CAS alias of the same letters");
}

/* The program structures, « », →, _, π, e and i are read by the parser, so no command registers them; the
   reference counts them in, offering Insert, where it greyed them out as "Not available in rpl.ai". */
{
  const { isSyntaxWord } = await import('../www/src/ui/command-help.js');
  const words = ['IF', 'THEN', 'ELSE', 'END', 'CASE', 'IFERR', 'FOR', 'NEXT', 'START', 'STEP', 'DO', 'UNTIL', 'WHILE', 'REPEAT', '« »', '→', '_', 'π', 'e', 'i'];
  assert(words.every((w) => isSyntaxWord(w) && isSyntaxWord(w.toUpperCase()) && !hasOp(w)) && !isSyntaxWord('SIN') && !isSyntaxWord('IFT') && !isSyntaxWord('PICT'),
    'syntax words: the twenty headings the parser reads are syntax, in either case, and none is a registered command');
  const marked = words.map((w) => REF.get(w.toUpperCase())).filter((e) => !e?.inApp).map((e) => e?.name);
  assert(marked.length === 0, `syntax words: the AUR page marks IF, FOR, « », →, _, π, e, i and the rest in app (${marked.join(', ')})`);
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(/const runnable = !!lookup\(name\);\s*const available = runnable \|\| isSyntaxWord\(name\);/.test(drawerSrc)
    && /\$\{runnable \|\| isSyntaxWord\(name\) \? `<button type="button" class="btn\$\{runnable \? '' : ' pri'\}" data-dw="ref-insert">Insert in the command line<\/button>` : `<span class="badge">Not available in rpl.ai<\/span>`\}/.test(drawerSrc)
    && /typeSyntaxWord\(this\.app\.entry, word\);/.test(drawerSrc),
    "syntax words: the Catalog lists them as available and their reference offers Insert (no Run), where IF's page said Not available in rpl.ai");
  const { typeSyntaxWord } = await import('../www/src/ui/command-help.js');
  const typed = (word) => { const calls = []; typeSyntaxWord({ typeObject: (t, b) => calls.push(`object ${t} ${b}`), typeWithCursor: (t) => calls.push(`cursor ${t}`), typeToken: (t) => calls.push(`token ${t}`) }, word); return calls.join(); };
  assert(typed('« »') === 'object «  » 2' && typed('_') === 'cursor _' && typed('IF') === 'token IF ' && typed('π') === 'token π ',
    'syntax words: Insert types « » around the cursor, _ as the key strip does, and a word such as IF or π with a space after it');
}

/* A Catalog search finds manual pages by their capitalised key, and its rows showed that key: π as Π, →Qπ as →QΠ,
   e as E, i as I, while the page itself is titled π. The row now shows the page's own spelling. */
{
  const spelled = [...REF].filter(([key, e]) => e.name !== key).map(([, e]) => e.name);
  assert(['π', 'e', 'i', '→Qπ', 'dn', 'F0λ', 'lim'].every((n) => spelled.includes(n)), `catalog rows: the manual spells π, e, i, →Qπ, dn, F0λ and lim in lower case (${spelled.join(' ')})`);
  const { spelledName } = await import('../www/src/ui/command-reference.js');
  assert(spelledName(REF.get('Π'), 'Π') === 'π' && spelledName(REF.get('→QΠ'), '→QΠ') === '→Qπ' && spelledName(REF.get('E'), 'E') === 'e'
    && spelledName(findReferenceEntry(REF, 'SQRT'), 'SQRT') === 'SQRT' && spelledName(null, 'NOPE') === 'NOPE',
    'catalog rows: spelledName gives a page\'s own spelling for its capitalised key, and keeps an alias or an unknown name as it is');
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(/const shown = spelledName\(entry, name\);\s*const label = query \? highlightSegments\(shown, matchPositions\(query, shown\)\)/.test(drawerSrc)
    && /title="Open the reference for \$\{escapeHtml\(shown\)\}"/.test(drawerSrc),
    'catalog rows: a row shows the manual page\'s own spelling of its name (π, →Qπ, e, i), where a search listed Π, →QΠ, E and I');
}

/* Command search found IF, FOR and π but choosing one said "IF isn't available in rpl.ai" (inside an open program
   too) and listed π as Π. A syntax word now goes onto the command line as the Catalog's Insert types it, in the
   manual's spelling. */
{
  const paletteSrc = readFileSync(new URL('../www/src/ui/palette.js', import.meta.url), 'utf8');
  assert(/const shown = spelledName\(entry, name\);\s*const runnable = !!lookup\(name\);/.test(paletteSrc)
    && /kind: 'command', title: shown,/.test(paletteSrc)
    && /: \(\) => typeSyntaxWord\(this\.app\.entry, shown\),/.test(paletteSrc),
    'command search: IF, FOR, π and the other syntax words show in the manual\'s spelling and choosing one types it on the command line, where it said "IF isn\'t available in rpl.ai"');
}

/* Command search listed commands rpl.ai lacks, such as PICT and PIXON, like any other, and choosing one put up an
   error. Such a row now carries a "not in app" badge beside its name, which leaves the description its width on a
   280 px phone and stays in view with the keyboard up where the description line hides, and choosing it opens its
   reference page. */
{
  const paletteSrc = readFileSync(new URL('../www/src/ui/palette.js', import.meta.url), 'utf8');
  assert(/const missing = !runnable && !isSyntaxWord\(name\);/.test(paletteSrc)
    && /run: runnable \? \(\) => \{ this\._remember\(name\); this\.app\.runCommandFromUI\(name\); \}\s*: missing \? \(\) => this\.app\.drawers\.showReference\(name\)/.test(paletteSrc)
    && /\$\{it\.missing \? ' <span class="badge">not in app<\/span>' : ''\}<\/span>/.test(paletteSrc),
    'command search: a command rpl.ai lacks wears a "not in app" badge and opens its reference page when chosen, where PICT looked runnable and choosing it put up an error');
}

/* On a 280 px phone a command's description kept four or five words ("Finds zeros of an express…"); on touch it takes
   two lines in command search and the Catalog, and the keyboard-up rule still hides it. */
{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const touch = css.slice(css.indexOf('@media (pointer: coarse) {'));
  assert(/\n  \.pal-row \.d, \.pal-row \.pv, \.cmd-row \.ds \{ white-space: normal; text-wrap: pretty; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; \}/.test(touch.slice(0, touch.indexOf('\n}\n')))
    && /:root\[data-keyboard\] \.dw-head, :root\[data-keyboard\] \.pal-row \.d \{ display: none; \}/.test(css),
    'command search and Catalog rows give a description, and the highlighted row\'s preview ("LIST→ needs more values th…" at 280 px), two lines on touch without a lone last word ("z → sin" over "z"), and hide the description while the keyboard is up');
}

/* "pi" listed π twice in command search, under Constants and under Commands, once π became findable by name. */
{
  const paletteSrc = readFileSync(new URL('../www/src/ui/palette.js', import.meta.url), 'utf8');
  assert(/const listed = new Set\(commandRows\.map\(\(it\) => it\.title\)\);/.test(paletteSrc)
    && /CHAR_GROUPS\.Constants\.filter\(\(\[label\]\) => !listed\.has\(label\)\)/.test(paletteSrc),
    'command search: a constant that is also a listed command (π, e, i) shows once, under Commands, where "pi" listed π twice');
}

/* At 280 px the focused search field clipped "Search commands, settings, variables, constants…" mid-word: a focused field drops text-overflow. */
{
  const paletteSrc = readFileSync(new URL('../www/src/ui/palette.js', import.meta.url), 'utf8');
  assert(/input\.placeholder = PLACEHOLDERS\.find\(fits\) \?\? PLACEHOLDERS\.at\(-1\);/.test(paletteSrc)
    && /this\._fitPlaceholder\(\);\n    this\._input\.value = seed;/.test(paletteSrc)
    && /'Search commands…'\]\);/.test(paletteSrc),
    'command search: the placeholder is the longest wording that fits the field, down to "Search commands…" on a narrow phone');
}

/* A Catalog family card beside one whose name wraps grew to match it, and its count slid down from its name. */
{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.cat-cats button \{[^}]*display: grid; align-content: start;/.test(css),
    'Catalog families: a card keeps its command count under its name when a neighbour\'s name wraps');
}

/* On a 280 px phone the drawer tabs row started at its left edge, so the open drawer's tab (History, Chars) sat past the right edge. */
{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(/this\._renderBody\(\);\n    this\._revealTab\(\);/.test(drawerSrc)
    && /const past = \(t\.left < s\.left \+ TAB_FADE && strip\.scrollLeft > 0\) \|\| \(t\.right > s\.right - TAB_FADE && strip\.scrollLeft \+ strip\.clientWidth < strip\.scrollWidth\);\s*if \(past\) strip\.scrollLeft \+= t\.left \+ t\.width \/ 2 - \(s\.left \+ s\.width \/ 2\);/.test(drawerSrc)
    && /const TAB_FADE = 36;/.test(drawerSrc),
    'drawer tabs: the open drawer\'s tab scrolls to the middle of the row when it would sit past an edge or under its 36 px fade (History at 360 px with the keypad hidden)');
}

/* The tabs beside the open one showed cut at both edges with nothing to say the row scrolls; it fades there as the key strip does. */
{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/this\.el\.querySelector\('\.dw-tabs'\)\.addEventListener\('scroll', \(\) => this\._markTabEdges\(\), \{ passive: true \}\);\n    this\._markTabEdges\(\);/.test(drawerSrc)
    && /new ResizeObserver\(\(\) => this\._markTabEdges\(\)\)\.observe\(this\.el\);/.test(drawerSrc)
    && ['.dw-tabs.more-r,', '.dw-tabs.more-l,', '.dw-tabs.more-l.more-r,'].every((sel) => css.includes(sel)),
    'drawer tabs: the row fades at an edge with more tabs past it, after a render, a scroll and a resize');
}
