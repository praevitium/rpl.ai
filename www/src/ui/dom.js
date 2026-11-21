export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const scrollEdges = (el) => [el.scrollLeft > 1, el.scrollLeft + el.clientWidth < el.scrollWidth - 1];

export function setScrollEdges(el, [left, right]) {
  el.classList.toggle('more-l', left);
  el.classList.toggle('more-r', right);
}

// Classes for edge fades on a sideways scroller, showing which way there is more.
export function markScrollEdges(el) {
  setScrollEdges(el, scrollEdges(el));
}

// The same for a list that scrolls up and down: more-t and more-b mark the edge it continues past.
export function markScrollEnds(el) {
  el.classList.toggle('more-t', el.scrollTop > 1);
  el.classList.toggle('more-b', el.scrollTop + el.clientHeight < el.scrollHeight - 1);
}
