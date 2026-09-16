/**
 * That the importer reads back every collection the export writes.
 *
 * The export takes the case document whole, so a `.iccase` carries the
 * document's own keys; `TABLES` is a second list, walked on the way in. A
 * collection in one and not the other is written into the file and dropped on
 * restore, silently -- the importer reads only what it names. -> #850
 */
import { describe, expect, it } from 'vitest'

import { CASE_COLLECTIONS, COLLECTIONS } from '../domain/collections.js'
import { TABLES } from './import.service.js'

/** A collection's wire spelling as the case document keys it. */
const camel = (name: string): string =>
  name.replace(/_(.)/g, (_, letter: string) => letter.toUpperCase())

const written = TABLES.map(([name]) => name as string).sort()

describe('one roster of archived tables', () => {
  it('finds a roster to compare against', () => {
    // Two empty lists are equal, which is how this file would go inert.
    expect(written.length).toBeGreaterThan(10)
  })

  it('reads back every collection the case document carries', () => {
    expect(
      written,
      'a collection the export writes and the import skips is lost on restore',
    ).toEqual([...CASE_COLLECTIONS].sort())
  })

  it('reads back every collection the registry declares', () => {
    expect(written, 'the registry and the archive are one roster in two spellings').toEqual(
      Object.keys(COLLECTIONS).map(camel).sort(),
    )
  })
})
