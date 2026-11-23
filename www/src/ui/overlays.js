// What Esc and a phone's back button put away, top first. Each press closes the first open one; a step marked with
// `via` belongs to that one alone (the palette takes its own Esc, and only Esc clears the line or the shift).
import { state as calcState } from '../rpl/state.js';

const focusIn = (selector) => !!globalThis.document?.activeElement?.closest?.(selector);

export const OVERLAYS = [
  // As the HP's ON wakes it from OFF and clears an error message, so does a phone's back button.
  { via: 'back', open: (app) => !!app._offScreen, close: (app) => app._offScreen.click() },
  { via: 'back', open: (app) => app._running(), close: (app) => app.stopProgram() },
  { via: 'esc', open: (app) => app._running() || !!calcState.halted?.paused, close: (app) => app.stopProgram() },
  { open: (app) => app.popover.isOpen(), close: (app) => app.popover.close() },
  { via: 'back', open: (app) => app.palette.isOpen(), close: (app) => app.palette.close() },
  { open: (app) => app.sheets.isOpen(), close: (app) => app.sheets.back() },
  { via: 'esc', open: (app) => !!app.plotFocus, close: (app) => app.setPlotFocus(false) },
  { via: 'esc', open: () => focusIn('.pl-box'), close: (app) => app.focusInput() },
  // Esc in the drawer leaves it, and leaves the stack and the command line behind it as they were; one docked beside
  // the stack stays open.
  {
    via: 'esc',
    open: () => focusIn('#drawer'),
    close: (app) => (app._drawerCoversStack() ? app.drawers.close() : app.focusInput()),
  },
  { open: (app) => !!app.entry.error, close: (app) => app.dismissError() },
  { open: (app) => app.inputMode !== 'rpl', close: (app) => app.cancelWriter() },
  { open: (app) => app._drawerCoversStack(), close: (app) => app.drawers.close() },
  // As the HP's ON cancels an edit and leaves the interactive stack, so does a phone's back button.
  { open: (app) => !!app.pendingEdit, close: (app) => app.cancelEdit() },
  { open: (app) => app.selection != null, close: (app) => app.clearSelection() },
  { via: 'esc', open: (app) => app.entry.buffer.length > 0, close: (app) => app.clearLine() },
  { via: 'esc', open: (app) => !!app.shift, close: (app) => app.setShift(null) },
];

export function topOverlay(app, via) {
  return OVERLAYS.find((o) => (!o.via || o.via === via) && o.open(app)) ?? null;
}
