/* =================================================================
   Interactive stack controller.

   HP50 keystroke G-2: "25.1 — If no command line, interactive stack".
   Pressing ▲ from an empty command line opens a browse mode in which:

     * a cursor highlights a stack level (level 1 at first)
     * ▲/▼ move the cursor up/down through the stack
     * a soft menu offers ECHO, PICK, ROLL, ROLLD, DROP, CANCL
     * ENTER runs ECHO (the HP50 default action)
     * ◀ or ESC cancels without performing an action

   This module is a plain controller: small state (active, level) plus
   pure transition helpers and the menu-config factory.  Everything
   here is DOM-free so the same machinery can be driven from tests
   without running a browser.

   The App layer owns the actual Stack / Entry / Display references
   and supplies callbacks for each menu action.  That keeps the
   controller free of any references to those objects.
   ================================================================= */

/** Clamp a 1-based stack level to [1, depth].  depth 0 returns 0. */
export function clampLevel(level, depth) {
  if (depth <= 0) return 0;
  if (level < 1) return 1;
  if (level > depth) return depth;
  return Math.trunc(level);
}

/** Move selection toward OLDER stack entries (higher level number).
 *  Clamped against the current depth. */
export function levelUp(current, depth) {
  return clampLevel(current + 1, depth);
}

/** Move selection toward NEWER stack entries (toward level 1). */
export function levelDown(current, depth) {
  return clampLevel(current - 1, depth);
}

/* -----------------------------------------------------------------
   Soft-menu layout — six slots on page 1:
     F1 ECHO   — decompile the selected value into the command line,
                 then exit interactive mode (value stays on stack).
     F2 PICK   — copy the selected level to the top (uses Stack.pick).
     F3 ROLL   — rotate the selected level to the top (splice-push).
     F4 ROLLD  — rotate the top DOWN into the selected position.
     F5 DROP   — delete the selected level from the stack.
     F6 CANCL  — exit interactive mode with no action.

   We stick to one page for now — second-page ops like DUPN / LEVEL /
   KEEP can be added when there's real demand.  The HP50 second page
   is rarely used in casual practice.
   ----------------------------------------------------------------- */

/**
 * Build a 6-slot menu descriptor for interactive stack mode.
 * @param {object} handlers — callbacks invoked when a slot is pressed.
 *   { onEcho, onPick, onRoll, onRollD, onDrop, onCancel }
 * @returns Array of { label, onPress }.
 */
export function interactiveStackMenu(handlers) {
  const h = handlers || {};
  return [
    { label: 'ECHO',  onPress: h.onEcho   || (() => {}) },
    { label: 'PICK',  onPress: h.onPick   || (() => {}) },
    { label: 'ROLL',  onPress: h.onRoll   || (() => {}) },
    { label: 'ROLLD', onPress: h.onRollD  || (() => {}) },
    { label: 'DROP',  onPress: h.onDrop   || (() => {}) },
    { label: 'CANCL', onPress: h.onCancel || (() => {}) },
  ];
}

/* -----------------------------------------------------------------
   Roll / RollD on a general stack level.

   Stack internals exposes .pick(level) (a dup of level N, like HP50
   "N PICK") and .swap / .rot / .over.  But there's no built-in
   "rotate level N to the top" or "rotate top down to position N" —
   those are the exact ops the interactive stack's ROLL / ROLLD
   buttons perform.  Implement them here so the controller can drive
   a plain Stack directly.  Both mutate in place and emit once.
   ----------------------------------------------------------------- */

/** Move the value at level N to level 1 (top).  N=1 is a no-op.
 *  Implemented against any object with an `_items` array plus `_emit`
 *  — the Stack class satisfies this, and a plain test double can too. */
export function rollLevel(stack, level) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  if (level === 1) return;                          // already on top
  const idx = stack._items.length - level;          // position in _items
  const [v] = stack._items.splice(idx, 1);
  stack._items.push(v);
  stack._emit();
}

/** Move the value at level 1 to level N (pushing intermediates up).
 *  Inverse of rollLevel.  N=1 is a no-op. */
export function rollDownToLevel(stack, level) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  if (level === 1) return;                          // already at 1
  const top = stack._items.pop();                   // removes level 1
  // After pop, the new depth is depth-1; the insertion target is
  // the same index we'd splice level N to in the old depth.  We want
  // the old level-N value to shift "up" by one so the new top sits
  // at the pre-pop level-N slot → insert at index (length - (level-1)).
  const insertIdx = stack._items.length - (level - 1);
  stack._items.splice(insertIdx, 0, top);
  stack._emit();
}

/** Drop exactly one level — removes the selected entry, splicing
 *  out its slot rather than popping from the top. */
export function dropLevel(stack, level) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  const idx = stack._items.length - level;
  stack._items.splice(idx, 1);
  stack._emit();
}
