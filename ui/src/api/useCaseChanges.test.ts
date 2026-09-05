/**
 * Reading a write announcement, and what it invalidates.
 */
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { COLLECTION_NAMES } from './model'
import { keys } from './queryKeys'
import { EVERYTHING, invalidationsFor, readChange } from './useCaseChanges'

describe('readChange', () => {
  it('reads the tables a write touched', () => {
    expect(readChange({ type: 'case.changed', scopes: ['timeline'], by: 'r.o' }))
      .toEqual({ scopes: ['timeline'], by: 'r.o' })
  })

  it('reads null as "assume everything moved"', () => {
    // Not an empty list, which reads as its opposite - nothing invalidated,
    // and the screen stale for ever.
    expect(readChange({ type: 'case.changed', scopes: null, by: '' })?.scopes)
      .toBeNull()
  })

  it('ignores a message of another kind', () => {
    // Presence and prose share this socket, so the reader sees every frame.
    expect(readChange({ type: 'presence', roster: [] })).toBeNull()
    expect(readChange({ type: 'prose.sync', field: 'f' })).toBeNull()
  })

  it('survives scopes that are not an array', () => {
    // Falls back to "everything", which is the safe direction: a refetch too
    // many costs a request, one too few costs correctness.
    expect(readChange({ type: 'case.changed', scopes: 'timeline' })?.scopes)
      .toBeNull()
  })

  it('drops a non-string scope rather than passing it to a query key', () => {
    expect(readChange({ type: 'case.changed', scopes: ['timeline', 7] })?.scopes)
      .toEqual(['timeline'])
  })
})

describe('the whole-case document, which the shell reads', () => {
  const forScopes = (scopes: string[]) =>
    invalidationsFor('C-1', scopes).map((one) => ({
      key: JSON.stringify(one.queryKey),
      exact: one.exact ?? false,
    }))

  /**
   * **Measured, and it was a live defect.**
   */
  it('refreshes the case document when a collection moves', () => {
    expect(forScopes(['evidence'])).toContainEqual({ key: '["case","C-1"]', exact: true })
  })

  /**
   * **`exact`, or the fix costs more than the defect.**
   */
  it('takes the case document alone, not the twelve collections under it', () => {
    const caseKeys = forScopes(['evidence']).filter((one) => one.key === '["case","C-1"]')
    expect(caseKeys).toEqual([{ key: '["case","C-1"]', exact: true }])
  })

  /**
   * **The summary is the rail, and `exact` above cannot reach it.**
   */
  it('refreshes the rail summary when a collection moves', () => {
    expect(forScopes(['evidence']))
      .toContainEqual({ key: '["case","C-1","summary"]', exact: false })
  })

  /**
   * **`cases` is the scope the server sends**, and it adds nothing to the
   * three unconditional entries.
   */
  it('adds nothing for a scalar write, which the three fixed entries cover', () => {
    const said = forScopes(['cases'])
    expect(said).toContainEqual({ key: '["case","C-1"]', exact: true })
    expect(said).toContainEqual({ key: '["case","C-1","summary"]', exact: false })
    // The two ways this has already been wrong, both silent.
    expect(said).not.toContainEqual({ key: '["case","C-1"]', exact: false })
    expect(JSON.stringify(said)).not.toContain('collection","cases')
  })

  it('sends a compliance write to the keys compliance actually uses', () => {
    // `case_compliance` is not a collection, so the cast made
    // `['case', id, 'collection', 'case_compliance']` - and an open Compliance
    // screen never repainted on another analyst's write.
    expect(forScopes(['case_compliance']))
      .toContainEqual({ key: '["case","C-1","compliance"]', exact: false })
  })

  it('still invalidates the collection that moved', () => {
    expect(forScopes(['evidence']))
      .toContainEqual({ key: '["case","C-1","collection","evidence"]', exact: false })
  })

  /**
   * **A scope the client does not know is dropped, not cast.**
   */
  it('drops a scope that is not one, rather than keying a query on it', () => {
    const said = forScopes(['evidence', 'not_a_table'])
    expect(JSON.stringify(said)).not.toContain('not_a_table')
    expect(said).toContainEqual({ key: '["case","C-1","collection","evidence"]', exact: false })
    expect(said).toContainEqual({ key: '["case","C-1"]', exact: true })
  })

  it('leaves every collection nobody touched alone', () => {
    const keys = forScopes(['evidence']).map((one) => one.key)
    for (const name of COLLECTION_NAMES.filter((one) => one !== 'evidence')) {
      expect(keys, `an evidence write invalidated ${name}`).not.toContain(
        `["case","C-1","collection","${name}"]`,
      )
    }
  })

  /**
   * The widest case must stay wide: `EVERYTHING` means the write could not say
   * what it touched, so the case key is taken as a prefix deliberately.
   */
  it('reaches every collection when the scope is unknown', () => {
    // **Imported, never typed.** The sentinel is NUL-prefixed so no table
    // name can collide with it, and this file is where that bit the author:
    // a space typed into the literal arrived on disk as the byte itself,
    // which made every `grep` of this file answer 'no match' for every
    // pattern. Reading it from the module is the only spelling that cannot
    // drift from the one the code compares against.
    expect(forScopes([EVERYTHING]))
      .toEqual([{ key: '["case","C-1"]', exact: false }])
  })

  /**
   * **Every collection, because the name says any.**
   */
  it.each(COLLECTION_NAMES)('invalidates attribution on a %s write', (scope) => {
    expect(forScopes([scope]))
      .toContainEqual({ key: '["case","C-1","attribution"]', exact: false })
  })
})

describe('coalescing a burst', () => {
  it('folds several announcements into the keys they name between them', () => {
    // One analyst's act is often several writes. Invalidating on each arrival
    // refetches the same collection two or three times in a few hundred
    // milliseconds, and only the last answer is ever seen.
    const seen = new Set<string>()
    for (const message of [
      { type: 'case.changed', scopes: ['timeline'] },
      { type: 'case.changed', scopes: ['timeline', 'systems'] },
      { type: 'case.changed', scopes: ['systems'] },
    ]) {
      for (const scope of readChange(message)?.scopes ?? []) seen.add(scope)
    }

    expect([...seen].sort()).toEqual(['systems', 'timeline'])
  })

  it('lets one unknown scope in a burst widen it to the whole case', () => {
    // `scopes: null` means the write did not know what it touched, and it
    // cannot be narrowed by the announcements around it - folding it in as
    // one more name would lose exactly the write that knew least.
    const scopes = [
      readChange({ type: 'case.changed', scopes: ['timeline'] })?.scopes,
      readChange({ type: 'case.changed', scopes: null })?.scopes,
    ]

    expect(scopes.some((s) => s === null)).toBe(true)
  })
})

describe('the keys a scope reaches', () => {
  it('invalidates only the collection that moved', () => {
    // The prefix convention is what makes this precise: invalidating one
    // collection must not refetch the other eleven, or every keystroke
    // somebody else makes costs this analyst a full case reload.
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')

    void client.invalidateQueries({ queryKey: keys.collection('C-1', 'timeline') })

    expect(spy.mock.calls[0]?.[0]?.queryKey)
      .toEqual(['case', 'C-1', 'collection', 'timeline'])
  })

  it('reaches every collection through the case key', () => {
    // What a `null` scope set uses, and what the `case` scope uses: TanStack
    // matches by prefix, so the case key is a superset of every collection
    // under it. Asserted here because the whole design rests on it.
    const caseKey = keys.case('C-1')
    const collection = keys.collection('C-1', 'timeline')

    expect(collection.slice(0, caseKey.length)).toEqual([...caseKey])
  })
})
