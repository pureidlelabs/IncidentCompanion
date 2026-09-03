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

/**
 * Every privilege `ic_app` holds on the tables, as the database itself reports
 * it: role, table, and the verb granted.
 */
async function appPrivileges(): Promise<string[]> {
  const client = new Client({ connectionString: MIGRATE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<{ line: string }>(
      `select table_name || ':' || privilege_type as line
         from information_schema.role_table_grants
        where grantee = 'ic_app' and table_schema = 'public'
        order by table_name, privilege_type`,
    )
    return rows.map((row) => row.line)
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

    /**
     * *AND the application's own identity gained nothing by it.*
     *
     * **The clause the case above cannot answer.** A push that restored the
     * policy and quietly granted `ic_app` something on the way would satisfy
     * every assertion there, and the whole reason a separate migrating
     * identity exists is that the application's own may not grow.
     *
     * Read from `information_schema` rather than from what the migration was
     * asked to do: what matters is what the database ended up granting, and a
     * privilege arriving through a default rather than a statement is the case
     * a diff of the migration would miss.
     *
     * **No mutation was applied to this one, and the reason is the reason it
     * passes.** The push runs `drizzle-kit`, which writes tables; the grants
     * live in `docker/db/roles.sql` and are applied by a different act. So
     * nothing available here can make a push change a privilege, and the case
     * is a guard against the migration that one day does rather than a
     * demonstration that one currently does not. The non-empty check is what
     * stops it passing on a query that returns nothing.
     */
    it('leaves the application identity holding exactly what it held', async () => {
      const before = await appPrivileges()
      expect(
        before.length,
        'ic_app holds nothing, so this would pass however the push went',
      ).toBeGreaterThan(0)

      await setQual('true')
      await run('npm', ['run', '--silent', 'db:push', '--', '--force'], {
        env: { ...process.env, DATABASE_URL: MIGRATE_URL },
      })

      expect(
        await appPrivileges(),
        'the application identity holds something it did not hold before the schema was ' +
          'pushed, so a migration is a way for it to grow',
      ).toEqual(before)
    }, 120_000)
  },
)
