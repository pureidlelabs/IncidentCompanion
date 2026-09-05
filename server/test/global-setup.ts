/**
 * A database the tests own, so running them never touches the one in use.
 */
import { execFile, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { Client } from 'pg'

const run = promisify(execFile)

/**
 * The package root, which is where `drizzle.config.json` is and is not always
 * the working directory a run was typed from.
 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 *  Exported so `run-lock.test.ts` locks against the same server rather than
 *  reading an environment variable no test process is given -- which is how a
 */
export const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  (
    JSON.parse(
      execFileSync('node', [fileURLToPath(new URL('../scripts/stack.mjs', import.meta.url))], {
        encoding: 'utf8',
      }),
    ) as { adminDatabaseUrl: string }
  ).adminDatabaseUrl

/** Owns the schema and applies it. Holds no exemption from any policy. */
const asRole = (url: string, role: string): string => {
  const at = new URL(url)
  at.username = role
  at.password = role
  return at.toString()
}

function testUrl(): string {
  const base = process.env.TEST_DATABASE_URL ?? `${ADMIN_URL}_test`
  const name = new URL(base).pathname.slice(1)
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run: the test database is "${name}", which does not end in _test.\n` +
        'The suite truncates tables, so it may only ever point at a database it owns.',
    )
  }
  return base
}

/**
 * `roles.sql`, which is the half of the role definitions a driver can run.
 */
async function rolesSql(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../docker/db/roles.sql', import.meta.url)), 'utf8')
}

/**
 * The in-process engine, used when no server is reachable - or when asked for.
 */
async function embedded(): Promise<void> {
  const { startEmbeddedPostgres } = await import('./database.js')
  const server = await startEmbeddedPostgres()
  // **Wrapped, not referenced.** `server.stop` reads `this`, and handing the
  // bare method to the teardown hook calls it with none -- so a failed stop
  // would leave the embedded Postgres running after the run.
  teardownEmbedded = () => server.stop()

  // **Nothing in the tree sets `IC_TEST_DB`**, so this path is reached only on
  // a machine with no admin Postgres -- and no suite reports whether it ran.
  const roles = await rolesSql()
  const apply = async (): Promise<void> => {
    const client = new Client({ connectionString: server.url })
    await client.connect()
    await client.query(roles)
    await client.end()
  }

  // Before the push, so the roles exist for it to grant to.
  await apply()

  await run('npx', ['drizzle-kit', 'push', '--force'], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: server.url },
  })

  /**
   * **And again after it, which is not belt and braces.**
   */
  await apply()

  const { asRole } = await import('./database.js')
  process.env.IC_EMBEDDED_DATABASE_URL = server.url
  // **The role rides in the URL, as it does against a real server.** The
  // engine ignores it on the wire, so `createPool` adopts it after connecting;
  // that is what makes the app's own pools -- the demo seeder's especially --
  // behave as the role their policies name.
  process.env.PG_ADOPT_ROLE_FROM_URL = '1'
  process.env.DATABASE_URL = asRole(server.url, 'ic_app')
  process.env.SEED_DATABASE_URL = asRole(server.url, 'ic_seed')
  // One connection per pool: the engine underneath is single-connection, and
  // the socket server's multiplexer desynchronises the wire under a pool of
  // ten rather than queueing behind it.
  process.env.PG_POOL_MAX = '1'
  console.warn(
    '[test] running against the in-process engine (no daemon).\n' +
      '       Measured 2026-08-11: 1573 of 1614 pass here. The rest are write paths \u2014\n' +
      '       a transaction per connection is multiplexed onto one backend, so a scope\n' +
      '       set inside one can be seen by another. Start the dev stack for those.',
  )
}

/**
 * The key two concurrent suites have to agree on. Arbitrary, and constant.
 */
const RUN_LOCK_KEY = 8_615_231

/** How long a second run waits for the first before giving up. */
const RUN_LOCK_WAIT_MS = 10 * 60 * 1000

let runLock: Client | undefined

/**
 * Held for the whole run, so two suites cannot drop each other's database.
 */
export async function takeRunLock(
  adminUrl: string = ADMIN_URL,
  waitMs: number = RUN_LOCK_WAIT_MS,
  /** Overridden only by `run-lock.test.ts`, which runs *inside* a suite that
   *  is already holding `RUN_LOCK_KEY` and so can never take it again. */
  key: number = RUN_LOCK_KEY,
): Promise<Client> {
  const client = new Client({ connectionString: new URL('/postgres', adminUrl).toString() })
  await client.connect()
  const deadline = Date.now() + waitMs
  for (;;) {
    const held = await client.query<{ got: boolean }>('select pg_try_advisory_lock($1) as got', [
      key,
    ])
    if (held.rows[0]?.got) return client
    if (Date.now() >= deadline) {
      await client.end()
      throw new Error(
        'Another test run holds the database lock and did not finish in time.\n' +
          `  Why: there is one test database and \`setup\` drops it with (force), which\n` +
          '       would terminate the other run\'s connections mid-query.\n' +
          '  Fix: wait for the other run, or kill it. Nothing needs cleaning up -\n' +
          '       the lock is released when its connection closes.',
      )
    }
    await new Promise((wake) => setTimeout(wake, 250))
  }
}

let teardownEmbedded: (() => Promise<void>) | undefined

export async function teardown(): Promise<void> {
  await teardownEmbedded?.()
  // Released explicitly so the next run starts at once rather than waiting for
  // the connection to be reaped.
  await runLock?.end()
  runLock = undefined
}

export async function setup(): Promise<void> {
  // **Asked for explicitly**, so the hermetic path can be exercised on a
  // machine where a server *is* reachable - otherwise it is only ever tested by
  // not having one, which is the configuration nobody runs.
  if (process.env.IC_TEST_DB === 'embedded') {
    await embedded()
    await provisionPersonas()
    return
  }

  const url = testUrl()
  const name = new URL(url).pathname.slice(1)

  const admin = new Client({ connectionString: new URL('/postgres', ADMIN_URL).toString() })
  try {
    await admin.connect()
  } catch {
    await embedded()
    await provisionPersonas()
    return
  }

  // **The lock is taken before the drop, and only after the admin connection
  // proved reachable** - a machine with no server takes the embedded path
  // above and never reaches here.
  await admin.end()
  runLock = await takeRunLock()

  // Dropped and recreated rather than truncated: a schema change between runs
  // otherwise leaves the old shape behind, and the failure reads as a broken
  // push rather than a stale database.
  await runLock.query(`drop database if exists "${name}" with (force)`)
  await runLock.query(`create database "${name}" owner ic_migrate`)

  // The roles are cluster-wide and already exist; this grants them on the
  // database just created and revokes what Postgres hands out by default.
  const onFresh = new Client({ connectionString: url })
  await onFresh.connect()
  const roles = await rolesSql()
  await onFresh.query(roles)
  await onFresh.end()

  await run('npx', ['drizzle-kit', 'push', '--force'], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: asRole(url, 'ic_migrate') },
  })

  // **What the suite queries through.** Not the owner and not an
  // administrator, so a test that asserts case scoping is asserting it against
  // the role that has to obey it.
  process.env.DATABASE_URL = asRole(url, 'ic_app')
  process.env.SEED_DATABASE_URL = asRole(url, 'ic_seed')

  await provisionPersonas()
}

/**
 * The suite's two accounts, created here because **this is the only moment the
 * install is empty**.
 */
async function provisionPersonas(): Promise<void> {
  const { boot, bootable, sharedAdmin, sharedAnalyst } = await import('./app-harness.js')
  if (!(await bootable())) return
  const harness = await boot()
  try {
    await sharedAdmin(harness)
    await sharedAnalyst(harness)
  } finally {
    await harness.close()
  }
}
