/**
 * The whole of what this process knows about where it is deployed: a database
 * URL and a Redis URL, and nothing about what is behind them.
 */
import { z } from 'zod'

/**
 * Every deployment signs in, so nothing here is optional to make an
 * unauthenticated mode possible - there isn't one.
 */
const schema = z.object({
  /** Postgres. Local lean runs point this at a container on loopback. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  /**
   * The seeding connection - a different role, not a different database.
   */
  SEED_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),

  /**
   * Where attached evidence is kept.
   */
  EVIDENCE_DIR: z.string().min(1).optional(),

  /**
   * Where the built React app is, when it is not beside the server.
   */
  UI_DIR: z.string().min(1).optional(),

  /**
   * Redis holds only what may evaporate - presence, claims, socket fan-out.
   */
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  /**
   * Signs session cookies.
   */
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /**
   * The origin Better Auth mints and validates callbacks against.
   */
  AUTH_BASE_URL: z.url({ protocol: /^https?$/ }),

  /**
   * The plaintext port this process listens on, behind nginx - 8080 rather than
   * 8443, which names https by convention and this socket is not.
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
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source)
  if (parsed.success) return parsed.data

  const faults = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Refusing to start -- the environment is incomplete:\n${faults}`)
}
