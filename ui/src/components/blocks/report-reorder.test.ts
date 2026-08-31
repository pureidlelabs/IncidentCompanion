import { describe, expect, it } from 'vitest'

import { idsAfterDrop } from './report-reorder'

/**
 * The id list a drop produces, which is the whole of what leaves the screen.
 *
 * Written as attacks on the payload rather than on the gesture: the route
 * rewrites `position` from the list it is posted, so an id dropped, an id
 * repeated or a scope only half named is a silent renumber of somebody's
 * report - and every one of those still looks like a list of ids.
 */
const IDS = ['a', 'b', 'c', 'd']

describe('the ids a drop leaves behind', () => {
  it('puts the moved section where the drop landed', () => {
    expect(idsAfterDrop(IDS, ['a'], 'c', 'before')).toEqual(['b', 'a', 'c', 'd'])
    expect(idsAfterDrop(IDS, ['a'], 'c', 'after')).toEqual(['b', 'c', 'a', 'd'])
    expect(idsAfterDrop(IDS, ['d'], 'a', 'before')).toEqual(['d', 'a', 'b', 'c'])
  })

  /**
   * Every id, once, whatever the drop was. The route requires the whole scope
   * and refuses a repeat, so a splice that lost the removal is a 422 rather
   * than a wrong order - and a splice that lost the insertion is a section
   * that vanishes from the document.
   */
  it('keeps the whole scope, each id once', () => {
    for (const target of IDS) {
      for (const position of ['before', 'after'] as const) {
        const next = idsAfterDrop(IDS, ['b'], target, position)
        if (next === null) continue
        expect([...next].sort()).toEqual([...IDS].sort())
      }
    }
  })

  /**
   * **A drop that changes nothing sends nothing.** Dragging a section onto the
   * gap it already occupies is the commonest way a drag ends, and posting it
   * spends a write, a version check and a change-feed row on an order the case
   * already has.
   */
  it('reports no move when the section lands where it already was', () => {
    expect(idsAfterDrop(IDS, ['a'], 'b', 'before')).toBeNull()
    expect(idsAfterDrop(IDS, ['b'], 'a', 'after')).toBeNull()
    expect(idsAfterDrop(IDS, ['d'], 'c', 'after')).toBeNull()
  })

  /**
   * A target the list does not hold, which is what a row another analyst has
   * just removed looks like from here. Placing the rest anyway would post a
   * list missing one of the scope's ids, and the route refuses a partial scope.
   */
  it('reports no move when the drop names a section this list does not hold', () => {
    expect(idsAfterDrop(IDS, ['a'], 'somebody-elses-block', 'before')).toBeNull()
    expect(idsAfterDrop(IDS, ['somebody-elses-block'], 'c', 'before')).toBeNull()
  })

  /**
   * **One unknown id among several known ones, which is the shape that gets
   * through.** A lift naming a row this list has not got means the screen and
   * the document disagree - somebody added or removed a section since this
   * list was read. Dropping the unknown one and placing the rest produces a
   * full, plausible, wrong order, and the route accepts it: it is the whole
   * scope, once each. `resequence` refuses the same shape for the same reason.
   *
   * Isolated deliberately. A break-verify deleting the guard left the case
   * above green, because a lift of nothing but an unknown id resolves to no
   * move by the no-op check one screen down.
   */
  it('reports no move when only some of the lifted sections are held', () => {
    expect(idsAfterDrop(IDS, ['a', 'somebody-elses-block'], 'c', 'before')).toBeNull()
  })

  /** A section cannot be dropped relative to itself. */
  it('reports no move when the target is one of the sections being moved', () => {
    expect(idsAfterDrop(IDS, ['a'], 'a', 'before')).toBeNull()
    expect(idsAfterDrop(IDS, ['a', 'b'], 'b', 'after')).toBeNull()
  })

  /**
   * Several rows at once keep the order they had, not the order the drag
   * reported them in. React Aria hands the keys as a `Set`, whose iteration
   * order is selection order - so a two-row drag would otherwise reverse them
   * whenever the second row was clicked first.
   */
  it('keeps the moved sections in the order the document had them', () => {
    expect(idsAfterDrop(IDS, ['c', 'a'], 'd', 'before')).toEqual(['b', 'a', 'c', 'd'])
  })
})
