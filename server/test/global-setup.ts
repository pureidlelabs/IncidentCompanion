/**
 * A database the tests own, so running them never touches the one in use.
 *
 * The demo-seeder tests delete every case in `beforeEach`, so a suite pointed
 * at the dev stack's database empties the picker while the app is open.
 *
 * **The name guard is the part that matters.** Creating a separate database is
 * easy to undo by accident - one environment variable, one copied command - so
 * a URL whose database does not end in `_test` refuses to run rather than
 * being helpfully migrated. A destructive default should fail closed.
 *
 * **Provisioning and running are different roles, and that is the point.**
 * Creating a database needs an administrator; *asserting* that one case cannot
 * read another's rows needs the role the server actually uses. A test suite
 * connected as a superuser proves nothing about row-level security - a
 * superuser ignores every policy, and `FORCE` does not apply to it. So this
 * provisions as the administrator and hands the suite `ic_app`.
 *
 * **Pushed, not migrated.** There are no installs to upgrade, so the schema is
 * applied straight from the TypeScript.
 */
import { execFile, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { Client } from 'pg'

const run = promisify(execFile)

/** The package root: `drizzle.config.ts` resolves against it, and it is not
 *  always the directory a run was typed from. */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Provisions databases and roles. Never what a test queries through.
 *
 *  Exported so `run-lock.test.ts` locks against the same server rather than
 *  reading an environment variable no test process is given -- which is how a
 *  tier ends up skipping in silence and reading as covered. */
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
 *
 * `role-passwords.sql` is deliberately not read: it is psql's syntax, and no
 * role provisioned here is ever authenticated as -- the real cluster already
 * carries the fixture passwords, and the in-process engine ignores the wire
 * user. -> `docker/db/role-passwords.sql`
 *
 * Resolved against this file rather than the working directory, because the
 * working directory is not always the package root: a run typed at the
 * repository root reaches here with `../docker` one level too high, and the
 * setup fails with `ENOENT` naming a path that exists.
 */
async function rolesSql(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../docker/db/roles.sql', import.meta.url)), 'utf8')
}

/**
 * The in-process engine, used when no server is reachable - or when asked for.
 *
 * **A skip is not a neutral outcome here.** Without this the whole
 * database-backed half of the suite disappears on any machine without the dev
 * stack, and reports success while doing it. PGlite is the real Postgres
 * engine, so what runs against it is the real dialect.
 *
 * **`IC_EMBEDDED_DATABASE_URL` is how the rest of the suite recognises it**,
 * because two things behave differently against it: the role has to be adopted
 * with `SET ROLE` (the wire ignores the user, and every policy is inert
 * without it), and there is only one connection, so a test that needs two
 * writers at once must skip rather than pass. -> `server/test/database.ts`
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
   * **And again after it, which is not belt and braces.** The grants in
   * `roles.sql` arrive through `ALTER DEFAULT PRIVILEGES FOR ROLE ic_migrate`,
   * and they attach to whoever *creates* the table - here that is the single
   * user the socket server hands out, not `ic_migrate`, so nothing is granted
   * and the first query fails with `permission denied for table user`, a long
   * way from the cause. The file's trailing `GRANT ... ON ALL TABLES` is the
   * catch-up path, and it covers what exists when it runs: nothing, the first
   * time. The file is idempotent by design, which is what makes this legal.
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
 *
 * **There is one test database, and `setup` opens by dropping it `with
 * (force)`** -- which terminates every other connection to it. So a second
 * `vitest run` starting while the first is mid-suite recreates the database
 * underneath it, and the first reports `relation "cases" does not exist` from
 * whichever files it had reached, every one green on a re-run. That signature
 * is what gets called flake and dismissed, and it is not flake -- it is two
 * runs sharing one name with no interlock.
 *
 * **A session advisory lock rather than a lockfile**: Postgres releases it when
 * the connection dies, so a killed run leaves nothing behind to clean up and
 * needs no staleness heuristic. `stack.mjs` carries a lockfile with a `stale`
 * timeout for the stack itself, and that timeout is exactly the thing not
 * needed here.
 *
 * Waits rather than refusing, because the common case is a landing running the
 * suite while an agent runs a subset, and the correct answer for the second one
 * is *later* rather than *no*.
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
 *
 * Sign-up closes as soon as the install has any account, and the accounts that
 * close it are not all sign-ups: `server/src/db/mutate.test.ts` and the
 * collection fixtures insert `user` rows directly for attribution and never
 * remove them. So which file happens to run first decides whether the door is
 * still open, and vitest orders files by their previous durations: the suite
 * alternated green and red on an unchanged tree.
 *
 * **Booting the app is the point, not an expense.** The accounts are made
 * through the doors an install really has - sign up the first, promote it,
 * then have it create the analyst - so nothing here is a bypass of the rule
 * being tested. It costs one boot per run.
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
