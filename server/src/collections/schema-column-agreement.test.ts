/**
 * That an empty form can actually be saved.
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
 */
const SWEPT: Pair[] = Object.entries(COLLECTION_SCHEMAS).map(([name, schema]) => [
  name,
  schema,
  REVIEWABLE[name]!,
  MINIMAL[name] ?? {},
])

/**
 * The two whose schemas are real but sit outside `COLLECTION_SCHEMAS`.
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
   * **What makes the two cases below a sweep rather than a sample.**
   */
  it('has a body and a table for every collection that publishes a schema', () => {
    const named = Object.keys(COLLECTION_SCHEMAS)
    expect(named.filter((name) => !(name in MINIMAL))).toEqual([])
    expect(named.filter((name) => !(name in REVIEWABLE))).toEqual([])
    expect(SWEPT.length).toBe(named.length)

    /**
     * **Every collection is covered or named**, so a new one cannot arrive
     * without landing in the sweep or being placed deliberately.
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
   * The mirror: a field the schema can leave unset must be a column that accepts
   * it.
   */
  it.each(PAIRS)('%s only writes columns the table has', (_name, schema, table, body) => {
    const parsed = schema.parse(body)
    const columns = getTableColumns(table)
    const unknownKeys = Object.keys(parsed).filter((key) => !(key in columns))
    expect(unknownKeys).toEqual([])
  })
})
