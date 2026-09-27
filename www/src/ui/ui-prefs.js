export const UI_PREFS_KEY = 'rplai.ui';

export const THEMES = Object.freeze(['auto', 'graphite', 'paper', 'classic']);
const KEYPAD_LAYOUTS = Object.freeze(['full', 'compact', 'hidden']);
const DRAWER_IDS = Object.freeze(['assistant', 'catalog', 'vars', 'history', 'plot', 'chars']);
const HISTORY_SORTS = Object.freeze(['newest', 'oldest']);
const ASSISTANT_MODES = Object.freeze(['ask', 'tutor']);
export const TUTOR_STYLES = Object.freeze(['socratic', 'direct']);

export const DEFAULT_UI_PREFS = Object.freeze({
  theme: 'auto',
  minimal: false,
  minimalMenu: false,
  keypad: 'full',
  drawer: null,
  lastDrawer: 'catalog',
  drawerWide: false,
  drawerWidth: null,
  hints: false,
  historySort: 'newest',
  menu: null,
  assistantMode: 'ask',
  tutorStyle: 'socratic',
  tourSeen: false,
});

const LEGACY_DRAWER_OF_TAB = Object.freeze({
  ai: 'assistant', commands: 'catalog', files: 'vars', history: 'history', graph: 'plot', chars: 'chars',
});

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
}

export function normalizeUiPrefs(raw) {
  const p = { ...DEFAULT_UI_PREFS };
  if (!raw || typeof raw !== 'object') return p;
  if (THEMES.includes(raw.theme)) p.theme = raw.theme;
  if (typeof raw.minimal === 'boolean') p.minimal = raw.minimal;
  if (typeof raw.minimalMenu === 'boolean') p.minimalMenu = raw.minimalMenu;
  if (KEYPAD_LAYOUTS.includes(raw.keypad)) p.keypad = raw.keypad;
  if (raw.drawer === null || DRAWER_IDS.includes(raw.drawer)) p.drawer = raw.drawer ?? null;
  if (DRAWER_IDS.includes(raw.lastDrawer)) p.lastDrawer = raw.lastDrawer;
  if (typeof raw.drawerWide === 'boolean') p.drawerWide = raw.drawerWide;
  if (Number.isFinite(raw.drawerWidth)) p.drawerWidth = raw.drawerWidth;
  if (typeof raw.hints === 'boolean') p.hints = raw.hints;
  if (HISTORY_SORTS.includes(raw.historySort)) p.historySort = raw.historySort;
  if (typeof raw.menu === 'string' && /^[A-Z]{2,8}$/.test(raw.menu)) p.menu = raw.menu;
  if (ASSISTANT_MODES.includes(raw.assistantMode)) p.assistantMode = raw.assistantMode;
  if (TUTOR_STYLES.includes(raw.tutorStyle)) p.tutorStyle = raw.tutorStyle;
  if (typeof raw.tourSeen === 'boolean') p.tourSeen = raw.tourSeen;
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

export function loadUiPrefs(storage = globalThis.localStorage) {
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

export function saveUiPrefs(prefs, storage = globalThis.localStorage) {
  try { storage?.setItem(UI_PREFS_KEY, JSON.stringify(normalizeUiPrefs(prefs))); } catch { /* quota or private mode */ }
}
