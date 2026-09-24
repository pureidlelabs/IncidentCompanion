/**
 * The Better Auth instance and the options it is built from.
 *
 * Passwords are hashed with Argon2id at the ASVS minimums in `ARGON2ID`;
 * lowering any of the three is a security decision, not a performance tune.
 * The auth tables come from the Drizzle schema in `db/schema/`.
 */
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { ADMIN_ROLE, DEFAULT_ROLE, ROLES } from '../domain/analyst-account.js'
import { recordInstallActivity } from '../install-activity/record.js'
import { ADDRESS_RULE } from '../wire/caller-address.js'
import { admin, openAPI } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/admin/access'
import type { SecondaryStorage } from 'better-auth'
import { trustedOrigins } from './trusted-origins.js'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tryGetCurrentAuthEndpointContext } from '@better-auth/core/context'

import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import type { Database } from '../db/client.js'
import * as schema from '../db/schema/index.js'
import { MINIMUM_PASSWORD_LENGTH, PASSWORD_REFUSED, refusePassword } from './password-policy.js'
import { CLEARED, afterFailure, isLocked, policyFrom } from './lockout.js'
import { readPolicy } from '../policy/read.js'
import { SESSION_LIFETIME_CEILING_MINUTES } from '../policy/keys.js'
import { sessionEnded } from './session-ended.js'
import { HELD } from './must-change-password.interceptor.js'
import { sameAddress } from './same-address.js'

/**
 * What a failed sign-in is recorded against.
 *
 * A constant, so every failure from one caller falls in one run however many
 * identifiers they tried. The identifier itself is in `detail`.
 */
export const SIGN_IN = 'sign-in'

/**
 * The endpoints that write a password, and the body field each carries it in.
 *
 * None is served over HTTP; each is reached in process, by
 * `setup.controller.ts`, `change-password.controller.ts` and
 * `accounts.controller.ts`, where `minPasswordLength` is the boot-time number.
 * -> #374
 *
 * **A path is what this can match, so a server-only endpoint is not here.**
 * `setPassword` is `createAuthEndpoint.serverOnly` and has no URL at all, so
 * `'/set-password'` matched nothing and read as coverage. Nothing calls it;
 * anything that did would take the boot-time minimum, and would need guarding
 * where it is called rather than here.
 */
const PASSWORD_WRITES: Readonly<Record<string, string>> = {
  '/sign-up/email': 'password',
  '/admin/create-user': 'password',
  '/change-password': 'newPassword',
  '/admin/set-user-password': 'newPassword',
}

const ARGON2ID = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * How long the session cookie is issued for, which is not the window.
 *
 * **The windows are the install's and this is a ceiling over both of them.**
 * `expiresIn` is compiled into the instance where the idle window and the
 * lifetime are settings, so what the row carries is written by the hooks in
 * `windowFor`; this bounds the *cookie*, and it is the longest lifetime an
 * install may set so that the browser's copy never dies before the session it
 * names. A shorter one would put the analyst back at a sign-in screen while
 * the server still held them signed in.
 *
 * **Two clocks carry the window, and one of them is in the browser.**
 * `expiresAt` moves on a session read; the cookie's `Max-Age` moves only on a
 * response from Better Auth's own endpoints, and `observesTheWindow` below is
 * what keeps them together by leaving the refresh to the reported one.
 * -> `test/the-idle-window-reaches-the-browser.test.ts`
 */
const COOKIE_CEILING_SECONDS = SESSION_LIFETIME_CEILING_MINUTES * 60

/**
 * Asserted in `new-user-role.test.ts`.
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

/** Not an argon2 hash, so no credential row holds it. */
const NOBODY_HOLDS = '-'

/**
 * The check behind every door that verifies a password, and the lockout's
 * whole implementation.
 *
 * Runs the argon2 verify whatever the account's state, so a locked account
 * costs what a wrong password does. Answers `false` for a locked account's
 * right password and counts it, as it counts a wrong one; a right one on an
 * open account clears the count.
 */
async function checkPassword(db: Database, hash: string, password: string): Promise<boolean> {
  if (await argonVerify(hash, password, ARGON2ID)) {
    const [holder] = await db
      .select({
        id: schema.user.id,
        failedSignIns: schema.user.failedSignIns,
        lockedUntil: schema.user.lockedUntil,
      })
      .from(schema.account)
      .innerJoin(schema.user, eq(schema.user.id, schema.account.userId))
      .where(heldBy(hash))
      .limit(1)
    if (holder && !isLocked(holder, new Date())) {
      if (holder.failedSignIns !== 0 || holder.lockedUntil !== null) {
        await db.update(schema.user).set(CLEARED).where(eq(schema.user.id, holder.id))
      }
      return true
    }
  }
  await countAgainst(db, hash)
  return false
}

/** The credential row holding `hash`. */
const heldBy = (hash: string) =>
  and(eq(schema.account.providerId, 'credential'), eq(schema.account.password, hash))

/**
 * One more failure against the account holding `hash`, and the lock when it
 * is the last one the account had. Writes `account_locked` then, with the
 * address of the call being answered.
 *
 * **One statement increments and returns the count**, so two failures
 * arriving together cannot both read `n` and both write `n + 1`.
 *
 * A hash nobody holds writes nothing, at the cost of the same two statements.
 */
async function countAgainst(db: Database, hash: string): Promise<void> {
  const now = new Date()
  // Read now: a threshold cached at boot ignores the change an administrator
  // just made.
  const stored = await readPolicy(db)
  const policy = policyFrom({
    afterFailures: stored['auth.lockoutAfterFailures'],
    minutes: stored['auth.lockoutMinutes'],
  })
  const [row] = await db
    .update(schema.user)
    .set({ failedSignIns: sql`${schema.user.failedSignIns} + 1` })
    .where(
      inArray(
        schema.user.id,
        db.select({ id: schema.account.userId }).from(schema.account).where(heldBy(hash)),
      ),
    )
    .returning({
      id: schema.user.id,
      email: schema.user.email,
      failedSignIns: schema.user.failedSignIns,
      lockedUntil: schema.user.lockedUntil,
    })
  if (!row) return

  // `afterFailure` is handed the count *before* this failure, because the
  // statement above already applied it.
  const next = afterFailure(
    { failedSignIns: row.failedSignIns - 1, lockedUntil: row.lockedUntil },
    policy,
    now,
  )
  if (next.lockedUntil === null || !next.justLocked) return

  await db.update(schema.user).set({ lockedUntil: next.lockedUntil }).where(eq(schema.user.id, row.id))
  await recordInstallActivity(db, {
    event: 'account_locked',
    target: row.email,
    detail: { failures: String(next.failedSignIns), minutes: String(policy.minutes) },
    headers: Object.fromEntries(
      (tryGetCurrentAuthEndpointContext() as { headers?: Headers } | undefined)?.headers?.entries() ??
        [],
    ),
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
 *
 * **Read from the endpoint's own copy of the session**, which is the session as
 * it was before this refresh; the update carries the new expiry and the token
 * and nothing else. A refresh that arrives without one is treated as a session
 * beginning now, which bounds it at one lifetime rather than at none -
 * `the-install-sets-both-windows.test.ts` is what says the ordinary path still
 * finds it, and goes red rather than quiet if it stops.
 *
 * **The instant survives the round trip, which a raw driver read does not.**
 * `created_at` is a timestamp without a zone, so `pg` on its own hands one back
 * read as the process's local time - measured at two minutes old and returned
 * as two hours. The suites cover this path on a machine two hours off UTC.
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
}

/**
 * The library's operations the install offers over HTTP, as `METHOD /path`
 * below the mount. -> `offersOnly`
 */
export const OFFERED: ReadonlySet<string> = new Set([
  'POST /sign-in/email',
  'GET /get-session',
  'POST /sign-out',
  'GET /list-sessions',
  'POST /revoke-session',
  'POST /revoke-other-sessions',
])

/**
 * The operations a held session may still reach. `/change-password` is not
 * offered over HTTP; it is here for `change-password.controller.ts`, which
 * calls it in process with the held session.
 */
const HELD_MAY: ReadonlySet<string> = new Set([
  '/get-session',
  '/sign-in/email',
  '/sign-out',
  '/change-password',
])

/** The endings of a caller's own sessions, and the event each is recorded as. */
const OWN_ENDINGS: Readonly<Record<string, 'signed_out' | 'account_sessions_ended'>> = {
  '/sign-out': 'signed_out',
  '/revoke-session': 'account_sessions_ended',
  '/revoke-other-sessions': 'account_sessions_ended',
}

/**
 * The library's session endings only the accounts pane reaches, which records
 * each act itself. -> `accounts/accounts.controller.ts`
 */
const RECORDED_BY_THE_ACCOUNTS_PANE: ReadonlySet<string> = new Set(['/admin/revoke-user-sessions', '/admin/ban-user'])

/**
 * The offered operations that act on the caller's own sessions. Refused to a
 * caller with none before the body is read, so the answer is the missing
 * session rather than the body.
 */
const ACTS_ON_ITS_SESSIONS: ReadonlySet<string> = new Set([
  '/list-sessions',
  '/revoke-session',
  '/revoke-other-sessions',
])

/**
 * What the install serves of the library, and to whom.
 *
 * `onRequest` answers every HTTP request outside `OFFERED` exactly as the
 * router answers a path that was never defined. It runs for HTTP only, so the
 * app's own `auth.api.X()` calls are unaffected. The `before` hook refuses a
 * held session everything outside `HELD_MAY`, in process included, with the
 * body `MustChangePasswordInterceptor` answers the app's own routes with.
 * `onResponse`, HTTP only like `onRequest`, answers a body read and refused
 * with 422, as every route of the app does, where the library answers 400.
 */
const offersOnly = {
  id: 'offers-only',
  onRequest: (request: Request, context: { baseURL: string }) => {
    const mount = new URL(context.baseURL).pathname
    const { pathname } = new URL(request.url)
    const offered =
      pathname.startsWith(`${mount}/`) &&
      OFFERED.has(`${request.method} ${pathname.slice(mount.length)}`)
    return Promise.resolve(
      offered ? undefined : { response: new Response(null, { status: 404, statusText: 'Not Found' }) },
    )
  },
  hooks: {
    before: [
      {
        matcher: (context: { path?: string }) => !HELD_MAY.has(context.path ?? ''),
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx)
          if (!session && ACTS_ON_ITS_SESSIONS.has(ctx.path)) {
            throw new APIError('UNAUTHORIZED', { message: 'Unauthorized', code: 'UNAUTHORIZED' })
          }
          if ((session?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword) {
            throw new APIError('FORBIDDEN', { ...HELD })
          }
        }),
      },
    ],
  },
  onResponse: async (response: Response) => {
    if (response.status !== 400) return
    const said = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: unknown } | null
    if (said?.code !== 'VALIDATION_ERROR') return
    return { response: new Response(response.body, { status: 422, headers: response.headers }) }
  },
} satisfies BetterAuthPlugin

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
      expiresIn: COOKIE_CEILING_SECONDS,
      /**
       * **Zero, because the throttle belongs where the reports are made.** The
       * only read that reaches here is the browser's activity report, already
       * at one a minute; a second throttle here can only make a report land on
       * nothing to do, which is a report that renews no cookie.
       * -> `observesTheWindow`, `ui/src/api/useActivityReporter.ts`
       */
      updateAge: 0,
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
      offersOnly,
      admin({
        ac,
        roles: { analyst: analystRole, admin: adminRole },
        defaultRole: DEFAULT_ROLE,
        adminRoles: [ADMIN_ROLE],
      }),
      // The library's description of its own operations, read in process by
      // `openapi.ts`; its routes are not offered over HTTP.
      openAPI({ disableDefaultReference: true }),
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
     * **The one refusal on the in-process path.** `/sign-up/email` is not
     * offered over HTTP, so this fires only for `setup.controller.ts`'s
     * in-process `signUpEmail`. Held by *refuses an in-process sign-up once
     * the install has an account* in `test/closed-sign-up.test.ts`, which goes
     * red when this refusal is removed. The file's other cases are held by
     * `offersOnly` and survive that deletion, so naming the file alone says
     * too little.
     */
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        /**
         * **Every door that writes a password, in one place.** The install's
         * minimum is a stored number and `minPasswordLength` is fixed when
         * these options are built, so an endpoint reached in process would go
         * on taking whatever was set at boot.
         *
         * **Read now, like every other bound here.** A minimum cached at boot
         * is one an administrator cannot raise without a restart, which for a
         * security control is the same as not settable.
         *
         * **Sign-in is not on this list and must never be.** The bound governs
         * what may be *written*; applying it to what is *offered* would lock
         * every account holding a password shorter than a raised minimum out
         * of the install, which is the opposite of the control.
         */
        const writes = PASSWORD_WRITES[ctx.path]
        if (writes) {
          const supplied = (ctx.body as Record<string, unknown> | undefined)?.[writes]
          if (typeof supplied === 'string') {
            const stored = await readPolicy(db)
            /**
             * **The refusal says no and not how short.** This runs ahead of
             * the endpoint's own session checks, so it does not know whom it
             * answers, and the minimum is otherwise readable only through an
             * `@AdminOnly` route. `change-password.controller.ts`
             * is behind a session and composes the number for the analyst it
             * belongs to.
             *
             * A caller can still learn that some password was too short, which
             * is a narrower thing to know than the number and is the cost of
             * refusing before the endpoint runs at all.
             */
            if (refusePassword(supplied, stored['auth.minPasswordLength'])) {
              throw new APIError('UNPROCESSABLE_ENTITY', { message: PASSWORD_REFUSED })
            }
          }
        }

        if (ctx.path !== '/sign-up/email') return
        const [already] = await db.select({ id: schema.user.id }).from(schema.user).limit(1)
        if (already) {
          throw new APIError('FORBIDDEN', {
            message: 'This install is not open for sign-up. Ask an administrator for an account.',
            code: SIGN_UP_CLOSED,
          })
        }

      }),
      /**
       * The audit events the session table cannot see.
       *
       * **A failed sign-in writes no row anywhere**, so without this an
       * attempt run against every account leaves the install with nothing to
       * show for it - which is the first thing both NIST SP 800-92 and
       * ISO 27002 8.15 ask an application log for.
       *
       * The attempted address is recorded and the password never is. It is
       * recorded in `detail` rather than as the target, the target being a
       * partition of the run window and therefore not the caller's to pick.
       * -> #541
       */
      after: createAuthMiddleware(async (ctx) => {
        const headers = Object.fromEntries(ctx.headers?.entries() ?? [])
        /**
         * **Every refused sign-in, and a wrong password at any other door.**
         * `returned` is the response *or* an `APIError`, and it is the only
         * place the outcome is visible: a refusal writes no row. The count is
         * `checkPassword`'s; this is the record.
         */
        const refused = ctx.context.returned
        if (!(refused instanceof APIError)) return
        const signingIn = ctx.path === '/sign-in/email'
        if (!signingIn && refused.body?.code !== 'INVALID_PASSWORD') return
        const attempted = signingIn
          ? (ctx.body as { email?: unknown } | undefined)?.email
          : ctx.context.session?.user.email
        /**
         * **An address with no account costs what an account does.** The
         * library hashes instead of verifying for one, so `checkPassword`
         * never runs and would leave the account-holding answer slower by its
         * two statements. Counting against a hash nobody holds spends them.
         */
        if (signingIn && typeof attempted === 'string' && attempted !== '') {
          const [holds] = await db
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(sameAddress(attempted))
            .limit(1)
          if (!holds) await countAgainst(db, NOBODY_HOLDS)
        }
        /**
         * **The target is ours, and the identifier they typed is not.**
         * `target_label` partitions the run window, so a caller who chooses it
         * chooses whether their own attempts are counted together -- and one
         * attempt each at a hundred accounts is password spraying, held at a
         * run of one and `Low` for ever. The account travels in `detail`,
         * which does not partition, exactly as a refused socket carries the
         * case it asked for.
         *
         * **What that costs, and it is not nothing.** The activity pane draws
         * no attributes, so on the screen the account is gone until it does --
         * and a collapsed run of three different accounts could not show one
         * of them honestly anyway. A collector receives `detail` whole.
         * -> #541, #544
         */
        await recordInstallActivity(db, {
          event: 'sign_in_failed',
          target: SIGN_IN,
          detail: {
            path: ctx.path,
            ...(typeof attempted === 'string' && attempted !== '' ? { account: attempted } : {}),
          },
          headers,
        })
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
           * **The expiry the install asked for, written where the session is
           * made.** `expiresIn` is a constant compiled into the instance and
           * these are settings an administrator moves, so the option below is
           * only the ceiling the cookie is issued for.
           *
           * **Assigned into the row as well as returned, and that is not a
           * tidiness point.** Better Auth computes the Redis TTL and the
           * `active-sessions` entry from the object it proposed rather than
           * from the one this returns, so a returned-only expiry leaves the
           * cached copy alive for the whole ceiling - measured at 1440 minutes
           * behind a session of 30. The row is the same object the caller
           * kept, so correcting it corrects both.
           * -> `test/the-install-sets-both-windows.test.ts`
           */
          before: async (fresh: Record<string, unknown>) => {
            fresh['expiresAt'] = await windowFor(db, asDate(fresh['createdAt']))
            return { data: fresh }
          },
          /**
           * A session row appearing **is** a successful sign-in.
           *
           * **Here rather than on `/sign-in/email`**, because it is the one
           * place every way in passes through: the password route today, and
           * Entra without a second call site the day SSO lands. A path list
           * is the thing that silently stops covering the newest door.
           *
           * **The row carries the origin the library already resolved, so it
           * is handed over as an origin rather than as headers.** Passing it
           * as a header name would put it back through the trust rule that
           * decides what a *caller* may claim, and outside production that
           * rule discards it -- losing the one address on this path the
           * install itself established. -> `install-activity/record.ts`
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
             * write-side dedupe would skip a line when an identical one is
             * minutes old, discarding evidence to fix a display problem the
             * reader already fixes. Nothing in this table is derivable after
             * the fact, so dropping is the one trade never worth making.
             */
            await recordInstallActivity(db, {
              event: 'signed_in',
              actor: { id, label: who?.name || who?.email || null },
              origin: {
                ipAddress: typeof session['ipAddress'] === 'string' ? session['ipAddress'] : null,
                userAgent: typeof session['userAgent'] === 'string' ? session['userAgent'] : null,
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
        /**
         * The one point a sign-out, a revoke and an admin's ban all pass
         * through, and it runs only for a session that existed. Writes the
         * audit line for a caller's own ending, one per session.
         */
        delete: {
          after: async (deleted: Record<string, unknown>, context?: unknown) => {
            const userId = typeof deleted['userId'] === 'string' ? deleted['userId'] : null
            if (!userId) return
            const ending = context as { path?: string; headers?: Headers } | undefined
            const path = ending?.path ?? ''
            const sessionId = typeof deleted['id'] === 'string' ? deleted['id'] : ''
            const event = OWN_ENDINGS[path]
            if (!event) {
              sessionEnded(userId, sessionId, RECORDED_BY_THE_ACCOUNTS_PANE.has(path))
              return
            }
            const [who] = await db
              .select({ name: schema.user.name, email: schema.user.email })
              .from(schema.user)
              .where(eq(schema.user.id, userId))
              .limit(1)
            const landed = await recordInstallActivity(db, {
              event,
              actor: { id: userId, label: who?.name || who?.email || null },
              target: who?.email ?? null,
              detail: { path },
              headers: Object.fromEntries(ending?.headers?.entries() ?? []),
            })
            sessionEnded(userId, sessionId, landed)
          },
        },
      },
    },
    /**
     * Who a request is from, for the limiter and the session row: the one
     * rule `callerAddress` also applies, so no reader re-decides it.
     * -> `wire/caller-address.ts`
     *
     * Never set `disableIpTracking`: the limiter returns early on it and
     * applies no rule at all.
     */
    advanced: {
      ipAddress: ADDRESS_RULE,
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
      // A sign-up makes an account and no session: the claim signs its winner
      // in once it has won. -> `setup.controller.ts`
      autoSignIn: false,
      /**
       * **Unset means 8.** The library applies this floor at every door that
       * writes a password, beneath the stored minimum the `before` hook holds
       * them to. -> `PASSWORD_WRITES`
       */
      minPasswordLength: MINIMUM_PASSWORD_LENGTH,
      password: {
        hash: (password) => argonHash(password, ARGON2ID),
        verify: ({ hash, password }) => checkPassword(db, hash, password),
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

/** The code the install rule refuses a sign-up with, once any account exists. */
export const SIGN_UP_CLOSED = 'SIGN_UP_CLOSED'

/** Whether `error` is the install rule's refusal rather than any other. */
export function signUpClosed(error: unknown): boolean {
  return error instanceof APIError && error.body?.code === SIGN_UP_CLOSED
}

/**
 * The same instance, with its in-process session reads made read-only.
 *
 * **A request is not the analyst.** The global guard reads the session on every
 * route and the socket reads it on every upgrade, and a read refreshes by
 * default - so the health poll, which runs every thirty seconds and keeps
 * running in a tab nobody is watching, holds the window open for as long as
 * the browser does. The refusal belongs here rather than at each call site: the
 * guard is the bridge's, and a rule stated once cannot be missed by the next
 * thing that reads a session.
 *
 * **`auth.handler` is untouched**, which is the half that matters: the
 * browser's own `GET /api/auth/get-session` still refreshes, and its response
 * is the only one that can carry a renewed cookie back.
 * -> `ui/src/api/useActivityReporter.ts`
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
