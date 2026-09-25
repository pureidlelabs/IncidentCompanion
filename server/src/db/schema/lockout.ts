/**
 * What guessing at an account has cost the addresses guessing.
 *
 * Not Better Auth's, and under no row-level security.
 */
import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

import { user } from './auth.js'

/** An address the account's right password has been given from. */
export const familiarAddress = pgTable(
  'familiar_address',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    address: text('address').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.address] })],
)

/**
 * One of an account's two runs of failures: from its familiar addresses, or
 * from every other. No row is a run with nothing counted.
 */
export const signInLockout = pgTable(
  'sign_in_lockout',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    familiar: boolean('familiar').notNull(),
    /** Failures since the run last locked or last saw the right password. */
    failures: integer('failures').notNull().default(0),
    /** Locks since the run last saw the right password. */
    locks: integer('locks').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** The run reached the threshold and its lock waits on its audit line; the run is shut meanwhile. */
    lockPending: boolean('lock_pending').notNull().default(false),
    /** Keyed hashes of the latest wrong passwords, oldest first. Never a password. */
    misses: text('misses').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.familiar] })],
)
