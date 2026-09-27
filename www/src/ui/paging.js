/* `computeMenuPage` answers: "given the full list of menu slots and
   a page index, what's the 6-slot view, normalized page number, and
   total page count?".  Pages wrap modularly so NXT/PREV can cycle
   forever without bounds-checking at the call site.  Pure, so it is
   unit tested without the DOM. */

/** Compute the visible 6-slot view of a soft-menu, given the full
 *  slot array and a 0-based page index that may be out of range
 *  (negative or >= totalPages).  Returns:
 *    { view, totalPages, page, hasMore }
 *  `view` is always exactly `pageSize` entries long — short pages are
 *  padded with nulls on the right so F1..F6 always have a defined slot.
 *  `hasMore` is true when totalPages > 1 (i.e., NXT/PREV are useful).
 */
export function computeMenuPage(allSlots, page, pageSize = 6) {
  const slots = Array.isArray(allSlots) ? allSlots : [];
  const totalPages = Math.max(1, Math.ceil(slots.length / pageSize));
  // true modulus so negative pages wrap to the end
  const norm = ((Math.floor(page || 0) % totalPages) + totalPages) % totalPages;
  const start = norm * pageSize;
  const view = slots.slice(start, start + pageSize);
  while (view.length < pageSize) view.push(null);
  return {
    view,
    totalPages,
    page: norm,
    hasMore: totalPages > 1,
  };
}
