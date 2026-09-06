/**
 * The version a write presents, taken from the row the analyst was looking at.
 *
 * **Every section needs this and none of them may improvise it.** A write
 * names the version it read; the server matches on it and refuses a save that
 * should have become a question. Each section reaching into its own row list
 * is one more chance to reach into the wrong one.
 *
 * **Not read inside `useEntryMutation`.** A hook can only see the *current*
 * cache, and the cache is repainted the moment another analyst writes - so a
 * version taken there is their row adopted as your base, and the check then
 * passes on exactly the collision it exists to catch. A read may refresh from
 * disk; a write may not.
 */

/** The shape every case-owned row shares. -> `server/src/domain/wire.ts` */
export interface Versioned {
  id: string
  version: number
}

/**
 * **`-1` when the row is not in the list, and never `0` or `1`.** Versions
 * start at 1, so a fallback of either is a number that can *match* a real row
 * - a write for a row this list has lost would then succeed against whatever
 * happens to be there. `-1` matches nothing, so the server refuses it.
 *
 * The refusal reads as "Someone else wrote this first", which is not quite
 * what happened; a wrong write is worse than a wrong message.
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
