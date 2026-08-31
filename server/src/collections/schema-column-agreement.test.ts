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

import {
  accounts,
  cloudApps,
  evidence,
  impact,
  malware,
  networkIndicators,
  systems,
} from '../db/schema/entities.js'
import { actions, caseNotes } from '../db/schema/tracker.js'
import { accountSchema } from '../domain/entities/account.js'
import { cloudAppSchema } from '../domain/entities/cloud-app.js'
import { evidenceSchema } from '../domain/entities/evidence.js'
import { impactSchema } from '../domain/entities/impact.js'
import { malwareSchema } from '../domain/entities/malware.js'
import { networkIndicatorSchema } from '../domain/entities/network-indicator.js'
import { systemSchema } from '../domain/entities/system.js'
import { actionSchema } from '../domain/entities/action.js'
import { caseNoteSchema } from '../domain/entities/case-note.js'

/** Each collection, its table, and a body with only its required field set. */
const PAIRS: [string, z.ZodObject, PgTable, Record<string, unknown>][] = [
  ['systems', systemSchema, systems, { hostname: 'H' }],
  ['accounts', accountSchema, accounts, { accountName: 'a' }],
  ['malware', malwareSchema, malware, { filename: 'f' }],
  ['network_indicators', networkIndicatorSchema, networkIndicators, { type: 'ipv4', value: '1.2.3.4' }],
  ['impact', impactSchema, impact, { label: 'Customer CRM export' }],
  ['cloud_apps', cloudAppSchema, cloudApps, { appName: 'a' }],
  ['evidence', evidenceSchema, evidence, { name: 'n' }],
  ['actions', actionSchema, actions, { task: 't' }],
  ['casenotes', caseNoteSchema, caseNotes, { note: 'n' }],
]

describe('a form saved with only its required field filled', () => {
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
   * The mirror: a field the schema can leave unset must be a column that
   * accepts it. Catches the opposite drift - a nullable schema field whose
   * column later gains NOT NULL.
   */
  it.each(PAIRS)('%s only writes columns the table has', (_name, schema, table, body) => {
    const parsed = schema.parse(body)
    const columns = getTableColumns(table)
    const unknownKeys = Object.keys(parsed).filter((key) => !(key in columns))
    expect(unknownKeys).toEqual([])
  })
})
