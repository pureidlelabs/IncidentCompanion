import { describe, expect, it } from 'vitest'

import { idsAfterDrop } from './report-reorder'

/**
 * The id list a drop produces, which is the whole of what leaves the screen.
 */
const IDS = ['a', 'b', 'c', 'd']

describe('the ids a drop leaves behind', () => {
  it('puts the moved section where the drop landed', () => {
    expect(idsAfterDrop(IDS, ['a'], 'c', 'before')).toEqual(['b', 'a', 'c', 'd'])
    expect(idsAfterDrop(IDS, ['a'], 'c', 'after')).toEqual(['b', 'c', 'a', 'd'])
    expect(idsAfterDrop(IDS, ['d'], 'a', 'before')).toEqual(['d', 'a', 'b', 'c'])
  })

  /**
   * Every id, once, whatever the drop was.
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
   * **A drop that changes nothing sends nothing.**
   */
  it('reports no move when the section lands where it already was', () => {
    expect(idsAfterDrop(IDS, ['a'], 'b', 'before')).toBeNull()
    expect(idsAfterDrop(IDS, ['b'], 'a', 'after')).toBeNull()
    expect(idsAfterDrop(IDS, ['d'], 'c', 'after')).toBeNull()
  })

  /**
   * A target the list does not hold, which is what a row another analyst has
   * just removed looks like from here.
   */
  it('reports no move when the drop names a section this list does not hold', () => {
    expect(idsAfterDrop(IDS, ['a'], 'somebody-elses-block', 'before')).toBeNull()
    expect(idsAfterDrop(IDS, ['somebody-elses-block'], 'c', 'before')).toBeNull()
  })

  /**
   * **One unknown id among several known ones, which is the shape that gets
   * through.**
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
   * reported them in.
   */
  it('keeps the moved sections in the order the document had them', () => {
    expect(idsAfterDrop(IDS, ['c', 'a'], 'd', 'before')).toEqual(['b', 'a', 'c', 'd'])
  })
})
