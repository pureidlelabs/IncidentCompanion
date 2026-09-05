/**
 * The Better Auth instance and the options it is built from.
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { eq, sql } from 'drizzle-orm'

import { recordInstallActivity } from '../install-activity/record.js'
import { admin } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/admin/access'
import type { SecondaryStorage } from 'better-auth'
import { trustedOrigins } from './trusted-origins.js'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import type { Database } from '../db/client.js'
import * as schema from '../db/schema/index.js'
import { MINIMUM_PASSWORD_LENGTH } from './password-policy.js'
import { CLEARED, afterFailure, isLocked, policyFrom } from './lockout.js'
import { sameAddress } from './same-address.js'
import { readPolicy } from '../policy/read.js'
import { SESSION_LIFETIME_CEILING_MINUTES } from '../policy/keys.js'
import { sessionEnded } from './session-ended.js'

const ARGON2ID = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * How long the session cookie is issued for, which is not the window.
 */
const COOKIE_CEILING_SECONDS = SESSION_LIFETIME_CEILING_MINUTES * 60

/**
 * The whole role vocabulary, and it is two words.
 */
export const ROLES = ['analyst', 'admin'] as const
export const DEFAULT_ROLE: (typeof ROLES)[number] = 'analyst'
export const ADMIN_ROLE: (typeof ROLES)[number] = 'admin'

/**
 * The role a brand-new account gets: administrator when the install has none,
 * otherwise whatever the caller asked for, falling back to `DEFAULT_ROLE` for
 * anything outside `ROLES`. Asserted in `new-user-role.test.ts`.
 */
export function roleForNewUser(asked: unknown, installHasAccounts: boolean): string {
  if (!installHasAccounts) return ADMIN_ROLE
  return ROLES.includes(asked as (typeof ROLES)[number]) ? (asked as string) : DEFAULT_ROLE
}

/**
 * The two roles as access-control roles rather than bare strings, so that
 * `role` is typed to this app's `analyst`/`admin` and not the plugin's
 * `user`/`admin`.
 */
const ac = createAccessControl(defaultStatements)

const analystRole = ac.newRole({ user: [], session: [] })

const adminRole = ac.newRole({
  user: ['create', 'list', 'set-role', 'ban', 'set-password', 'get', 'update'],
  session: ['list', 'revoke'],
})

/**
 * One failed sign-in against a named address: count it, and shut the account
 * if that was the last one it had.
 */
async function countTheFailure(
  db: Database,
  attempted: string,
  headers: Record<string, string>,
): Promise<void> {
  /**
   * **Read now, not at boot.**
   */
  const stored = await readPolicy(db)
  const policy = policyFrom({
    afterFailures: stored['auth.lockoutAfterFailures'],
    minutes: stored['auth.lockoutMinutes'],
  })
  const before = new Date()

  const [row] = await db
    .update(schema.user)
    .set({ failedSignIns: sql`${schema.user.failedSignIns} + 1` })
    .where(sameAddress(attempted))
    .returning({
      id: schema.user.id,
      name: schema.user.name,
      failedSignIns: schema.user.failedSignIns,
      lockedUntil: schema.user.lockedUntil,
    })
  // No account by that address. Nothing to count, and deliberately no row.
  if (!row) return

  // `afterFailure` is handed the count *before* this failure, because the
  // statement above already applied it.
  const next = afterFailure(
    { failedSignIns: row.failedSignIns - 1, lockedUntil: row.lockedUntil },
    policy,
    before,
  )
  if (next.lockedUntil === null || !next.justLocked) return

  await db
    .update(schema.user)
    .set({ lockedUntil: next.lockedUntil })
    .where(eq(schema.user.id, row.id))

  await recordInstallActivity(db, {
    event: 'account_locked',
    target: attempted,
    detail: {
      failures: String(next.failedSignIns),
      minutes: String(policy.minutes),
    },
    headers,
  })
}

/** A date the adapter may hand over as a `Date` or as the string it stored. */
function asDate(given: unknown): Date | undefined {
  if (given instanceof Date) return given
  if (typeof given !== 'string') return undefined
  const parsed = new Date(given)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/**
 * When the session being refreshed began.
 */
function sessionBegan(context: unknown): Date | undefined {
  const holder = context as { context?: { session?: { session?: { createdAt?: unknown } } } }
  return asDate(holder?.context?.session?.session?.createdAt)
}

/**
 * The expiry a session may hold: the idle window from now, and never past the
 * lifetime from when it began. Whichever falls first is the one written.
 */
async function windowFor(db: Database, began: Date | undefined, now = new Date()): Promise<Date> {
  const policy = await readPolicy(db)
  const idle = now.getTime() + policy['auth.sessionIdleMinutes'] * 60_000
  const ends = (began ?? now).getTime() + policy['auth.sessionLifetimeMinutes'] * 60_000
  return new Date(Math.min(idle, ends))
}

/**
 * What a guess costs on the routes where a wrong answer is a guess.
 */
const CREDENTIAL_WINDOW_SECONDS = 15 * 60
const CREDENTIAL_ATTEMPTS = 5

export const CREDENTIAL_RULES = {
  '/sign-in/email': { window: CREDENTIAL_WINDOW_SECONDS, max: CREDENTIAL_ATTEMPTS },
  '/sign-up/email': { window: CREDENTIAL_WINDOW_SECONDS, max: CREDENTIAL_ATTEMPTS },
  '/forget-password': { window: CREDENTIAL_WINDOW_SECONDS, max: CREDENTIAL_ATTEMPTS },
  '/reset-password': { window: CREDENTIAL_WINDOW_SECONDS, max: CREDENTIAL_ATTEMPTS },
  '/change-password': { window: CREDENTIAL_WINDOW_SECONDS, max: CREDENTIAL_ATTEMPTS },
}

/**
 * The options `betterAuth` is built from.
 */
export function authOptions(
  db: Database,
  secret: string,
  baseURL: string,
  mode = 'production',
  sessions?: SecondaryStorage,
) {
  return {
    baseURL,
    secret,
    /**
     * Without this, only `AUTH_BASE_URL`'s exact spelling is accepted and an
     * analyst who typed `localhost` is refused with `INVALID_ORIGIN`.
     * -> `trusted-origins.ts`
     */
    trustedOrigins: trustedOrigins(baseURL, mode),
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    /**
     * Redis answers session lookups; Postgres still holds them, and
     * `storeSessionInDatabase` below is what lets a miss fall through instead
     * of reading as a signed-out user. -> `session-store.ts`
     */
    ...(sessions
      ? {
          secondaryStorage: sessions,
          /**
           * Stated rather than inferred: supplying a secondary store moves the
           * rate limiter to it by default, so leaving this out would relocate
           * a security control as a side effect. -> `rate-limit.ts`
           */
          rateLimit: {
            storage: 'secondary-storage' as const,
            customRules: CREDENTIAL_RULES,
          },
        }
      : {}),
    session: {
      expiresIn: COOKIE_CEILING_SECONDS,
      /**
       * **Zero, because the throttle belongs where the reports are made.**
       */
      updateAge: 0,
      /**
       * Unconditional, and what keeps Postgres the record: with a secondary store
       * and without this, sessions are written only to Redis, which has no volume
       * here.
       */
      storeSessionInDatabase: true,
    },
    /**
     * Account management - list, create, set-role, set-password, ban - comes
     * from the library rather than being written here; banning through it also
     * revokes the account's live sessions.
     */
    plugins: [
      admin({
        ac,
        roles: { analyst: analystRole, admin: adminRole },
        defaultRole: DEFAULT_ROLE,
        adminRoles: [ADMIN_ROLE],
      }),
    ],
    /**
     * **Routes the browser is served and nothing calls.**
     */
    disabledPaths: [
      // Nothing signs itself up: the setup token claims the install and an
      // administrator provisions every account after it. Leaving this open
      // while unclaimed made it a second, tokenless door to the *first*
      // administrator -- which is what the token exists to prevent.
      // `setup.controller.ts` calls `signUpEmail` in process, which
      // `disabledPaths` does not intercept.
      '/sign-up/email',
      '/admin/set-role',
      '/admin/update-user',
      '/admin/create-user',
      '/admin/remove-user',
      '/admin/list-users',
      '/admin/set-user-password',
      '/admin/ban-user',
      '/admin/unban-user',
      '/admin/list-user-sessions',
      '/admin/revoke-user-session',
      '/admin/revoke-user-sessions',
      '/admin/impersonate-user',
      '/admin/stop-impersonating',
      '/admin/has-permission',
    ],
    /**
     * **Declared here or the column is invisible to Better Auth.**
     */
    user: {
      additionalFields: {
        mustChangePassword: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
        /**
         * **The lockout's two, declared here rather than only in Drizzle.**
         */
        failedSignIns: {
          type: 'number',
          required: false,
          defaultValue: 0,
          input: false,
        },
        lockedUntil: {
          type: 'date',
          required: false,
          input: false,
        },
      },
    },
    /**
     * **Sign-up is open exactly while the install has no accounts**, counted
     * against the table rather than recorded as a flag.
     */
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        /**
         * **A shut account is refused before the password is checked**, so a
         * lockout costs an attacker the guess rather than merely the answer -
         * and so a correct password found during the window still does not
         * open it.
         */
        if (ctx.path.startsWith('/sign-in')) {
          const attempted = (ctx.body as { email?: unknown } | undefined)?.email
          if (typeof attempted === 'string' && attempted !== '') {
            const [account] = await db
              .select({
                failedSignIns: schema.user.failedSignIns,
                lockedUntil: schema.user.lockedUntil,
              })
              .from(schema.user)
              // **Folded, not compared.** -> `countTheFailure`
              .where(sameAddress(attempted))
              .limit(1)
            if (account && isLocked(account, new Date())) {
              throw new APIError('TOO_MANY_REQUESTS', {
                code: 'ACCOUNT_TEMPORARILY_LOCKED',
                message:
                  'This account is locked after repeated failed sign-ins. Try again later, or ask an administrator.',
              })
            }
          }
        }
        if (ctx.path !== '/sign-up/email') return
        const [already] = await db.select({ id: schema.user.id }).from(schema.user).limit(1)
        if (already) {
          throw new APIError('FORBIDDEN', {
            message: 'This install is not open for sign-up. Ask an administrator for an account.',
          })
        }

      }),
      /**
       * The two audit events the session table cannot see.
       */
      after: createAuthMiddleware(async (ctx) => {
        const headers = Object.fromEntries(ctx.headers?.entries() ?? [])
        if (ctx.path === '/sign-out') {
          const who = ctx.context.session?.user
          await recordInstallActivity(db, {
            event: 'signed_out',
            actor: { id: who?.id ?? null, label: who?.name ?? who?.email ?? null },
            headers,
          })
          return
        }
        if (!ctx.path.startsWith('/sign-in')) return
        /**
         * **A success clears the count, not only the lock.**
         */
        if (!(ctx.context.returned instanceof APIError)) {
          const who = ctx.context.newSession?.user ?? ctx.context.session?.user
          if (who?.id) {
            await db.update(schema.user).set(CLEARED).where(eq(schema.user.id, who.id))
          }
          return
        }
        // **`returned` is the response *or* an `APIError`**, and it is the only
        // place a sign-in's outcome is visible: a refusal writes no row, so
        // there is nothing else to read afterwards.
        const attempted = (ctx.body as { email?: unknown } | undefined)?.email
        await recordInstallActivity(db, {
          event: 'sign_in_failed',
          target: typeof attempted === 'string' ? attempted : null,
          detail: { path: ctx.path },
          headers,
        })
        if (typeof attempted === 'string' && attempted !== '') {
          await countTheFailure(db, attempted, headers)
        }
      }),
    },
    /**
     * **Where the first account becomes the administrator**, on the write itself
     * rather than in one route - so it holds for sign-up, for a seeded account and
     * for anything added later.
     */
    databaseHooks: {
      user: {
        create: {
          before: async (fresh: Record<string, unknown>) => {
            const [already] = await db.select({ id: schema.user.id }).from(schema.user).limit(1)
            return { data: { ...fresh, role: roleForNewUser(fresh['role'], Boolean(already)) } }
          },
        },
      },
      session: {
        create: {
          /**
           * **The expiry the install asked for, written where the session is made.**
           */
          before: async (fresh: Record<string, unknown>) => {
            fresh['expiresAt'] = await windowFor(db, asDate(fresh['createdAt']))
            return { data: fresh }
          },
          /**
           * A session row appearing **is** a successful sign-in.
           */
          after: async (session: Record<string, unknown>) => {
            const id = typeof session['userId'] === 'string' ? session['userId'] : null
            const [who] = id
              ? await db
                  .select({ name: schema.user.name, email: schema.user.email })
                  .from(schema.user)
                  .where(eq(schema.user.id, id))
                  .limit(1)
              : []
            /**
             * **Every session, and the reader collapses the repeats.**
             */
            await recordInstallActivity(db, {
              event: 'signed_in',
              actor: { id, label: who?.name || who?.email || null },
              headers: {
                'x-real-ip': typeof session['ipAddress'] === 'string' ? session['ipAddress'] : '',
                'user-agent':
                  typeof session['userAgent'] === 'string' ? session['userAgent'] : '',
              },
            })
          },
        },
        /**
         * The refresh, which is where the lifetime is enforced.
         *
         * **The row carries when it began and this is the only thing that
         * reads it.** A session that is refreshed every minute would otherwise
         * be refreshed for ever: the idle window says nothing about how long
         * the session has been open, and the lifetime says nothing about
         * whether anybody is there.
         */
        update: {
          before: async (data: Record<string, unknown>, context?: unknown) => ({
            data: { ...data, expiresAt: await windowFor(db, sessionBegan(context)) },
          }),
        },
        /** The one point a sign-out, a revoke and an admin's ban all pass through. */
        delete: {
          after: (deleted: Record<string, unknown>) => {
            const userId = typeof deleted['userId'] === 'string' ? deleted['userId'] : null
            if (userId) sessionEnded(userId)
            return Promise.resolve()
          },
        },
      },
    },
    /**
     * Which headers may name the caller the rate limiter counts against.
     */
    advanced: {
      ipAddress: { ipAddressHeaders: mode === 'production' ? ['x-real-ip'] : [] },
    },
    /**
     * Half of *core makes no outbound request*, and the half a config can hold.
     */
    telemetry: { enabled: false },
    /**
     * Keeps verification values in Postgres.
     */
    verification: { storeInDatabase: true },
    emailAndPassword: {
      enabled: true,
      /**
       * **Unset means 8, and the library serves its own change-password and sign-up
       * routes.**
       */
      minPasswordLength: MINIMUM_PASSWORD_LENGTH,
      password: {
        hash: (password) => argonHash(password, ARGON2ID),
        verify: ({ hash, password }) => argonVerify(hash, password, ARGON2ID),
      },
    },
  } satisfies BetterAuthOptions
}

export function createAuth(
  db: Database,
  secret: string,
  baseURL: string,
  mode = 'production',
  sessions?: SecondaryStorage,
) {
  return betterAuth(authOptions(db, secret, baseURL, mode, sessions))
}

export type Auth = ReturnType<typeof createAuth>

/**
 * The same instance, with its in-process session reads made read-only.
 */
export function observesTheWindow(auth: Auth): Auth {
  type Read = Auth['api']['getSession']
  /**
   * Spelled out rather than taken from `Parameters<Read>`: the endpoint is
   * overloaded, and the one TypeScript resolves to makes `headers` optional
   * where the call needs it required.
   */
  type Asked = { headers: HeadersInit; query?: { disableCookieCache?: boolean } }
  const read = ((options: Asked) =>
    auth.api.getSession({
      ...options,
      query: { ...options.query, disableRefresh: true },
    })) as Read
  return { ...auth, api: { ...auth.api, getSession: read } }
}
