/**
 * `batchCreatable` walks `COLLECTION_NAMES`, so a served table absent from it
 * is dropped with no error anywhere - the Import Data screen simply has no row
 * for a door the server opens.
 *
 * Held against the demo catalogue, which `demo-catalogue.mts` writes from
 * `CollectionsController.listing()` rather than by hand.
 */
import { describe, expect, it } from 'vitest'

import catalogue from '@/demo/catalogue/collections.json'

import { COLLECTION_NAMES, type CollectionName } from './model'

describe('every table the listing opens a batch door for', () => {
  it('is one the client has a name for', () => {
    const doors = Object.entries(catalogue)
      .filter(([, meta]) => meta.batch_create)
      .map(([name]) => name)

    expect(doors.length, 'the listing opens no batch door, so this asserts nothing').toBeGreaterThan(
      0,
    )
    expect(
      doors.filter((name) => !COLLECTION_NAMES.includes(name as CollectionName)),
      'the listing opens a batch door for these and the client drops them: give each a name, a '
        + 'label and a case key, or take the collection out of the registry the route derives from',
    ).toEqual([])
  })
})
