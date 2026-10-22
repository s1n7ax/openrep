/**
 * The array with the item at `index` moved `delta` places (-1 = up, 1 = down).
 * Returns the same array when the index is out of range or the move would
 * leave the array, so callers can tell nothing changed.
 */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length || delta === 0) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(index, 1) as [T];
  next.splice(target, 0, moved);
  return next;
}

/** `moveItem` for the item with id `id`. */
export function moveById<T extends { id: string }>(items: T[], id: string, delta: number): T[] {
  return moveItem(
    items,
    items.findIndex((item) => item.id === id),
    delta,
  );
}
