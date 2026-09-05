/**
 * The pool and the Drizzle handle, as injectables.
 *
 * `@Global`, so every module shares one pool per process rather than opening a
 * second set of connections against the same limit. The pool is closed on
 * shutdown, or a `SIGTERM` leaves connections open until Postgres times them
 * out.
 */
import { Global, Module, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ModuleRef } from '@nestjs/core'
import { Pool } from 'pg'

import { createDatabase, createPool, type Database } from './client.js'
import type { Env } from '../config/env.js'

export const PG_POOL = Symbol('PG_POOL')
export const DATABASE = Symbol('DATABASE')

/**
 * The seeding handle - **a second pool on purpose**, because role is a
 * property of the connection and `ic_seed` may write across every case, which
 * the request-serving role must not.
 *
 * **Null when no seeding role is configured.** A caller refuses with
 * `seedRoleMissing` rather than falling back to the app's connection.
 */
export const SEED_DATABASE = Symbol('SEED_DATABASE')

/**
 * What to say when something that writes across every case has no role to do
 * it with. Named here so every caller refuses the same way - inject
 * `SEED_DATABASE` as nullable and check it, or an install with the seeder off
 * fails as a `TypeError` inside `app.listen()` and never binds.
 */
export function seedRoleMissing(what: string): string {
  return (
    `Cannot seed ${what}: SEED_DATABASE_URL is not set. Seeding writes across ` +
    'every case and deletes rows, which row-level security refuses on the app ' +
    'role -- so it needs ic_seed. Set it, or do not run the seeder.'
  )
}
export const SEED_POOL = Symbol('SEED_POOL')

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createPool(config.get('DATABASE_URL', { infer: true })),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => createDatabase(pool),
    },
    {
      provide: SEED_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Pool | null => {
        const url = config.get('SEED_DATABASE_URL', { infer: true })
        return url ? createPool(url) : null
      },
    },
    {
      provide: SEED_DATABASE,
      inject: [SEED_POOL],
      useFactory: (pool: Pool | null): Database | null => (pool ? createDatabase(pool) : null),
    },
  ],
  exports: [PG_POOL, DATABASE, SEED_POOL, SEED_DATABASE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const pool = this.moduleRef.get<Pool>(PG_POOL, { strict: false })
    const seeding = this.moduleRef.get<Pool | null>(SEED_POOL, { strict: false })
    await Promise.all([pool.end(), seeding?.end()])
  }
}
