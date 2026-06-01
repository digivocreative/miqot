// Pure, framework-free helpers for managing WA Copy categories.
// No React / DOM / store — unit-tested in tests/wa-copy-category-ops.test.js.

/** Slugify a label into a stable category id (a-z0-9 + hyphens). */
export function slugifyCategory(label) {
  const base = String(label)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'kategori';
}

/**
 * Ensure `base` is unique against `taken`, appending -2, -3, … on collision.
 * @param {string} base
 * @param {Iterable<string>} taken existing ids (a Set is used as-is)
 * @returns {string}
 */
export function uniqueCategoryValue(base, taken) {
  const set = taken instanceof Set ? taken : new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Append a new category record (value derived from label, order = max+1). */
export function appendCategory(list, draft) {
  const taken = new Set(list.map(c => c.value));
  const value = uniqueCategoryValue(slugifyCategory(draft.label), taken);
  const order = list.reduce((m, c) => Math.max(m, c.order), 0) + 1;
  return [
    ...list,
    { value, label: draft.label.trim(), iconName: draft.iconName, tip: (draft.tip ?? '').trim(), order },
  ];
}

/**
 * Patch an existing category's display fields; `value` and `order` stay stable.
 * @param {import('./categoryOps').CategoryRecord[]} list
 * @param {string} value id of the category to patch
 * @param {Partial<import('./categoryOps').CategoryDraftInput>} patch
 * @returns {import('./categoryOps').CategoryRecord[]}
 */
export function patchCategory(list, value, patch) {
  return list.map(c => {
    if (c.value !== value) return c;
    const next = { ...c };
    if (patch.label !== undefined) next.label = patch.label.trim();
    if (patch.iconName !== undefined) next.iconName = patch.iconName;
    if (patch.tip !== undefined) next.tip = (patch.tip ?? '').trim();
    return next;
  });
}

/** Swap a category's order with its neighbour (sorted by order). No-op at bounds. */
export function reorderCategory(list, value, dir) {
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(c => c.value === value);
  if (idx < 0) return list;
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sorted.length) return list;
  const a = sorted[idx];
  const b = sorted[swap];
  const aOrder = a.order;
  return list.map(c => {
    if (c.value === a.value) return { ...c, order: b.order };
    if (c.value === b.value) return { ...c, order: aOrder };
    return c;
  });
}

/**
 * Delete a category and reassign its content to `reassignTo`.
 * `field` is the content's category key ('category' for caption/faq, 'phase' for tour).
 * Returns { categories, items } or null when rejected (last category, same target,
 * missing source/target).
 */
export function deleteCategoryAndReassign(list, items, field, value, reassignTo) {
  if (list.length <= 1) return null;
  if (value === reassignTo) return null;
  if (!list.some(c => c.value === value)) return null;
  if (!list.some(c => c.value === reassignTo)) return null;
  let order = items
    .filter(it => it[field] === reassignTo)
    .reduce((m, it) => Math.max(m, it.order), 0);
  const nextItems = items.map(it => {
    if (it[field] !== value) return it;
    order += 1;
    return { ...it, [field]: reassignTo, order };
  });
  const nextCategories = list.filter(c => c.value !== value);
  return { categories: nextCategories, items: nextItems };
}
