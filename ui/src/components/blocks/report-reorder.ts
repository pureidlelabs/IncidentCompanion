/**
 * Where a dropped section lands, as the id list the reorder route takes.
 *
 * Kept apart from the workspace because it is the only part of a drag a jsdom
 * test can read: the gesture is geometry and the payload is arithmetic.
 */

/** Which side of the section it was dropped on. */
export type DropSide = 'before' | 'after'

/**
 * The scope's ids in the order a drop leaves them, or `null` for no move.
 *
 * `ids` is one report's blocks, every one of them, in the order on screen -
 * which is the scope `POST /cases/:id/report_blocks/order` requires and the
 * exact list it renumbers `position` from. `moved` may name several sections;
 * they are placed in the order `ids` had them rather than the order they were
 * picked.
 *
 * `null` rather than an unchanged copy, so a caller can skip the request: a
 * drop landing where the section already was is the commonest end to a drag,
 * and an id list this does not hold whole cannot be posted at all - the route
 * refuses a scope that is missing a row.
 */
export function idsAfterDrop(
  ids: readonly string[],
  moved: readonly string[],
  target: string,
  side: DropSide,
): string[] | null {
  const held = new Set(ids)
  if (moved.length === 0) return null
  for (const id of moved) if (!held.has(id)) return null

  const lifted = new Set(moved)
  const taken = ids.filter((id) => lifted.has(id))
  const rest = ids.filter((id) => !lifted.has(id))
  // **The one guard on the target, and it covers both ways it can fail**: a
  // target this list does not hold, and a target that is one of the sections
  // being moved - `rest` is what survives the lift, so neither is in it. A
  // separate `ids` membership check ahead of this was tried and proved
  // redundant: deleting it left every test green.
  const at = rest.indexOf(target)
  if (at === -1) return null

  const next = [...rest]
  next.splice(side === 'before' ? at : at + 1, 0, ...taken)

  if (next.length === ids.length && next.every((id, index) => id === ids[index])) return null
  return next
}
