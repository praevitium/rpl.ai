// The soft keys of the families, their folders and the units menu, as methods of the App.
import { state as calcState, varRecall, testUserFlag, setUserFlag, clearUserFlag, getCasModulo } from '../rpl/state.js';
import { isMatrix, isVector } from '../rpl/types.js';
import { describeValue } from './display.js';
import { familyCommands } from './drawer.js';
import {
  MENU_FAMILIES, UNIT_GROUPS, STAT_GROUPS, CAS_GROUPS, MATRIX_GROUPS, INTEGER_GROUPS, TRIG_GROUPS, LIST_GROUPS, TIME_GROUPS,
  KEY_LABELS, menuById,
} from './menus.js';

const TVM_VARIABLES = ['N', 'I%YR', 'PV', 'PMT', 'FV', 'PYR'];
const SIGMA_DATA_KEYS = ['Σ+', 'Σ-', 'CLΣ', 'STOΣ'];
// The mode commands whose keys mark the mode in force, as the HP's DEG■ and HEX■ do: [state field, value].
const MODE_KEYS = Object.freeze({
  DEG: ['angle', 'DEG'], RAD: ['angle', 'RAD'], GRAD: ['angle', 'GRD'], GRD: ['angle', 'GRD'],
  RECT: ['coordMode', 'RECT'], CYLIN: ['coordMode', 'CYLIN'], SPHERE: ['coordMode', 'SPHERE'], CMPLX: ['complexMode', true],
  HEX: ['binaryBase', 'h'], DEC: ['binaryBase', 'd'], OCT: ['binaryBase', 'o'], BIN: ['binaryBase', 'b'],
});

export function sigmaDataNote(data) {
  if (data !== undefined && !isMatrix(data) && !isVector(data)) return `ΣDAT holds ${describeValue(data).text}, not data`;
  const points = isMatrix(data) ? data.rows.length : data?.items.length ?? 0;
  return points ? `ΣDAT: ${points} point${points === 1 ? '' : 's'}` : 'ΣDAT is empty';
}

export const modulusNote = () => `The modular commands work modulo ${getCasModulo()}`;

export const SOFT_MENU_METHODS = {
  _showFamilyMenu(id) {
    const family = MENU_FAMILIES.find((f) => f.id === id) ?? MENU_FAMILIES[0];
    // A family's keys put the HP's own menu first, commands from other families included, and the rest follow.
    const keys = family.keys ?? [];
    const slots = [...keys, ...familyCommands(family).filter((name) => !keys.includes(name))].map((name) => this._commandSlot(name));
    const flagKeys = (family.flagKeys ?? []).map((key) => this._flagKey(...key));
    const lead = {
      UNITS: () => UNIT_GROUPS.map((group) => ({ label: group.id, dir: true, title: `${group.title}: ${group.units.length} units`, onPress: () => this._showUnitMenu(group) })),
      TVM: () => TVM_VARIABLES.map((id) => this._solverKey(id, id === 'PYR' ? null : 'TVMROOT')),
      STAT: () => this._groupKeys(STAT_GROUPS, 'STAT'),
      CAS: () => this._groupKeys(CAS_GROUPS, 'CAS'),
      MATRIX: () => this._groupKeys(MATRIX_GROUPS, 'MATRIX'),
      TIME: () => this._groupKeys(TIME_GROUPS, 'TIME'),
      INTEGER: () => this._groupKeys(INTEGER_GROUPS, 'INTEGER'),
      TRIG: () => this._groupKeys(TRIG_GROUPS, 'TRIG'),
      LIST: () => this._groupKeys(LIST_GROUPS, 'LIST'),
    }[family.id];
    this.setMenu([...(lead ? lead() : []), ...slots, ...flagKeys], family.id);
  },

  // TOOL's VIEW, which is no command here: level 1 full size in a sheet, as a level's View shows it.
  _viewKey() {
    return { label: 'VIEW', title: 'Show level 1 full size, with Edit, Copy and Share', onPress: () => this.levelAction('view', 1) };
  },

  // A flag the HP sets from a form, such as TIME's clock and date formats, as a key marked while the flag is set.
  _flagKey(flag, label, what) {
    const command = () => `${flag} ${testUserFlag(flag) ? 'CF' : 'SF'}`;
    return {
      label,
      title: `${what} (flag ${flag})`,
      toggle: true,
      on: () => testUserFlag(flag),
      onPress: () => {
        if (this.entry._typingAtCursor()) this.entry.typeToken(`${command()} `);
        else (testUserFlag(flag) ? clearUserFlag : setUserFlag)(flag);
      },
    };
  },

  _commandSlot(name) {
    const mode = MODE_KEYS[name];
    const note = SIGMA_DATA_KEYS.includes(name) ? () => sigmaDataNote(varRecall('ΣDAT')) : name === 'MODSTO' ? modulusNote : null;
    return {
      label: KEY_LABELS[name] ?? name,
      command: name,
      title: `${this.commandTitle(name)} · ↰ types it · ↱ opens the reference`,
      blockedReason: () => this._tooFewArgumentsReason(name),
      onPress: () => (note ? this._runNotedKey(name, note) : this.runCommandFromUI(name, { asKey: true })),
      onPressL: () => this.entry.typeToken(`${name} `),
      onPressR: () => this.drawers.showReference(name),
      ...(mode && { toggle: true, on: () => calcState[mode[0]] === mode[1] }),
    };
  },

  // Σ+, Σ- and CLΣ change only ΣDAT, and MODSTO only the modulus, so on a phone their keys say what it is now.
  _runNotedKey(name, note) {
    const mark = this.stack.undoMark();
    this.runCommandFromUI(name, { asKey: true });
    if (this.stack.undoMark() === mark || this.entry.error) return;
    this.undoToast(note());
  },

  _groupKeys(groups, familyId) {
    return groups.map((group) => ({ label: group.id, dir: true, title: `${group.title}: ${group.commands.join(' ')}`, onPress: () => this._showGroupMenu(group, familyId) }));
  },

  _showGroupMenu(group, familyId) {
    const back = { label: '◀ BACK', title: `Back to the ${menuById(familyId).title} menu`, onPress: () => this._showFamilyMenu(familyId) };
    const edit = familyId === 'STAT' && group.id === 'DATA'
      ? [{ label: 'EDIT', title: 'Edit the statistics matrix ΣDAT as a table; a spreadsheet range pastes into it', onPress: () => this.editStatData() }] : [];
    this.setMenu([back, ...edit, ...group.commands.map((name) => this._commandSlot(name))], familyId, { folder: group.id });
    if (group.commands.includes('MODSTO')) this.toast(`${modulusNote()}; MODSTO sets it.`, { key: 'modulus', transient: true });
  },

  _showUnitMenu(group) {
    const back = { label: '◀ BACK', title: 'Back to the Units menu', onPress: () => this._showFamilyMenu('UNITS') };
    const keys = group.units.map((unit) => ({
      label: unit,
      title: `Attach _${unit} to the number you are typing, or multiply level 1 by it · ↰ converts level 1 to ${unit} · ↱ divides by ${unit}`,
      onPress: () => this.insertUnit(unit),
      onPressL: () => this.insertUnit(unit, 'convert'),
      onPressR: () => this.insertUnit(unit, 'divide'),
      onHold: (anchor) => this._heldKeyMenu(this._heldUnitOptions(unit), anchor, 'Unit'),
    }));
    this.setMenu([back, ...keys], 'UNITS', { folder: group.id });
  },

  // A writer has no level 1 to convert, so a held unit key offers what its tap and ↱ do there.
  _heldUnitOptions(unit) {
    const divide = { text: `Divide by ${unit}`, run: () => this.insertUnit(unit, 'divide') };
    if (this.inputMode === 'equation' || this.inputMode === 'matrix') return [{ text: `Attach ${unit}`, mark: '', run: () => this.insertUnit(unit) }, divide];
    return [{ text: `Convert level 1 to ${unit}`, run: () => this.insertUnit(unit, 'convert') }, divide];
  },
};
