/**
 * The Postgres pool and the Drizzle handle over it.
 *
 * **One pool per process, built from the URL and never from parts** - a
 * host/port/user/password quartet is four things to get wrong per environment,
 * where a URL is one string the app never inspects.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export type Database = ReturnType<typeof createDatabase>

/**
 * The handle inside a transaction.
 *
 * **Named because `withCase` hands it out and nothing else should.** A query
 * run against `Database` from inside a scoped transaction takes a different
 * connection, which carries no scope and therefore sees no rows - a failure
 * that looks like missing data rather than a mistake. -> `db/scope.ts`
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * **`PG_POOL_MAX` bounds the pool, and is left unset in normal use** - `pg`'s
 * own default is the right answer against a real server. It exists because the
 * test tier can be an in-process engine that is single-connection underneath:
 * there, a pool of ten is ten clients multiplexed onto one backend, and the
 * wire desynchronises rather than queueing (`unexpected commandComplete
 * message from backend`). -> `test/database.ts`
 */
export function createPool(url: string): Pool {
  const max = Number(process.env.PG_POOL_MAX)
  const pool = new Pool({ connectionString: url, ...(max > 0 ? { max } : {}) })

  /**
   * **`PG_ADOPT_ROLE_FROM_URL` is off in normal use and must stay off** - a
   * real server authenticates the user in the URL, so the connection already
   * *is* that role. It restores row-level security under a test engine that
   * hands every client the superuser, and is never a security boundary.
   */
  if (process.env.PG_ADOPT_ROLE_FROM_URL === '1') {
    const role = decodeURIComponent(new URL(url).username)
    if (role) {
      pool.on('connect', (client) => {
        void client.query(`set role ${role}`)
      })
    }
  }
  return pool
}

/**
 * The Drizzle handle. **No `schema` option** - v1 dropped it with RQBv1, and
 * passing one is ignored rather than refused. Better Auth takes the schema
 * directly, in `drizzleAdapter`.
 */
export function createDatabase(pool: Pool) {
  return drizzle({ client: pool })
}
