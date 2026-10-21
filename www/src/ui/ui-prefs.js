export const UI_PREFS_KEY = 'rplai.ui';

export const THEMES = Object.freeze(['auto', 'graphite', 'paper', 'classic']);
export const THEME_LABELS = Object.freeze({ auto: 'Match system', graphite: 'Graphite (dark)', paper: 'Paper (light)', classic: 'Classic LCD' });
export const STACK_SIZES = Object.freeze(['small', 'normal', 'large', 'larger']);
export const STACK_SIZE_LABELS = Object.freeze({ small: 'Small', normal: 'Normal', large: 'Large', larger: 'Larger' });
export const KEYPAD_LAYOUTS = Object.freeze(['full', 'compact', 'hidden']);
export const KEYPAD_LABELS = Object.freeze({ full: 'Full', compact: 'Compact', hidden: 'Hidden' });
export const SIDES = Object.freeze(['left', 'right']);
export const SIDE_LABELS = Object.freeze({ left: 'Left', right: 'Right' });
const DRAWER_IDS = Object.freeze(['assistant', 'catalog', 'vars', 'history', 'plot', 'chars']);
const HISTORY_SORTS = Object.freeze(['newest', 'oldest']);
const ASSISTANT_MODES = Object.freeze(['ask', 'tutor']);
export const TUTOR_STYLES = Object.freeze(['socratic', 'direct']);
const RECENT_COMMANDS_MAX = 8;
const RECENT_MENUS_MAX = 4;

export const DEFAULT_UI_PREFS = Object.freeze({
  theme: 'auto',
  minimal: false,
  minimalMenu: false,
  keypad: 'full',
  keypadSide: 'right',
  panelsSide: 'left',
  drawer: null,
  lastDrawer: 'catalog',
  drawerWide: false,
  drawerWidth: null,
  hints: false,
  haptics: false,
  keyClick: false,
  keepAwake: false,
  notes: true,
  stackSize: 'normal',
  historySort: 'newest',
  menu: null,
  assistantMode: 'ask',
  tutorStyle: 'socratic',
  tourSeen: false,
  recentCommands: Object.freeze([]),
  recentMenus: Object.freeze([]),
});

const LEGACY_DRAWER_OF_TAB = Object.freeze({
  ai: 'assistant', commands: 'catalog', files: 'vars', history: 'history', graph: 'plot', chars: 'chars',
});

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
}

// Blocked site data makes even reading globalThis.localStorage throw.
function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function normalizeUiPrefs(raw) {
  const p = { ...DEFAULT_UI_PREFS };
  if (!raw || typeof raw !== 'object') return p;
  if (THEMES.includes(raw.theme)) p.theme = raw.theme;
  if (typeof raw.minimal === 'boolean') p.minimal = raw.minimal;
  if (typeof raw.minimalMenu === 'boolean') p.minimalMenu = raw.minimalMenu;
  if (KEYPAD_LAYOUTS.includes(raw.keypad)) p.keypad = raw.keypad;
  if (SIDES.includes(raw.keypadSide)) p.keypadSide = raw.keypadSide;
  if (SIDES.includes(raw.panelsSide)) p.panelsSide = raw.panelsSide;
  if (raw.drawer === null || DRAWER_IDS.includes(raw.drawer)) p.drawer = raw.drawer ?? null;
  if (DRAWER_IDS.includes(raw.lastDrawer)) p.lastDrawer = raw.lastDrawer;
  if (typeof raw.drawerWide === 'boolean') p.drawerWide = raw.drawerWide;
  if (Number.isFinite(raw.drawerWidth)) p.drawerWidth = raw.drawerWidth;
  if (typeof raw.hints === 'boolean') p.hints = raw.hints;
  if (typeof raw.haptics === 'boolean') p.haptics = raw.haptics;
  if (typeof raw.keyClick === 'boolean') p.keyClick = raw.keyClick;
  if (typeof raw.keepAwake === 'boolean') p.keepAwake = raw.keepAwake;
  if (typeof raw.notes === 'boolean') p.notes = raw.notes;
  if (STACK_SIZES.includes(raw.stackSize)) p.stackSize = raw.stackSize;
  if (HISTORY_SORTS.includes(raw.historySort)) p.historySort = raw.historySort;
  if (typeof raw.menu === 'string' && /^[A-Z]{2,8}$/.test(raw.menu)) p.menu = raw.menu;
  if (ASSISTANT_MODES.includes(raw.assistantMode)) p.assistantMode = raw.assistantMode;
  if (TUTOR_STYLES.includes(raw.tutorStyle)) p.tutorStyle = raw.tutorStyle;
  if (typeof raw.tourSeen === 'boolean') p.tourSeen = raw.tourSeen;
  if (Array.isArray(raw.recentCommands)) {
    // Search lists an ASCII alias (LIST->) under its arrow name, so one saved before it did reads as that name.
    const names = raw.recentCommands.filter((n) => typeof n === 'string' && /^\S{1,24}$/.test(n)).map((n) => n.replace(/->/g, '→'));
    p.recentCommands = [...new Set(names)].slice(0, RECENT_COMMANDS_MAX);
  }
  if (Array.isArray(raw.recentMenus)) {
    p.recentMenus = [...new Set(raw.recentMenus.filter((n) => typeof n === 'string' && /^[A-Z]{2,8}$/.test(n)))].slice(0, RECENT_MENUS_MAX);
  }
  return p;
}

function legacyUiPrefs(storage) {
  const panel = readJson(storage, 'hp50.ui.sidePanel');
  let chrome = null;
  try { chrome = storage?.getItem('hp50.ui.chrome') ?? null; } catch { chrome = null; }
  if (!panel && !chrome) return null;
  const drawer = LEGACY_DRAWER_OF_TAB[panel?.tab] ?? null;
  return normalizeUiPrefs({
    minimal: chrome === 'minimal',
    keypad: chrome === 'simple' ? 'compact' : 'full',
    drawer: panel?.open ? drawer : null,
    lastDrawer: drawer ?? undefined,
    drawerWidth: panel?.width,
    historySort: panel?.historySort,
  });
}

export function loadUiPrefs(storage = browserStorage()) {
  const saved = readJson(storage, UI_PREFS_KEY);
  if (saved) return normalizeUiPrefs(saved);
  const legacy = legacyUiPrefs(storage);
  if (!legacy) return normalizeUiPrefs(null);
  saveUiPrefs(legacy, storage);
  try {
    storage.removeItem('hp50.ui.sidePanel');
    storage.removeItem('hp50.ui.chrome');
  } catch { /* storage blocked: the legacy keys just stay */ }
  return legacy;
}

export function saveUiPrefs(prefs, storage = browserStorage()) {
  try { storage?.setItem(UI_PREFS_KEY, JSON.stringify(normalizeUiPrefs(prefs))); } catch { /* quota or private mode */ }
}
