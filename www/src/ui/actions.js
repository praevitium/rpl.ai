export const ACTIONS = Object.freeze({
  'palette.open':      { label: 'Search commands, settings and help', surfaces: ['appbar.search'] },
  'assistant.ask':     { label: 'Ask the assistant', surfaces: ['input.ask', 'rail.assistant'] },
  'assistant.tutor':   { label: 'Walk me through a problem (Tutor)', surfaces: ['stack.empty', 'drawer.assistant', 'palette'] },
  'writer.equation':   { label: 'Equation writer', surfaces: ['input.tabs', 'keypad.EQW'] },
  'writer.matrix':     { label: 'Matrix writer', surfaces: ['input.tabs'] },
  'writer.commit':     { label: 'Push what you wrote, or put it back in the level being edited', surfaces: ['input.go', 'menu.EQUATION', 'menu.MATRIX'] },
  'drawer.toggle':     { label: 'Show or hide the tools drawer', surfaces: ['rail', 'drawer.close'] },
  'keypad.toggle':     { label: 'Show or hide the keypad', surfaces: ['appbar.keypad', 'keypad.head'] },
  'view.minimal':      { label: 'Minimal view: status line, stack and command line', surfaces: ['appbar.minimal', 'status.minimal', 'settings.appearance'] },
  'settings.open':     { label: 'Settings', surfaces: ['appbar.settings'] },
  'shortcuts.open':    { label: 'Keyboard shortcuts', surfaces: ['appbar.help'] },
  'help.tour':         { label: 'Take the tour', surfaces: ['appbar.help', 'palette'] },
  'catalog.open':      { label: 'Command reference', surfaces: ['appbar.help', 'rail.catalog'] },
  'about.open':        { label: 'About rpl.ai', surfaces: ['appbar.help'] },
  'edit.undo':         { label: 'Undo', surfaces: ['appbar.undo', 'keypad.UNDO'] },
  'edit.redo':         { label: 'Redo', surfaces: ['appbar.redo', 'keypad.REDO'] },
  'edit.paste':        { label: 'Paste HP-format text into the command line', surfaces: ['palette'] },
  'ui.escape':         { label: 'Close, clear the selection, dismiss, or cancel the edit', surfaces: ['keypad.ON'] },
  'menu.prev':         { label: 'Previous menu page', surfaces: ['menubar.prev', 'keypad.PREV'] },
  'menu.next':         { label: 'Next menu page', surfaces: ['menubar.next', 'keypad.NEXT'] },
  'softkey.press':     { label: 'Soft key', surfaces: ['menubar.keys'] },
  'softkey.store':     { label: 'Soft key, ↰ layer (store into that variable)', surfaces: ['menubar.keys'] },
  'softkey.recall':    { label: 'Soft key, ↱ layer (recall without running)', surfaces: ['menubar.keys'] },
  'line.newline':      { label: 'New line in the command line', surfaces: ['input.hint', 'keypad.↵'] },
  'stack.dup':         { label: 'DUP: copy level 1', surfaces: ['keypad.ENTER'] },
  'stack.drop':        { label: 'DROP: remove level 1', surfaces: ['keypad.⌫'] },
  'stack.swap':        { label: 'SWAP levels 1 and 2', surfaces: ['keypad.▶'] },
  'level.selectFirst': { label: 'Select level 1', surfaces: ['keypad.▲', 'stack.row'] },
  'level.editFirst':   { label: 'Edit level 1 in its writer', surfaces: ['keypad.▼', 'stack.row'] },
  'level.up':          { label: 'Select the level above', surfaces: ['keypad.▲', 'menu.LEVEL'] },
  'level.down':        { label: 'Select the level below', surfaces: ['keypad.▼', 'menu.LEVEL'] },
  'level.rollUp':      { label: 'Move the level up (ROLLD)', surfaces: ['stack.drag', 'menu.LEVEL'] },
  'level.rollDown':    { label: 'Move the level down (ROLL)', surfaces: ['stack.drag', 'menu.LEVEL'] },
  'level.edit':        { label: 'Edit the selected level', surfaces: ['stack.toolbar', 'menu.LEVEL'] },
  'level.drop':        { label: 'Drop the selected level', surfaces: ['stack.toolbar', 'menu.LEVEL'] },
  'level.copy':        { label: 'Copy the selected level', surfaces: ['stack.toolbar', 'menu.LEVEL'] },
  'level.pick':        { label: 'PICK: copy the selected level to level 1', surfaces: ['menu.LEVEL'] },
  'eqw.fraction':      { label: 'Fraction: what you typed becomes the numerator', surfaces: ['menu.EQUATION', 'keypad.÷'] },
  'eqw.power':         { label: 'Exponent', surfaces: ['menu.EQUATION', 'keypad.yˣ'] },
  'eqw.group':         { label: 'Parentheses that close themselves', surfaces: ['menu.EQUATION', 'keypad.( )'] },
  'eqw.next':          { label: 'Next box', surfaces: ['input.hint'] },
  'eqw.extend':        { label: 'Extend the selection', surfaces: ['eqw.selection'] },
  'matrix.nextCell':   { label: 'Next cell (adds a row after the last)', surfaces: ['input.hint', 'menu.MATRIX'] },
  'plot.pan':          { label: 'Pan the plot, or move the trace cursor', surfaces: ['plot.drag', 'plot.range'] },
  'plot.zoomIn':       { label: 'Zoom in', surfaces: ['plot.toolbar'] },
  'plot.zoomOut':      { label: 'Zoom out', surfaces: ['plot.toolbar'] },
  'plot.reset':        { label: 'Reset the view', surfaces: ['plot.toolbar'] },
  'plot.trace':        { label: 'Trace mode', surfaces: ['plot.toolbar'] },
  'plot.fullscreen':   { label: 'Full screen', surfaces: ['plot.toolbar'] },
  'palette.move':      { label: 'Choose a result', surfaces: ['palette.list'] },
  'palette.run':       { label: 'Run the result', surfaces: ['palette.list'] },
  'palette.reference': { label: 'Open the reference', surfaces: ['palette.list'] },
});

export const CONTEXT_LABELS = Object.freeze({
  global: 'Anywhere',
  empty: 'Empty command line (the keys show these meanings)',
  line: 'Command line',
  selection: 'A stack level is selected',
  equation: 'Equation writer',
  matrix: 'Matrix writer',
  plot: 'Plot, when focused',
  palette: 'Search',
});

const fkeys = (prefix, action) => [1, 2, 3, 4, 5, 6].map((n) => (
  { context: 'global', chord: `${prefix}F${n}`, action, arg: n - 1 }
));

export const KEYMAP = Object.freeze([
  { context: 'global', chord: 'Mod+K', action: 'palette.open' },
  { context: 'global', chord: 'Mod+Z', action: 'edit.undo' },
  { context: 'global', chord: 'Mod+Shift+Z', action: 'edit.redo' },
  { context: 'global', chord: 'Mod+Y', action: 'edit.redo' },
  { context: 'global', chord: 'Mod+V', action: 'edit.paste' },
  { context: 'global', chord: 'Mod+I', action: 'assistant.ask' },
  { context: 'global', chord: 'Mod+E', action: 'writer.equation' },
  { context: 'global', chord: 'Mod+Shift+M', action: 'writer.matrix' },
  { context: 'global', chord: 'Mod+\\', action: 'drawer.toggle' },
  { context: 'global', chord: 'Mod+;', action: 'keypad.toggle' },
  { context: 'global', chord: 'Mod+Shift+F', action: 'view.minimal' },
  { context: 'global', chord: 'Mod+,', action: 'settings.open' },
  { context: 'global', chord: 'Mod+/', action: 'shortcuts.open' },
  { context: 'global', chord: 'Escape', action: 'ui.escape' },
  { context: 'global', chord: 'PageUp', action: 'menu.prev' },
  { context: 'global', chord: 'PageDown', action: 'menu.next' },
  ...fkeys('', 'softkey.press'),
  ...fkeys('Shift+', 'softkey.store'),
  ...fkeys('Alt+', 'softkey.recall'),
  { context: 'line', chord: 'Shift+Enter', action: 'line.newline' },
  { context: 'empty', chord: 'Enter', action: 'stack.dup' },
  { context: 'empty', chord: 'Backspace', action: 'stack.drop' },
  { context: 'empty', chord: 'ArrowUp', action: 'level.selectFirst' },
  { context: 'empty', chord: 'ArrowDown', action: 'level.editFirst' },
  { context: 'empty', chord: 'ArrowRight', action: 'stack.swap' },
  { context: 'empty', chord: 'ArrowLeft', action: 'menu.prev' },
  { context: 'selection', chord: 'ArrowUp', action: 'level.up' },
  { context: 'selection', chord: 'ArrowDown', action: 'level.down' },
  { context: 'selection', chord: 'Mod+ArrowUp', action: 'level.rollUp' },
  { context: 'selection', chord: 'Mod+ArrowDown', action: 'level.rollDown' },
  { context: 'selection', chord: 'Enter', action: 'level.edit' },
  { context: 'selection', chord: 'Backspace', action: 'level.drop' },
  { context: 'selection', chord: 'Delete', action: 'level.drop' },
  { context: 'selection', chord: 'Mod+C', action: 'level.copy' },
  { context: 'selection', chord: 'Mod+D', action: 'level.pick' },
  { context: 'equation', chord: '/', action: 'eqw.fraction' },
  { context: 'equation', chord: '^', action: 'eqw.power' },
  { context: 'equation', chord: '(', action: 'eqw.group' },
  { context: 'equation', chord: 'Tab', action: 'eqw.next' },
  { context: 'equation', chord: 'Shift+ArrowLeft', action: 'eqw.extend', arg: -1 },
  { context: 'equation', chord: 'Shift+ArrowRight', action: 'eqw.extend', arg: 1 },
  { context: 'equation', chord: 'Enter', action: 'writer.commit' },
  { context: 'matrix', chord: 'Tab', action: 'matrix.nextCell' },
  { context: 'matrix', chord: 'Enter', action: 'writer.commit' },
  { context: 'plot', chord: 'ArrowLeft', action: 'plot.pan', arg: 'left' },
  { context: 'plot', chord: 'ArrowRight', action: 'plot.pan', arg: 'right' },
  { context: 'plot', chord: 'ArrowUp', action: 'plot.pan', arg: 'up' },
  { context: 'plot', chord: 'ArrowDown', action: 'plot.pan', arg: 'down' },
  { context: 'plot', chord: '+', action: 'plot.zoomIn' },
  { context: 'plot', chord: '=', action: 'plot.zoomIn' },
  { context: 'plot', chord: '-', action: 'plot.zoomOut' },
  { context: 'plot', chord: '0', action: 'plot.reset' },
  { context: 'plot', chord: 'T', action: 'plot.trace' },
  { context: 'plot', chord: 'F', action: 'plot.fullscreen' },
  { context: 'palette', chord: 'ArrowUp', action: 'palette.move' },
  { context: 'palette', chord: 'ArrowDown', action: 'palette.move' },
  { context: 'palette', chord: 'Enter', action: 'palette.run' },
  { context: 'palette', chord: 'ArrowRight', action: 'palette.reference' },
]);

export const BROWSER_RESERVED_CHORDS = Object.freeze([
  'Mod+T', 'Mod+W', 'Mod+N', 'Mod+L', 'Mod+Q', 'Mod+R', 'Mod+H', 'Mod+M', 'Mod+Tab',
  'Mod+Shift+T', 'Mod+Shift+W', 'Mod+Shift+N', 'Mod+[', 'Mod+]',
  'Mod+1', 'Mod+2', 'Mod+3', 'Mod+4', 'Mod+5', 'Mod+6', 'Mod+7', 'Mod+8', 'Mod+9',
]);

const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift'];

export function parseChord(chord) {
  if (chord === '+') return { mods: [], key: '+' };
  if (chord.endsWith('++')) return { mods: chord.slice(0, -2).split('+'), key: '+' };
  const parts = chord.split('+');
  return { mods: parts.slice(0, -1), key: parts.at(-1) };
}

export function isBarePrintableChord(chord) {
  const { mods, key } = parseChord(chord);
  return (key.length === 1 || key === 'Space') && mods.every((m) => m === 'Shift');
}

export function isMacPlatform(nav = globalThis.navigator) {
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform);
}

function eventKeyName(e) {
  const letter = /^Key([A-Z])$/.exec(e.code ?? '');
  const digit = /^Digit([0-9])$/.exec(e.code ?? '');
  if (e.altKey && letter) return letter[1];
  if (e.altKey && digit) return digit[1];
  if (e.key === ' ') return 'Space';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

export function chordFromEvent(e, mac = isMacPlatform()) {
  const key = eventKeyName(e);
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return '';
  const mods = [];
  if (mac ? e.metaKey : e.ctrlKey) mods.push('Mod');
  if (mac && e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  const shiftIsImplied = key.length === 1 && !/[A-Z0-9]/.test(key) && !mods.length;
  if (e.shiftKey && !shiftIsImplied) mods.push('Shift');
  mods.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return [...mods, key].join('+');
}

const MAC_GLYPHS = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
const KEY_GLYPHS = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backspace: '⌫', Delete: 'Del', Enter: '↵', Escape: 'Esc',
  PageUp: 'PgUp', PageDown: 'PgDn', Space: 'Space', Tab: 'Tab',
};

export function chordText(chord, mac = isMacPlatform()) {
  const { mods, key } = parseChord(chord);
  const keyText = KEY_GLYPHS[key] ?? key;
  if (mac) {
    const order = ['Ctrl', 'Alt', 'Shift', 'Mod'];
    return [...mods].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((m) => MAC_GLYPHS[m]).join('') + keyText;
  }
  const ordered = [...mods].sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return [...ordered.map((m) => (m === 'Mod' ? 'Ctrl' : m)), keyText].join('+');
}

function bindingsFor(actionId, context = null) {
  return KEYMAP.filter((b) => b.action === actionId && (!context || b.context === context));
}

export function shortcutText(actionId, mac = isMacPlatform()) {
  const first = bindingsFor(actionId).find((b) => b.context === 'global') ?? bindingsFor(actionId)[0];
  return first ? chordText(first.chord, mac) : '';
}

export function findBinding(chord, contexts) {
  for (const context of contexts) {
    const hit = KEYMAP.find((b) => b.context === context && b.chord === chord);
    if (hit) return hit;
  }
  return null;
}
