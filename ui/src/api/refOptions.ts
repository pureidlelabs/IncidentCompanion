/**
 * id -> display label, for a `device_select` field's target collection.
 *
 * Mirrors the search feature's `refs.ts` idiom (`buildOptionsCache`) at the
 * scale one screen needs: one target collection, not all six. Built from
 * `useCollection`'s own rows, never denormalised onto the referencing entry -
 * a name copied at write time goes stale the moment the target is renamed.
 */
export function refOptions<T extends { id: string }>(
  rows: readonly T[],
  nameOf: (row: T) => string,
): ReadonlyMap<string, string> {
  return new Map(rows.map((row) => [row.id, nameOf(row)]))
}
