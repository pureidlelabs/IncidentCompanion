/**
 * Where the suite's database comes from, and which role it is reached through.
 *
 * **The default tier is meant to need no daemon.** A tier that requires a
 * Postgres and a Redis for every run loses its readers slowly enough that
 * nobody notices, and what a provisioned-only tier leaves behind is every
 * database-backed file skipping. PGlite is the real Postgres engine
 * in-process, so it removes the daemon without substituting the engine, which
 * matters here more than usual: this suite asserts transactions, a conditional
 * `UPDATE ... WHERE version = $n` and the row count it returns.
 *
 * **It is reached over a socket, not through a driver.** `@electric-sql/pglite-socket`
 * speaks the Postgres wire protocol, so `pg.Pool`, Drizzle and `drizzle-kit`
 * all connect unchanged and nothing in `src/db/` learns that the tier exists.
 * The alternative - `drizzle-orm/pglite` - changes the `Database` type and
 * therefore every signature it flows through.
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import type { Pool } from 'pg'

import { createPool } from '../src/db/client.js'

export interface EmbeddedPostgres {
  url: string
  stop(): Promise<void>
}

/**
 * Starts an in-process Postgres and serves it on a free port.
 *
 * **Port 0 on purpose**: concurrent runs, and other worktrees on the same
 * machine, must not collide on a fixed one.
 */
export async function startEmbeddedPostgres(): Promise<EmbeddedPostgres> {
  const db = await PGlite.create()
  /**
   * **`maxConnections` defaults to 1, and every pool here opens ten.** The
   * socket server accepts one client and resets the rest, which surfaces as a
   * database that keeps dropping connections rather than as a limit being hit.
   *
   * Queries still execute one at a time; the multiplexer buys *connections*,
   * not concurrency. That is why `hasConcurrentConnections` still answers no.
   */
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 50 })
  await server.start()

  const port =
    (server as unknown as { port?: number }).port ??
    (server as unknown as { server?: { address(): { port: number } } }).server?.address().port
  if (!port) throw new Error('the embedded Postgres reported no port')

  return {
    url: `postgres://postgres:postgres@127.0.0.1:${String(port)}/postgres`,
    stop: async () => {
      await server.stop()
      await db.close()
    },
  }
}

/**
 * A pool that behaves like the role it names, on either backend.
 *
 * **`SET ROLE`, and it is load-bearing rather than tidy.** The socket server
 * ignores the user in the connection URL and hands every client the superuser:
 * connecting as `ic_app` reports `current_user: postgres` and `rolsuper: true`,
 * and a table with `FORCE ROW LEVEL SECURITY` returns **both** cases' rows to a
 * query scoped to one. That is exactly the failure `db/roles.sql`
 * warns about: *a security control that reads as present and enforces nothing*,
 * with every test still green. After `set role ic_app` the same query returns
 * the one right row.
 *
 * **A test-tier fidelity mechanism, not a security boundary** - a session can
 * `reset role`. The server process connects as the role for real.
 *
 * **`max: 1` against the embedded engine.** PGlite is single-connection; the
 * socket server can multiplex, but it serialises queries over one real
 * connection, so two interleaved transactions would share a scope - and the
 * scope is what `withCase` sets. One connection is the honest configuration.
 */
export function openTestPool(url: string, role?: string): Pool {
  return createPool(role && isEmbedded(url) ? asRole(url, role) : url)
}

export function asRole(url: string, role: string): string {
  const at = new URL(url)
  at.username = role
  at.password = role
  return at.toString()
}

export function isEmbedded(url: string): boolean {
  const embedded = process.env.IC_EMBEDDED_DATABASE_URL
  if (!embedded) return false
  // Compared on host and port: the same engine is addressed under three
  // different users, so a string match would answer no for two of them.
  return new URL(url).host === new URL(embedded).host
}

/**
 * Whether the run can assert things only a real server does.
 *
 * **Two connections at once is the one that matters.** A version check refusing
 * the second of two concurrent writers needs two real connections, and the
 * embedded engine has one. A test asserting that must skip rather than pass.
 */
export function hasConcurrentConnections(): boolean {
  return !isEmbedded(process.env.DATABASE_URL ?? '')
}
