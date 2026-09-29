export function computeMenuPage(allSlots, page, pageSize = 6) {
  const slots = Array.isArray(allSlots) ? allSlots : [];
  const totalPages = Math.max(1, Math.ceil(slots.length / pageSize));
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
