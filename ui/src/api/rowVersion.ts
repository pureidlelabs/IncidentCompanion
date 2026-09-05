/**
 * The version a write presents, taken from the row the analyst was looking at.
 */

/** The shape every case-owned row shares. -> `server/src/domain/wire.ts` */
export interface Versioned {
  id: string
  version: number
}

/**
 * **`-1` when the row is not in the list, and never `0` or `1`.**
 */
export function versionOf(rows: readonly Versioned[], entryId: string): number {
  return rows.find((row) => row.id === entryId)?.version ?? -1
}

/**
 * The row as the form was rendered from it, for the merge review a refusal
 * raises. Absent when the list no longer holds the row.
 */
export function baseOf<T extends Versioned>(
  rows: readonly T[],
  entryId: string,
): T | undefined {
  return rows.find((row) => row.id === entryId)
}
