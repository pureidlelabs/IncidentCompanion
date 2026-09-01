/**
 * That `db:push` puts a policy back when the database has drifted from the schema.
 *
 * **The drift is arranged in the database, not in the source.** The suite's own
 * database is dropped and recreated per run, so asserting that the live
 * policies match the schema would hold whatever the schema said.
 *
 * Covers one policy on one table: the push applies them all the same way.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { asRole, isEmbedded } from '../../test/database.js'

const run = promisify(execFile)

const APP_URL = process.env.DATABASE_URL ?? ''
/** Owns the tables: altering a policy and pushing the schema both need it. */
const MIGRATE_URL = APP_URL ? asRole(APP_URL, 'ic_migrate') : ''

const TABLE = 'evidence'
const POLICY = 'case_scope'

async function qualOf(): Promise<string> {
  const client = new Client({ connectionString: MIGRATE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<{ qual: string }>(
      'select qual from pg_policies where schemaname = $1 and tablename = $2 and policyname = $3',
      ['public', TABLE, POLICY],
    )
    return rows[0]?.qual ?? ''
  } finally {
    await client.end()
  }
}

async function setQual(expression: string): Promise<void> {
  const client = new Client({ connectionString: MIGRATE_URL })
  await client.connect()
  try {
    await client.query(`alter policy "${POLICY}" on "${TABLE}" using (${expression})`)
  } finally {
    await client.end()
  }
}

let original = ''

describe.skipIf(!APP_URL || isEmbedded(APP_URL))(
  'pushing the schema onto a drifted database',
  () => {
    afterAll(async () => {
      // The rest of the run reads this table through the policy, so a failed
      // push must not leave it open.
      if (original) await setQual(original)
    })

    it('restores a policy the database no longer holds as the schema declares it', async () => {
      original = await qualOf()
      expect(original).toContain('app.case_id')

      await setQual('true')
      expect(await qualOf()).toBe('true')

      await run('npm', ['run', '--silent', 'db:push', '--', '--force'], {
        env: { ...process.env, DATABASE_URL: MIGRATE_URL },
      })

      expect(await qualOf()).toBe(original)
    }, 120_000)
  },
)
