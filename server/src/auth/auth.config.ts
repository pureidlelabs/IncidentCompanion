/**
 * The Better Auth instance and the options it is built from.
 *
 * Passwords are hashed with Argon2id at the ASVS minimums in `ARGON2ID`;
 * lowering any of the three is a security decision, not a performance tune.
 * The auth tables come from the Drizzle schema in `db/schema/`.
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

const ARGON2ID = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * The rolling idle window: a session expires this long after it was last used.
 *
 * `UPDATE_EVERY_SECONDS` bounds how often that expiry is rewritten, so a busy
 * session costs one UPDATE a minute rather than one a request - and the real
 * window is 30 to 31 minutes rather than exactly 30.
 */
const IDLE_WINDOW_SECONDS = 30 * 60
const UPDATE_EVERY_SECONDS = 60

/**
 * The whole role vocabulary, and it is two words.
 *
 * Declared here because `defaultRole` below and the list the Accounts pane
 * offers are the same fact. `admin` gates managing accounts, the idle timeout
 * and the API access level; everything else a signed-in analyst does, case
 * data included, is ungated by role.
 */
export const ROLES = ['analyst', 'admin'] as const
export const DEFAULT_ROLE: (typeof ROLES)[number] = 'analyst'
export const ADMIN_ROLE: (typeof ROLES)[number] = 'admin'

/**
 * The role a brand-new account gets: administrator when the install has none,
 * otherwise whatever the caller asked for, falling back to `DEFAULT_ROLE` for
 * anything outside `ROLES`. Asserted in `new-user-role.test.ts`.
 *
 * **Honouring the caller is safe only because of what can reach here**: `POST
 * /api/accounts` is `@Roles([ADMIN_ROLE])`, and `/sign-up/email` is refused
 * outright once any account exists. Widen either and this stops being a
 * decision an administrator made.
 */
export function roleForNewUser(asked: unknown, installHasAccounts: boolean): string {
  if (!installHasAccounts) return ADMIN_ROLE
  return ROLES.includes(asked as (typeof ROLES)[number]) ? (asked as string) : DEFAULT_ROLE
}

/**
 * The two roles as access-control roles rather than bare strings, so that
 * `role` is typed to this app's `analyst`/`admin` and not the plugin's
 * `user`/`admin`.
 *
 * The statements are the admin plugin's own - managing users and sessions - so
 * an analyst is granted nothing. **`impersonate` and `delete` are withheld on
 * purpose**: no route offers either, and a permission held with nothing to
 * spend it on is one a later route inherits silently.
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
 *
 * **A missing address is not an error and writes nothing.** Guessing at
 * addresses that have no account must leave no row to find, or the table
 * becomes a list of every address an attacker tried - which is a write path
 * anyone unauthenticated can drive.
 *
 * **Read-modify-write under a single statement's `where`.** Two failures
 * arriving together would otherwise both read the same count and both write
 * `n + 1`, so the tenth failure could be recorded as the ninth twice; the
 * increment happens in SQL and the threshold is compared against what the
 * statement returns.
 */
async function countTheFailure(
  db: Database,
  attempted: string,
  headers: Record<string, string>,
): Promise<void> {
  /**
   * **Read now, not at boot.** A threshold cached when the process started is
   * one that ignores the change an administrator just made - the screen says
   * five and the control still allows ten until something restarts.
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

/**
 * What a guess costs on the routes where a wrong answer is a guess.
 *
 * **Tighter than nginx's, because these know more.** nginx allows 10 attempts
 * a minute per address on a path; inside the app the request is known to *be*
 * a sign-in, so five in fifteen minutes is the honest ceiling for a human who
 * has forgotten their password.
 *
 * **Paths are relative to the auth mount point**, which is how Better Auth
 * matches them - `/sign-in/email`, not `/api/auth/sign-in/email`.
 *
 * **The session read is deliberately absent.** It fires on every page load, so
 * a credential-shaped limit on it would sign an analyst out mid-case and call
 * it a rate limit.
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
 *
 * **Separate from `createAuth` so a test can hold the same object.** What
 * columns the database needs is a function of these options - plugins add
 * models and fields - and `auth.schema.test.ts` derives the answer from them
 * with `getAuthTables()`. Reconstructing an equivalent object there is how the
 * two quietly stop describing the same server.
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
     *
     * **Optional, and `rateLimit` travels with it**: `auth.schema.test.ts`
     * builds these options with no infrastructure at all, and naming
     * `secondary-storage` without a store throws out of `auth.handler` on the
     * first authenticated request. Declare the pair or neither.
     */
    ...(sessions
      ? {
          secondaryStorage: sessions,
          /**
           * Stated rather than inferred: supplying a secondary store moves the
           * rate limiter to it by default, so leaving this out would relocate
           * a security control as a side effect. -> `rate-limit.ts`
           *
           * **This is the auth half of a two-layer limit, and the Nest
           * throttler cannot reach it.** `@thallesp/nestjs-better-auth` mounts
           * Better Auth with `consumer.apply(...).forRoutes('*path')`, and
           * middleware runs before guards - so `APP_GUARD` never sees
           * `/api/auth/*` at all. The throttler covers this app's controllers;
           * these rules cover the credential routes.
           * -> `src/throttle/`
           *
           * **Left production-gated, which is Better Auth's own default.** A
           * five-per-fifteen-minutes sign-in rule keys on the address, and the
           * whole test suite is one address - enabling it everywhere would
           * refuse the harness's own sign-ins and fail files that have nothing
           * to do with rate limiting.
           */
          rateLimit: {
            storage: 'secondary-storage' as const,
            customRules: CREDENTIAL_RULES,
          },
        }
      : {}),
    session: {
      expiresIn: IDLE_WINDOW_SECONDS,
      updateAge: UPDATE_EVERY_SECONDS,
      /**
       * Unconditional, and what keeps Postgres the record: with a secondary
       * store and without this, sessions are written only to Redis, which has
       * no volume here. **Not `preserveSessionInDatabase`** - same condition in
       * the library, and it switches the read fallback back off.
       */
      storeSessionInDatabase: true,
    },
    /**
     * Account management - list, create, set-role, set-password, ban - comes
     * from the library rather than being written here; banning through it also
     * revokes the account's live sessions.
     *
     * **Adding or removing a plugin changes the schema.** This one puts `role`,
     * `banned`, `banReason` and `banExpires` on `user` and `impersonatedBy` on
     * `session`. Re-derive `db/schema/auth.ts` from `getAuthTables()` and apply
     * it with `npm run db:push`; `auth.schema.test.ts` fails on a mismatch.
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
     * **Routes the browser is served and nothing calls.** The admin plugin
     * mounts fifteen; `grep -rn "auth/admin" ui/src` finds none, because every
     * account operation goes through `/api/accounts/*`, which calls the same
     * endpoints in process. `disabledPaths` is enforced in `onRequest`, and
     * `auth.api.X()` invokes the endpoint directly, so closing a path leaves
     * the app's own calls working.
     *
     * **A rule cannot be enforced from outside the endpoint that acts.** The
     * last-administrator check was a `before` hook reading `userId` off the raw
     * body: `z.coerce.string()` turns `["<id>"]` into an id *after* the hook
     * has decided the body names nobody, and `/admin/update-user` changes a
     * role through `data.role`, which the hook did not match. Both demoted the
     * only administrator and answered 200.
     * -> `accounts.controller.ts`, `POST /api/accounts/:username/role`
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
     * **Declared here or the column is invisible to Better Auth.** The adapter
     * selects only the fields it knows about, so a column added to the Drizzle
     * schema alone never reaches `session.user`.
     *
     * `input: false` because no client may set it: a sign-up body carrying
     * `mustChangePassword: false` would otherwise opt itself out.
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
         * `auth.schema.test.ts` holds the two schemas level and fails on a
         * column nothing asks for - which is the check that catches a column
         * left behind by a removed plugin, and it cannot tell that from a
         * column this app added on purpose. Declaring them is how the app says
         * which one this is.
         *
         * **`input: false` on both, and that is the security half.** Without
         * it Better Auth accepts them in a sign-up or update body, so an
         * account could hand itself `failedSignIns: 0` on the way past the
         * control that counts them.
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
     *
     * **A `before` hook, so nothing is written when it refuses.** The database
     * hook below cannot serve here: it fires for an administrator creating
     * somebody too, and it fires once the row is already being written, which
     * would answer an error and leave the account behind.
     *
     * **The one refusal on the in-process path.** `disabledPaths` refuses
     * `/sign-up/email` over HTTP before any hook runs, so this fires only for
     * `setup.controller.ts`'s in-process `signUpEmail`, which that list cannot
     * intercept. Held by *refuses an in-process sign-up once the install has an
     * account* in `test/closed-sign-up.test.ts`, which goes red when this
     * refusal is removed -- the file's other cases are held by the path list
     * and stayed green through exactly that deletion, which is why an earlier
     * version of this docstring naming the file was not enough.
     */
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        /**
         * **A shut account is refused before the password is checked**, so a
         * lockout costs an attacker the guess rather than merely the answer -
         * and so a correct password found during the window still does not
         * open it.
         *
         * The refusal names the lock. That does tell an unauthenticated
         * caller the address belongs to an account, which is user
         * enumeration - and it is the deliberate trade here: this install has
         * no public sign-up, so the set of addresses is already the customer's
         * own staff, while an analyst locked out mid-incident with a generic
         * "wrong password" will keep guessing and keep the lock alive.
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
       *
       * **A failed sign-in writes no row anywhere**, so without this an
       * attempt run against every account leaves the install with nothing to
       * show for it - which is the first thing both NIST SP 800-92 and
       * ISO 27002 8.15 ask an application log for.
       *
       * **A sign-out deletes the session**, so the end of an access period is
       * recoverable only from here. ISO names log-on *and* log-off.
       *
       * The attempted address is recorded and the password never is: the
       * address is what makes a run of failures legible as one attack rather
       * than as five unrelated typos, and this column is read by every admin.
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
         * **A success clears the count, not only the lock.** Leaving the
         * counter where it stood would shut the account again on the analyst's
         * very next typo, which reads as the lockout being broken.
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
     * **Where the first account becomes the administrator**, on the write
     * itself rather than in one route - so it holds for sign-up, for a seeded
     * account and for anything added later. The plugin would otherwise give
     * every account `defaultRole`, and the only route that can promote somebody
     * is itself admin-only.
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
           * A session row appearing **is** a successful sign-in.
           *
           * **Here rather than on `/sign-in/email`**, because it is the one
           * place every way in passes through: the password route today, and
           * Entra without a second call site the day SSO lands. A path list
           * is the thing that silently stops covering the newest door.
           *
           * The row carries the origin the library resolved, so this does not
           * re-read the headers - and `advanced.ipAddress` already restricts
           * that to `x-real-ip` in production, which is the same rule
           * `record.ts` applies.
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
             * **Every session, and the reader collapses the repeats.** A
             * write-side dedupe stood here for one commit and was deleted: it
             * skipped a line when an identical one was minutes old, which
             * discards evidence to fix a display problem the reader already
             * fixes. Nothing in this table is derivable after the fact, so
             * dropping is the one trade that is never worth making.
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
      },
    },
    /**
     * Which headers may name the caller the rate limiter counts against.
     *
     * **Exactly one in production, and none anywhere else.** `x-real-ip` is
     * overwritten by nginx on every request and the app publishes no port, so
     * it is the one spelling a caller cannot choose; `dev-node.sh` has no proxy
     * in front of it, where the same setting would be a bypass. `[]` is not the
     * same as unset - the library reads `ipAddressHeaders || DEFAULT_IP_HEADERS`
     * and an empty array is truthy, so omitting the key restores
     * `x-forwarded-for`. Asserted in `auth.config.test.ts`.
     *
     * Never set `disableIpTracking`: the limiter returns early on it and
     * applies no rule at all. -> `_evidence/better-auth-options-audit.md`
     */
    advanced: {
      ipAddress: { ipAddressHeaders: mode === 'production' ? ['x-real-ip'] : [] },
    },
    /**
     * Half of *core makes no outbound request*, and the half a config can hold.
     * `BETTER_AUTH_TELEMETRY=1` in the environment beats this setting, so the
     * other half is the stack not passing that variable -
     * `tests/docker/test_container_config.py`. Already the default; set anyway,
     * because a prerelease can revise a default and this project pins an `rc`.
     */
    telemetry: { enabled: false },
    /**
     * Keeps verification values in Postgres. With a secondary store and without
     * this they are written only to Redis, which has no volume here. Nothing
     * mints one today; this stops the first reset-password flow somebody adds
     * inheriting a token store that forgets.
     */
    verification: { storeInDatabase: true },
    emailAndPassword: {
      enabled: true,
      /**
       * **Unset means 8, and the library serves its own change-password
       * and sign-up routes.** So the effective minimum on the install was
       * the library's default while every controller and screen said 12.
       * -> `auth/password-policy.ts`
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
