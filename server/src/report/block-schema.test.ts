/**
 * What a client may write to a report block, against what the table can hold.
 *
 * **A seam, and the failure is silent on both sides.** The generic collection
 * route validates a body with `reportBlockSchema` and writes it to
 * `reportBlocks`; a field in the schema with no column is accepted, dropped and
 * answered 200, so the client believes it saved.
 *
 * Written as a comparison rather than a case per field, so the next field is
 * covered on the day it is added.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { reportBlockSchema } from '../domain/entities/report.js'
import { referenceFieldsOf } from '../domain/references.js'
import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { REPORT_BLOCKS_COLLECTION } from '../collections/entities.controller.js'
import { reportBlocks } from '../db/schema/report.js'

describe('a report block', () => {
  it('can store every field a client may write', () => {
    const columns = new Set(Object.keys(getTableColumns(reportBlocks)))
    const written = Object.keys(reportBlockSchema.shape)

    const homeless = written.filter((name) => !columns.has(name))
    expect(homeless, 'these are accepted by the route and stored nowhere').toEqual([])
  })

  /**
   * **The figure's own field, named** - because the general check above passes
   * for a schema that lost it entirely.
   */
  it('carries the figure s evidence reference', () => {
    expect(Object.keys(reportBlockSchema.shape)).toContain('evidenceId')
    expect(Object.keys(getTableColumns(reportBlocks))).toContain('evidenceId')
  })

  it('accepts a block with no evidence, which is every kind but the figure', () => {
    const parsed = reportBlockSchema.safeParse({
      reportId: '00000000-0000-4000-8000-000000000000',
      position: 0,
      kind: 'written',
      heading: '',
      headingKey: '',
    })
    expect(parsed.success).toBe(true)
  })

  /**
   * **A reference the case-boundary check can see.** `danglingReferences`
   * finds a foreign key by reading the field's `refTarget`, so a bare
   * `z.uuid()` here is invisible to it. Through the generic collection route
   * that lets a body naming *another case's* evidence be accepted and stored,
   * because the database's own foreign key is checked outside row-level
   * security; and an id naming no row raises a raw Postgres violation where
   * every other reference answers a clean refusal.
   *
   * Asserted through `referenceFieldsOf`, which is the function the check
   * itself walks, rather than against the descriptor - a `refTarget` spelled
   * somewhere the walker does not read would satisfy the second and not the
   * first.
   */
  it('declares its evidence reference where the boundary check reads it', () => {
    expect(referenceFieldsOf(reportBlockSchema)).toContainEqual({
      field: 'evidenceId',
      target: 'evidence',
    })
  })

  /**
   * **The third vertex, and the one that made the last fix inert.** Declaring
   * `refTarget` is not enough: the check resolves a schema as
   * `def.schemaFor?.(values) ?? COLLECTION_SCHEMAS[def.name]`, and report
   * blocks are registered without a schema - so it resolves `undefined` and
   * returns before looking at anything, whatever a schema elsewhere declares.
   * Asserted against the definition the service actually reads, so a schema
   * declared somewhere the resolver does not look fails here.
   */
  it('gives the reference check a schema that carries the reference', () => {
    const resolved =
      REPORT_BLOCKS_COLLECTION.schemaFor?.({}) ?? COLLECTION_SCHEMAS[REPORT_BLOCKS_COLLECTION.name]
    expect(resolved, 'the check resolves no schema, so it returns before checking').toBeDefined()
    expect(referenceFieldsOf(resolved!)).toContainEqual({
      field: 'evidenceId',
      target: 'evidence',
    })
  })

  /**
   * **"No image" is a real choice, and the empty string is not a uuid.** The
   * picker carries a blank row, so an analyst who picked the wrong image can
   * pick none. `null` is what the column, the `nullish` here and the foreign
   * key's own `set null` all mean by "no image"; the empty string a form field
   * yields is not a uuid, and the route answers 400 to it.
   */
  it('takes null for no image, and refuses the empty string', () => {
    const patch = (evidenceId: unknown) =>
      reportBlockSchema.partial().safeParse({ evidenceId }).success

    expect(patch(null), 'clearing a figure is refused').toBe(true)
    expect(patch(''), 'the empty string is not a uuid and must not be smuggled in').toBe(false)
  })

  it('refuses an evidence reference that is not an id', () => {
    const parsed = reportBlockSchema.safeParse({
      reportId: '00000000-0000-4000-8000-000000000000',
      kind: 'figure',
      evidenceId: 'not-a-uuid',
    })
    expect(parsed.success).toBe(false)
  })
})
