/**
 * The Postgres pool and the Drizzle handle over it.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export type Database = ReturnType<typeof createDatabase>

/**
 * The handle inside a transaction.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * **`PG_POOL_MAX` bounds the pool, and is left unset in normal use** - `pg`'s
 * own default is the right answer against a real server.
 */
export function createPool(url: string): Pool {
  const max = Number(process.env.PG_POOL_MAX)
  const pool = new Pool({ connectionString: url, ...(max > 0 ? { max } : {}) })

  /**
   * **`PG_ADOPT_ROLE_FROM_URL` is off in normal use and must stay off** - a real
   * server authenticates the user in the URL, so the connection already *is*
   * that role.
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
 * The Drizzle handle.
 */
export function createDatabase(pool: Pool) {
  return drizzle({ client: pool })
}
