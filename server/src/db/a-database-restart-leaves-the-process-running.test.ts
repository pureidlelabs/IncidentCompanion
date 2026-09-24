/**
 * A Postgres restart ends every idle connection with `57P01`, and the process
 * holding the pool outlives it and serves again.
 *
 * **A child process, because the defect is the process exiting.** In-process,
 * vitest catches the unhandled `error` event and the case itself can still pass.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import { isEmbedded } from '../../test/database.js'

const run = promisify(execFile)

const APP_URL = process.env.DATABASE_URL ?? ''
const ADMIN_URL = process.env.ADMIN_DATABASE_URL ?? ''
const CLIENT = fileURLToPath(new URL('./client.ts', import.meta.url))

const CHILD = `
import pg from 'pg'
import { createPool } from ${JSON.stringify(CLIENT)}

const pool = createPool(process.env.DATABASE_URL)
const { rows } = await pool.query('select pg_backend_pid() as pid')
const admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL })
await admin.connect()
await admin.query('select pg_terminate_backend($1)', [rows[0].pid])
await admin.end()
await new Promise((wake) => setTimeout(wake, 1000))
const again = await pool.query('select 1 as one')
console.log('SERVED ' + again.rows[0].one)
await pool.end()
`

describe.skipIf(!APP_URL || !ADMIN_URL || isEmbedded(APP_URL))('a database restart', () => {
  it('ends an idle connection and leaves the process running and serving', async () => {
    const outcome = await run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', CHILD], {
      env: { ...process.env, DATABASE_URL: APP_URL, ADMIN_DATABASE_URL: ADMIN_URL },
    }).then(
      ({ stdout }) => ({ code: 0, out: stdout }),
      (error: { code: number; stdout: string; stderr: string }) => ({
        code: error.code,
        out: `${error.stdout}${error.stderr}`,
      }),
    )
    expect(outcome.code, `the process exited when its idle connection was ended:\n${outcome.out}`).toBe(0)
    expect(outcome.out).toContain('SERVED 1')
  }, 60_000)
})
