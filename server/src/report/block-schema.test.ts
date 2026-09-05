/**
 * What a client may write to a report block, against what the table can hold.
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
   * for a schema that lost it entirely, and losing it is the state this whole
   * change was undoing.
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
   * **A reference the case-boundary check can see.**
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
   * **The third vertex, and the one that made the last fix inert.**
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
