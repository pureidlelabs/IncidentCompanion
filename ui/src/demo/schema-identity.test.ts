/**
 * **The demo judges a draft with the install's own schema, not a copy.**
 */
import { COLLECTION_SCHEMAS, TIMELINE_WRITE_SCHEMAS } from '@contract/collections'
import { describe, expect, it } from 'vitest'

import { schemaFor } from './handler'

describe('the schema a draft is judged by', () => {
  it('is the object the server exports, for every collection that has one', () => {
    const names = Object.keys(COLLECTION_SCHEMAS)
    expect(names.length, 'no collection schemas found; has the contract moved?').toBeGreaterThan(5)
    for (const name of names) {
      expect(schemaFor(name, {}), name).toBe(COLLECTION_SCHEMAS[name])
    }
  })

  it('is the one the timeline picks from the kind the draft declares', () => {
    for (const kind of Object.keys(TIMELINE_WRITE_SCHEMAS)) {
      expect(schemaFor('timeline', { kind }), kind).toBe(
        TIMELINE_WRITE_SCHEMAS[kind as keyof typeof TIMELINE_WRITE_SCHEMAS],
      )
    }
  })

  it('is nothing at all where the demo cannot check a draft', () => {
    expect(schemaFor('timeline', { kind: 'not-a-kind' })).toBeNull()
    expect(schemaFor('wombats', {})).toBeNull()
  })
})
