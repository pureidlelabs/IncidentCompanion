import { describe, expect, it } from 'vitest'

import { ENTITY_TARGETS } from '@/api/entityTargets'

import { GRAPH_KINDS, KIND_LABEL } from './graph-kinds'

/**
 * The graph's chips are a hand-kept list, and this is what holds it to the
 * thing it is a list of.
 *
 * A `ref.target` carrying a `scope` is one of the five the entities page draws
 * a fragment for, which is exactly what the graph offers a chip for. The two
 * lists are written in different files and neither derives from the other, so
 * without this a sixth kind gaining a screen leaves the graph silently
 * offering five -- nothing renders wrong, the nodes are simply never narrowed
 * to and the chip an analyst looks for is not there.
 */
describe('the kinds the graph offers', () => {
  it('are the reference targets that have a screen of their own', () => {
    const scoped = Object.entries(ENTITY_TARGETS)
      .filter(([, target]) => target.scope !== undefined)
      .map(([name]) => name)

    expect([...GRAPH_KINDS].sort(), 'the graph narrows by a different set than the app registers')
      .toEqual(scoped.sort())
  })

  /**
   * The label is what the chip reads, so a kind with none draws its wire name:
   * an analyst offered `cloud_app` where every other chip says a word.
   */
  it('each read as a word rather than as a wire name', () => {
    const unlabelled = GRAPH_KINDS.filter((kind) => KIND_LABEL[kind] === undefined)

    expect(unlabelled, 'these would draw their wire name on the chip').toEqual([])
  })
})
