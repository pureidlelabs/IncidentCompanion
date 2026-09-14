/**
 * **What the client offers for batch creation is what the server accepts.**
 *
 * The list is hardcoded here and the server decides per collection, so the two
 * can disagree silently: a collection the server takes a batch write for is
 * simply absent from the Import Data screen, with no error anywhere and no
 * way for an analyst to tell the door exists. -> #362
 *
 * **Held against `BULK_TARGETS`, which is what mounts the doors.** That is the
 * server's own answer rather than a second copy of it: a list written here
 * would agree with itself for ever.
 *
 * **What this does not cover:** whether a collection the server refuses is
 * absent here. That direction is safe -- offering a door the server refuses
 * ends in a refusal the analyst sees -- and `reports` and `report_blocks` are
 * `bulk: false` on both sides already.
 */
import { describe, expect, it } from 'vitest'

import { BATCH_CREATABLE_COLLECTION_NAMES } from './model'
import { BULK_TARGETS } from '@contract/collections'

describe('the collections offered for batch creation', () => {
  it('includes every one the server opens a batch door for', () => {
    expect(
      BULK_TARGETS.length,
      'the server opens no batch door, so this asserts nothing',
    ).toBeGreaterThan(0)

    expect(
      [...BULK_TARGETS].filter(
        (name) => !BATCH_CREATABLE_COLLECTION_NAMES.includes(name as never),
      ),
      'the server takes a batch write for these and the screen offers none of them',
    ).toEqual([])
  })
})
