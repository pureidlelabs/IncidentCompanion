/**
 * That an empty form can actually be saved.
 *
 * **Written from a 500 the browser found and every server test missed.**
 * Adding an asset through the Add dialog answered *null value in column
 * "system_type" violates not-null constraint*: the Zod schema modelled unset
 * as `null`, the column is `text NOT NULL DEFAULT ''`. Every existing test set
 * the field, so nothing saw it - the defect lives in the values a test author
 * does not think to send, which is exactly what an analyst sends.
 *
 * So this parses each schema with **nothing filled in** and checks the result
 * against the column definitions, rather than against what a test writer
 * expected.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import type { PgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { reportBlockSchema, reportSchema } from '../domain/entities/report.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { REVIEWABLE } from './registry.js'

/**
 * A body with only the collection's required fields set.
 *
 * **This map is not the subject list.** The subjects come from
 * `COLLECTION_SCHEMAS`, and the first case below refuses a collection that has
 * no body here -- so a new collection is red rather than uncovered. A
 * hand-written list of subjects was the previous shape, and it silently omitted
 * `methods`, `reports` and `report_blocks`.
 */
const MINIMAL: Record<string, Record<string, unknown>> = {
  systems: { hostname: 'H' },
  accounts: { accountName: 'a' },
  malware: { filename: 'f' },
  network_indicators: { type: 'ipv4', value: '1.2.3.4' },
  impact: { label: 'Customer CRM export' },
  cloud_apps: { appName: 'a' },
  evidence: { name: 'n' },
  actions: { task: 't' },
  casenotes: { note: 'n' },
  methods: { name: 'M' },
}

type Pair = [string, z.ZodObject, PgTable, Record<string, unknown>]

/**
 * Every collection that publishes one whole-row schema, with its table.
 *
 * `timeline` is absent because it publishes no single schema -- an event and an
 * action validate against different ones -- so it falls out of
 * `COLLECTION_SCHEMAS` by construction rather than by being left off a list.
 */
const SWEPT: Pair[] = Object.entries(COLLECTION_SCHEMAS).map(([name, schema]) => [
  name,
  schema,
  REVIEWABLE[name]!,
  MINIMAL[name] ?? {},
])

/**
 * The two whose schemas are real but sit outside `COLLECTION_SCHEMAS`.
 *
 * `reports` and `report_blocks` declare no `schema` in `COLLECTIONS`, and
 * giving them one would make them importable as a side effect --
 * `IMPORTABLE` is `Object.keys(COLLECTION_SCHEMAS)`, and a selection has never
 * been able to name a report. Their columns can drift like any other, so they
 * are named here rather than left uncovered.
 */
const OUTSIDE: Pair[] = [
  ['reports', reportSchema, reports, { label: 'R' }],
  [
    'report_blocks',
    reportBlockSchema,
    reportBlocks,
    { reportId: '00000000-0000-4000-8000-000000000000' },
  ],
]

const PAIRS: Pair[] = [...SWEPT, ...OUTSIDE]

describe('a form saved with only its required field filled', () => {
  /**
   * **What makes the two cases below a sweep rather than a sample.** They
   * iterate `COLLECTION_SCHEMAS`, so a collection added to the application is
   * swept automatically -- but only if it has a body to save and a table to
   * check against. Without this, a new collection would iterate with `{}` and
   * an undefined table, and pass by doing nothing.
   */
  it('has a body and a table for every collection that publishes a schema', () => {
    const named = Object.keys(COLLECTION_SCHEMAS)
    expect(named.filter((name) => !(name in MINIMAL))).toEqual([])
    expect(named.filter((name) => !(name in REVIEWABLE))).toEqual([])
    expect(SWEPT.length).toBe(named.length)

    /**
     * **Every collection is covered or named**, so a new one cannot arrive
     * without landing in the sweep or being placed deliberately.
     *
     * `timeline` is the single exclusion, and it is a real one rather than an
     * oversight: it validates against a different schema per `kind`, so there
     * is no whole-row schema for this file to check a column against. Its
     * agreement is `domain/entities/timeline.test.ts`'s to keep.
     */
    const covered = new Set([...PAIRS.map(([name]) => name), 'timeline'])
    expect(covered).toEqual(new Set(Object.keys(REVIEWABLE)))
  })

  it.each(PAIRS)('%s produces no null for a NOT NULL column', (_name, schema, table, body) => {
    const parsed = schema.safeParse(body)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)

    const columns = getTableColumns(table)
    const nulls = Object.entries(parsed.data as Record<string, unknown>)
      .filter(([key, value]) => value === null && columns[key]?.notNull === true)
      .map(([key]) => key)

    expect(nulls).toEqual([])
  })

  /**
   * The mirror: every key a parse produces has to be a column. Catches the
   * opposite drift - a schema field added with no column behind it, which the
   * nulls case above cannot see.
   */
  it.each(PAIRS)('%s only writes columns the table has', (_name, schema, table, body) => {
    const parsed = schema.parse(body)
    const columns = getTableColumns(table)
    const unknownKeys = Object.keys(parsed).filter((key) => !(key in columns))
    expect(unknownKeys).toEqual([])
  })
})
