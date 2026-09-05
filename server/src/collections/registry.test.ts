/**
 * Every map the server keys by collection is a slice of one registry, and each
 * slice is asserted *total* here.
 *
 * **Totality is the property, not agreement.** The seven hand-written maps
 * these replaced agreed pairwise for months and still produced four defects,
 * each one entry short in one map - and one of those was created by a fix that
 * updated one of two call sites. A test comparing two lists cannot see the
 * entry missing from both.
 */
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  BULK_TARGETS,
  COLLECTIONS,
  REFERENCE_TABLES,
  REVIEWABLE,
  TABLES,
  type Collection,
} from './registry.js'
import {
  COLLECTION_SCHEMAS,
  IMPORTABLE,
  NOUNS,
  REFERENCING_SCHEMAS,
  SCREEN_KEY,
} from '../domain/collections.js'
import { actionWriteSchema, eventWriteSchema } from '../domain/entities/timeline.js'
import { referenceFieldsOf } from '../domain/references.js'

const NAMES = Object.keys(COLLECTIONS) as Collection[]

/**
 * Every schema a reference can be declared on. **Imported, not re-listed** --
 * a local copy omits the schemas supplied another way.
 * -> `domain/collections.ts`
 */
const REFERENCING = REFERENCING_SCHEMAS as z.ZodObject[]

/**
 * The schemas `/api/specs` walks, which is where a picker comes from.
 *
 * **Narrower than `REFERENCING`, and the difference is `report_blocks`.** Its
 * `reportId` is a reference for the case-boundary check and draws no control:
 * a block's parent is identity, and a picker for it would offer an analyst the
 * chance to file a section under the wrong report. So "does this resolve" and
 * "does this need a noun" are asked over different sets.
 */
const PICKER_SCHEMAS: z.ZodObject[] = [
  ...Object.values(COLLECTION_SCHEMAS),
  eventWriteSchema,
  actionWriteSchema,
]

const targetsOf = (schemas: z.ZodObject[]): string[] => [
  ...new Set(schemas.flatMap((schema) => referenceFieldsOf(schema).map((ref) => ref.target))),
]

const REF_TARGETS = targetsOf(REFERENCING)
const PICKER_TARGETS = targetsOf(PICKER_SCHEMAS)

describe('every map is a total slice of the registry', () => {
  it('gives every collection a table to be reviewed against', () => {
    expect(Object.keys(REVIEWABLE).sort()).toEqual([...NAMES].sort())
  })

  /**
   * **The values, not only the keys.** `TABLES` is built by walking
   * `BULK_TARGETS`, so a collection the table binding never got still appears
   * as a key - holding `undefined`, which every caller reads as "no such
   * collection" one layer later.
   */
  it('holds a bulk table for exactly the bulk collections', () => {
    const bulk = NAMES.filter((name) => COLLECTIONS[name].bulk)
    expect([...BULK_TARGETS]).toEqual(bulk)
    expect(Object.keys(TABLES)).toEqual(bulk)
    expect(Object.values(TABLES).filter((table) => !table)).toEqual([])
    expect(Object.values(REVIEWABLE).filter((table) => !table)).toEqual([])
  })

  it('validates with a schema for exactly the collections that declare one', () => {
    const withSchema = NAMES.filter((name) => 'schema' in COLLECTIONS[name])
    expect(Object.keys(COLLECTION_SCHEMAS)).toEqual(withSchema)
    expect(IMPORTABLE).toEqual(withSchema)
  })

  it('names a screen key and a noun for every collection a picker points at', () => {
    const unresolvable = PICKER_TARGETS.filter((target) => !SCREEN_KEY[target] || !NOUNS[target])
    expect(unresolvable, 'a picker with no noun offers the wire name to the analyst').toEqual([])
  })

  /**
   * **The other half, or the split above quietly becomes an exemption.** A
   * reference that resolves but draws nothing is correct for `reportId` and
   * wrong for anything an analyst fills in, so the set is named rather than
   * left as whatever falls out.
   */
  it('draws a picker for every reference except a report block\u2019s parent', () => {
    expect(REF_TARGETS.filter((target) => !PICKER_TARGETS.includes(target))).toEqual(['reports'])
  })

  it('keys the screen keys and nouns by a collection that exists', () => {
    const strays = [...Object.keys(SCREEN_KEY), ...Object.keys(NOUNS)].filter(
      (name) => !(name in COLLECTIONS),
    )
    expect(strays, 'a camelCase key here falls through to the wire spelling').toEqual([])
  })
})

describe('the deliberate gaps', () => {
  /**
   * **`timeline` has a table and no schema on purpose.** Its patchable fields
   * depend on the row's `kind`, so a single schema would let an import write an
   * action's fields onto an event. Named here so the gap is a decision rather
   * than an omission somebody closes by guessing.
   */
  it('leaves timeline out of the schemas, because its shape depends on the row', () => {
    expect(COLLECTION_SCHEMAS['timeline']).toBeUndefined()
    expect(IMPORTABLE).not.toContain('timeline')
    expect(TABLES['timeline']).toBeDefined()
  })

  /**
   * **Reports are reviewable and nothing else.** They are written under a
   * version check, so a save on one can be refused and reviewed; no selection
   * has ever been able to name one. Widening the bulk half to close the review
   * gap is what would make a report bulk-deletable and exportable as a side
   * effect.
   */
  it.each(['reports', 'report_blocks'])('reviews %s without exposing it to a selection', (name) => {
    expect(REVIEWABLE[name]).toBeDefined()
    expect(BULK_TARGETS).not.toContain(name)
    expect(IMPORTABLE).not.toContain(name)
  })
})

describe('the reference targets on the entity schemas', () => {
  /**
   * **The check whose absence let a cross-case reference go unguarded.** A
   * `refTarget` that names nothing in `TABLES` throws in `reference-check.ts`
   * at write time. Skipped silently, it leaves a jsonb id list -- the half
   * Postgres does not constrain -- with nothing looking at it.
   *
   * Enumerated from the schemas' own metadata rather than listed, so a
   * reference added tomorrow is checked the moment it exists.
   */
  it('all name a collection a reference resolves through', () => {
    expect(REF_TARGETS.length).toBeGreaterThan(0)
    // `REFERENCE_TABLES`, not `TABLES`: a reference may name a report, while a
    // selection may not, and reading the bulk map here is what left
    // `report_blocks.reportId` with nowhere to resolve.
    const unknown = REF_TARGETS.filter(
      (target) => !(target in COLLECTIONS && target in REFERENCE_TABLES),
    )
    expect(unknown, 'a reference nothing can resolve is a reference nothing checks').toEqual([])
  })
})
