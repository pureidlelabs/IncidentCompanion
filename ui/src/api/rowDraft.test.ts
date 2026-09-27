/**
 * What a record served again does to each field the analyst is changing.
 */
import { describe, expect, it } from 'vitest'

import { reconcile, type Hold, type Holds } from './rowDraft'
import { drawn } from './rowWrite'

const at = (version: number) => drawn({ version }).version

/** Title held: the analyst changed 'Drawn' to 'Mine' at version 7. */
const held = (extra: Partial<Hold> = {}): Holds => ({
  title: { base: 'Drawn', read: at(7), mine: 'Mine', ...extra },
})

const served = (version: number, fields: Record<string, unknown>) => ({
  version,
  title: 'Drawn',
  summary: 'Drawn summary',
  ...fields,
})

describe('a record served again, against a field being changed', () => {
  it('keeps the analyst value and shows the other when somebody else changed that field', () => {
    expect(reconcile(held(), served(8, { title: 'Theirs' }))).toEqual({
      title: { base: 'Drawn', read: 7, mine: 'Mine', theirs: { value: 'Theirs', version: 8 } },
    })
  })

  it('takes the newer version when somebody else changed a different field', () => {
    expect(reconcile(held(), served(8, { summary: 'Their summary' }))).toEqual({
      title: { base: 'Drawn', read: 8, mine: 'Mine' },
    })
  })

  it('lets the field go once the server holds what the analyst put there', () => {
    expect(reconcile(held(), served(8, { title: 'Mine' }))).toEqual({})
  })

  it('lets the field go when nothing of the analyst is left in it', () => {
    expect(reconcile(held({ mine: 'Drawn' }), served(8, { title: 'Theirs' }))).toEqual({})
  })

  it('ignores a record no newer than the one the change began from', () => {
    const holds = held()
    expect(reconcile(holds, served(7, { title: 'Stale read' }))).toBe(holds)
    expect(reconcile(holds, served(6, { title: 'Older still' }))).toBe(holds)
  })

  it('does not judge a field whose write is out, because its answer decides it', () => {
    const holds = held({ sending: true })
    expect(reconcile(holds, served(8, { title: 'Theirs' }))).toBe(holds)
  })

  it('sends a refused change again when the field turns out not to have moved', () => {
    expect(reconcile(held({ refused: true }), served(8, { summary: 'Their summary' }))).toEqual({
      title: { base: 'Drawn', read: 8, mine: 'Mine', again: true },
    })
  })

  it('raises a collision when a refused change meets a field that did move', () => {
    expect(reconcile(held({ refused: true }), served(8, { title: 'Theirs' }))).toEqual({
      title: { base: 'Drawn', read: 7, mine: 'Mine', theirs: { value: 'Theirs', version: 8 } },
    })
  })

  it('follows the other value as it moves again, and never chooses for the analyst', () => {
    const once = reconcile(held(), served(8, { title: 'Theirs' }))
    expect(reconcile(once, served(9, { title: 'Theirs, edited' }))).toEqual({
      title: {
        base: 'Drawn',
        read: 7,
        mine: 'Mine',
        theirs: { value: 'Theirs, edited', version: 9 },
      },
    })
  })

  it('drops the collision when the other analyst puts the field back', () => {
    const once = reconcile(held(), served(8, { title: 'Theirs' }))
    expect(reconcile(once, served(9, { title: 'Drawn' }))).toEqual({
      title: { base: 'Drawn', read: 9, mine: 'Mine' },
    })
  })

  it('judges each field on its own', () => {
    const holds: Holds = {
      title: { base: 'Drawn', read: at(7), mine: 'Mine' },
      summary: { base: 'Drawn summary', read: at(7), mine: 'My summary' },
    }
    expect(reconcile(holds, served(8, { summary: 'Their summary' }))).toEqual({
      title: { base: 'Drawn', read: 8, mine: 'Mine' },
      summary: {
        base: 'Drawn summary',
        read: 7,
        mine: 'My summary',
        theirs: { value: 'Their summary', version: 8 },
      },
    })
  })

  it('compares a set of answers by what it holds, not by identity', () => {
    const holds: Holds = { causes: { base: ['a'], read: at(7), mine: ['a', 'b'] } }
    const served: { version: number } = Object.assign({ version: 8 }, { causes: ['a', 'b'] })
    expect(reconcile(holds, served)).toEqual({})
  })
})
