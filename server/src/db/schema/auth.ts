/**
 * Better Auth's own four tables, declared in Drizzle so there is one schema.
 *
 * **Re-derive from `getAuthTables()` in `better-auth/db` after any version
 * bump or plugin addition** - it is the authority on what columns a given
 * config has, and a hand-copied schema omits a new one silently until a
 * sign-in fails at runtime.
 *
 * The property names are the contract and the column names are not: the
 * adapter looks up `user.emailVerified` as a key on this object.
 */
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),

  /**
   * The admin plugin's four. **Nullable, because the plugin treats absent as
   * "not set"** and writes them only when something says so - a `NOT NULL`
   * here refuses the insert Better Auth makes for the very first analyst.
   *
   * `role` is `analyst` or `admin`; the default is applied by the plugin at
   * create time rather than by the column, so a row written any other way is
   * visibly roleless instead of silently privileged.
   */
  role: text('role'),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),

  /**
   * The account was given its password by somebody else and owes its own. Set
   * by the two admin paths only - creating an account and resetting one -
   * never by sign-up.
   *
   * Not null, defaulting false, so the rows Better Auth writes for itself are
   * correct and the guard never has to read "never asked" as a third state.
   */
  mustChangePassword: boolean('must_change_password').notNull().default(false),

  /**
   * Consecutive failed sign-ins, and how long the account is shut for.
   *
   * **Columns rather than Redis, and that is the security decision here.** A
   * counter in a cache is cleared by a restart, so an attacker who can make
   * the process restart - or who simply waits for a deploy - gets a fresh
   * allowance. The control has to outlive the process it protects.
   *
   * **Per account, which is the half a rate limit cannot do.** A per-address
   * limit slows one attacker; it does nothing about the same password tried
   * against one analyst from a thousand addresses, and that is the shape a
   * credential-stuffing run actually has.
   *
   * Reset by a successful sign-in, never by time alone: the count is
   * *consecutive*, so a lockout that expired without a success still leaves
   * the account one failure from shutting again.
   */
  failedSignIns: integer('failed_sign_ins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // Cascade, because a deleted analyst must not leave a usable session behind.
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  /**
   * Who is impersonating this analyst, if anyone. The admin plugin's, and
   * declared because the adapter selects it - **not because impersonation is
   * offered**: no route here starts one, and a session carrying this is one
   * nothing in this app can have created.
   */
  impersonatedBy: text('impersonated_by'),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  // The password hash for credential accounts. Argon2id here, not Better
  // Auth's scrypt default - see `auth.config.ts`.
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})
