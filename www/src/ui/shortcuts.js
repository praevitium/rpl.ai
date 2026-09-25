/* =================================================================
   Physical-keyboard shortcut handlers that involve a modifier key
   (Ctrl / Cmd).  Lives here — not in app.js — so it can be unit-
   tested in Node without a DOM.

   Semantics:
     Ctrl/Cmd-Z                   → UNDO  (multi-level history)
     Ctrl/Cmd-Y   OR Shift-Ctrl/Cmd-Z → REDO
     Ctrl/Cmd-V                   → PASTE clipboard contents into the
                                    input editor, reading HP source
                                    (`'X'`, `\<<`) via Entry.paste.  The handler only
                                    fires when no real <input> /
                                    <textarea> has focus (guarded in
                                    app.js), so standard OS copy /
                                    paste inside text fields still
                                    works.

   Alt is treated as "hands off"; any alt-combo passes through so
   browser/OS shortcuts remain untouched.

   The handler is a pure function that takes the event-like object
   and the calculator Entry plus a clipboard facade.  Returns `true`
   if it handled the event (caller should preventDefault); `false`
   if it did not.
   ================================================================= */

/**
 * @param {KeyboardEvent-like} e       — needs {key, ctrlKey, metaKey,
 *                                        altKey, shiftKey}.
 * @param {Entry}              entry   — entry.performUndo / performRedo
 *                                        / type / flashError.
 * @param {object}             opts    — { clipboard } optional override
 *                                        with readText()->Promise<string>.
 *                                        Defaults to navigator.clipboard
 *                                        when available, else an object
 *                                        whose readText rejects.
 * @returns {boolean} true if handled (caller should preventDefault).
 */
export function handleModifierShortcut(e, entry, opts = {}) {
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
  if (!mod) return false;

  const k = (e.key || '').toLowerCase();

  if (k === 'z' && !e.shiftKey) {
    try { entry.performUndo(); }
    catch (err) { entry.flashError(err); }
    return true;
  }
  // Ctrl/Cmd-Y or Shift-Ctrl/Cmd-Z → REDO.  The latter matches
  // standard macOS editors; the former matches Windows conventions.
  if (k === 'y' || (k === 'z' && e.shiftKey)) {
    try { entry.performRedo(); }
    catch (err) { entry.flashError(err); }
    return true;
  }
  if (k === 'v' && !e.shiftKey) {
    const cb = opts.clipboard || (
      (typeof navigator !== 'undefined' && navigator.clipboard)
        ? navigator.clipboard
        : null
    );
    if (cb && typeof cb.readText === 'function') {
      // Fire-and-forget: keydown handlers can't block on await in
      // all browsers, and preventDefault has already been decided.
      Promise.resolve(cb.readText()).then((text) => {
        if (typeof text === 'string' && text.length) entry.paste(text);
      }).catch((err) => entry.flashError(err));
    } else {
      entry.flashError({ message: 'Clipboard unavailable' });
    }
    return true;
  }

  // Some other modifier combo — let it pass through.
  return false;
}
