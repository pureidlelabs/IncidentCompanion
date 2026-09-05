/**
 * Where the suite's database comes from, and which role it is reached through.
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import type { Pool } from 'pg'

import { createPool } from '../src/db/client.js'

export interface EmbeddedPostgres {
  /** A URL any Postgres client can use, including `drizzle-kit push`. */
  url: string
  stop(): Promise<void>
}

/**
 * Starts an in-process Postgres and serves it on a free port.
 */
export async function startEmbeddedPostgres(): Promise<EmbeddedPostgres> {
  const db = await PGlite.create()
  /**
   * **`maxConnections` defaults to 1, and every pool here opens ten.**
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
 */
export function openTestPool(url: string, role?: string): Pool {
  return createPool(role && isEmbedded(url) ? asRole(url, role) : url)
}

/** The same URL, addressed as another role. */
export function asRole(url: string, role: string): string {
  const at = new URL(url)
  at.username = role
  at.password = role
  return at.toString()
}

/** Whether this URL is the in-process engine rather than a real server. */
export function isEmbedded(url: string): boolean {
  const embedded = process.env.IC_EMBEDDED_DATABASE_URL
  if (!embedded) return false
  // Compared on host and port: the same engine is addressed under three
  // different users, so a string match would answer no for two of them.
  return new URL(url).host === new URL(embedded).host
}

/**
 * Whether the run can assert things only a real server does.
 */
export function hasConcurrentConnections(): boolean {
  return !isEmbedded(process.env.DATABASE_URL ?? '')
}
