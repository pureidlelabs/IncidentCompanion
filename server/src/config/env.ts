/**
 * The whole of what this process knows about where it is deployed: a database
 * URL and a Redis URL, and nothing about what is behind them.
 *
 * Parsed once, at startup; the process refuses to boot without it.
 */
import { z } from 'zod'

/**
 * Every deployment signs in, so nothing here is optional to make an
 * unauthenticated mode possible - there isn't one. An optional auth mode
 * doubles the behaviours every route must be correct under.
 */
const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  /**
   * The seeding connection - a different role, not a different database.
   * Row-level security refuses the unscoped writes the demo seeder makes, so
   * the request-serving role cannot do this work.
   *
   * Absent means the seeder is off. -> `db/roles.sql`
   */
  SEED_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),

  /**
   * Where attached evidence is kept.
   *
   * **On disk rather than in Postgres**, because it is the one thing here
   * measured in megabytes - a bytea column puts every artefact in every backup
   * and in the working set of an otherwise small database.
   */
  EVIDENCE_DIR: z.string().min(1).optional(),

  /**
   * Where the built React app is, when it is not beside the server.
   *
   * **Optional, because the ordinary answer is derivable.** A checkout has
   * `ui/dist` a known distance from this file; an image puts it wherever it
   * was copied, and that is the case this exists for. A server with neither
   * still serves the API - the bundle is cargo, not a dependency.
   */
  UI_DIR: z.string().min(1).optional(),

  /**
   * Redis holds only what may evaporate - presence, claims, socket fan-out.
   * Session revocation deliberately does not live here: the cookie is signed
   * and stateless, so a revocation list that dies with a Redis restart
   * silently re-validates every session it was holding. That goes in Postgres.
   */
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  /**
   * Signs session cookies. **No default, in any environment**, because a
   * default secret is one that ships: every deployment that forgot to set it
   * shares the same signing key, and a cookie minted anywhere is then valid
   * everywhere. 32 bytes is the floor rather than advice.
   */
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /**
   * The origin Better Auth mints and validates callbacks against. Wrong here
   * means OAuth redirects land on the wrong host, so it is read rather than
   * inferred from the request - a `Host` header is attacker-controlled.
   */
  AUTH_BASE_URL: z.url({ protocol: /^https?$/ }),

  /**
   * The plaintext port this process listens on, behind nginx - 8080 rather
   * than 8443, which names https by convention and this socket is not. The
   * number the analyst types is nginx's, and lives in `AUTH_BASE_URL`.
   */
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  /**
   * Defaults to the closed setting, because a default deciding a security
   * posture must be the safe one: `development` widens the trusted-origin
   * list to Vite's port, and that list is applied as app-wide CORS with
   * credentials. The dev script says `NODE_ENV=development` out loud.
   */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
})

export type Env = z.infer<typeof schema>

/**
 * Read and validate the environment, or throw with every fault at once.
 *
 * Reports all failures rather than the first: a run that fails on
 * `DATABASE_URL`, gets fixed, then fails on `REDIS_URL` costs two restarts to
 * learn what one message could have said.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source)
  if (parsed.success) return parsed.data

  const faults = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Refusing to start -- the environment is incomplete:\n${faults}`)
}
