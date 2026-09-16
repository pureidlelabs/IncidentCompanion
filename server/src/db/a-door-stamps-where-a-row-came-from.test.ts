/**
 * That a door's stamp reaches the columns it names, and that no column it
 * would name is left to the file.
 *
 * Nothing else fails when the filter is wrong. -> `import-stamp.ts`
 *
 * **Quantified over the tables an import writes**, so a table that gains one of
 * these columns is covered the day it does rather than when somebody remembers
 * this file.
 *
 * **What this does not cover:** whether each door calls it. The doors are four
 * call sites in three services and each has its own test; what this holds is
 * the thing they share.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { importStamp } from './import-stamp.js'
import { TABLES } from '../case-archive/import.service.js'
import { TABLES as BULK_TABLES } from '../collections/registry.js'
import { COLLECTION_SCHEMAS, IMPORTABLE, TIMELINE_WRITE_SCHEMAS } from '../domain/collections.js'
import { archiveRowSchema } from '../case-archive/rows.js'

/** What a door may state about a row, whichever door it is. */
const STAMPED = ['source', 'provenance', 'unreviewed'] as const

const DOOR = 'a door'

describe('the stamp a door puts on a row', () => {
  it('names only columns the table has, whichever table it is', () => {
    for (const [name, table] of TABLES) {
      const columns = Object.keys(getTableColumns(table))
      for (const field of Object.keys(importStamp(DOOR, table))) {
        expect(columns, `${name} has no ${field} column to stamp`).toContain(field)
      }
    }
  })

  it('leaves no column a door could name to whatever was already there', () => {
    for (const [name, table] of TABLES) {
      const columns = new Set(Object.keys(getTableColumns(table)))
      const stamped = Object.keys(importStamp(DOOR, table))
      for (const field of STAMPED) {
        if (columns.has(field)) expect(stamped, `${name}.${field} is unstamped`).toContain(field)
      }
    }
  })


  /**
   * **Every collection a file may be written back for can say a row arrived.**
   * `importStamp` narrows to the columns the table has, so a table with none of
   * them takes the stamp, reports the same row count and stores nothing -- the
   * row is then indistinguishable from one an analyst typed, which is the one
   * thing `incident-import/spec.md` says it must not be.
   *
   * `source` names the door and `provenance` says it arrived; a table carrying
   * either can answer where a row came from, and the timeline carries the
   * second. -> #732
   */
  it('gives every importable collection somewhere to record that a row arrived', () => {
    const ORIGIN = ['source', 'provenance'] as const
    for (const name of IMPORTABLE) {
      const table = BULK_TABLES[name as keyof typeof BULK_TABLES]
      expect(table, `${name} is importable and has no table here`).toBeDefined()
      const columns = new Set(Object.keys(getTableColumns(table)))
      expect(
        ORIGIN.some((one) => columns.has(one)),
        `${name} can be imported into and has no column saying a row arrived, so the ` +
          `door's stamp lands nowhere and the row reads as an analyst's own work`,
      ).toBe(true)
    }
  })

  /**
   * **The write schemas are the reason a door's stamp is the last word.** A
   * strict schema that declared one of these would let a caller assert it, and
   * the stamp would then be overriding a claim rather than answering where no
   * claim is possible.
   */
  it('is on no schema a caller writes through', () => {
    const schemas = [...Object.values(COLLECTION_SCHEMAS), ...Object.values(TIMELINE_WRITE_SCHEMAS)]
    for (const schema of schemas) {
      for (const field of STAMPED) expect(Object.keys(schema.shape)).not.toContain(field)
    }
  })

  /**
   * **The archive is the door that has a file to read them from**, which is
   * what made it the one that carried them: its rows are judged by a wider
   * schema than a write, because an export carries columns no analyst writes.
   * The wider schema is where a carried stamp comes back. -> #651
   */
  it('survives an archive that states all three', () => {
    const claimed = { source: 'somewhere else', provenance: 'typed', unreviewed: false }
    for (const [name] of TABLES) {
      const bases =
        name === 'timeline' ? [{ kind: 'event' }, { kind: 'action' }] : [{} as Record<string, unknown>]
      for (const base of bases) {
        const schema = archiveRowSchema(name, base)
        expect(schema, `${name} has no archive schema`).toBeDefined()
        const judged = schema!.parse({ ...base, ...claimed })
        for (const field of STAMPED) {
          expect(Object.keys(judged), `${name} takes ${field} from the file`).not.toContain(field)
        }
      }
    }
  })
})
