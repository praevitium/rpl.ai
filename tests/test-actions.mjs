import { assert } from './helpers.mjs';
import {
  ACTIONS, KEYMAP, CONTEXT_LABELS, BROWSER_RESERVED_CHORDS,
  isBarePrintableChord, chordFromEvent, chordText, findBinding, shortcutText, parseChord,
} from '../www/src/ui/actions.js';

{
  const hidden = Object.entries(ACTIONS).filter(([, a]) => !a.surfaces?.length).map(([id]) => id);
  assert(hidden.length === 0, `every action has a visible surface${hidden.length ? ` (missing: ${hidden.join(', ')})` : ''}`);
}

{
  const unknown = KEYMAP.filter((b) => !ACTIONS[b.action]).map((b) => b.action);
  assert(unknown.length === 0, `every keymap binding runs a registered action${unknown.length ? ` (${unknown.join(', ')})` : ''}`);
  const badContexts = KEYMAP.filter((b) => !CONTEXT_LABELS[b.context]).map((b) => b.context);
  assert(badContexts.length === 0, 'every keymap context has a label for the shortcut sheet');
}

{
  const seen = new Map();
  const clashes = [];
  for (const b of KEYMAP) {
    const key = `${b.context} ${b.chord}`;
    if (seen.has(key)) clashes.push(key);
    seen.set(key, b);
  }
  const globals = new Set(KEYMAP.filter((b) => b.context === 'global').map((b) => b.chord));
  for (const b of KEYMAP) {
    if (b.context !== 'global' && globals.has(b.chord)) clashes.push(`${b.context} ${b.chord} shadows a global chord`);
  }
  assert(clashes.length === 0, `no chord is bound twice in one context${clashes.length ? ` (${clashes.join('; ')})` : ''}`);
}

{
  const printable = KEYMAP.filter((b) => b.context === 'global' && isBarePrintableChord(b.chord)).map((b) => b.chord);
  assert(printable.length === 0, `no global binding is a bare printable key, so "/" and "?" type${printable.length ? ` (${printable.join(' ')})` : ''}`);
  assert(isBarePrintableChord('/') && isBarePrintableChord('?') && isBarePrintableChord('Shift+A') && isBarePrintableChord('Space'),
    'isBarePrintableChord: "/", "?", Shift+A and Space are printable');
  assert(!isBarePrintableChord('Mod+/') && !isBarePrintableChord('F1') && !isBarePrintableChord('Escape'),
    'isBarePrintableChord: Mod+/, F1 and Escape are not printable');
}

{
  const reserved = new Set(BROWSER_RESERVED_CHORDS);
  const hits = KEYMAP.filter((b) => reserved.has(b.chord)).map((b) => b.chord);
  assert(hits.length === 0, `no binding uses a chord the browser reserves${hits.length ? ` (${hits.join(' ')})` : ''}`);
}

{
  const ev = (key, extra = {}) => ({ key, code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra });
  assert(chordFromEvent(ev('k', { metaKey: true, code: 'KeyK' }), true) === 'Mod+K', 'chordFromEvent: ⌘K on a Mac is Mod+K');
  assert(chordFromEvent(ev('k', { ctrlKey: true, code: 'KeyK' }), false) === 'Mod+K', 'chordFromEvent: Ctrl+K elsewhere is Mod+K');
  assert(chordFromEvent(ev('k', { ctrlKey: true, code: 'KeyK' }), true) === 'Ctrl+K', 'chordFromEvent: Ctrl+K on a Mac stays Ctrl+K');
  assert(chordFromEvent(ev('Z', { metaKey: true, shiftKey: true, code: 'KeyZ' }), true) === 'Mod+Shift+Z', 'chordFromEvent: ⇧⌘Z is Mod+Shift+Z');
  assert(chordFromEvent(ev('?', { shiftKey: true, code: 'Slash' }), true) === '?', 'chordFromEvent: Shift+/ typing "?" is the bare "?" chord');
  assert(chordFromEvent(ev('ƒ', { altKey: true, code: 'KeyF' }), true) === 'Alt+F', 'chordFromEvent: ⌥F on a Mac reads the physical key');
  assert(chordFromEvent(ev('F3', { shiftKey: true, code: 'F3' }), false) === 'Shift+F3', 'chordFromEvent: Shift+F3');
  assert(chordFromEvent(ev('Shift', { shiftKey: true }), false) === '', 'chordFromEvent: a lone modifier is not a chord');
  assert(chordFromEvent(ev('\\', { metaKey: true, code: 'Backslash' }), true) === 'Mod+\\', 'chordFromEvent: ⌘\\ is Mod+\\');
}

{
  assert(chordText('Mod+Shift+Z', true) === '⇧⌘Z', 'chordText: Mac glyphs in Apple order');
  assert(chordText('Mod+Shift+Z', false) === 'Ctrl+Shift+Z', 'chordText: Ctrl spelled out elsewhere');
  assert(chordText('ArrowUp', true) === '↑' && chordText('Backspace', false) === '⌫', 'chordText: arrow and backspace glyphs');
  assert(chordText('+', false) === '+' && parseChord('Mod++').key === '+', 'chordText / parseChord: the plus key');
  assert(shortcutText('palette.open', true) === '⌘K', 'shortcutText: the palette shows ⌘K');
}

{
  assert(findBinding('Enter', ['selection', 'empty', 'global'])?.action === 'level.edit',
    'findBinding: Enter on a selected level edits it');
  assert(findBinding('Enter', ['empty', 'global'])?.action === 'stack.dup', 'findBinding: Enter on an empty line is DUP');
  assert(findBinding('/', ['line', 'global']) === null, 'findBinding: "/" in the command line is not a shortcut');
  assert(findBinding('Mod+C', ['empty', 'global'])?.action === 'level.copy' && findBinding('Mod+C', ['line', 'global']) === null,
    'findBinding: Ctrl or Cmd+C on an empty line copies level 1, and with text on the line it is left to the editor');
  assert(findBinding('Mod+Enter', ['matrix', 'global'])?.action === 'writer.commit',
    'findBinding: Ctrl or Cmd+Enter in the matrix writer pushes the matrix, listed with the writer\'s other shortcuts');
  assert(findBinding('Shift+Enter', ['selection', 'empty', 'global'])?.action === 'level.echo' && findBinding('Shift+Enter', ['line', 'global'])?.action === 'line.newline',
    'findBinding: Shift+Enter on a selected level copies it into the command line, as the interactive stack\'s ECHO does; on a line with no level selected it starts a new line');
  assert(findBinding('Mod+A', ['equation', 'global'])?.action === 'eqw.selectAll' && findBinding('Mod+A', ['line', 'global']) === null,
    'findBinding: Ctrl or Cmd+A in the equation writer selects the whole formula, where it selected the whole page for Ctrl+C to copy; on the command line it is left to the editor');
  assert(findBinding('Space', ['selection', 'empty', 'global'])?.action === 'level.view' && findBinding('Space', ['empty', 'global']) === null,
    'findBinding: Space on a selected level shows it full size, as the interactive stack\'s VIEW does; with nothing selected it is not a shortcut');
  assert(findBinding('Home', ['selection', 'empty', 'global'])?.action === 'level.top' && findBinding('End', ['selection', 'empty', 'global'])?.action === 'level.bottom'
    && findBinding('Home', ['line', 'global']) === null,
    'findBinding: Home and End move the interactive stack\'s pointer to the top level and to level 1; with no level selected they are left to the command line');
}
