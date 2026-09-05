/**
 * id -> display label, for a `device_select` field's target collection.
 */
export function refOptions<T extends { id: string }>(
  rows: readonly T[],
  nameOf: (row: T) => string,
): ReadonlyMap<string, string> {
  return new Map(rows.map((row) => [row.id, nameOf(row)]))
}
